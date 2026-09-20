# typed: false
# frozen_string_literal: true

# Ruby already has Ruby's value semantics, so nothing here mirrors
# values.mjs. These two predicates are the exception: the runtime answers
# them in the browser and Ruby does not define them.
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
