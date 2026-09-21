# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # The meta object: the serialization of each class's declaration-time
    # state. Constructors, mixin factories, property descriptors, registry
    # values, settings, restorations, and method arities, all of which
    # Runtime.install replays. Nothing here knows what a declaration means.
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
              unless entry["registry_values"].empty?
                registries = entry["registry_values"].map do |name, values|
                  "#{Knowledge.member(name)}: #{serialize_value(values, entry)}"
                end
                fields << "registries: {\n#{registries.join(",\n")}\n}"
              end
              unless entry["setting_values"].empty?
                settings = entry["setting_values"].map do |name, value|
                  "{name: #{name.to_json}, js: #{Knowledge.member(name).to_json}, " \
                    "value: #{serialize_value(value, entry)}}"
                end
                fields << "settings: [#{settings.join(', ')}]"
              end
              unless entry["restorations"].empty?
                restorations = entry["restorations"].map do |restoration|
                  "{path: #{restoration['path'].to_json}, key: #{restoration['key'].to_json}, " \
                    "type: #{restoration['type'].to_json}}"
                end
                fields << "restorations: [#{restorations.join(', ')}]"
              end
            end
            methods = entry["methods"].flat_map do |method|
              Knowledge.variants(method).map do |variant|
                descriptor = {"arity" => variant["arity"]}
                if method["complex"]
                  descriptor["minimum"] = variant["minimum"]
                  descriptor["maximum"] = variant["maximum"]
                end
                descriptor["js"] = variant["js"] if variant["js"] != variant["name"]
                descriptor["family"] = variant["family"] if variant["family"]
                "#{object_key(variant['name'])}: #{JSON.pretty_generate(descriptor)}"
              end
            end
            fields << "methods: {\n#{methods.join(",\n")}\n}"
            groups[mixin ? "mixins" : "classes"] << "#{entry['name'].to_json}: {\n#{fields.join(",\n")}\n}"
          end
          "{\n#{groups.map { |name, entries| "#{name}: {\n#{entries.join(",\n")}\n}" }.join(",\n")}\n}"
        end

      private

        # Declared data as a JavaScript expression: literals, symbols as
        # strings, nested hashes and arrays, and a class reference as the
        # identifier the class is emitted under. This is the whole of what a
        # macro may put in a registry or a setting.
        def serialize_value(value, entry)
          case value
          when Knowledge::Reflection::ClassReference
            reference(value.name, entry["scope"])
          when ::Hash
            pairs = value.map { |key, item| "#{object_key(key.to_s)}: #{serialize_value(item, entry)}" }
            "{#{pairs.join(', ')}}"
          when ::Array
            "[#{value.map { |item| serialize_value(item, entry) }.join(', ')}]"
          when ::Symbol
            value.to_s.to_json
          else
            value.to_json
          end
        end

        def object_key(name)
          # In a JS object literal, "__proto__": value changes the prototype.
          # A computed key remains an ordinary metadata entry.
          name == "__proto__" ? "[#{name.to_json}]" : name.to_json
        end

        def property_js(property, entry)
          metadata = property.reject do |key, _|
            %w[expression name computed default].include?(key) ||
              (key == "js" && property["js"] == property["name"])
          end.map do |key, value|
            "#{Knowledge.member(key)}: #{value.to_json}"
          end
          if property["computed"]
            function = "compute_#{property['js']}"
            expression = convert("def #{function}()\n#{property['expression']}\nend", entry)
            # A converted property function is embedded as an object value rather than
            # emitted at module scope, so contain any converter prelude and return the
            # named function.
            unless expression.lstrip.start_with?("function ")
              expression = "(() => {\n#{expression}\nreturn #{function};\n})()"
            end
            metadata << "compute: #{expression}"
          else
            # A stored default is a literal, and the function is what makes
            # each instance's array or hash its own.
            metadata << "defaultValue() { return #{serialize_value(property['default'], entry)}; }"
          end
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
              "#{Knowledge.member(name).to_json}, #{registry['initial'].to_json}); }"
          end
          # A setting is stored under its Ruby name, the name a lookup by
          # value (Runtime.classWithSetting) is written with.
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
