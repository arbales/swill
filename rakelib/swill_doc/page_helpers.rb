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
      return context.title if context.respond_to?(:title)
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
      %(#{member_prefix(method)}<span class="signature-name">#{h method.name}</span>) +
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

    # --- JavaScript ---

    # name(params): returns, from deno doc: a parameter's type is its JSDoc
    # type, a default is shown as written, and a rest parameter is spread.
    def js_signature_html(function)
      # A constant, such as NIL_READERS, is a value rather than a call.
      return %(<span class="signature-name">#{h function.name}</span>) if function.constant?
      types = function.tags.select { |tag| tag["kind"] == "param" }.to_h { |tag| [tag["name"], tag.dig("tsType", "repr")] }
      params = function.params.map { |param| js_param_html(param, types) }
      returns = function.tags.find { |tag| tag["kind"] == "return" }&.dig("tsType", "repr")
      %(<span class="signature-name">#{h function.name}</span>) +
        %(<span class="signature-params">(#{params.join(', ')})</span>) +
        (returns ? %( <span class="signature-returns">→ #{h returns}</span>) : "")
    end

    def js_param_html(param, types)
      case param["kind"]
      when "rest"
        name = param.dig("arg", "name")
        "...#{h name}#{js_type(types[name])}"
      when "assign"
        # deno doc cannot print every default (new Map(), {}); such a
        # parameter reads as optional.
        name = param.dig("left", "name")
        default = param["right"]
        return "#{h name}?#{js_type(types[name])}" if default.nil? || default.include?("UNSUPPORTED")
        "#{h name}#{js_type(types[name])} = #{h default}"
      else
        name = param["name"]
        "#{h name}#{param['optional'] ? '?' : ''}#{js_type(types[name])}"
      end
    end

    def js_type(type)
      type ? %(: <span class="signature-type">#{h type}</span>) : ""
    end

    # A parameter's, a result's, or an error's own description.
    def js_tags(function, kind)
      function.tags.select { |tag| tag["kind"] == kind && (tag["doc"].to_s.strip != "" || kind != "param") }
    end

    # Markdown from JSDoc, through RDoc's own formatter, so a class it names in
    # backticks links to the class page as it would in Ruby.
    def markdown_html(text)
      return "" if text.to_s.strip.empty?
      options = @store.options
      formatter = RDoc::Markup::ToHtmlCrossref.new(
        @context.path, @store.find_class_or_module("Swill") || @store.all_classes_and_modules.first,
        pipe: options.pipe, output_decoration: options.output_decoration,
        hyperlink_all: options.hyperlink_all, show_hash: options.show_hash,
        autolink_excluded_words: options.autolink_excluded_words || [],
        warn_missing_rdoc_ref: options.warn_missing_rdoc_ref
      )
      RDoc::Markdown.parse(text).accept(formatter)
    end

    # Markdown for a line that continues a label: no paragraph of its own.
    def inline_markdown_html(text)
      markdown_html(text).gsub(%r{</?p>}, "").strip
    end

    # Both spellings of a piece of a page; the language switch shows one.
    def spelled(ruby, javascript)
      return ruby if javascript.nil? || javascript == ruby
      %(<span class="lang-ruby">#{ruby}</span><span class="lang-javascript">#{javascript}</span>)
    end

    # A relative link from this page to another path in the output.
    def link_to_path(path)
      RDoc::Markup::ToHtml.gen_relative_url(@context.path, path)
    end

    # A JavaScript file as highlighted HTML, one string per line: Rouge's
    # tokens, split at each newline as the Ruby lines are.
    def highlighted_javascript_lines(source)
      lines = [+""]
      Rouge::Lexers::Javascript.new.lex(source).each do |token, value|
        css = token.shortname
        value.split(/(\n)/).each do |part|
          next lines << +"" if part == "\n"
          next if part.empty?
          lines.last << (css.empty? ? h(part) : %(<span class="#{css}">#{h part}</span>))
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

    # The classes and modules that include a module directly.
    def includers(mod)
      @store.all_classes_and_modules.select { |candidate| candidate.includes.any? { |included| included.module == mod } }
            .sort_by(&:full_name)
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

    # A class's members by `:section:`, in source order: the untitled section
    # first, then each titled one where its first member appears. Within a
    # section, members are grouped by kind; a section with no public members
    # is left out.
    def member_sections(klass)
      kinds = [
        ["Properties", :declaration, declarations(klass, false)],
        ["Outlets", :declaration, declarations(klass, true)],
        ["Attributes", :attribute, plain_attributes(klass)],
        ["Public class methods", "class-method", public_methods(klass, true)],
        ["Public instance methods", "instance-method", public_methods(klass, false)]
      ]
      sections = klass.sort_sections.filter_map do |section|
        groups = kinds.map do |title, kind, list|
          members = list.select { |member| member.section == section }
          # A titled section keeps its source order, which is the order the
          # comment was written to read in; the untitled one is alphabetical.
          members = members.sort_by { |member| member.line || 0 } if section.title
          [title, kind, members]
        end.reject { |_, _, list| list.empty? }
        [section, groups] unless groups.empty?
      end
      sections.sort_by do |section, groups|
        [section.title ? 1 : 0, groups.flat_map { |_, _, list| list.map { |member| member.line || 0 } }.min]
      end
    end

    # The page's index: the untitled section by kind, then one entry list per
    # titled section, each linking to its heading.
    def page_index(sections)
      sections.flat_map do |section, groups|
        next groups.map { |title, _, list| [title, nil, list] } unless section.title
        [[section.title, section.aref, groups.flat_map { |_, _, list| list }]]
      end
    end

    # Ruby's spelling of a member's kind: `.` for a class method, `#` for an
    # instance method, property or attribute.
    def member_prefix(member)
      singleton = member.is_a?(RDoc::AnyMethod) && member.singleton
      %(<span class="member-prefix">#{singleton ? '.' : '#'}</span>)
    end

    # An index entry: prefix and name, in both spellings.
    def index_entry_html(klass, entry)
      javascript = if !compiled?(klass) then nil
                   elsif entry.is_a?(RDoc::AnyMethod) then javascript_member(entry.name)
                   else javascript_property(klass, entry.name)
                   end
      member_prefix(entry) + spelled(h(entry.name), javascript && h(javascript))
    end

    # The documented modules a class includes, and those they include in turn,
    # nearest first. A module not in the store, such as T::Sig, is left out.
    def included_modules(klass, seen = [])
      klass.includes.each do |included|
        mod = included.module
        next unless mod.is_a?(RDoc::ClassModule) && !seen.include?(mod)
        seen << mod
        included_modules(mod, seen)
      end
      seen
    end

    # What an included module adds, as YARD lists it: names only, each linked
    # to its entry on the module's page.
    def included_members(mod)
      [["Properties", declarations(mod, false)], ["Outlets", declarations(mod, true)],
       ["Methods", public_methods(mod, false)]].reject { |_, list| list.empty? }
    end

    def member_link(mod, member)
      javascript = if !compiled?(mod) then nil
                   elsif member.is_a?(RDoc::AnyMethod) then javascript_member(member.name)
                   else javascript_property(mod, member.name)
                   end
      %(<a href="#{h href_to(mod)}##{h member.aref}">#{spelled(h(member.name), javascript && h(javascript))}</a>)
    end
  end
end
