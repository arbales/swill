# typed: false
# frozen_string_literal: true

require "json"
require "open3"
require "ruby2js"
require "ruby2js/filter/pragma"
require "ruby2js/filter/return"
require_relative "names"
require_relative "knowledge"
require_relative "filters/sorbet_operations"
require_relative "filters/shared_lowering"
require_relative "filters/static_types"
require_relative "filters/core_types"
require_relative "filters/ruby_surface"
require_relative "filters/ruby_calls"
require_relative "filters/javascript_surface"

module Swill
  module Ruby2JS
    # The framework's own sources in compilation order, for the build and for
    # tests that compile the framework.
    FRAMEWORK_SOURCES = {
      javascript_only: %w[
        lib/swill/core/observable.rb
        lib/swill/core/object.rb
        lib/swill/core/ownership.rb
        lib/swill/core/object_bindings.rb
        lib/swill/core/responder.rb
        lib/swill/core/view.rb
        lib/swill/core/controller.rb
        lib/swill/core/bindings.rb
        lib/swill/core/actions.rb
        lib/swill/core/outlets.rb
        lib/swill/core/awakening.rb
        lib/swill/core/fragments.rb
        lib/swill/core/window.rb
        lib/swill/core/application.rb
        lib/swill/controller/list.rb
        lib/swill/controller/sortable_list.rb
        lib/swill/controller/editor.rb
        lib/swill/controller/inline_editor.rb
        lib/swill/controller/editable_list.rb
      ].freeze,
      shared: %w[
        lib/swill/model/attributes.rb
        lib/swill/model/dirty_tracking.rb
        lib/swill/model/drafts.rb
        lib/swill/model/base.rb
      ].freeze
    }.freeze

    # Orchestration: collect facts, validate the graph, convert each entry
    # with its surface, and emit definitions. Metadata emission lives in
    # compiler/meta.rb and Sorbet artifacts in compiler/sorbet.rb.
    class Compiler
      attr_reader :knowledge

        def initialize(imports: [])
          @knowledge = Knowledge.new(imports)
        end

        def add(source, file: "(spike)", javascript_only: false)
          knowledge.collect(source, file, javascript_only: javascript_only)
          self
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
            source = entry["node"].loc.expression.source
            js = convert(source, entry, compiled_class: class_name, compiled_parent: parent)
            if mixin
              lines << "export function #{id}(Superclass) {\n#{js}\nreturn #{class_name};\n}"
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
            resolve_outlet_types(entry)
            members = entry["properties"].map { |p| [p["js"], p["name"]] } +
              entry["methods"].map { |m| [m["js"], m["name"]] }
            raise CompileError, "colliding members in #{entry['name']}" unless members.map(&:first).uniq.length == members.length
            # A method with a property's name would be lowered as a property read.
            if entry["methods"].any? { |method| inherited_properties(entry).include?(method["name"]) }
              raise CompileError, "method/property overlap requires explicit lowering"
            end
            available << entry["name"]
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
            resolved = knowledge.resolve(inner, entry["name"].split("::"))
            target = knowledge.entries.find { |candidate| candidate["name"] == resolved }
            raise CompileError, "outlet #{property['name']}: #{inner} is not a class" unless target["kind"] == "class"
            property["type"] = type.sub(inner, resolved)
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

        def reference(name, scope)
          resolved = knowledge.resolve(name, scope)
          Knowledge.identifier(resolved)
        end

        def convert(source, entry, compiled_class: nil, compiled_parent: nil)
          filters = entry["javascript_only"] ?
            [JavaScriptSurface, ::Ruby2JS::Filter::Return] :
            [RubySurface, ::Ruby2JS::Filter::Return, RubyCalls]
          # Shared Ruby chooses operators from static types, so a native `||`
          # must stay logical: `false ?? x` would keep Ruby's falsy value. The
          # JavaScript-only surface keeps Ruby2JS's own operator selection.
          ::Ruby2JS.convert(source, filters: filters,
                          eslevel: 2022, comparison: :identity, truthy: :js,
                          **(entry["javascript_only"] ? {} : {or: :logical}),
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

require_relative "compiler/meta"
require_relative "compiler/sorbet"
