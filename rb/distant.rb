# frozen_string_literal: true

require_relative "distant/types"
require_relative "distant/database"
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
  module Distant
    # The version of the wire protocol this server speaks. The browser sends
    # its own in the `HELLO` message, the `Schema` writes it into its payload
    # and so into the schema hash, and the `Dispatcher` answers
    # `schema_mismatch` when the browser's differs.
    PROTOCOL_VERSION = 3
  end
end
