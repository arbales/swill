# frozen_string_literal: true

require_relative "data/types"
require_relative "data/value"
require_relative "data/sig"
require_relative "data/type_facade"
require_relative "data/declarations"
require_relative "data/schema"
require_relative "data/generator"
require_relative "data/protocol"
require_relative "data/context"
require_relative "data/validator"
require_relative "data/dispatcher"
require_relative "data/web_socket"

module Swill
  # Server-side schema, generation, and dispatch for the remote data graph.
  module Data
    PROTOCOL_VERSION = 1

    def self.install(model_base)
      model_base.extend(Declarations) unless model_base.singleton_class < Declarations
    end
  end
end
