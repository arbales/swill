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

        def collect(source, file, javascript_only: false)
          ast, comments = ::Ruby2JS.parse(source, file)
          # This shared-Ruby spike accepts type hints, not JavaScript-only control
          # pragmas (notably skip/extend, which would invalidate collected metadata).
          Array(comments[:_raw]).each do |comment|
            comment.text.scan(/#\s*Pragma:\s*(\S+)/i).flatten.each do |name|
              unless %w[array hash string].include?(name)
                raise CompileError, "unsupported spike pragma #{name}"
              end
            end
          end
          collect_scope(statements(ast), [], javascript_only)
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

require_relative "knowledge/collection"
require_relative "knowledge/signatures"
require_relative "knowledge/declarations"
