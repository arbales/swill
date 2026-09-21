# typed: false
# frozen_string_literal: true

# The MRI host for Swill. Swill is not meant to run on MRI; MRI hosts two
# narrow things, and this host is sized to them:
#
#   * Declarations, for the compiler. Every source's class bodies are
#     evaluated so the compiler can reflect on what they declared. Method
#     bodies never run.
#   * The model and data subset, for the shared examples. Attributes,
#     validation, dirty tracking, drafts, and the codecs are genuinely
#     portable, and build/mri-*.json keeps MRI and JavaScript agreeing.
#
# One protocol, two hosts: ask where Runtime.collect_attributes lives and the
# answer is attributes.mjs for the browser and attributes.rb here. This host
# grows only when a shared example needs it.
require "sorbet-runtime"
require_relative "declarations"
require_relative "properties"
require_relative "attributes"
require_relative "values"

module Swill
  module Runtime
    OMITTED_ARGUMENT = Object.new.freeze

    def self.omitted_argument
      OMITTED_ARGUMENT
    end

    def self.omitted_argument?(value)
      value.equal?(OMITTED_ARGUMENT)
    end
    class << self
      def read(object, name)
        object.public_send(name)
      end

      def write(object, name, value)
        object.public_send("#{name}=", value)
      end

      # One identity store per class, created on first use, so a subclass
      # never shares its parent's records.
      def identity_store(klass)
        klass.instance_variable_get(:@__swill_store__) ||
          klass.instance_variable_set(:@__swill_store__, Swill::Model::Store.new)
      end

      # The class whose own setting (not an inherited one) has the value:
      # how a JSON:API type finds its model class.
      def class_with_setting(name, value)
        ObjectSpace.each_object(::Class).find do |klass|
          klass < Swill::Model::Base && klass.instance_variable_get(:"@#{name}") == value
        end
      end

      # The installed class registered under a name. The browser's
      # Runtime.resolve reads the class registry; here the constant is the
      # registry.
      def resolve(name)
        ::Object.const_get(name.to_s)
      end

      # The installed name a declaration should record for a class: a class
      # answers its own, and a class-name string (the forward-reference
      # escape hatch) is qualified in the declaring class's namespace unless
      # it already carries one.
      def class_name(type, owner)
        return type.name.to_s unless type.is_a?(::String)
        return type if type.include?("::")
        namespace = owner.name.to_s.split("::")[0..-2]
        (namespace + [type]).join("::")
      end

      # A declared type as the text the compiler and the RBI use. Inside a
      # proc type Sorbet prints void as <VOID>, which is not spellable.
      def type_name(type)
        return type if type.is_a?(::String)
        T::Utils.coerce(type).to_s.gsub("<VOID>", ".void")
      rescue StandardError
        type.to_s
      end

      # An outlet's declared type as its reader answers it: unconnected until
      # awakening, so nilable unless it already is.
      def optional_type(type)
        text = type_name(type)
        return type if text == "T.untyped" || text.start_with?("T.nilable(")
        type.is_a?(::String) ? "T.nilable(#{type})" : T.nilable(type)
      end

      def warn(message)
        Kernel.warn("[Swill] #{message}")
      end

      # Remote transport is a browser concern. These state readers make
      # generated models safe to load and inspect on MRI during generation.
      def data_field_loaded(_object, _name) = false
      def data_field_loading(_object, _name) = false
      def data_field_error(_object, _name) = nil

      def initialize_remote_data(object)
        return unless object.class.respond_to?(:remote_fields)

        object.class.remote_fields.each do |name, descriptor|
          write(object, name, Swill::Model::Collection.new) if descriptor["kind"] == "many"
        end
      end

      def load_data_field(_object, _name, _reload)
        raise "remote data is available only in the browser runtime"
      end

      def data_query(*) = raise("remote data is available only in the browser runtime")
      def data_resolve(*) = raise("remote data is available only in the browser runtime")
      def data_command(*) = raise("remote data is available only in the browser runtime")
    end
  end
end
