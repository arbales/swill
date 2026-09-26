# frozen_string_literal: true

require "erb"

module SwillDoc
  # What the templates call. @context is the class or page being written, so
  # every link is relative to it and every class name is shortened for it.
  module PageHelpers
    include ERB::Util

    # A constant path in a type, such as View, Swill::View, or ::Swill::View.
    CONSTANT = /(?<![\w:])(?:::)?[A-Z]\w*(?:::[A-Z]\w*)*/

    CONSTANT_LINES = 8

    def page_name(page)
      page.full_name.split("/").last
    end

    def page_title(context)
      context.is_a?(RDoc::ClassModule) ? context.full_name : page_name(context)
    end

    def href_to(code_object)
      code_object.as_href(@context.path)
    end

    # A type as written, with each class it names linked and shortened to the
    # shortest name that reaches the same class from this page. The full name
    # is the link's title. T.untyped reads as untyped; Sorbet's own T:: forms
    # and names that are not documented classes, such as Element, stay as
    # written.
    def type_html(type, scope)
      return h("unknown") unless type
      type = type.gsub(/\bT\.untyped\b/, "untyped")
      html = +""
      last = 0
      type.to_enum(:scan, CONSTANT).each do
        match = Regexp.last_match
        html << h(type[last...match.begin(0)]) << constant_html(match[0], scope)
        last = match.end(0)
      end
      html << h(type[last..])
    end

    def constant_html(name, scope)
      return h(name) if name == "T" || name.start_with?("T::")
      found = resolve(name, scope)
      return h(name) unless found
      %(<a href="#{h href_to(found)}" title="#{h found.full_name}">#{h short_name(found)}</a>)
    end

    # Ruby's lookup: the first segment from the enclosing scopes outward, the
    # rest within it.
    def resolve(name, scope)
      return @store.find_class_or_module(name.delete_prefix("::")) if name.start_with?("::")
      first, *rest = name.split("::")
      found = scope.find_module_named(first)
      rest.each { |segment| found &&= found.classes_hash[segment] || found.modules_hash[segment] }
      found.is_a?(RDoc::ClassModule) ? found : nil
    end

    def short_name(klass)
      segments = klass.full_name.split("::")
      scope = @context.is_a?(RDoc::ClassModule) ? @context : nil
      return klass.full_name unless scope
      (1..segments.size).each do |count|
        candidate = segments.last(count).join("::")
        return candidate if resolve(candidate, scope) == klass
      end
      klass.full_name
    end

    # A class name that links to its page when it is documented; +short+
    # names it as this page would.
    def class_link(klass_or_name, short: false)
      return h(klass_or_name) unless klass_or_name.is_a?(RDoc::ClassModule)
      label = short ? short_name(klass_or_name) : klass_or_name.full_name
      %(<a href="#{h href_to(klass_or_name)}" title="#{h klass_or_name.full_name}">#{h label}</a>)
    end

    # name(params) → returns. A method with a sig shows its parameters with
    # their types; one without shows its parameters as written.
    def signature_html(method)
      signature = SwillRDoc::Signatures.for(method)
      params =
        if signature
          "(#{signature.params.map { |name, type| "#{h name}: #{type_html(type, method.parent)}" }.join(', ')})"
        else
          h(method.params || "()")
        end
      returns = signature ? type_html(signature.returns, method.parent) : h("unknown")
      %(<span class="signature-name">#{h method.name}</span>) +
        %(<span class="signature-params">#{params}</span>) +
        %( <span class="signature-returns">→ #{returns}</span>)
    end

    # A Ruby file as highlighted HTML, one string per line: RDoc's colorizer,
    # with tokens that span lines, such as heredocs, split at each newline.
    def highlighted_lines(source)
      lines = [+""]
      RDoc::Parser::RubyColorizer.colorize(source).each do |token|
        token.text.split(/(\n)/).each do |part|
          next lines << +"" if part == "\n"
          lines.last << RDoc::TokenStream.to_html([RDoc::Parser::RubyColorizer::ColoredToken.new(token.kind, part)])
        end
      end
      lines.pop if lines.last.empty?
      lines
    end

    def attribute_meta(attribute)
      {"R" => "reader", "W" => "writer", "RW" => "accessor"}.fetch(attribute.rw, attribute.rw.to_s)
    end

    # RDoc keeps a superclass it could not find by full name as the name
    # written, such as Responder inside module Swill; found here the way Ruby
    # would, from the class's own namespace.
    def superclass_of(klass)
      superclass = klass.superclass || "Object"
      return superclass unless superclass.is_a?(String)
      resolve(superclass, klass.parent) || superclass
    end

    def subclasses(klass)
      @store.all_classes.select { |candidate| superclass_of(candidate) == klass }.sort_by(&:full_name)
    end

    def constant_value(constant)
      lines = constant.value.to_s.lines
      shown = lines.first(CONSTANT_LINES).join.chomp
      hidden = lines.size - CONSTANT_LINES
      hidden.positive? ? "#{shown}\n(#{hidden} more lines)" : shown
    end

    def public_methods(klass, singleton)
      klass.method_list.select { |method| method.visibility == :public && method.singleton == singleton }
                       .sort_by(&:name)
    end

    def declarations(klass, outlets)
      klass.attributes.select { |attribute| attribute.is_a?(SwillRDoc::Declaration) && attribute.outlet? == outlets }
    end

    def plain_attributes(klass)
      klass.attributes.reject { |attribute| attribute.is_a?(SwillRDoc::Declaration) }
    end
  end
end
