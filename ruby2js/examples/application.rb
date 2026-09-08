# typed: true

module Demo
  class Controller < Swill::Controller
    extend T::Sig

    property :person, type: T.nilable(Demo::Person), default: nil
    property :fallback, type: String, default: "Nobody"

    property :title, type: String do
      current = person
      if current
        current.greeting
      else
        fallback
      end
    end

    sig { void }
    def view_did_load
      self.person = Demo::Person.new
    end

    sig { returns(String) }
    def clear()
      self.person = nil
      title
    end

    # Reached through the responder chain from a nested controller's button.
    sig { void }
    def shout
      current = person
      current.name = current.name.upcase if current
    end
  end

  # A nested controller with the same binding and action names as its parent.
  class Badge < Swill::Controller
    extend T::Sig

    property :count, type: Integer, default: 0

    property :title, type: String do
      "Badge #{count}"
    end

    sig { void }
    def bump
      self.count = count + 1
    end

    sig { void }
    def clear
      self.count = 0
    end
  end
end
