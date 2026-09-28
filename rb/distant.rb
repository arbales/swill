# frozen_string_literal: true

require_relative "distant/types"
require_relative "distant/value"
require_relative "distant/sig"
require_relative "distant/type_facade"
require_relative "distant/interface"
require_relative "distant/schema"
require_relative "distant/generator"
require_relative "distant/protocol"
require_relative "distant/context"
require_relative "distant/validator"
require_relative "distant/dispatcher"
require_relative "distant/connection"

module Swill
  # Distant Objects: the server side of the remote data graph, from each
  # model's declared interface to its schema, generated client, and dispatch.
  module Distant
    PROTOCOL_VERSION = 2
  end
end
