# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Walks class and module bodies into entries.
    class Knowledge
      private

        def collect_scope(nodes, scope, javascript_only)
          nodes.each do |node|
            if node.type == :module
              name, body = node.children
              children = statements(body)
              nested = children.select { |child| namespace_declaration?(child) }
              # A Ruby module can provide mixin behavior and own nested constants.
              # Collect those two roles independently instead of treating the
              # presence of any nested declaration as proof that it is only a
              # namespace. Empty modules remain valid (inert) mixins.
              collect_entry(node, scope, "mixin", javascript_only) if children.empty? || nested.length != children.length
              collect_scope(nested, scope + [constant(name)], javascript_only)
            elsif node.type == :class
              collect_entry(node, scope, "class", javascript_only)
            else
              raise CompileError, "unsupported top-level #{node.type}: #{node.loc.expression.source}"
            end
          end
        end

        def namespace_declaration?(node)
          return true if node.type == :class
          node.type == :module && constant(node.children.first) != "ClassMethods"
        end

        def collect_entry(node, scope, kind, javascript_only)
          name = (scope + [constant(node.children.first)]).join("::")
          raise CompileError, "reopened/duplicate constant #{name}" if entries.any? { |e| e["name"] == name }

          entry = {
            "name" => name, "identifier" => self.class.identifier(name),
            "kind" => kind, "scope" => scope, "node" => node, "javascript_only" => javascript_only,
            "parent" => kind == "class" && node.children[1] ? constant(node.children[1]) : nil,
            "includes" => [], "properties" => [], "methods" => [], "included_properties" => [],
            "class_methods" => [], "registries" => [], "settings" => [], "restorations" => []
          }
          pending_signature = nil
          statements(node.children.last).each do |child|
            if child.type == :def
              method, args, = child.children
              unless method.to_s.match?(/\A[a-z_]\w*[!?=]?\z/) &&
                     method != :method_missing && (javascript_only || method != :initialize)
                raise CompileError, "unsupported method definition #{method}"
              end
              unless args.children.all? { |arg| arg.type == :arg }
                raise CompileError, "only positional required method arguments are supported"
              end
              validate_expression!(child.children.last)
              entry["methods"] << {
                "name" => method.to_s, "js" => self.class.member(method),
                "arity" => args.children.length,
                "parameters" => signature_parameters(pending_signature),
                "returns" => signature_return(pending_signature)
              }
              pending_signature = nil
            elsif signature?(child)
              # Sorbet checks these; executable definitions omit annotations.
              pending_signature = child
            elsif child.type == :send && child.children[0..1] == [nil, :extend] &&
                  child.children[2..] == [::Ruby2JS.parse("T::Sig").first]
              # Annotation-only extension.
            elsif child.type == :send && child.children[0..1] == [nil, :include]
              names = child.children[2..].map { |arg| constant(arg) }
              # Ruby include A, B places A before B in lookup; separate includes
              # put the last include first. Factory nesting preserves both rules.
              entry["includes"].concat(names.reverse)
              names.reverse_each do |mixin_name|
                resolved = resolve(mixin_name, scope)
                mixin = entries.find { |candidate| candidate["name"] == resolved }
                raise CompileError, "include target must be a mixin" unless mixin["kind"] == "mixin"
                # Interpret only the supported static declaration hook, never run
                # application Ruby. Each receiver owns its declaration descriptors.
                entry["properties"].concat(mixin.fetch("included_properties", []).map(&:dup))
              end
            elsif child.type == :defs && kind == "mixin"
              collect_included_hook(entry, child)
            elsif child.type == :module && kind == "mixin" &&
                  constant(child.children.first) == "ClassMethods"
              collect_class_methods(entry, child)
            elsif kind == "mixin" && namespace_declaration?(child)
              # collect_scope records nested constants as their own entries.
            elsif child.type == :send && child.children[0..1] == [nil, :restorable]
              collect_restorable(entry, child)
            elsif declaration?(child)
              collect_property(entry, child)
            else
              raise CompileError, "unsupported class body in #{name}: #{child.loc.expression.source}"
            end
          end
          names = entry["properties"].map { |property| property["name"] }
          raise CompileError, "duplicate property in #{name}" unless names.uniq == names
          if entry["extends_class_methods"] && entry["class_methods"].empty? &&
             entry["registries"].empty? && entry["settings"].empty?
            raise CompileError, "ClassMethods module is missing or empty"
          end
          entries << entry
        end

        def collect_included_hook(entry, node)
          receiver, name, args, body = node.children
          unless receiver.type == :self && name == :included &&
                 args.children.length == 1 && args.children.first.type == :arg
            raise CompileError, "only self.included(base) declaration hooks are supported"
          end
          if entry["included_hook"]
            raise CompileError, "duplicate included hook in #{entry['name']}"
          end
          entry["included_hook"] = true
          base = args.children.first.children.first
          declarations = {"properties" => []}
          statements(body).each do |statement|
            call = statement.type == :block ? statement.children.first : statement
            receiver, method, *arguments = call.children if call.type == :send
            if statement.type == :send && receiver&.type == :lvar && receiver.children == [base] &&
               method == :extend && arguments.length == 1 &&
               constant(arguments.first) == "ClassMethods"
              entry["extends_class_methods"] = true
            elsif receiver&.type == :lvar && receiver.children == [base] &&
                  %i[property attribute].include?(method)
              # Stored or computed; a computed block compiles in each receiver.
              collect_property(declarations, statement)
            else
              raise CompileError, "included hooks support only literal base.property/base.attribute declarations"
            end
          end
          entry["included_properties"] = declarations["properties"]
          names = entry["included_properties"].map { |property| property["name"] }
          raise CompileError, "duplicate included property" unless names.uniq == names
        end

        def collect_class_methods(entry, node)
          statements(node.children.last).each do |statement|
            if statement.type == :def
              method, args, = statement.children
              if entry["name"] == "Swill::Model::Attributes" && method == :attribute
                # `attribute` is a compile-time class-body declaration in JavaScript.
                # Its ordinary Ruby implementation remains the MRI source of truth;
                # collect_property and generated registry seeds lower that one
                # finite protocol without compiling its metaprogramming body.
                next
              end
              unless args.children.all? { |arg| arg.type == :arg }
                raise CompileError, "class methods support only positional required arguments"
              end
              validate_expression!(statement.children.last)
              entry["class_methods"] << statement
            elsif statement.type == :send && statement.children[0..1] == [nil, :extend] &&
                  constant(statement.children.fetch(2)).end_with?("Declarations")
              # The compiler implements this finite declaration protocol directly.
            elsif statement.type == :send && statement.children.first.nil? &&
                  %i[inheritable_registry class_setting].include?(statement.children[1])
              _, macro, name, *options = statement.children
              raise CompileError, "#{macro} name must be a literal symbol" unless name&.type == :sym
              if macro == :inheritable_registry
                initial = options.empty? ? :hash : options.first&.children&.first
                unless options.length <= 1 && options.first&.type != :block && %i[hash array].include?(initial)
                  raise CompileError, "registry storage must be :hash or :array"
                end
                entry["registries"] << {"name" => name.children.first.to_s, "initial" => initial.to_s}
              else
                raise CompileError, "class_setting coercion blocks are outside this slice" unless options.empty?
                entry["settings"] << name.children.first.to_s
              end
            elsif signature?(statement)
              # Sorbet checks signatures; executable definitions omit them.
            else
              raise CompileError, "unsupported ClassMethods body: #{statement.loc.expression.source}"
            end
          end
          names = entry["registries"].map { |item| item["name"] } + entry["settings"]
          raise CompileError, "duplicate class declaration" unless names.uniq == names
        end

    end
  end
end
