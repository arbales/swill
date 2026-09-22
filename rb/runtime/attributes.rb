# typed: false
# frozen_string_literal: true

# Declaration metadata used by MRI-only connection tests. Model attribute
# behavior lives in the compiled Ruby Attributes concern.
module Swill
  module Runtime
    class << self
      def outlets(object)
        declarations(object.class, "properties").each_value.select { |descriptor| descriptor["outlet"] }
      end
    end
  end
end
