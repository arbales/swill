# frozen_string_literal: true

module Swill
  module Model
    # Observable result state for a model collection request.
    class Dataset
      include Observable

      property :records, default: -> { [] }
      property :loading, default: false
      property :error

      attr_reader :model_class, :url, :params

      def initialize(model_class, url:, params: {}, wire: Wire)
        @model_class = model_class
        @url = url
        @params = params
        @wire = wire
      end

      def reload
        self.loading = true
        self.error = nil

        @wire.get_json(url, params: params).then do |payload|
          self.records = model_class.parse_many(payload)
          self.loading = false
          self
        end.fail do |failure|
          self.error = failure
          self.loading = false
          self
        end
      end
    end

    # Class-side dataset factory, independently composable like the other
    # model concerns. URLs stay explicit until a route convention is chosen.
    module Datasets
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        def dataset(url:, params: {}, wire: Wire)
          Dataset.new(self, url: url, params: params, wire: wire)
        end
      end
    end
  end
end
