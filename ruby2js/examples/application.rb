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
    outlet :seed, type: T::Hash[String, String]
    outlet :missing, type: Swill::View, optional: true

    # Kept equal to the badge outlet's count by an object binding.
    property :badge_count, type: Integer, default: 0

    # The roster JSON becomes people; the list shows them through bind="people".
    property :people, type: T::Array[Demo::Person], default: []
    outlet :roster, type: T::Array[Demo::Person], optional: true
    outlet :people_list, type: Swill::Controller::List, optional: true

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
      # Required outlets are connected by now, and view_did_load set a person.
      T.must(person).name = T.must(seed).fetch("name")
      bind(:badge_count, to: T.must(badge), key_path: "count")
      self.people = T.must(roster) if roster
      # Start with the name field focused; the field is a View, so it accepts.
      application.make_first_responder(T.must(name_field))
    end

    # A plain list hands its selection here on Enter or a double-click; the
    # people list edits in place instead and never sends this.
    sig { params(sender: Swill::Controller::List).void }
    def activate_selection(sender)
      self.person = sender.selected_object
    end

    # A row's remove button. The sender is the button, so the list says which
    # row it sits in; the list re-renders from the new array.
    sig { params(sender: T.untyped).void }
    def remove_person(sender)
      list = people_list
      return unless list
      removed = list.object_at(list.row_for(sender))
      self.people = people.select { |candidate| candidate != removed }
    end

    # The roster script holds rows; the outlet holds people. The awakening
    # checks the result against the outlet's type.
    sig { override.params(name: String, value: T.untyped).returns(T.untyped) }
    def decode_outlet_data(name, value)
      return value unless name == "roster"
      T.cast(value, T::Array[Hash]).map { |row| Demo::SpecialPerson.from_attributes(row) }
    end

    # Escape in any owned field bubbles here through the responder chain.
    sig { override.params(event: T.untyped).void }
    def cancel_operation(event)
      clear
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
      T.must(person).name = T.must(person).name.upcase
    end
  end

  # A nested controller with the same binding and action names as its parent.
  class Badge < Swill::Controller
    extend T::Sig

    property :count, type: Integer, default: 0
    property :restored, type: T::Boolean, default: false

    # When this badge is window content, its count lives in the URL fragment
    # under the window's name (main.n=3) and comes back on Back/Forward.
    restorable :count, key: :n

    property :title, type: String do
      "Badge #{count}"
    end

    sig { override.params(restored: T::Boolean).void }
    def controller_did_restore(restored)
      self.restored = restored
    end

    sig { void }
    def bump
      self.count = count + 1
    end

    sig { void }
    def clear
      self.count = 0
    end

    # A badge presented as a dialog closes itself through the application.
    sig { void }
    def close
      application.dismiss(self)
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

    # Alternate the main window between two templates.
    sig { void }
    def swap_window
      current = window_named("main")
      name = current && current.content_name == "welcome" ? "farewell" : "welcome"
      load_window_content("main", name)
    end

    sig { void }
    def open_palette
      show_window("palette")
    end

    # Clears every awakened controller that handles clear; the metadata
    # query is the explicit stand-in for respond_to?.
    sig { void }
    def reset
      controllers.each do |controller|
        T.unsafe(controller).clear if controller.respond_to?(:clear)
      end
    end
  end
end

module Demo
  # The roster table. Rows are cloned from its <template for="row"> and bind
  # to each person; the selection and sort order are kept in the URL under
  # the people window, so a reload or Back/Forward shows the same view.
  # Rows edit in place from <template for="editor">; Enter or a double-click
  # opens the editor, Enter commits, and Escape discards.
  class PeopleList < Swill::Controller::EditableList
    extend T::Sig

    restorable :selected_object_id, key: :selected
    restorable :sort_key, key: :sort
    restorable :sort_direction, key: :dir

    # How many times a different person became the selected one.
    property :selection_changes, type: Integer, default: 0

    sig { override.params(previous: T.untyped, object: T.untyped).void }
    def selected_object_did_change(previous, object)
      self.selection_changes = selection_changes + 1
    end
  end

  # Bound by its parent through bind="person" on its root; its own bindings
  # resolve under represented_object, so bind="name" edits the person.
  class PersonEditor < Swill::Controller
    extend T::Sig

    # Controller-local state, reached from markup with bind="@note".
    property :note, type: String, default: ""

    sig { returns(T.nilable(Symbol)) }
    def binding_root
      :represented_object
    end
  end
end
