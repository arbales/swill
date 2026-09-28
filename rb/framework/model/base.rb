# typed: true
# frozen_string_literal: true

module Swill
  module Model
    # Common model state: observable, validated attributes and a stable id.
    # Persistence strategies live in Resource and Distant::Object.
    class Base < Swill::Object
      extend T::Sig
      include Attributes

      attribute :id, type: T.nilable(String), default: nil
    end
  end
end
