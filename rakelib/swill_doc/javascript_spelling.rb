# frozen_string_literal: true

require "strscan"

module SwillDoc
  # How a class page reads to plain JavaScript: the same members, spelled as
  # the compiler emits them. Everything comes from the compiler's interface,
  # the record the compiled output is written from, so the two cannot drift:
  # JavaScript names, getters, optional-argument variants, and static members.
  # Types are written in TypeScript notation.
  module JavaScriptSpelling
    # The framework's interface, by class name.
    def interface
      @interface ||= ::Swill::Ruby2JS::Build.framework.to_h { |entry| [entry["name"], entry] }
    end

    # Swill.List for Swill::Controller::List, or nil for a class plain
    # JavaScript cannot reach by a public name.
    def public_javascript_name(full_name)
      @public_names ||= ::Swill::Ruby2JS::JAVASCRIPT_NAMES.to_h { |name, ruby| [ruby, "Swill.#{name}"] }
      @public_names[full_name]
    end

    def macro?(klass, method)
      method.singleton && (interface[klass.full_name]&.fetch("macros", []) || []).include?(method.name)
    end

    # The JavaScript signatures of one Ruby method: one per variant of a
    # method with optional parameters, or a getter's name and type.
    def javascript_signatures(klass, method)
      entry = interface[klass.full_name]
      return [] unless entry
      list = method.singleton ? entry.fetch("static_methods", []) : entry.fetch("methods", [])
      found = list.find { |candidate| candidate["name"] == method.name }
      return [] unless found
      scope = klass
      if found["accessor"]
        return [%(#{member_prefix(method)}<span class="signature-name">#{h found['js']}</span>) +
                %( <span class="signature-returns">: #{ts_type_html(found['returns'], scope)}</span>)]
      end
      ::Swill::Ruby2JS::Knowledge.variants(found).map do |variant|
        formals = ::Swill::Ruby2JS::Knowledge.variant_formals(found, variant["taken"] || 0)
        params = formals.map do |formal|
          type = found.dig("parameters", formal["name"])
          name = javascript_member(formal["name"])
          type ? "#{h name}: #{ts_type_html(type, scope)}" : h(name)
        end
        %(#{member_prefix(method)}<span class="signature-name">#{h variant['js']}</span>) +
          %(<span class="signature-params">(#{params.join(', ')})</span>) +
          %( <span class="signature-returns">→ #{ts_type_html(found['returns'] || 'void', scope)}</span>)
      end
    end

    # Whether the compiler compiles the class, and so it has a JavaScript
    # spelling at all. The compiler and the data layer's server side do not.
    def compiled?(klass)
      interface.key?(klass.full_name)
    end

    # Every JavaScript name a Ruby method has: its variants', or its own; a
    # method of a class that is never compiled keeps its Ruby name.
    def javascript_names(klass, method)
      return [method.name] unless compiled?(klass)
      entry = interface[klass.full_name]
      list = method.singleton ? entry.fetch("static_methods", []) : entry.fetch("methods", [])
      found = list.find { |candidate| candidate["name"] == method.name }
      return [javascript_member(method.name)] unless found
      ::Swill::Ruby2JS::Knowledge.variants(found).map { |variant| variant["js"] }
    end

    def javascript_member(name)
      ::Swill::Ruby2JS::Names.member(name)
    end

    # A declared property's JavaScript name.
    def javascript_property(klass, name)
      entry = interface[klass.full_name]
      found = entry && (entry["properties"] || []).find { |property| property["name"] == name }
      found ? found["js"] : javascript_member(name)
    end

    # A Sorbet type in TypeScript notation, each class linked.
    def ts_type_html(type, scope)
      return h("unknown") if type.nil?
      TypeScriptType.new(type, ->(name) { ts_class_html(name, scope) }).to_html
    rescue TypeScriptType::Unparsed
      h(type)
    end

    # A class link in its JavaScript spelling: its public name where it has
    # one.
    def javascript_class_link(klass)
      return class_link(klass) unless klass.is_a?(RDoc::ClassModule) && public_javascript_name(klass.full_name)
      %(<a href="#{h href_to(klass)}" title="#{h klass.full_name}">#{h public_javascript_name(klass.full_name)}</a>)
    end

    def ts_class_html(name, scope)
      found = resolve(name, scope)
      return h(name) unless found
      label = public_javascript_name(found.full_name) || short_name(found)
      %(<a href="#{h href_to(found)}" title="#{h found.full_name}">#{h label}</a>)
    end

    # Sorbet's type syntax, read and written again as TypeScript would write
    # it. A constant is handed to the block, which links it.
    class TypeScriptType
      class Unparsed < StandardError; end

      SCALARS = {
        "T.untyped" => "any", "T::Boolean" => "boolean", "String" => "string", "Symbol" => "string",
        "Integer" => "number", "Float" => "number", "Numeric" => "number", "NilClass" => "null",
        "void" => "void", "T.noreturn" => "never", "T.self_type" => "this", "T.attached_class" => "this",
        "Object" => "object", "BasicObject" => "object"
      }.freeze

      def initialize(text, constant)
        @scanner = StringScanner.new(text.strip)
        @constant = constant
      end

      def to_html
        html = type
        raise Unparsed unless @scanner.eos?
        html
      end

      private

      def type
        skip_space
        if @scanner.scan(/T\.nilable\(/) then nullable(inside(")"))
        elsif @scanner.scan(/T\.any\(/) then list(")").uniq.join(" | ")
        elsif @scanner.scan(/T\.all\(/) then list(")").join(" & ")
        elsif @scanner.scan(/T::(?:Array|Set|Enumerable)\[/) then array(inside("]"))
        elsif @scanner.scan(/T::Hash\[/) then hash(list("]"))
        elsif @scanner.scan(/T\.class_of\(/) then "typeof #{inside(')')}"
        elsif @scanner.scan(/T\.proc/) then procedure
        elsif (scalar = SCALARS.keys.find { |name| @scanner.match?(/#{Regexp.escape(name)}(?![\w:])/) })
          @scanner.pos += scalar.length
          SCALARS[scalar]
        elsif (name = @scanner.scan(/(?:::)?[A-Z]\w*(?:::[A-Z]\w*)*/))
          generic = @scanner.scan(/\[/) ? "&lt;#{list(']').join(', ')}&gt;" : ""
          "#{@constant.(name)}#{generic}"
        else
          raise Unparsed
        end
      end

      def nullable(inner) = inner == "null" ? inner : "#{inner} | null"

      def array(element) = element.match?(/[|&]|=&gt;| =>/) ? "(#{element})[]" : "#{element}[]"

      def hash(pair)
        raise Unparsed unless pair.length == 2
        "Record&lt;#{pair[0]}, #{pair[1]}&gt;"
      end

      # T.proc.params(a: A).returns(R), or .void; either part may be absent.
      def procedure
        params = []
        if @scanner.scan(/\.params\(/)
          until @scanner.scan(/\s*\)/)
            name = @scanner.scan(/\s*(\w+):\s*/) or raise Unparsed
            params << "#{name.strip.delete_suffix(':').strip}: #{type}"
            @scanner.scan(/\s*,/)
          end
        end
        returns = if @scanner.scan(/\.returns\(/) then inside(")")
                  elsif @scanner.scan(/\.void/) then "void"
                  else "unknown"
                  end
        "(#{params.join(', ')}) =&gt; #{returns}"
      end

      def inside(closer)
        value = type
        skip_space
        raise Unparsed unless @scanner.scan(/#{Regexp.escape(closer)}/)
        value
      end

      def list(closer)
        values = []
        loop do
          values << type
          skip_space
          next if @scanner.scan(/,/)
          raise Unparsed unless @scanner.scan(/#{Regexp.escape(closer)}/)
          return values
        end
      end

      def skip_space = @scanner.skip(/\s+/)
    end
  end
end
