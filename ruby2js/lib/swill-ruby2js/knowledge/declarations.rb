# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # The property, attribute, and outlet declaration DSL.
    class Knowledge
      
        DECLARATION_TYPE = /\A(?:String|Integer|T::Boolean|T\.nilable\((?:String|[A-Z]\w*(?:::\w+)*)\)|[A-Z]\w*(?:::\w+)*)\z/

        def declaration?(node)
          call = node.type == :block ? node.children.first : node
          call.type == :send && call.children.first.nil? && %i[property attribute outlet].include?(call.children[1])
        end

        # Validate source before filters can erase or transform it (Pragma can
        # extract type hints from T.let, which is not annotation-only on MRI).
        def validate_expression!(node)
          return unless node.respond_to?(:type)
          if node.type == :const
            name = constant(node)
            if name == "T" || name.start_with?("T::")
              raise CompileError, "unsupported runtime Sorbet construct #{name}"
            end
          elsif node.type == :send &&
                %i[public_send send __send__ const_get define_method instance_exec eval method_missing].include?(node.children[1])
            raise CompileError, "runtime reflection #{node.children[1]} is outside this spike"
          end
          node.children.each { |child| validate_expression!(child) }
        end

        def collect_property(entry, node)
          call = node.type == :block ? node.children.first : node
          _, macro, name, options = call.children
          raise CompileError, "declaration names must be literal symbols" unless name&.type == :sym
          raise CompileError, "declarations require type: and optional default:" unless options&.type == :hash
          pairs = options.children.to_h do |pair|
            key, value = pair.children
            raise CompileError, "expected literal keyword" unless key.type == :sym
            [key.children.first, value]
          end
          allowed = macro == :outlet ? %i[type optional] : %i[type default key]
          raise CompileError, "unknown declaration keyword" unless (pairs.keys - allowed).empty?
          type = pairs.fetch(:type) { raise CompileError, "declaration requires type:" }.loc.expression.source
          if macro == :attribute && !pairs.key?(:default)
            raise CompileError, "attribute declaration requires default:"
          end
          unless type.match?(DECLARATION_TYPE) || type == "T.untyped"
            raise CompileError, "unsupported declaration type #{type}"
          end
          computed = node.type == :block
          raise CompileError, "outlets cannot be computed" if computed && macro == :outlet
          optional = pairs[:optional]
          if optional && !%i[true false].include?(optional.type)
            raise CompileError, "outlet optional: must be a literal boolean"
          end
          # An outlet is unconnected until awakening, so its reader is nilable.
          if macro == :outlet && type != "T.untyped" && !type.start_with?("T.nilable(")
            type = "T.nilable(#{type})"
          end
          property_name = name.children.first.to_s
          unless property_name.match?(/\A[a-z_]\w*\??\z/) && (computed || !property_name.end_with?("?"))
            raise CompileError, "unsupported property name #{property_name}"
          end
          raise CompileError, "computed attributes are outside this spike" if computed && macro == :attribute
          raise CompileError, "computed default is ambiguous" if computed && pairs.key?(:default)
          if computed && !node.children[1].children.empty?
            raise CompileError, "computed blocks cannot take arguments"
          end
          default = pairs[:default]
          unless computed || default.nil? || %i[str int nil true false].include?(default.type)
            raise CompileError, "spike supports only immutable literal defaults"
          end
          wire_key = pairs[:key]
          if wire_key && !%i[sym str].include?(wire_key.type)
            raise CompileError, "attribute key must be a literal symbol or string"
          end
          validate_expression!(node.children.last) if computed
          property = {
            "name" => name.children.first.to_s, "js" => self.class.member(name.children.first),
            "type" => type, "attribute" => macro == :attribute, "computed" => computed,
            # Include comments after the final expression, where type pragmas live.
            "expression" => computed ? block_body_source(node) : (default&.loc&.expression&.source || "nil")
          }
          property["key"] = wire_key ? wire_key.children.first.to_s : name.children.first.to_s if macro == :attribute
          if macro == :outlet
            property["outlet"] = true
            property["optional"] = optional&.type == :true
          end
          entry["properties"] << property
        end

    end
  end
end
