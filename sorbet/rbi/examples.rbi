# typed: true

# Mixins the examples declare, which Sorbet needs the shape of. The framework
# boundary is runtime.rbi, which is the file the gem ships; this one stays in
# the checkout.

module NameTracking
  extend T::Helpers
  requires_ancestor { Swill::Object }
end

module NameValidation
  # MRI instances inherit Kernel through Object; the ancestor requirement alone
  # does not make Kernel's private methods visible to Sorbet inside the module.
  include Kernel
  extend T::Helpers
  requires_ancestor { Swill::Object }
end

module NormalizeName
  extend T::Helpers
  requires_ancestor { Swill::Model::Base }
end

module StripName
  extend T::Helpers
  requires_ancestor { Swill::Model::Base }
end

module DecorateName
  extend T::Helpers
  requires_ancestor { Swill::Model::Base }
end
