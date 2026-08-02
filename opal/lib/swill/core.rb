# frozen_string_literal: true

require "swill/core/support"
require "swill/core/core_ext"
require "swill/core/observable"
require "swill/core/key_path"
require "swill/core/object_bindings"
require "swill/core/responder"
require "swill/core/notification_center"
require "swill/core/sig"

# Not required here, and therefore not in the default client bundle:
# - swill/core/iso8601 — the Date.iso8601 polyfill; pulls Opal's date/time
#   stdlib. Require it (plus "date") when the client actually handles dates.
# - swill/core/sig/authoring — the server-side sig decorator surface.
