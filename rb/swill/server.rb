# frozen_string_literal: true

module Swill
  ROOT = File.expand_path("../..", __dir__) unless const_defined?(:ROOT, false)
end

require_relative "../compiler/version"
require_relative "../data"
