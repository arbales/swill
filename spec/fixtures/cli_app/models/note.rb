# typed: true
module Fixture
  class Note < Swill::Model::Base
    attribute :title, type: String, default: ""
  end
end
