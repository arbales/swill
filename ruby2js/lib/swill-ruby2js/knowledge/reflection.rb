# typed: false
# frozen_string_literal: true

module Swill
  module Ruby2JS
    # Loaded classes to entries. Everything a class body *declared* is read
    # off the class the loader defined: properties, registry values, settings,
    # restorations, and forwarded methods. Everything a class body *wrote* —
    # method names, arities, async, and every AST node — stays where only the
    # source knows it.
    class Knowledge
      module Reflection
        ClassReference = ::Struct.new(:name)
        module_function

        # Whether a receiverless call in a class body is a declaration: the
        # property primitive, a macro some ancestor marked, or a setting an
        # included ClassMethods declared. Anything else is unsupported.
        def declaration?(klass, name)
          return false unless klass
          name = name.to_sym
          return true if name == :property
          marks(klass, :swill_macros).include?(name) || setting?(klass, name)
        end

        def setting?(klass, name)
          marks(klass, :swill_settings).include?(name.to_s)
        end

        # A class's declaration marks: the ones its own body made, the ones
        # its superclasses made, and the ones the ClassMethods modules it
        # extends declare.
        def marks(klass, kind)
          found = []
          klass.singleton_class.ancestors.each do |mod|
            next if mod.is_a?(::Class)
            found.concat(mod.public_send(kind)) if mod.respond_to?(kind)
          end
          owner = klass
          while owner.is_a?(::Module)
            ivar = :"@#{kind}"
            found.concat(owner.instance_variable_get(ivar) || []) if owner.instance_variable_defined?(ivar)
            owner = owner.is_a?(::Class) ? owner.superclass : nil
          end
          found
        end

        # Fill in everything the class body declared. The entry already
        # carries what the source alone knows.
        def fill(entry, target, blocks)
          if entry["kind"] == "mixin"
            fill_mixin(entry, target)
          else
            fill_class(entry, target, blocks)
          end
        end

        def fill_class(entry, klass, blocks)
          entry["macros"] = marks(klass, :swill_macros).map(&:to_s).uniq
          entry["properties"] = own_properties(klass).map { |descriptor| property(descriptor, blocks) }
          entry["restorations"] = own_restorations(klass).map do |restoration|
            {"path" => restoration["path"], "key" => restoration["key"]}
          end
          entry["registry_values"] = registry_values(klass)
          entry["setting_values"] = setting_values(klass)
          entry["methods"].concat(forwards(klass))
        end

        # A mixin declares through its included hook, so what it declares is
        # read from a class that includes it and nothing else.
        def fill_mixin(entry, mod)
          class_methods = mod.const_defined?(:ClassMethods, false) ? mod.const_get(:ClassMethods, false) : nil
          entry["macros"] = class_methods&.respond_to?(:swill_macros) ? class_methods.swill_macros.map(&:to_s) : []
          entry["registries"] = class_methods&.respond_to?(:swill_registries) ? class_methods.swill_registries : []
          entry["settings"] = class_methods&.respond_to?(:swill_settings) ? class_methods.swill_settings : []
        end

        # What a mixin declares is read from a class that includes it, which
        # is the only place a hook's declarations exist. The includers get
        # their own descriptors; this copy is for the mixin's own RBI and for
        # compiling the method bodies it wrote.
        def fill_included(entry, probe, blocks)
          entry["included_properties"] = own_properties(probe).map { |descriptor| property(descriptor, blocks) }
        end

        def own_properties(klass)
          klass.respond_to?(:swill_properties) ? klass.swill_properties.values : []
        end

        def own_restorations(klass)
          klass.respond_to?(:swill_restorations) ? klass.swill_restorations : []
        end

        def property(descriptor, blocks)
          name = descriptor["name"]
          entry = {
            "name" => name, "js" => Knowledge.member(name),
            "type" => type_text(descriptor["type"]),
            "attribute" => descriptor["attribute"], "computed" => descriptor["computed"]
          }
          entry["key"] = descriptor["key"] if descriptor["attribute"]
          if descriptor["outlet"]
            entry["outlet"] = true
            entry["optional"] = descriptor["optional"]
          end
          entry["will_access"] = true if descriptor["will_access"]
          if descriptor["computed"]
            entry["expression"] = blocks.fetch(descriptor["block"])
          else
            entry["default"] = descriptor["default"]
          end
          entry
        end

        def forwards(klass)
          return [] unless klass.respond_to?(:swill_forwards)
          klass.swill_forwards.map do |forward|
            {
              "name" => forward["name"], "js" => Knowledge.member(forward["name"]),
              "arity" => forward["parameters"].length,
              "parameters" => forward["parameters"].transform_values { |type| type_text(type) },
              "returns" => forward["returns"] && type_text(forward["returns"]),
              "async" => forward["async"], "to" => forward["to"], "with" => forward["with"]
            }
          end
        end

        # The registry exactly as declaration-time Ruby left it. A class owns
        # a copied collection, so replacing that copy at installation preserves
        # deletion, ordering, prepending, and duplicate array entries.
        def registry_values(klass)
          marks(klass, :swill_registries).each_with_object({}) do |registry, result|
            name = registry["name"]
            ivar = :"@#{name}"
            next unless klass.instance_variable_defined?(ivar)
            result[name] = value(klass.instance_variable_get(ivar))
          end
        end

        def setting_values(klass)
          marks(klass, :swill_settings).each_with_object({}) do |name, result|
            ivar = :"@#{name}"
            next unless klass.instance_variable_defined?(ivar)
            result[name] = value(klass.instance_variable_get(ivar))
          end
        end

        # Declared data as the entry carries it: literals, nested hashes and
        # arrays, and a class as a tagged reference the emitter resolves.
        def value(item)
          case item
          when ::Class, ::Module then ClassReference.new(text(item.name.to_s))
          when ::Hash then item.to_h { |key, entry| [text(key.to_s), value(entry)] }
          when ::Array then item.map { |entry| value(entry) }
          when ::String then text(item)
          when ::Symbol then text(item.to_s)
          else item
          end
        end

        # A declared type as the text the compiler and the RBI use: the
        # container's prefix stripped, and void spelled as it is written.
        def type_text(type)
          return text(type) if type.is_a?(::String)
          text(T::Utils.coerce(type).to_s.gsub("<VOID>", ".void"))
        end

        def text(item)
          Loader.strip_prefix(item)
        end
      end
    end
  end
end
