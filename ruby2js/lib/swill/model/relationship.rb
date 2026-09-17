# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # A has_many or has_one as installed: its name, wire key, kind, model
    # class, and URL pattern, where :id stands for the owner's id.
    class Relationship < Swill::Object
      extend T::Sig

      sig { params(descriptor: T::Hash[String, T.untyped]).void }
      def initialize(descriptor)
        super()
        @name = T.let(descriptor["name"], String)
        @key = T.let(descriptor["key"], String)
        @kind = T.let(descriptor["kind"], String)
        @type = T.unsafe(descriptor["type"])
        @url = T.let(descriptor["url"], T.nilable(String))
      end

      sig { returns(String) }
      def name
        @name
      end

      sig { returns(String) }
      def key
        @key
      end

      sig { returns(T::Boolean) }
      def many?
        @kind == "many"
      end

      sig { returns(T.class_of(Base)) }
      def model_class
        @type
      end

      # Where an owner's related records are: the declared pattern with the
      # owner's id, or the owner's own URL followed by the key.
      sig { params(owner: Base).returns(String) }
      def url_for(owner)
        id = T.must(owner.id)
        pattern = @url
        return pattern.sub(":id", encodeURIComponent(id)) if pattern
        "#{owner.class.resource_url(id)}/#{@key}"
      end
    end
  end
end
