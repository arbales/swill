# typed: true
module Fixture
  class Note < Swill::Model::Resource
    attribute :title, type: String, default: ""
  end
end
