# frozen_string_literal: true

# `require "swill/bundles"`: the server's view of the page's bundles, without
# the rest of the server.
module Swill
  ROOT = File.expand_path("../..", __dir__) unless const_defined?(:ROOT, false)
end

require_relative "../bundles"
