# typed: true

module NormalizeName
  extend T::Sig

  sig { params(value: String).returns(String) }
  def normalize(value)
    value
  end
end

module StripName
  extend T::Sig

  sig { params(value: String).returns(String) }
  def normalize(value)
    super(value).strip
  end
end

module DecorateName
  extend T::Sig

  sig { params(value: String).returns(String) }
  def normalize(value)
    "<#{super(value)}>"
  end
end

module Demo
  class Person < Swill::Model::Base
    extend T::Sig
    include NormalizeName
    include StripName
    include DecorateName

    attribute :name, type: String, default: ""
    property :loud, type: T::Boolean, default: false

    property :label, type: String do
      if loud
        name.upcase
      else
        name
      end
    end

    property :blank?, type: T::Boolean do
      name.blank?
    end

    sig { params(value: String).returns(String) }
    def normalize(value)
      "[#{super(value)}]"
    end

    sig { returns(String) }
    def greeting
      "Hello #{label}"
    end

    sig { params(value: String).returns(String) }
    def rename(value)
      self.name = normalize(value)
    end

    sig { params(value: T.nilable(Integer)).returns(Integer) }
    def ruby_truth(value)
      if value
        1
      else
        2
      end
    end

    sig { params(value: T.nilable(String)).returns(String) }
    def ruby_or(value)
      value || "fallback"
    end
  end

  class SpecialPerson < Person
    attribute :role, type: String, key: :job, default: "editor"

    # The validate_<attribute>(value, previous) convention: return the value
    # to store, or raise to reject and keep the previous one.
    sig { params(value: String, previous: String).returns(String) }
    def validate_role(value, previous)
      cleaned = value.strip
      raise "role must not be blank" if cleaned.empty?
      cleaned
    end
  end
end
