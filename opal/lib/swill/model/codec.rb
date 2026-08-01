# frozen_string_literal: true

module Swill
  module Model
    module Codec
      def parse_one(_model_class, _payload)
        raise NotImplementedError
      end

      def parse_many(_model_class, _payload)
        raise NotImplementedError
      end

      def serialize(_model, dirty_only: false)
        raise NotImplementedError
      end
    end

  end
end
