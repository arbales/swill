# frozen_string_literal: true

# Small ActiveSupport-compatible predicates used by Ruby binding expressions.
# Define them only when the host has not already supplied its own semantics.
class Object
  unless method_defined?(:blank?)
    def blank?
      respond_to?(:empty?) ? !!empty? : !self
    end
  end

  unless method_defined?(:present?)
    def present?
      !blank?
    end
  end
end

class String
  unless instance_methods(false).include?(:blank?)
    def blank?
      strip.empty?
    end
  end
end
