# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # has_many and has_one, as ordinary Ruby. An association is two
    # properties, a registry entry, and two forwarded methods — nothing the
    # declaration primitives do not already provide, so nothing here needs a
    # branch in the compiler or a function in the runtime.
    #
    #   has_many :ingredients, type: Ingredient, url: "/api/recipes/:id/ingredients"
    #
    # declares +ingredients+ and its key-value loading state, records the
    # descriptor, and defines +load_ingredients+ and +reload_ingredients+.
    # Because the value property is declared will_access:, reading
    # +ingredients+ on a persisted record that has not loaded them starts the
    # request and fills the value in when it lands, so a binding on the value
    # is all an application needs to write.
    module Associations
      extend T::Sig

      sig { params(base: T.class_of(Swill::Object)).void }
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        extend Swill::Declarations

        inheritable_registry :model_associations

        macro def has_many(name, type:, key: name, url: nil, will_access: true)
          declare_association(name, type, key, url, "many", will_access)
        end

        macro def has_one(name, type:, key: name, url: nil, will_access: true)
          declare_association(name, type, key, url, "one", will_access)
        end

        # An association names its model class, which may be declared later
        # in a genuine cycle; a class-name string is the escape hatch, and
        # the descriptor carries the installed name either way.
        macro def declare_association(name, type, key, url, kind, will_access)
          target = Swill::Runtime.class_name(type, self)
          many = kind == "many"
          value_type = many ? "T::Array[#{target}]" : "T.nilable(#{target})"
          property name, type: value_type, default: (many ? [] : nil), will_access: will_access
          # Key-value loading, as AVFoundation spells it: an association is
          # unknown, loading, loaded, or failed. Every state is a property, so
          # a spinner, an empty state, and a failure are all bindings rather
          # than a controller method with a rescue.
          property :"#{name}_loading", type: T::Boolean, default: false
          property :"#{name}_loaded", type: T::Boolean, default: false
          property :"#{name}_error", type: T.nilable(String), default: nil
          model_associations[name.to_s] = {
            "name" => name.to_s, "key" => key.to_s, "kind" => kind,
            "type" => target, "url" => url
          }
          forward :"load_#{name}", to: :load_association, with: [name.to_s],
                  returns: value_type, async: true
          forward :"reload_#{name}", to: :reload_association, with: [name.to_s],
                  returns: value_type, async: true
        end
      end
    end
  end
end
