# typed: true

module Demo
  class Controller < Swill::Controller
    extend T::Sig

    property :person, type: T.nilable(Demo::Person), default: nil
    property :fallback, type: String, default: "Nobody"

    # Connected between view_did_load and awake_from_dom. The input becomes a
    # plain View, the nested controller is itself the value, the JSON script
    # is decoded, and an optional outlet may be absent.
    outlet :name_field, type: Swill::View
    outlet :badge, type: Demo::Badge
    outlet :seed, type: T.untyped
    outlet :missing, type: Swill::View, optional: true

    # Kept equal to the badge outlet's count by an object binding.
    property :badge_count, type: Integer, default: 0

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
      reset_person
    end

    sig { void }
    def awake_from_dom
      current = person
      data = seed
      current.name = data["name"] if current && data
      current_badge = badge
      bind(:badge_count, to: current_badge, key_path: "count") if current_badge
    end

    sig { returns(String) }
    def clear()
      reset_person
      title
    end

    sig { void }
    def reset_person
      self.person = Demo::Person.new
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

module Demo
  # Declared by <body application="Demo::Application">. Root controllers
  # forward unhandled actions here, so a button anywhere can reset the page.
  class Application < Swill::Application
    extend T::Sig

    property :launched, type: T::Boolean, default: false

    sig { void }
    def application_did_launch
      self.launched = true
    end

    # Clears every awakened controller that handles clear; the metadata
    # query is the explicit stand-in for respond_to?.
    sig { void }
    def reset
      controllers.forEach do |controller|
        controller.clear() if Swill::Runtime.hasAction(controller, "clear")
      end
    end
  end
end

module Demo
  # Bound by its parent through bind="person" on its root; its own bindings
  # resolve under represented_object, so bind="name" edits the person.
  class PersonEditor < Swill::Controller
    extend T::Sig

    # Controller-local state, reached from markup with bind="@note".
    property :note, type: String, default: ""

    sig { returns(String) }
    def binding_root
      "represented_object"
    end
  end
end
