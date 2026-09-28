# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Walks class and module bodies into entries.
    class Knowledge
      private

        # Reject unsupported source structure and method expressions before a
        # class body runs. Declaration calls are known from prior entries and
        # from macro/setting definitions anywhere in this source.
        def preflight_scope!(nodes, declarations)
          nodes.each do |node|
            if node.type == :module
              name, body = node.children
              children = statements(body)
              nested = children.select { |child| namespace_declaration?(child) }
              preflight_entry!(node, "mixin", declarations) if children.empty? || nested.length != children.length
              preflight_scope!(nested, declarations)
            elsif node.type == :class
              preflight_entry!(node, "class", declarations)
            elsif node.type == :send && node.children[0].nil? && %i[require require_relative].include?(node.children[1])
              next
            else
              raise CompileError, "unsupported top-level #{node.type}: #{node.loc.expression.source}"
            end
          end
        end

        def preflight_entry!(node, kind, declarations)
          statements(node.children.last).each do |statement|
            next if self.class.macro_wrapper?(statement)
            next if self.class.visibility_statement?(statement)
            statement = self.class.unwrap_visibility(statement)
            async = self.class.async_wrapper?(statement)
            child = async ? statement.children[2] : statement
            if child.type == :def
              validate_expression!(child.children.last)
            elsif attribute_accessor?(child)
              next
            elsif child.type == :defs
              # An included hook contains declaration calls whose type
              # arguments are data, and is checked structurally after load.
              validate_expression!(child.children.last) unless kind == "mixin" && child.children[1] == :included
            elsif signature?(child)
              next
            elsif type_member?(child)
              next
            elsif child.type == :casgn && child.children[0].nil?
              validate_expression!(child.children[2])
            elsif child.type == :send && child.children.first.nil? && %i[extend include].include?(child.children[1])
              next
            elsif child.type == :module && kind == "mixin" && constant(child.children.first) == "ClassMethods"
              preflight_class_methods!(child, declarations)
            elsif kind == "mixin" && namespace_declaration?(child)
              next
            else
              call = child.type == :block ? child.children.first : child
              name = call.children[1].to_s if call&.type == :send && call.children.first.nil?
              next if name && declarations.include?(name)
              raise CompileError, "unsupported class body: #{child.loc.expression.source}"
            end
          end
        end

        def preflight_class_methods!(node, declarations)
          statements(node.children.last).each do |statement|
            next if self.class.macro_wrapper?(statement) || signature?(statement)
            next if self.class.visibility_statement?(statement)
            if statement.type == :def
              validate_expression!(statement.children.last)
            elsif statement.type == :send && statement.children.first.nil? &&
                  %i[extend inheritable_registry class_setting].include?(statement.children[1])
              next
            else
              raise CompileError, "unsupported ClassMethods body: #{statement.loc.expression.source}"
            end
          end
        end

        def declaration_names(ast)
          names = ["property", "declare_restoration"]
          entries.each do |entry|
            names.concat(entry.fetch("macros", []), entry.fetch("settings", []))
          end
          visit = lambda do |node|
            next unless node.respond_to?(:type)
            if self.class.macro_wrapper?(node)
              definition = node.children[2]
              names << definition.children[definition.type == :defs ? 1 : 0].to_s
            elsif node.type == :send && node.children.first.nil? && node.children[1] == :class_setting &&
                  node.children[2]&.type == :sym
              names << node.children[2].children.first.to_s
            end
            node.children.each { |child| visit.(child) }
          end
          visit.(ast)
          names.uniq
        end

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
        # collection would record them. Read before anything is evaluated so
        # imported framework namespaces can be rejected without mutation.
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
          # Inner blocks first, so a line they begin on stays theirs.
          node.children.each { |child| index_blocks(child, file) }
          return unless node.type == :block
          source = block_body_source(node)
          # Proc#source_location reports the line of `do`, which for a call
          # wrapped over several lines is not the line the call begins on,
          # so every line of the block is keyed to it unless an inner block
          # already claimed the line.
          range = node.loc.expression
          first = range.line
          last = range.source_buffer.line_for_position(range.end_pos)
          (first..last).each { |line| @blocks[[file, line]] ||= source }
        end

        def namespace_declaration?(node)
          return true if node.type == :class
          node.type == :module && constant(node.children.first) != "ClassMethods"
        end

        def collect_entry(node, scope, kind)
          name = (scope + [constant(node.children.first)]).join("::")
          existing = entries.find { |candidate| candidate["name"] == name }
          if existing&.fetch("imported", false)
            raise CompileError, "application cannot reopen imported constant #{name}"
          end
          if existing && existing["kind"] != kind
            raise CompileError, "#{name} cannot be reopened as a #{kind}"
          end

          entry = {
            "name" => name, "identifier" => self.class.identifier(name),
            "kind" => kind, "scope" => scope, "node" => node,
            "parent" => kind == "class" && node.children[1] ? constant(node.children[1]) : nil,
            "includes" => [], "properties" => [], "methods" => [], "static_methods" => [], "included_properties" => [],
            "class_methods" => [], "class_method_entries" => [], "registries" => [], "settings" => [],
            "module_functions" => [], "constant_nodes" => [], "constants" => [],
            "setting_values" => {}, "registry_values" => {}, "restorations" => []
          }
          target = loader.constant(name)
          raise CompileError, "#{name} did not load" if target.nil?
          pending_signature = nil
          # Ruby's visibility rules, read as Ruby reads them: a bare
          # `private` applies to the definitions after it, `private def`
          # to that one definition, and `private :name` to methods by name
          # once the body has run.
          visibility = "public"
          named_visibility = {}
          statements(node.children.last).each do |child|
            # async def name ... end parses as async(def ...): the method is
            # asynchronous and may await.
            # macro def self.outlet(...) — a declaration macro's own
            # implementation. The compiler lowers the declaration and never
            # compiles the body.
            next if self.class.macro_wrapper?(child)
            if self.class.visibility_toggle?(child)
              visibility = child.children[1].to_s
              next
            elsif self.class.visibility_names?(child)
              child.children[2..].each { |symbol| named_visibility[symbol.children.first.to_s] = child.children[1].to_s }
              next
            end
            explicit = self.class.visibility_wrapper?(child) ? child.children[1].to_s : nil
            child = self.class.unwrap_visibility(child)
            async = self.class.async_wrapper?(child)
            child = child.children[2] if async
            if child.type == :def
              method, args, = child.children
              unless method.to_s.match?(/\A[a-z_]\w*[!?=]?\z/) && method != :method_missing
                raise CompileError, "unsupported method definition #{method}"
              end
              formals = collect_parameters(args)
              optionals = formals.select { |formal| formal["kind"] == "opt" }
              check_signature_parameters!(method, formals, pending_signature)
              validate_expression!(child.children.last)
              collected = {
                "name" => method.to_s, "js" => self.class.member(method),
                "arity" => formals.count { |formal| formal["kind"] == "req" },
                "maximum" => formals.any? { |formal| formal["kind"] == "rest" } ? nil :
                  formals.count { |formal| %w[req opt].include?(formal["kind"]) },
                "parameters" => signature_parameters(pending_signature),
                "returns" => signature_return(pending_signature),
                "async" => async, "formals" => formals
              }
              complex = formals.any? { |formal| !%w[req opt].include?(formal["kind"]) } ||
                implicit_block?(child.children.last)
              collected["complex"] = true if complex
              collected["implicit_block"] = true if implicit_block?(child.children.last)
              if optionals.any? && !complex
                collected["optionals"] = optionals.map { |formal| formal["name"] }
              end
              member_visibility = explicit || visibility
              collected["visibility"] = member_visibility unless member_visibility == "public"
              entry["methods"] << collected
              pending_signature = nil
            elsif attribute_accessor?(child)
              accessors = collect_attribute_accessors(child, pending_signature)
              accessors.each { |accessor| accessor["visibility"] = visibility } unless visibility == "public"
              entry["methods"].concat(accessors)
              pending_signature = nil
            elsif signature?(child)
              # Sorbet checks these; executable definitions omit annotations.
              pending_signature = child
            elsif type_member?(child)
              # Sorbet-only generic metadata; JavaScript has no runtime type member.
              next
            elsif child.type == :casgn && child.children[0].nil?
              validate_expression!(child.children[2])
              entry["constant_nodes"] << child
              entry["constants"] << child.children[1].to_s
            elsif child.type == :send && child.children[0..1] == [nil, :extend] &&
                  [::Ruby2JS.parse("T::Sig").first, ::Ruby2JS.parse("T::Generic").first].include?(child.children[2])
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
              if child.children[1] == :included
                collect_included_hook(entry, child)
              else
                # A module function: the module is a namespace as well as a
                # mixin, so the function belongs to the module itself rather
                # than to whatever includes it.
                collect_static_method(entry, child, pending_signature, async)
                entry["module_functions"] << child
                pending_signature = nil
              end
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
          named_visibility.each do |method_name, member_visibility|
            method = entry["methods"].find { |candidate| candidate["name"] == method_name }
            raise CompileError, "#{member_visibility} names an undefined method #{method_name} in #{name}" unless method
            if member_visibility == "public"
              method.delete("visibility")
            else
              method["visibility"] = member_visibility
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
             entry["registries"].empty? && entry["settings"].empty? && entry["macros"].empty?
            raise CompileError, "ClassMethods module is missing or empty"
          end
          source_methods = merge_methods([], entry["methods"].reject { |method| method["to"] })
          entry["methods"] = source_methods + entry["methods"].select { |method| method["to"] }
          entry["static_methods"] = merge_methods([], entry["static_methods"])
          if existing
            merge_entry!(existing, entry, node)
          else
            entry["fragments"] = [node]
            entry["source_files"] = [node.loc.expression.source_buffer.name]
            entries << entry
          end
          refresh_entry_node!(existing || entry)
        end

        # Ruby class bodies run in source order. Keep one compiler entry and
        # one emitted JavaScript class while folding later bodies into it.
        # Method definitions replace an earlier definition with the same Ruby
        # name; reflected declarations already describe the class's final MRI
        # state after this fragment ran.
        def merge_entry!(entry, fragment, node)
          if fragment["parent"] && !same_parent?(entry, fragment)
            raise CompileError, "superclass mismatch for class #{entry['name']}"
          end

          entry["fragments"] << node
          entry["source_files"] << node.loc.expression.source_buffer.name
          entry["includes"] = (entry["includes"] + fragment["includes"]).uniq
          entry["methods"] = merge_methods(entry["methods"].reject { |method| method["to"] },
                                             fragment["methods"].reject { |method| method["to"] }) +
            fragment["methods"].select { |method| method["to"] }
          entry["static_methods"] = merge_methods(entry["static_methods"], fragment["static_methods"])
          entry["class_methods"] = merge_method_nodes(entry["class_methods"], fragment["class_methods"])
          entry["class_method_entries"] = merge_methods(entry["class_method_entries"],
                                                          fragment["class_method_entries"])
          entry["constant_nodes"] = merge_constant_nodes(entry["constant_nodes"], fragment["constant_nodes"])
          entry["constants"] = entry["constant_nodes"].map { |node| node.children[1].to_s }
          %w[macros properties restorations registries settings registry_values setting_values
             included_properties].each do |key|
            entry[key] = fragment[key]
          end
          entry["included_hook"] ||= fragment["included_hook"]
          entry["extends_class_methods"] ||= fragment["extends_class_methods"]
        end

        def merge_methods(existing, additions)
          additions.reduce(existing.dup) do |methods, method|
            methods.reject { |candidate| candidate["name"] == method["name"] } << method
          end
        end

        def merge_constant_nodes(existing, additions)
          additions.reduce(existing.dup) do |constants, constant_node|
            name = constant_node.children[1]
            constants.reject { |candidate| candidate.children[1] == name } << constant_node
          end
        end

        def same_parent?(entry, fragment)
          existing = entry["parent"] || "Object"
          added = fragment["parent"]
          return true if existing == added
          resolve(existing, entry["scope"]) == resolve(added, fragment["scope"])
        rescue CompileError
          false
        end

        def merge_method_nodes(existing, additions)
          additions.reduce(existing.dup) do |methods, method|
            name = method.children.first.to_s
            methods.reject { |candidate| candidate.children.first.to_s == name } << method
          end
        end

        # Filters reason about a single class AST. Reparse the concatenated
        # bodies so type inference and emission see every fragment without
        # producing prototype patches or a second JavaScript class.
        def refresh_entry_node!(entry)
          return if entry["fragments"].length == 1
          body_statements = entry["fragments"].flat_map { |fragment| statements(fragment.children.last) }
          last_method = {}
          body_statements.each_with_index do |statement, index|
            key = defined_method_key(statement)
            last_method[key] = index if key
          end
          body = body_statements.each_with_index.filter_map do |statement, index|
            key = defined_method_key(statement)
            next if key && last_method[key] != index
            statement.loc.expression.source
          end.join("\n")
          keyword = entry["kind"] == "mixin" ? "module" : "class"
          source = "#{keyword} Reopened\n#{body}\nend\n"
          ast, = ::Ruby2JS.parse(source, entry["source_files"].join(" + "))
          entry["node"] = statements(ast).first
        end

        def defined_method_key(statement)
          statement = self.class.unwrap_visibility(statement)
          statement = statement.children[2] if self.class.async_wrapper?(statement)
          case statement.type
          when :def then ["instance", statement.children.first.to_s]
          when :defs then ["class", statement.children[1].to_s]
          when :casgn then ["constant", statement.children[1].to_s] unless type_member?(statement)
          end
        end

        def type_member?(node)
          node.type == :casgn && node.children[2]&.type == :send &&
            node.children[2].children[0..1] == [nil, :type_member]
        end

        # Named Ruby parameters. Anonymous forwarding forms are intentionally
        # outside the spike: they have no stable name for signatures or wire schemas.
        def collect_parameters(args, subject: "method")
          formals = args.children.map do |arg|
            case arg.type
            when :arg then {"name" => arg.children.first.to_s, "kind" => "req"}
            when :optarg
              {"name" => arg.children.first.to_s, "kind" => "opt", "default" => arg.children[1].loc.expression.source}
            when :restarg then named_formal(arg, "rest", subject)
            when :kwarg then named_formal(arg, "keyreq", subject)
            when :kwoptarg
              named_formal(arg, "key", subject).merge("default" => arg.children[1].loc.expression.source)
            when :kwrestarg then named_formal(arg, "keyrest", subject)
            when :blockarg then named_formal(arg, "block", subject)
            else
              raise CompileError, "unsupported #{subject} parameter form #{arg.type}"
            end
          end
          formals
        end

        def named_formal(arg, kind, subject)
          name = arg.children.first
          if name.nil? || %i[* ** &].include?(name)
            raise CompileError, "anonymous #{subject} parameters are not supported"
          end
          {"name" => name.to_s, "kind" => kind}
        end

        def implicit_block?(node)
          return false unless node.respond_to?(:type)
          return true if node.type == :yield
          return true if node.type == :send && node.children[0..1] == [nil, :block_given?]
          node.children.any? { |child| implicit_block?(child) }
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

        # attr_reader, attr_writer, and attr_accessor with literal names. They
        # compile to native accessors, as def name=(value) already does, so a
        # reader is read rather than called.
        def attribute_accessor?(node)
          return false unless node.type == :send && node.children.first.nil? &&
                              %i[attr_reader attr_writer attr_accessor].include?(node.children[1])
          names = node.children[2..]
          unless names.any? && names.all? { |name| name.type == :sym && name.children.first.match?(/\A[a-z_]\w*\z/) }
            raise CompileError, "#{node.children[1]} takes literal symbol names: #{node.loc.expression.source}"
          end
          true
        end

        # A signature above an accessor declaration types each of its names,
        # as Sorbet reads it: returns(T) for a reader, params(name: T) for a
        # writer.
        def collect_attribute_accessors(node, signature)
          kind = node.children[1]
          returns = signature_return(signature)
          node.children[2..].flat_map do |name_node|
            name = name_node.children.first.to_s
            reader = {
              "name" => name, "js" => self.class.member(name), "arity" => 0, "maximum" => 0,
              "parameters" => {}, "returns" => returns, "async" => false, "formals" => [], "accessor" => true
            }
            type = signature_parameters(signature)[name] || returns
            writer = {
              "name" => "#{name}=", "js" => self.class.member("#{name}="), "arity" => 1, "maximum" => 1,
              "parameters" => type ? {name => type} : {}, "returns" => type, "async" => false,
              "formals" => [{"name" => name, "kind" => "req"}]
            }
            case kind
            when :attr_reader then [reader]
            when :attr_writer then [writer]
            else [reader, writer]
            end
          end
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

        VISIBILITIES = %i[private protected public].freeze

        # A bare `private` (or `protected`, `public`): the visibility of the
        # definitions that follow it in the body.
        def self.visibility_toggle?(node)
          node.type == :send && node.children[0].nil? && VISIBILITIES.include?(node.children[1]) &&
            node.children.length == 2
        end

        # `private :a, :b`: a visibility applied to methods by name.
        def self.visibility_names?(node)
          node.type == :send && node.children[0].nil? && VISIBILITIES.include?(node.children[1]) &&
            node.children.length > 2 && node.children[2..].all? { |arg| arg.respond_to?(:type) && arg.type == :sym }
        end

        # `private def name ... end`, with `async def` allowed inside: the
        # visibility of that one definition.
        def self.visibility_wrapper?(node)
          return false unless node.type == :send && node.children[0].nil? && VISIBILITIES.include?(node.children[1]) &&
                              node.children.length == 3 && node.children[2].respond_to?(:type)
          inner = node.children[2]
          inner.type == :def || async_wrapper?(inner)
        end

        def self.visibility_statement?(node)
          visibility_toggle?(node) || visibility_names?(node)
        end

        # The definition inside a visibility wrapper, or the node itself.
        def self.unwrap_visibility(node)
          visibility_wrapper?(node) ? node.children[2] : node
        end

        def collect_static_method(entry, node, signature, async)
          receiver, method, args, body = node.children
          raise CompileError, "class methods are defined on self" unless receiver.type == :self
          unless method == :[] || (method.to_s.match?(/\A[a-z_]\w*[!?=]?\z/) && method != :new)
            raise CompileError, "unsupported method definition self.#{method}"
          end
          formals = collect_parameters(args)
          check_signature_parameters!(method, formals, signature)
          validate_expression!(body)
          optionals = formals.select { |formal| formal["kind"] == "opt" }
          collected = {
            "name" => method.to_s, "js" => self.class.member(method), "arity" => args.children.length,
            "maximum" => formals.any? { |formal| formal["kind"] == "rest" } ? nil :
              formals.count { |formal| %w[req opt].include?(formal["kind"]) },
            "parameters" => signature_parameters(signature), "returns" => signature_return(signature),
            "async" => async, "formals" => formals
          }
          collected["arity"] = formals.count { |formal| formal["kind"] == "req" }
          complex = formals.any? { |formal| !%w[req opt].include?(formal["kind"]) } || implicit_block?(body)
          collected["complex"] = true if complex
          collected["implicit_block"] = true if implicit_block?(body)
          collected["optionals"] = optionals.map { |formal| formal["name"] } if optionals.any? && !complex
          entry["static_methods"] << collected
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
            elsif self.class.visibility_statement?(statement)
              # Ruby's visibility for the macros and class methods after it,
              # which Sorbet checks on MRI; the browser's class methods stay
              # ordinary.
              next
            elsif statement.type == :def
              method, args, = statement.children
              formals = collect_parameters(args, subject: "class method")
              validate_expression!(statement.children.last)
              entry["class_methods"] << statement
              entry["class_method_entries"] << {
                "name" => method.to_s, "js" => self.class.member(method),
                "arity" => formals.count { |formal| formal["kind"] == "req" },
                "maximum" => formals.any? { |formal| formal["kind"] == "rest" } ? nil :
                  formals.count { |formal| %w[req opt].include?(formal["kind"]) },
                "formals" => formals,
                # ClassMethods factories are emitted separately and do not get
                # generated arity shims, so their optionals use the adapter too.
                "complex" => formals.any? { |formal| formal["kind"] != "req" } || implicit_block?(statement.children.last),
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
