# typed: true

module Demo
  class Person < Record
    extend T::Sig
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
  end
end
