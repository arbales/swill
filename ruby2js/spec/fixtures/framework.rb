# typed: true

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

class Record < ReactiveObject
  extend T::Sig
  include Swill::Model::Attributes

  attribute :id, type: T.nilable(String), default: nil

  sig { params(value: String).returns(String) }
  def normalize(value)
    value
  end
end

