# typed: true
module Fixture
  class Notes < Swill::Controller
    extend T::Sig
    property :count, type: Integer, default: 0

    sig { void }
    def add
      self.count = count + 1
    end
  end

  class Application < Swill::Application
  end
end
