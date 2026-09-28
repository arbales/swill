# typed: false
# frozen_string_literal: true

require "json"
require "open3"
require "ruby2js"
begin
  require "ruby2js/filter/pragma"
rescue LoadError
  # Ruby2JS 5.1.2 as published does not carry the Pragma filter this compiler
  # extends; the version on master does, under the same version number. Say so
  # here rather than failing later on an uninitialized constant.
  raise LoadError, <<~MESSAGE
    swill needs the Pragma filter, which is not in any released ruby2js.
    Add the git source to your Gemfile alongside the gem:

      gem "ruby2js", git: "https://github.com/ruby2js/ruby2js.git", branch: "master"
  MESSAGE
end
require "ruby2js/filter/return"
require_relative "names"
require_relative "knowledge"
require_relative "loader"
require_relative "filters/sorbet_operations"
require_relative "filters/shared_lowering"
require_relative "filters/static_types"
require_relative "filters/core_types"
require_relative "filters/ruby_surface"
require_relative "filters/ruby_calls"

module Swill
  module Ruby2JS
    # The framework's own sources in compilation order.
    FRAMEWORK_SOURCES = %w[
      rb/framework/core/observable.rb
      rb/framework/core/object.rb
      rb/framework/core/dom.rb
      rb/framework/core/swell.rb
      rb/framework/core/notification_center.rb
      rb/framework/core/wire.rb
      rb/framework/core/value_transformer.rb
      rb/framework/core/binding_destinations.rb
      rb/framework/core/binding.rb
      rb/framework/core/object_bindings.rb
      rb/framework/core/collection_arrangement.rb
      rb/framework/core/responder.rb
      rb/framework/core/outlet_owner.rb
      rb/framework/core/templates.rb
      rb/framework/core/view.rb
      rb/framework/control/base.rb
      rb/framework/control/button.rb
      rb/framework/control/text_field.rb
      rb/framework/control/select.rb
      rb/framework/control/custom_select.rb
      rb/framework/control/segmented.rb
      rb/framework/core/controller.rb
      rb/framework/connections/bindings.rb
      rb/framework/connections/actions.rb
      rb/framework/connections/outlets.rb
      rb/framework/core/awakening.rb
      rb/framework/core/url_fragment.rb
      rb/framework/core/window.rb
      rb/framework/core/application.rb
      rb/framework/controller/list.rb
      rb/framework/controller/sortable_list.rb
      rb/framework/controller/editor.rb
      rb/framework/controller/inline_editor.rb
      rb/framework/controller/editable_list.rb
      rb/framework/model/attributes.rb
      rb/framework/model/dirty_tracking.rb
      rb/framework/model/drafts.rb
      rb/framework/model/base.rb
      rb/framework/model/editable.rb
      rb/framework/model/associations.rb
      rb/framework/model/store.rb
      rb/framework/model/identity.rb
      rb/framework/model/collection.rb
      rb/framework/model/distant_client.rb
      rb/framework/model/distant_data.rb
      rb/framework/model/distant_object.rb
      rb/framework/model/association.rb
      rb/framework/model/codec.rb
      rb/framework/model/dataset.rb
      rb/framework/model/resource.rb
    ].freeze

    # The UI framework alone, in the same order: views, controllers, bindings,
    # the responder chain, and List, without models, remote data, the concrete
    # controls, or the list controllers built on List.
    UI_FRAMEWORK_SOURCES = FRAMEWORK_SOURCES.reject do |path|
      path.start_with?("rb/framework/model/") ||
        (path.start_with?("rb/framework/control/") && !path.end_with?("/base.rb")) ||
        %w[core/wire.rb controller/sortable_list.rb controller/editor.rb
           controller/inline_editor.rb controller/editable_list.rb].any? { |name| path.end_with?(name) }
    end.freeze

    # Orchestration: collect facts, validate the graph, convert each entry
    # with its surface, and emit definitions. Metadata emission lives in
    # compiler/meta.rb and Sorbet artifacts in compiler/sorbet.rb.
    class Compiler
      attr_reader :knowledge

        # Sources are loaded into a container so their declarations can be
        # read back. A compiler with imports is an application, and shares the
        # framework's container; one without is a root, and gets its own.
        def initialize(imports: [], loader: :default)
          @imports = imports
          @sources = []
          loader = imports.empty? ? Loader.new : Loader.new(parent: Loader.framework) if loader == :default
          @loader_factory = -> { loader.fresh }
          @knowledge = Knowledge.new(imports, loader: loader)
        end

        # The container this compiler's sources are loaded into.
        def loader
          knowledge.loader
        end

        def add(source, file: "(spike)")
          knowledge.collect(source, file)
          @sources << [source, file]
          self
        rescue CompileError => error
          error = model_base_migration_error(source, error)
          rebuild_knowledge
          raise error if file == "(spike)"
          raise CompileError, "#{file}: #{error.message}"
        end

        def model_base_migration_error(source, error)
          return error unless source.match?(/<\s*Swill::Model::Base\b/)
          match = error.message.match(/undefined method '(endpoint|resource_type|codec|has_many|has_one)'/)
          return error unless match

          destination = %w[has_many has_one].include?(match[1]) ?
            "Swill::Model::Resource for endpoint associations or Swill::Model::DistantObject for generated associations" :
            "Swill::Model::Resource"
          CompileError.new("#{error.message}; models using #{match[1]} must inherit #{destination}")
        end

        def javascript(runtime:, framework: nil)
          validate!
          # Single-module form for executable compiler fixtures. Production uses
          # modules below; both paths emit the same definitions and meta object.
          self.class.format_javascript([
            imports(runtime, framework), definitions, "const meta = #{meta_object};",
            "Runtime.install(meta);"
          ].join("\n"))
        end

        def modules(name:, runtime:, framework: nil, publish: nil, launch: nil)
          validate!
          references = knowledge.local.flat_map do |entry|
            [entry["identifier"], *(entry["extends_class_methods"] ? ["#{entry['identifier']}_ClassMethods"] : [])]
          end.join(", ")
          entrypoint = [
            "import {Runtime} from #{runtime.to_json};",
            "import {meta} from './#{name}.meta.mjs';"
          ]
          if publish
            entrypoint << "import * as definitions from './#{name}.classes.mjs';"
            entrypoint << "if (globalThis[#{publish.to_json}]) throw new Error('Framework already loaded');"
          end
          entrypoint << "Runtime.install(meta);"
          if publish
            entrypoint << "globalThis[#{publish.to_json}] = Object.freeze({" \
              "...definitions, Runtime, install: meta => Runtime.install(meta)});"
          end
          if launch
            raise CompileError, "launch requires publish" unless publish
            # The browser boundary: a document exists only inside a page.
            entrypoint << "if (typeof document !== 'undefined') " \
              "new (Runtime.resolve(#{launch.to_json}))().install(document);"
          end
          entrypoint << "export * from './#{name}.classes.mjs';"
          {
            "#{name}.classes.mjs" => self.class.format_javascript(
              "#{imports(runtime, framework)}\n#{definitions}"
            ),
            "#{name}.meta.mjs" => self.class.format_javascript(
              "#{imports(runtime, framework)}\n" \
              "import {#{references}} from './#{name}.classes.mjs';\n" \
              "export const meta = #{meta_object};"
            ),
            "#{name}.mjs" => self.class.format_javascript(entrypoint.join("\n"))
          }
        end

        def imports(runtime, framework)
          lines = [%{import {Runtime} from #{runtime.to_json};}]
          imported = knowledge.entries.select { |entry| entry["imported"] }
          if imported.any?
            raise CompileError, "framework import required" unless framework
            names = imported.flat_map do |entry|
              [entry["identifier"], *(entry["extends_class_methods"] ? ["#{entry['identifier']}_ClassMethods"] : [])]
            end
            lines << "import {#{names.join(', ')}} from #{framework.to_json};"
          end
          lines.join("\n")
        end

        def definitions
          lines = []
          knowledge.local.each do |entry|
            scope = entry["scope"]
            id = entry["identifier"]
            mixin = entry["kind"] == "mixin"
            parent = mixin ? "Superclass" : (entry["parent"] ? reference(entry["parent"], scope) : "Object")
            class_name = mixin ? "#{id}_Layer" : id
            source = with_generated_methods(entry["node"].loc.expression.source, entry)
            js = begin
              convert(source, entry, compiled_class: class_name, compiled_parent: parent)
            rescue CompileError => error
              raise CompileError, "#{entry['node'].loc.expression.source_buffer.name} (#{entry['name']}): #{error.message}"
            end
            if mixin
              lines << "export function #{id}(Superclass) {\n#{js}\nreturn #{class_name};\n}"
              lines << module_functions(entry) if entry["module_functions"].any? || entry["constant_nodes"].any?
              lines << class_method_factory(entry) if entry["extends_class_methods"]
            else
              # Ruby2JS may prepend truthiness helper declarations, so prefixing the
              # whole conversion with `export` would export a helper instead of the
              # class. Keep conversion structured and export the known declaration.
              lines << js
              lines << "export {#{id}};"
            end
          end
          lines.join("\n")
        end

        # Use the project's existing JS parser/printer, not substitutions over
        # generated text. Formatting is part of every emission, without bundling,
        # minification, or changing the ES module boundary.
        def self.format_javascript(source)
          output, errors, status = Open3.capture3(
            "esbuild", "--loader=js", "--target=es2022", "--charset=utf8", stdin_data: source
          )
          raise CompileError, "generated JavaScript could not be formatted: #{errors}" unless status.success?
          output
        rescue Errno::ENOENT
          raise CompileError, "esbuild is required to format generated JavaScript"
        end

      private

        # A failed reopening may already have changed the MRI class object
        # used for reflection. Replaying accepted sources into a fresh loader
        # restores the compiler's transactional add contract. This path runs
        # only after an error and has no effect on generated runtime code.
        def rebuild_knowledge
          loader = @loader_factory.call
          rebuilt = Knowledge.new(@imports, loader: loader)
          @sources.each { |source, file| rebuilt.collect(source, file) }
          @knowledge = rebuilt
        end

        # What must hold for the graph to compile and emit: ancestry order and
        # kinds, mixin shape, and members that would collide in JavaScript or
        # be ambiguous to lower. What the runtime cannot install or honor is
        # rejected by the runtime at installation instead.
        def validate!
          available = knowledge.entries.select { |entry| entry["imported"] }.map { |entry| entry["name"] }
          knowledge.local.each do |entry|
            parent = nil
            parent_name = entry["parent"] && knowledge.resolve(entry["parent"], entry["scope"])
            if parent_name && !available.include?(parent_name)
              raise CompileError, "superclass must be defined before #{entry['name']}"
            end
            if parent_name
              parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
              raise CompileError, "superclass must be a class" unless parent["kind"] == "class"
            end
            ancestors = parent ? included_modules(parent) : []
            entry["includes"].each do |name|
              resolved = knowledge.resolve(name, entry["scope"])
              raise CompileError, "mixin must be defined before #{entry['name']}" unless available.include?(resolved)
              target = knowledge.entries.find { |e| e["name"] == resolved }
              raise CompileError, "include target must be a mixin" unless target["kind"] == "mixin"
              raise CompileError, "duplicate include requires Ruby ancestor deduplication" if ancestors.include?(resolved)
              ancestors << resolved
            end
            if entry["kind"] == "mixin" && (entry["properties"].any? || entry["includes"].any?)
              raise CompileError, "spike mixins support instance methods only"
            end
            entry["restorations"].each do |restoration|
              restoration["type"] = restoration_type(entry, restoration["path"].split("."))
            end
            check_overrides!(entry, parent_name)
            resolve_outlet_types(entry)
            resolve_association_types(entry)
            canonicalize_signatures(entry)
            members = javascript_members(entry)
            members.group_by(&:first).each_value do |same|
              next if same.length == 1
              raise CompileError, "#{same.map { |_, name| "#{entry['name']}##{name}" }.join(' and ')} " \
                "are #{same.length == 2 ? 'both' : 'all'} #{same.first.first} in JavaScript"
            end
            check_inherited_members!(entry, parent_name, members)
            statics = entry.fetch("static_methods", []).flat_map do |method|
              Knowledge.variants(method).map { |variant| [variant["js"], variant["name"]] }
            end
            unless statics.map(&:first).uniq.length == statics.length
              raise CompileError, "colliding class methods in #{entry['name']}"
            end
            # A method with a property's name would be lowered as a property read.
            if entry["methods"].any? { |method| inherited_properties(entry).include?(method["name"]) }
              raise CompileError, "method/property overlap requires explicit lowering"
            end
            available << entry["name"]
          end
        end
        public :validate!

        # A method with optional parameters is several JavaScript methods, so
        # an override declaring different ones would shadow only part of what
        # it means to override.
        def check_overrides!(entry, parent_name)
          entry["methods"].each do |method|
            inherited = inherited_method_entry(entry, parent_name, method["name"])
            next unless inherited
            # A reader is a getter or a method in JavaScript, and a call site
            # compiled against one cannot reach the other.
            unless method["accessor"] == inherited["accessor"]
              raise CompileError,
                "#{entry['name']}##{method['name']} must be declared as the member it overrides is, " \
                "with attr_reader or def"
            end
            if method["complex"] || inherited["complex"]
              unless call_shape(inherited) == call_shape(method)
                raise CompileError,
                  "#{entry['name']}##{method['name']} must accept the same arguments as the method it overrides"
              end
            else
              inherited_family = Knowledge.variants(inherited).map { |variant| variant.values_at("name", "arity") }
              own_family = Knowledge.variants(method).map { |variant| variant.values_at("name", "arity") }
              unless inherited_family == own_family
                raise CompileError,
                  "#{entry['name']}##{method['name']} must accept the same arities as the method it overrides"
              end
            end
            inherit_signature(method, inherited)
          end
          entry.fetch("static_methods", []).each do |method|
            inherited = parent_name && knowledge.static_method_entry(parent_name, method["name"])
            next unless inherited
            unless call_shape(inherited) == call_shape(method)
              raise CompileError,
                "#{entry['name']}.#{method['name']} must accept the same arguments as the method it overrides"
            end
            inherit_signature(method, inherited)
          end
        end

        # An override keeps the inherited method contract when it does not
        # restate one. Ruby applications can then use typed framework hooks
        # without repeating their signatures solely for JavaScript lowering.
        def inherit_signature(method, inherited)
          if method["parameters"].empty?
            method["parameters"] = method.fetch("formals", []).each_with_index.filter_map do |formal, index|
              inherited_formal = inherited.fetch("formals", [])[index]
              type = inherited_formal && inherited["parameters"][inherited_formal["name"]]
              [formal["name"], type] if type
            end.to_h
          end
          method["returns"] ||= inherited["returns"]
        end

        def call_shape(method)
          shape = method.fetch("formals", []).map do |formal|
            formal["kind"].start_with?("key") ? [formal["kind"], formal["name"]] : formal["kind"]
          end
          [shape, method["implicit_block"] == true]
        end

        # [JavaScript name, Ruby name] for every property and method variant.
        def javascript_members(entry)
          entry["properties"].map { |property| [property["js"], property["name"]] } +
            entry["methods"].flat_map { |method| Knowledge.variants(method).map { |variant| [variant["js"], variant["name"]] } }
        end

        # A member may not take an ancestor's JavaScript name under another
        # Ruby name: save! and save are both save, so a subclass's save would
        # replace its parent's save! in JavaScript without overriding either.
        def check_inherited_members!(entry, parent_name, members)
          inherited = {}
          pending = entry["includes"].map { |name| knowledge.resolve(name, entry["scope"]) }
          pending << parent_name if parent_name
          seen = {}
          until pending.empty?
            name = pending.shift
            next if seen[name]
            seen[name] = true
            ancestor = knowledge.entries.find { |candidate| candidate["name"] == name }
            next unless ancestor
            javascript_members(ancestor).each { |javascript, ruby| inherited[javascript] ||= [ruby, name] }
            pending.concat(ancestor["includes"].map { |included| knowledge.resolve(included, ancestor["scope"]) })
            pending << knowledge.resolve(ancestor["parent"], ancestor["scope"]) if ancestor["parent"]
          end
          members.each do |javascript, ruby|
            other, owner = inherited[javascript]
            next if other.nil? || other == ruby
            raise CompileError, "#{entry['name']}##{ruby} and #{owner}##{other} are both #{javascript} in JavaScript"
          end
        end

        def inherited_method_entry(entry, parent_name, name)
          entry["includes"].reverse_each do |mixin_name|
            resolved = knowledge.resolve(mixin_name, entry["scope"])
            found = knowledge.method_entry(resolved, name)
            return found if found
          end
          parent_name && knowledge.method_entry(parent_name, name)
        end

        # Signature types are written in the entry's own scope (View inside
        # module Swill). An importing build resolves them from elsewhere, so
        # every class name that resolves here is spelled out in full.
        def canonicalize_signatures(entry)
          scope = entry["name"].split("::")
          (entry["methods"] + entry.fetch("static_methods", []) + entry.fetch("class_method_entries", [])).each do |method|
            method["returns"] = canonical_type(method["returns"], scope) if method["returns"]
            method["parameters"] = method["parameters"].transform_values { |type| canonical_type(type, scope) }
          end
        end

        def canonical_type(type, scope)
          type.gsub(/\b[A-Z]\w*(?:::\w+)*\b/) do |name|
            next name if name.start_with?("T") && (name == "T" || name.start_with?("T::"))
            begin
              knowledge.resolve(name, scope)
            rescue CompileError
              name
            end
          end
        end

        # Awakening checks each connected outlet against its declared type by
        # name, so an outlet's class type is written as the name the class is
        # installed under. Resolved here, after every entry is collected.
        def resolve_outlet_types(entry)
          entry["properties"].each do |property|
            next unless property["outlet"]
            type = property["type"]
            inner = type[/\AT\.nilable\((.+)\)\z/, 1] || type
            next unless inner.match?(/\A[A-Z]\w*(?:::\w+)*\z/) && !%w[String Integer Float Symbol NilClass Array Hash].include?(inner)
            next if DOM::CLASSES.key?(inner)
            resolved = knowledge.resolve(inner, entry["name"].split("::"))
            target = knowledge.entries.find { |candidate| candidate["name"] == resolved }
            raise CompileError, "outlet #{property['name']}: #{inner} is not a class" unless target["kind"] == "class"
            property["type"] = type.sub(inner, resolved)
          end
        end

        # A declared class name is checked here, where the whole graph is
        # known: an association may name a class defined later, or in a cycle,
        # so its descriptor carries the name rather than the class.
        def resolve_association_types(entry)
          associations = entry["registry_values"]["model_associations"]
          return unless associations
          associations.each_value do |association|
            resolved = knowledge.resolve(association["type"], entry["name"].split("::"))
            target = knowledge.entries.find { |candidate| candidate["name"] == resolved }
            unless target && target["kind"] == "class"
              raise CompileError, "association #{association['name']}: #{association['type']} is not a class"
            end
            %W[#{association['name']} #{association['name']}_loading].each do |name|
              property = entry["properties"].find { |candidate| candidate["name"] == name }
              property["type"] = property["type"].sub(association["type"], resolved)
            end
            association["type"] = resolved
          end
        end

        # The declared type at the end of a restorable path, followed through
        # declared property types; nil when a segment is not statically typed.
        # The runtime checks at installation that the path starts at a property.
        def restoration_type(entry, segments)
          owner = entry["name"]
          type = nil
          segments.each do |segment|
            property = owner && knowledge.property_entry(owner, segment)
            return nil unless property
            type = property["type"]
            inner = type[/\AT\.nilable\((.+)\)\z/, 1] || type
            owner = begin
              resolved = knowledge.resolve(inner, entry["name"].split("::"))
              knowledge.entries.any? { |candidate| candidate["name"] == resolved } ? resolved : nil
            rescue CompileError
              nil
            end
          end
          type
        end

        # Methods the compiler writes rather than the author: a macro's
        # forwards, and the shorter arities of a method with optional
        # parameters. Both are written back as Ruby and compiled with the body
        # they belong to, rather than substituted into generated JavaScript.
        def with_generated_methods(source, entry)
          body = (forwarded_methods(entry) + variant_methods(entry)).join("\n")
          return source if body.empty?
          stripped = source.rstrip
          raise CompileError, "class body must end with end" unless stripped.end_with?("end")
          "#{stripped[0...-3]}\n#{body}\nend\n"
        end

        def forwarded_methods(entry)
          entry["methods"].select { |method| method["to"] }.map do |method|
            parameters = method["parameters"].keys
            arguments = method["with"].map(&:to_json) + parameters
            call = "#{method['to']}(#{arguments.join(', ')})"
            header = "def #{method['name']}(#{parameters.join(', ')})"
            "#{method['async'] ? "async #{header}\nawait " : "#{header}\n"}#{call}\nend"
          end
        end

        # The widest variant carries the body; every shorter one hands it the
        # defaults, which is where Ruby's own argument binding is written down.
        def variant_methods(entry)
          (entry["methods"] + entry.fetch("static_methods", [])).flat_map do |method|
            next [] unless method["formals"]
            next [] if method["complex"]
            variants = Knowledge.variants(method)
            widest = variants.last
            variants[0...-1].map do |variant|
              seen = 0
              arguments = method["formals"].map do |formal|
                next formal["name"] unless formal["default"]
                seen += 1
                seen <= variant["taken"] ? formal["name"] : formal["default"]
              end
              parameters = Knowledge.variant_formals(method, variant["taken"]).map { |formal| formal["name"] }
              # A parent's default shim must reach its own body, not dispatch
              # back into the override that called it through super().
              call = "__swill_variant_body(:#{widest['js']}, #{arguments.join(', ')})"
              static = entry.fetch("static_methods", []).include?(method)
              header = "def #{static ? 'self.' : ''}#{variant['name']}(#{parameters.join(', ')})"
              method["async"] ? "async #{header}\nawait #{call}\nend" : "#{header}\n#{call}\nend"
            end
          end
        end

        def reference(name, scope)
          resolved = knowledge.resolve(name, scope)
          Knowledge.identifier(resolved)
        end

        def convert(source, entry, compiled_class: nil, compiled_parent: nil)
          # Ruby chooses operators from static types, so a native `||` must
          # stay logical: `false ?? x` would keep Ruby's falsy value.
          ::Ruby2JS.convert(source, filters: [RubySurface, ::Ruby2JS::Filter::Return, RubyCalls],
                          eslevel: 2022, comparison: :identity, truthy: :js, or: :logical,
                          underscored_private: true,
                          knowledge: knowledge, spike_scope: entry["scope"],
                          entry: entry,
                          compiled_class: compiled_class, compiled_parent: compiled_parent,
                          properties: inherited_properties(entry),
                          property_types: inherited_property_types(entry)).to_s
        end

        def inherited_properties(entry)
          own = (entry["properties"] + entry.fetch("included_properties", [])).map { |property| property["name"] }
          return own if entry["parent"].nil?
          parent_name = knowledge.resolve(entry["parent"], entry["scope"])
          parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
          inherited_properties(parent) + own
        end

        def inherited_property_types(entry)
          own = (entry["properties"] + entry.fetch("included_properties", []))
            .to_h { |property| [property["name"], property["type"]] }
          return own if entry["parent"].nil?
          parent_name = knowledge.resolve(entry["parent"], entry["scope"])
          parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
          inherited_property_types(parent).merge(own)
        end

        def included_modules(entry)
          own = entry["includes"].map { |name| knowledge.resolve(name, entry["scope"]) }
          return own if entry["parent"].nil?
          parent_name = knowledge.resolve(entry["parent"], entry["scope"])
          parent = knowledge.entries.find { |candidate| candidate["name"] == parent_name }
          included_modules(parent) + own
        end

    end
  end
end

require_relative "emit/meta"
require_relative "emit/sorbet"
