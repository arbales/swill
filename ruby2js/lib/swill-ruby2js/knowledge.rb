# typed: false
# frozen_string_literal: true

require_relative "names"

module Swill
  module Ruby2JS
    # Static facts about classes, mixins, declarations, and methods collected
    # from source without evaluating it. Collection lives in knowledge/.
    class Knowledge
      attr_reader :entries

      def self.identifier(name)
        Names.identifier(name)
      end

      def self.member(name)
        Names.member(name)
      end

        def initialize(imports = [])
          @entries = imports.map { |entry| entry.merge("imported" => true) }
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
          collect_scope(statements(ast), [])
          self
        end

        def local
          entries.reject { |entry| entry["imported"] }
        end

        def interface
          local.map { |entry| entry.reject { |key, _| key == "node" } }
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
          # A mixin's own ClassMethods, while its layer compiles.
          found = entry.fetch("class_method_entries", []).find { |candidate| candidate["name"] == name }
          return found if found
          if entry.fetch("registries", []).any? { |registry| registry["name"] == name } || entry.fetch("settings", []).include?(name)
            return {"name" => name, "js" => Knowledge.member(name), "arity" => 0, "parameters" => {},
                    "returns" => "T.untyped", "configuration" => true}
          end
          entry["includes"].reverse_each do |mixin_name|
            mixin = entries.find { |candidate| candidate["name"] == resolve(mixin_name, entry["scope"]) }
            next unless mixin && mixin["extends_class_methods"]
            found = mixin.fetch("class_method_entries", []).find { |candidate| candidate["name"] == name }
            return found if found
            if mixin["registries"].any? { |registry| registry["name"] == name } || mixin["settings"].include?(name)
              return {"name" => name, "js" => Knowledge.member(name), "arity" => 0, "parameters" => {},
                      "returns" => "T.untyped", "configuration" => true}
            end
          end
          return nil unless entry["parent"]
          class_member_entry(resolve(entry["parent"], entry["scope"]), method)
        rescue CompileError
          nil
        end

        # Whether a class body may set +name+: a class_setting an included
        # mixin, or an ancestor's, declares. The entry is still being built.
        def setting_declared?(entry, name)
          entry["includes"].each do |mixin_name|
            mixin = entries.find { |candidate| candidate["name"] == resolve(mixin_name, entry["scope"]) }
            return true if mixin && mixin.fetch("settings", []).include?(name.to_s)
          end
          return false unless entry["parent"]
          parent = entries.find { |candidate| candidate["name"] == resolve(entry["parent"], entry["scope"]) }
          parent ? setting_declared?(parent, name) : false
        rescue CompileError
          false
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
require_relative "knowledge/collection"
require_relative "knowledge/signatures"
require_relative "knowledge/declarations"
