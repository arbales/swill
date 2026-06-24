# Build on Opal's curated minimal core rather than the full stdlib, then add
# back only what Swill uses, to keep the downloadable bundle small. opal/mini
# gives us String/Array/Hash/Enumerable/Proc/Regexp/Number; the full `opal`
# adds Time, Complex, Rational, encoding, format, binding, and irb, none of
# which Swill needs. Anything we discover we need gets an explicit require
# here.
require "opal/mini"

# opal/mini omits corelib/unsupported, which is where Opal defines the
# visibility keywords (private/protected/public) as no-ops. We rely on
# `private` for encapsulation, so pull it back in.
require "corelib/unsupported"

# Opal's `date` stdlib (used by the ISO-8601 date polyfill and Swill::Sig)
# requires the Time class, which lives in corelib/time and is omitted by
# opal/mini. Pull it back so Date works on the client.
require "corelib/time"

require "native" # DOM and JavaScript interop
require "json"   # JSON-payload outlets (Swill::Outlets)

require "swill/responder"
require "swill/observable"
require "swill/key_path"
require "swill/event"
require "swill/view"
require "swill/focus"
require "swill/outlets"
require "swill/controller"
require "swill/bindings"
require "swill/actions"
require "swill/awakening"
require "swill/application"
require "swill/iso8601"
require "swill/sig"

module Swill
  VERSION = "0.0.0"
end
