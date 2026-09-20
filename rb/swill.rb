# frozen_string_literal: true

module Swill
  # The repository (or installed gem) root. Every path the compiler reads —
  # the framework's Ruby, the MRI host, the prebuilt bundles, the runtime's
  # RBI — is built from here, so the layout is described in exactly one
  # place. Defined before the requires below so the compiler's own files can
  # read it while they load.
  ROOT = File.expand_path("..", __dir__)
end

require_relative "compiler/version"
require_relative "compiler/compiler"
