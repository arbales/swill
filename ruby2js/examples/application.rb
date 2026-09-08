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
  end
end
