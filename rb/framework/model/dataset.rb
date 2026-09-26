# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # The observable state of one collection request: its records, whether
    # a load is in flight, and the last failure. A list binds to records
    # and an indicator to loading; reload asks the server again.
    class Dataset < Swill::Object
      extend T::Sig

      property :records, type: T::Array[T.untyped], default: []
      property :loading, type: T::Boolean, default: false
      property :error, type: T.nilable(String), default: nil

      sig { params(model_class: T.class_of(Resource), url: String, params: T::Hash[String, T.untyped]).void }
      def initialize(model_class, url, params)
        super()
        @model_class = model_class
        @url = url
        @params = params
      end

      sig { returns(String) }
      attr_reader :url

      sig { returns(T::Hash[String, T.untyped]) }
      attr_reader :params

      sig { returns(Dataset) }
      async def reload
        self.loading = true
        self.error = nil
        begin
          self.records = @model_class.parse_many(await Wire.default.get_json(@url, params: @params))
        rescue => failure
          self.error = failure.message
        ensure
          self.loading = false
        end
        self
      end
    end
  end
end
