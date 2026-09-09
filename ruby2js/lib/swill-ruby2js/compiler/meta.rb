# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # The meta object: constructors, mixin factories, property descriptors,
    # registries, and method arities that Runtime.install consumes.
    class Compiler
        def meta_object
          groups = {"mixins" => [], "classes" => []}
          knowledge.local.each do |entry|
            mixin = entry["kind"] == "mixin"
            fields = ["#{mixin ? 'factory' : 'constructor'}: #{entry['identifier']}"]
            if mixin && entry["extends_class_methods"]
              fields << "classFactory: #{entry['identifier']}_ClassMethods"
            end
            unless mixin
              references = entry["includes"].map { |name| reference(name, entry["scope"]) }
              fields << "mixins: [#{references.join(', ')}]" unless references.empty?
              properties = entry["properties"].map do |property|
                "#{object_key(property['name'])}: #{property_js(property, entry)}"
              end
              fields << "properties: {\n#{properties.join(",\n")}\n}"
              attributes = entry["properties"].select { |property| property["attribute"] }
              if attributes.any? && included_modules(entry).include?("Swill::Model::Attributes")
                seeds = attributes.map do |property|
                  "#{object_key(property['name'])}: {property: #{property['name'].to_json}, key: #{property['key'].to_json}}"
                end
                fields << "registries: {model_attributes: {\n#{seeds.join(",\n")}\n}}"
              end
            end
            unless mixin || entry["restorations"].empty?
          restorations = entry["restorations"].map do |restoration|
            "{path: #{restoration['path'].to_json}, key: #{restoration['key'].to_json}, type: #{restoration['type'].to_json}}"
          end
          fields << "restorations: [#{restorations.join(', ')}]"
        end
        methods = entry["methods"].map do |method|
              descriptor = {"arity" => method["arity"]}
              descriptor["js"] = method["js"] if method["js"] != method["name"]
              "#{object_key(method['name'])}: #{JSON.pretty_generate(descriptor)}"
            end
            fields << "methods: {\n#{methods.join(",\n")}\n}"
            groups[mixin ? "mixins" : "classes"] << "#{entry['name'].to_json}: {\n#{fields.join(",\n")}\n}"
          end
          "{\n#{groups.map { |name, entries| "#{name}: {\n#{entries.join(",\n")}\n}" }.join(",\n")}\n}"
        end

      private

        def object_key(name)
          # In a JS object literal, "__proto__": value changes the prototype.
          # A computed key remains an ordinary metadata entry.
          name == "__proto__" ? "[#{name.to_json}]" : name.to_json
        end

        def property_js(property, entry)
          function = "#{property['computed'] ? 'compute' : 'default'}_#{property['js']}"
          expression = convert("def #{function}()\n#{property['expression']}\nend", entry)
          # A converted property function is embedded as an object value rather than
          # emitted at module scope, so contain any converter prelude and return the
          # named function.
          unless expression.lstrip.start_with?("function ")
            expression = "(() => {\n#{expression}\nreturn #{function};\n})()"
          end
          metadata = property.reject do |key, _|
            %w[expression name computed].include?(key) || (key == "js" && property["js"] == property["name"])
          end.map do |key, value|
            "#{key}: #{value.to_json}"
          end
          metadata << "#{property['computed'] ? 'compute' : 'defaultValue'}: #{expression}"
          "{\n#{metadata.join(",\n")}\n}"
        end

        def class_method_factory(entry)
          id = entry["identifier"]
          class_name = "#{id}_ClassMethods_Layer"
          methods = entry["class_methods"].map(&:loc).map { |location| location.expression.source }
          source = "class Placeholder < Object\n#{methods.join("\n")}\nend"
          js = convert(source, entry, compiled_class: class_name, compiled_parent: "Object")
          declarations = entry["registries"].map do |registry|
            name = registry["name"]
            "#{Knowledge.member(name)}() { return Runtime.inheritableRegistry(this, " \
              "#{name.to_json}, #{registry['initial'].to_json}); }"
          end
          declarations.concat(entry["settings"].map do |name|
            "#{Knowledge.member(name)}(...values) { return Runtime.classSetting(this, #{name.to_json}, values); }"
          end)
          unless declarations.empty?
            insertion = declarations.join("\n")
            js = js.sub(/\n}\s*\z/, "\n#{insertion}\n}")
          end
          <<~JS
            export function #{id}_ClassMethods(Superclass) {
              #{js}
              Object.setPrototypeOf(#{class_name}.prototype, Superclass);
              return #{class_name}.prototype;
            }
          JS
        end

    end
  end
end
