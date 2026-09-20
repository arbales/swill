# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Walks class and module bodies into entries.
    class Knowledge
      private

        def collect_scope(nodes, scope)
          nodes.each do |node|
            if node.type == :module
              name, body = node.children
              children = statements(body)
              nested = children.select { |child| namespace_declaration?(child) }
              # A Ruby module can provide mixin behavior and own nested constants.
              # Collect those two roles independently instead of treating the
              # presence of any nested declaration as proof that it is only a
              # namespace. Empty modules remain valid (inert) mixins.
              collect_entry(node, scope, "mixin") if children.empty? || nested.length != children.length
              collect_scope(nested, scope + [constant(name)])
            elsif node.type == :class
              collect_entry(node, scope, "class")
            elsif node.type == :send && node.children[0].nil? && %i[require require_relative].include?(node.children[1])
              # Source order is the build's concern (swill build follows
              # require_relative from the entry); here the line is inert.
            else
              raise CompileError, "unsupported top-level #{node.type}: #{node.loc.expression.source}"
            end
          end
        end

        # The constants a source declares as entries, in the order a
        # collection would record them. Read before anything is evaluated, so
        # a file that would reopen a class the compiler already knows is
        # rejected before it can mutate the shared framework container.
        def declared_names(nodes, scope)
          nodes.each_with_object([]) do |node, names|
            if node.type == :module
              name, body = node.children
              children = statements(body)
              nested = children.select { |child| namespace_declaration?(child) }
              names << (scope + [constant(name)]).join("::") if children.empty? || nested.length != children.length
              names.concat(declared_names(nested, scope + [constant(name)]))
            elsif node.type == :class
              names << (scope + [constant(node.children.first)]).join("::")
            end
          end
        end

        # Every block in a file, by the line Proc#source_location reports for
        # it. A computed property's descriptor carries that location, which is
        # how a reflected declaration finds the source to compile.
        def index_blocks(node, file)
          return unless node.respond_to?(:type)
          if node.type == :block
            source = block_body_source(node)
            @blocks[[file, node.loc.expression.line]] = source
            @blocks[[file, node.loc.begin.line]] = source if node.loc.respond_to?(:begin) && node.loc.begin
          end
          node.children.each { |child| index_blocks(child, file) }
        end

        def namespace_declaration?(node)
          return true if node.type == :class
          node.type == :module && constant(node.children.first) != "ClassMethods"
        end

        def collect_entry(node, scope, kind)
          name = (scope + [constant(node.children.first)]).join("::")
          raise CompileError, "reopened/duplicate constant #{name}" if entries.any? { |e| e["name"] == name }

          entry = {
            "name" => name, "identifier" => self.class.identifier(name),
            "kind" => kind, "scope" => scope, "node" => node,
            "parent" => kind == "class" && node.children[1] ? constant(node.children[1]) : nil,
            "includes" => [], "properties" => [], "methods" => [], "static_methods" => [], "included_properties" => [],
            "class_methods" => [], "class_method_entries" => [], "registries" => [], "settings" => [],
            "setting_values" => {}, "registry_values" => {}, "restorations" => []
          }
          target = loader.constant(name)
          raise CompileError, "#{name} did not load" if target.nil?
          pending_signature = nil
          statements(node.children.last).each do |child|
            # async def name ... end parses as async(def ...): the method is
            # asynchronous and may await.
            # macro def self.outlet(...) — a declaration macro's own
            # implementation. The compiler lowers the declaration and never
            # compiles the body.
            next if self.class.macro_wrapper?(child)
            async = self.class.async_wrapper?(child)
            child = child.children[2] if async
            if child.type == :def
              method, args, = child.children
              unless method.to_s.match?(/\A[a-z_]\w*[!?=]?\z/) && method != :method_missing
                raise CompileError, "unsupported method definition #{method}"
              end
              formals = collect_parameters(args, optional: true)
              optionals = formals.select { |formal| formal["default"] }
              if optionals.any? && method.to_s.match?(/[?!=]\z/)
                raise CompileError, "a predicate, bang, or writer takes required arguments only"
              end
              check_signature_parameters!(method, formals, pending_signature)
              validate_expression!(child.children.last)
              collected = {
                "name" => method.to_s, "js" => self.class.member(method),
                "arity" => formals.length - optionals.length,
                "parameters" => signature_parameters(pending_signature),
                "returns" => signature_return(pending_signature),
                "async" => async
              }
              if optionals.any?
                collected["optionals"] = optionals.map { |formal| formal["name"] }
                collected["formals"] = formals
              end
              entry["methods"] << collected
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
                # Whatever the mixin's included hook declared is on the class
                # itself, which is where the entry reads it from.
              end
            elsif child.type == :defs && kind == "class"
              collect_static_method(entry, child, pending_signature, async)
              pending_signature = nil
            elsif child.type == :defs && kind == "mixin"
              collect_included_hook(entry, child)
            elsif child.type == :module && kind == "mixin" &&
                  constant(child.children.first) == "ClassMethods"
              collect_class_methods(entry, child)
            elsif kind == "mixin" && namespace_declaration?(child)
              # collect_scope records nested constants as their own entries.
            elsif declared_call?(target, child)
              # A declaration: the class body already ran, so the class itself
              # records what it did and nothing is interpreted here.
            else
              raise CompileError, "unsupported class body in #{name}: #{child.loc.expression.source}"
            end
          end
          Reflection.fill(entry, target, @blocks)
          if entry["included_hook"]
            probe = begin
              loader.probe(target)
            rescue ::StandardError => error
              raise CompileError, "#{name} included hook: #{error.message}"
            end
            Reflection.fill_included(entry, probe, @blocks)
          end
          if entry["extends_class_methods"] && entry["class_methods"].empty? &&
             entry["registries"].empty? && entry["settings"].empty?
            raise CompileError, "ClassMethods module is missing or empty"
          end
          entries << entry
        end

        # A method's parameters. Positional only: a keyword, a splat, or a
        # block parameter has no place in a metadata-dispatched protocol.
        # Optionals must be contiguous, as Ruby requires, so a variant is
        # named by how many of them it takes.
        def collect_parameters(args, optional:, subject: "method")
          formals = args.children.map do |arg|
            case arg.type
            when :arg then {"name" => arg.children.first.to_s}
            when :optarg
              unless optional
                raise CompileError, "#{subject} arguments are positional and required"
              end
              {"name" => arg.children.first.to_s, "default" => arg.children[1].loc.expression.source}
            else
              raise CompileError, "#{subject} arguments are positional#{optional ? '' : ' and required'}"
            end
          end
          defaults = formals.each_index.select { |index| formals[index]["default"] }
          unless defaults.empty? || defaults == (defaults.first..defaults.last).to_a
            raise CompileError, "optional arguments must be contiguous"
          end
          formals
        end

        # The signature names the parameters the definition does, in order.
        # Nothing checked this before; with optionals in play a mismatch would
        # silently type the wrong argument at every call site.
        def check_signature_parameters!(name, formals, signature)
          return unless signature
          declared = signature_parameters(signature).keys
          return if declared.empty? || declared == formals.map { |formal| formal["name"] }
          raise CompileError, "signature parameters must match #{name}'s parameters in order"
        end

        # Whether a class-body statement is a declaration: the property
        # primitive, a macro an ancestor marked, or a setting an included
        # ClassMethods declares.
        def declared_call?(target, node)
          call = node.type == :block ? node.children.first : node
          return false unless call.respond_to?(:type) && call.type == :send && call.children.first.nil?
          name = call.children[1]
          return false unless Reflection.declaration?(target, name)
          # A class body writes a setting; reading one there says nothing.
          if Reflection.setting?(target, name) && call.children.length == 2
            raise CompileError, "#{name} takes one value"
          end
          true
        end

        # def self.name(args) on a class: a static method. Inside it, self is
        # the class and a bare new constructs it.
        def self.async_wrapper?(node)
          wrapper?(node, :async)
        end

        # macro def name(...) — the sibling of async def: the definition is a
        # declaration macro, callable in a class body and never emitted.
        def self.macro_wrapper?(node)
          wrapper?(node, :macro)
        end

        def self.wrapper?(node, name)
          node.type == :send && node.children[0].nil? && node.children[1] == name &&
            node.children.length == 3 && node.children[2].respond_to?(:type) && %i[def defs].include?(node.children[2].type)
        end

        def collect_static_method(entry, node, signature, async)
          receiver, method, args, body = node.children
          raise CompileError, "class methods are defined on self" unless receiver.type == :self
          unless method.to_s.match?(/\A[a-z_]\w*[!?=]?\z/) && method != :new
            raise CompileError, "unsupported method definition self.#{method}"
          end
          formals = collect_parameters(args, optional: false)
          check_signature_parameters!(method, formals, signature)
          validate_expression!(body)
          entry["static_methods"] << {
            "name" => method.to_s, "js" => self.class.member(method), "arity" => args.children.length,
            "parameters" => signature_parameters(signature), "returns" => signature_return(signature),
            "async" => async
          }
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

          statements(body).each do |statement|
            call = statement.type == :block ? statement.children.first : statement
            receiver, method, *arguments = call.children if call.type == :send
            if statement.type == :send && receiver&.type == :lvar && receiver.children == [base] &&
               method == :extend && arguments.length == 1 &&
               constant(arguments.first) == "ClassMethods"
              entry["extends_class_methods"] = true
            elsif receiver&.type == :lvar && receiver.children == [base]
              # A declaration on the including class. What it declares is read
              # from a class that includes the mixin; a computed block
              # compiles in each receiver.
            else
              raise CompileError, "included hooks support only declarations on base"
            end
          end
        end

        def collect_class_methods(entry, node)
          pending_signature = nil
          statements(node.children.last).each do |statement|
            if self.class.macro_wrapper?(statement)
              # A declaration macro's implementation. The compiler lowers the
              # declaration itself and never compiles this body.
              pending_signature = nil
              next
            elsif statement.type == :def
              method, args, = statement.children
              collect_parameters(args, optional: false, subject: "class method")
              validate_expression!(statement.children.last)
              entry["class_methods"] << statement
              entry["class_method_entries"] << {
                "name" => method.to_s, "js" => self.class.member(method), "arity" => args.children.length,
                "parameters" => signature_parameters(pending_signature),
                "returns" => signature_return(pending_signature)
              }
              pending_signature = nil
            elsif statement.type == :send && statement.children[0..1] == [nil, :extend] &&
                  %w[Swill::Declarations T::Sig].include?(constant(statement.children.fetch(2)))
              # The compiler implements this finite declaration protocol
              # directly; T::Sig is annotation-only.
            elsif statement.type == :send && statement.children.first.nil? &&
                  %i[inheritable_registry class_setting].include?(statement.children[1])
              # A registry or a setting: the module already declared it, and
              # the entry reads it back from the module itself.
              _, macro, name, = statement.children
              raise CompileError, "#{macro} name must be a literal symbol" unless name&.type == :sym
            elsif signature?(statement)
              # Sorbet checks signatures; executable definitions omit them,
              # and the compiler reads the types.
              pending_signature = statement
            else
              raise CompileError, "unsupported ClassMethods body: #{statement.loc.expression.source}"
            end
          end
        end

    end
  end
end
