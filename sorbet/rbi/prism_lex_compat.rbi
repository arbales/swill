# typed: true

# Prism 1.9.0 (required by Minitest 6) ships a signature returning
# Prism::LexCompat::Result but omits its declaration. Mirror the class hierarchy
# in prism/lib/prism/lex_compat.rb without disabling dependency RBI checking.
# Remove this shim once Prism ships the declaration.
module Prism
  class LexCompat
    class Result < Prism::Result
    end
  end
end
