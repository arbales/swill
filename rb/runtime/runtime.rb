# typed: false
# frozen_string_literal: true

require "sorbet-runtime"
require "time"
require "date"
require "bigdecimal"
require_relative "declarations"
require_relative "properties"
require_relative "attributes"
require_relative "values"

module Swill
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

      def responds_to(object, name)
        object.respond_to?(name)
      end

      def method_accepts(object, name, count)
        method = object.method(name)
        method.arity == count || (method.arity < 0 && count >= -method.arity - 1)
      end

      def invoke(object, name, *arguments)
        object.public_send(name, *arguments)
      end

      def duplicate(value)
        value.dup
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
          klass < Swill::Model::Resource && klass.instance_variable_get(:"@#{name}") == value
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

      # MRI can exercise all distant-data semantics except the browser transport.
      def register_data_lifecycle(_reset, _opened, _changed); end
      def connect_data; end
      def data_connected = false
      def data_request(*) = raise("remote data is available only in the browser runtime")
      def data_time(value) = value.is_a?(Time) && !(defined?(Sequel::SQLTime) && value.is_a?(Sequel::SQLTime))
      def data_time_iso(value) = value.utc.iso8601(6)
      def data_time_from_iso(value) = Time.iso8601(value)
      def data_record(value) = value.is_a?(Hash)
      def data_value_type(value)
        case value
        when DateTime then "DateTime"
        when Date then "Date"
        when BigDecimal then "BigDecimal"
        else
          return "TimeOfDay" if defined?(Sequel::SQLTime) && value.is_a?(Sequel::SQLTime)
          return "RangeValue" if defined?(Sequel::Postgres::PGRange) && value.is_a?(Sequel::Postgres::PGRange)
          return "Interval" if defined?(ActiveSupport::Duration) && value.is_a?(ActiveSupport::Duration)
          nil
        end
      end
      def data_value_payload(value)
        case data_value_type(value)
        when "Date" then value.iso8601
        when "DateTime" then value.new_offset(0).iso8601(6)
        when "BigDecimal" then value.to_s("F")
        when "TimeOfDay" then value.strftime("%H:%M:%S.%6N")
        when "RangeValue"
          [value.db_type, value.empty?, value.begin, value.end, value.exclude_begin?, value.exclude_end?]
        when "Interval"
          parts = value.parts
          months = parts.fetch(:years, 0) * 12 + parts.fetch(:months, 0)
          days = parts.fetch(:weeks, 0) * 7 + parts.fetch(:days, 0)
          seconds = parts.fetch(:hours, 0) * 3600 + parts.fetch(:minutes, 0) * 60 + parts.fetch(:seconds, 0)
          [months, days, (BigDecimal(seconds.to_s) * 1_000_000).to_i.to_s]
        end
      end
      def data_date_from_iso(value) = Date.iso8601(value)
      def data_date_iso(value) = value.iso8601
      def data_date_time_from_iso(value) = DateTime.iso8601(value)
      def data_decimal_from_string(value) = BigDecimal(value)
      def data_time_of_day_from_iso(value) = Sequel::SQLTime.parse(value)
      def data_range(name, empty, first, last, exclude_first, exclude_last)
        return Sequel::Postgres::PGRange.empty(name) if empty
        Sequel::Postgres::PGRange.new(first, last, db_type: name,
          exclude_begin: exclude_first, exclude_end: exclude_last)
      end
      def data_interval(months, days, micros)
        seconds = BigDecimal(micros.to_s) / 1_000_000
        ActiveSupport::Duration.new(months * 2_592_000 + days * 86_400 + seconds.to_f,
          months: months, days: days, seconds: seconds)
      end
      def compare_decimal(left, right) = left <=> right
      def is_number(value) = value.is_a?(Numeric)
      def is_boolean(value) = value.equal?(true) || value.equal?(false)
      def compare_text(left, right) = left <=> right
    end
  end
end
