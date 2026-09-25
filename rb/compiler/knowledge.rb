# typed: false
# frozen_string_literal: true

require_relative "names"

module Swill
  module Ruby2JS
    # Facts about classes, mixins, declarations, and methods: what only the
    # source knows, read from the AST, and what a class body declared, read
    # off the class the loader defined. Collection lives in knowledge/.
    class Knowledge
      attr_reader :entries

      def self.identifier(name)
        Names.identifier(name)
      end

      def self.member(name)
        Names.member(name)
      end

      def self.type_member_node?(node)
        node.type == :casgn && node.children[2]&.type == :send &&
          node.children[2].children[0..1] == [nil, :type_member]
      end

      # A method with optional parameters is one JavaScript method per arity,
      # the way Cocoa spells an overload as a selector: observe and
      # observeWithObject. The shortest variant keeps the plain name; the rest
      # are named for the optionals they take and carry the family, which is
      # how the runtime resolves a name and an argument count to one method.
      def self.variants(method)
        if method["complex"]
          return [{"name" => method["name"], "js" => method["js"],
                   "arity" => method["arity"], "minimum" => method["arity"],
                   "maximum" => method["maximum"]}]
        end
        optionals = method["optionals"] || []
        (0..optionals.length).map do |taken|
          if taken.zero?
            {"name" => method["name"], "js" => method["js"], "arity" => method["arity"], "taken" => 0}
          else
            name = "#{method['name']}_with_#{optionals.first(taken).join('_and_')}"
            {"name" => name, "js" => member(name), "arity" => method["arity"] + taken,
             "taken" => taken, "family" => method["name"]}
          end
        end
      end

      def self.variant_for(method, count)
        variants(method).find { |variant| variant["arity"] == count }
      end

      # The parameters a variant receives, in declaration order: every
      # required one, and the first +taken+ optionals, as Ruby binds them.
      def self.variant_formals(method, taken)
        seen = 0
        (method["formals"] || []).select do |formal|
          next true unless formal["default"]
          seen += 1
          seen <= taken
        end
      end

        attr_reader :loader

        def initialize(imports = [], loader:)
          @entries = imports.map { |entry| entry.merge("imported" => true) }
          @loader = loader
          # A computed block's source, by the file and line Proc#source_location
          # reports, so a reflected descriptor can find the block it came from.
          @blocks = {}
        end

        def collect(source, file)
          ast, comments = ::Ruby2JS.parse(source, file)
          # Type-hint pragmas only; control pragmas (notably skip/extend)
          # would invalidate collected metadata.
          Array(comments[:_raw]).each do |comment|
            comment.text.scan(/#\s*Pragma:\s*(\S+)/i).flatten.each do |name|
              unless %w[array hash string].include?(name)
                raise CompileError, "unsupported spike pragma #{name}"
              end
            end
          end
          # Three passes: what the source declares, so imported constants stay
          # closed; the evaluation; then entries read from the classes it
          # defined or reopened.
          names = declared_names(statements(ast), [])
          imported_roots = entries.select { |entry| entry["imported"] }
            .map { |entry| entry["name"].split("::").first }.uniq
          protected = names.find do |name|
            imported_roots.any? { |root| name == root || name.start_with?("#{root}::") }
          end
          raise CompileError, "application cannot declare inside imported namespace #{protected}" if protected

          preflight_scope!(statements(ast), declaration_names(ast))
          previous_entries = copy_entries(entries)
          previous_blocks = @blocks.dup
          loader.evaluate(source, file, declared: names) do |evaluated_file|
            # Proc#source_location uses the evaluation path, so blocks are
            # indexed only inside the transaction that will collect them.
            index_blocks(ast, evaluated_file)
            collect_scope(statements(ast), [])
          end
          self
        rescue ::Exception # Keep the compiler reusable after any failed source.
          @entries = previous_entries if previous_entries
          @blocks = previous_blocks if previous_blocks
          raise
        end

        def local
          entries.reject { |entry| entry["imported"] }
        end

        def interface
          local.map do |entry|
            entry.reject { |key, _| %w[node fragments source_files].include?(key) }
          end
        end

        def copy_entries(value)
          case value
          when ::Hash then value.to_h { |key, item| [key, copy_entries(item)] }
          when ::Array then value.map { |item| copy_entries(item) }
          else value
          end
        end

        def resolve(name, scope)
          parts = scope.dup
          loop do
            candidate = (parts + [name]).join("::")
            return candidate if entries.any? { |entry| entry["name"] == candidate }
            break if parts.empty?
            parts.pop
          end
          raise CompileError, "unknown constant #{name} in #{scope.join('::')}"
        end

        def constant_member(name, scope, current = nil)
          return [current["name"], name] if current && !name.include?("::") && current.fetch("constants", []).include?(name)
          parts = scope.dup
          loop do
            candidate = (parts + [name]).join("::")
            owner_name, member = candidate.rpartition("::").values_at(0, 2)
            owner = entries.find { |entry| entry["name"] == owner_name }
            return [owner_name, member] if owner&.fetch("constants", [])&.include?(member)
            break if parts.empty?
            parts.pop
          end
          nil
        end

        def constant(node)
          raise CompileError, "expected a static constant" unless node&.type == :const
          parent, name = node.children
          parent ? "#{constant(parent)}::#{name}" : name.to_s
        end

        def statements(node)
          return [] unless node
          node.type == :begin ? node.children : [node]
        end

        def method_defined?(type, method)
          !method_entry(type, method).nil?
        end

        # Ruby lookup order over collected facts: the class or mixin itself, then
        # its included mixins (nearest first), then the superclass.
        def method_entry(type, method)
          entry = entries.find { |candidate| candidate["name"] == type }
          return nil unless entry
          found = entry["methods"].find { |candidate| candidate["name"] == method.to_s }
          return found if found
          # A generated shim calls the widest variant by its own name.
          found = entry["methods"].find do |candidate|
            candidate["optionals"] && Knowledge.variants(candidate).any? { |variant| variant["name"] == method.to_s }
          end
          return found if found
          entry["includes"].reverse_each do |name|
            found = method_entry(resolve(name, entry["scope"]), method)
            return found if found
          end
          return nil unless entry["parent"]
          method_entry(resolve(entry["parent"], entry["scope"]), method)
        end

        # A static method on a class or, as JavaScript inherits statics, on
        # an ancestor class.
        def static_method_entry(type, method)
          entry = entries.find { |candidate| candidate["name"] == type }
          return nil unless entry
          found = entry.fetch("static_methods", []).find { |candidate| candidate["name"] == method.to_s }
          return found if found
          found = entry.fetch("static_methods", []).find do |candidate|
            candidate["optionals"] && Knowledge.variants(candidate).any? { |variant| variant["name"] == method.to_s }
          end
          return found if found
          return nil unless entry["parent"]
          static_method_entry(resolve(entry["parent"], entry["scope"]), method)
        rescue CompileError
          nil
        end

        # A member of the class object: a static method, or a method,
        # registry, or setting an included mixin's ClassMethods provides, on
        # the class or an ancestor. Configuration reads answer T.untyped.
        def class_member_entry(type, method)
          entry = entries.find { |candidate| candidate["name"] == type }
          return nil unless entry
          name = method.to_s
          found = entry.fetch("static_methods", []).find { |candidate| candidate["name"] == name }
          return found if found
          found = entry.fetch("static_methods", []).find do |candidate|
            candidate["optionals"] && Knowledge.variants(candidate).any? { |variant| variant["name"] == name }
          end
          return found if found
          # A mixin's own ClassMethods, while its layer compiles.
          found = entry.fetch("class_method_entries", []).find { |candidate| candidate["name"] == name }
          return found if found
          found = configuration_entry(entry, name)
          return found if found
          entry["includes"].reverse_each do |mixin_name|
            mixin = entries.find { |candidate| candidate["name"] == resolve(mixin_name, entry["scope"]) }
            next unless mixin && mixin["extends_class_methods"]
            found = mixin.fetch("class_method_entries", []).find { |candidate| candidate["name"] == name }
            return found if found
            found = configuration_entry(mixin, name)
            return found if found
          end
          return nil unless entry["parent"]
          class_member_entry(resolve(entry["parent"], entry["scope"]), method)
        rescue CompileError
          nil
        end

        # A registry read answers the collection it holds; a setting read
        # answers whatever was declared.
        def configuration_entry(owner, name)
          registry = owner.fetch("registries", []).find { |candidate| candidate["name"] == name }
          returns = if registry
            registry["initial"] == "array" ? "T::Array[T.untyped]" : "T::Hash[T.untyped, T.untyped]"
          elsif owner.fetch("settings", []).include?(name)
            "T.untyped"
          end
          return nil unless returns
          {"name" => name, "js" => Knowledge.member(name), "arity" => 0, "parameters" => {},
           "returns" => returns, "configuration" => true}
        end

        def property_entry(type, name)
          entry = entries.find { |candidate| candidate["name"] == type }
          return nil unless entry
          found = (entry["properties"] + entry.fetch("included_properties", [])).find do |property|
            property["name"] == name.to_s
          end
          return found if found
          return nil unless entry["parent"]
          property_entry(resolve(entry["parent"], entry["scope"]), name)
        end

        # Whether the entry's superclass chain reaches +ancestor+ by name.
        def descends_from?(entry, ancestor)
          current = entry
          while current
            return true if current["name"] == ancestor
            return false unless current["parent"]
            parent_name = resolve(current["parent"], current["scope"])
            current = entries.find { |candidate| candidate["name"] == parent_name }
          end
          false
        end

    end
  end
end

require_relative "knowledge/dom"
require_relative "knowledge/reflection"
require_relative "knowledge/collection"
require_relative "knowledge/signatures"
require_relative "knowledge/validation"
