# typed: true

# The static example: every UI facility on one page, with no backend. A
# toolbar switches the main window between three panes, a palette dialog and
# two restorable workspace panes come from templates, and the panes exercise
# bindings, drafts, nested controllers, notifications, controls, and an
# editable list.
module Static
  # A client model: attributes with wire keys, validation on assignment, and
  # dirty tracking. blank_email? and clean? are computed from them.
  class User < Swill::Model::Editable
    extend T::Sig

    attribute :name, type: String, default: "world"
    attribute :email, type: String, key: :email_address, default: ""

    sig { params(value: String, _previous: String).returns(String) }
    def validate_email(value, _previous)
      value.strip.downcase
    end

    property :blank_email?, type: T::Boolean do
      email.strip.empty?
    end

    property :present_email?, type: T::Boolean do
      !blank_email?
    end

    property :clean?, type: T::Boolean do
      !dirty?
    end
  end

  # A plain observable object for the list, constructed in code.
  class Contact < Swill::Object
    extend T::Sig

    property :name, type: String, default: ""
    property :role, type: String, default: ""

    sig { params(name: String, role: String).void }
    def initialize(name, role)
      super()
      self.name = name
      self.role = role
    end
  end

  class Application < Swill::Application
  end

  # The toolbar: which example the main window shows, and the other windows.
  class Menubar < Swill::Controller
    extend T::Sig

    # The button the last confirmation alert was answered with.
    property :answer, type: String, default: ""

    sig { override.void }
    def controller_did_load
      observe_notification("example_did_change", ->(notification) { sync_selected_example(notification.user_info) })
      main = application.window_named("main")
      name = main ? main.content_name : nil
      sync_selected_example(name) if name
    end

    sig { params(sender: Element).void }
    def show_example(sender)
      application.load_window_content("main", T.must(sender.getAttribute("data-example")))
    end

    sig { void }
    def show_palette
      application.show_window("palette")
    end

    # Asks before discarding, as a modal alert: Cancel is its default
    # button.
    sig { void }
    async def confirm
      alert = Swill::Alert.new
      alert.message_text = "Discard the draft?"
      alert.informative_text = "Its changes cannot be recovered."
      alert.add_button("Cancel")
      alert.add_button("Discard")
      self.answer = (await alert.run).to_s
    end

    sig { void }
    def show_intro
      application.load_window_content("workspace", "intro-pane")
    end

    sig { void }
    def show_details
      application.load_window_content("workspace", "details-pane")
    end

    sig { params(name: String).void }
    def sync_selected_example(name)
      view.element.querySelectorAll("[data-example]").forEach(->(button) do
        button.setAttribute("aria-pressed", button.getAttribute("data-example") == name ? "true" : "false")
      end)
    end
  end

  # Each pane announces itself once loaded, so the toolbar can follow.
  class Pane < Swill::Controller
    extend T::Sig

    sig { returns(String) }
    def example_name
      ""
    end

    sig { override.void }
    def controller_did_load
      Swill::NotificationCenter.default.post("example_did_change", self, example_name)
    end
  end

  class BindingsPane < Pane
    extend T::Sig

    property :user, type: T.nilable(Static::User), default: nil
    property :draft, type: T.nilable(Static::User), default: nil
    property :saving, type: T::Boolean, default: false
    property :first_responder_debug, type: String, default: "None"
    property :last_notification, type: String, default: "None"

    outlet :name_field, type: Swill::View
    outlet :draft_editor, type: "Static::DraftEditor"

    # Recomputed whenever user.name changes through the binding on the field.
    property :greeting, type: String do
      current = user
      current ? "Hello, #{current.name}!" : ""
    end

    property :summary, type: String do
      current = user
      email = current ? current.email.strip : ""
      email.empty? ? "No email." : "Email: #{email}"
    end

    sig { returns(String) }
    def example_name
      "bindings"
    end

    sig { override.void }
    def view_did_load
      self.user = Static::User.from_attributes({"id" => "demo", "name" => "world", "email_address" => ""})
      self.draft = T.must(user).draft
    end

    sig { override.void }
    def controller_did_load
      super
      observe_notification("counter_changed", ->(notification) { self.last_notification = "Counter changed to #{notification.user_info}" })
      observe_notification("first_responder_did_change", ->(notification) { update_first_responder_debug(notification.user_info) })
      T.must(draft_editor).represented_object = draft
      # The field focuses itself as it becomes first responder.
      application.make_first_responder(T.must(name_field))
      update_first_responder_debug(application.first_responder)
    end

    sig { params(responder: T.nilable(Swill::Responder)).void }
    def update_first_responder_debug(responder)
      self.first_responder_debug = describe_responder(responder)
    end

    sig { params(responder: T.nilable(Swill::Responder)).returns(String) }
    def describe_responder(responder)
      return "None" unless responder
      name = Swill::Runtime.nameOf(responder) || "Object"
      return name unless responder.is_a?(Swill::View)
      element = T.cast(responder, Swill::View).element
      tag = element.tagName.downcase
      id = element.getAttribute("id")
      outlet = element.getAttribute("outlet")
      identity = id ? "##{id}" : (outlet ? "#{tag}[outlet=#{outlet}]" : tag)
      "#{name} #{identity}"
    end

    sig { void }
    def clear
      current = T.must(user)
      current.name = ""
      current.email = ""
    end

    sig { void }
    def fake_save
      self.saving = true
      T.must(user).mark_clean!
    end

    # The draft is a detached buffer: nothing reaches the user until applied.
    sig { void }
    def apply_draft
      current = T.must(user)
      current.apply_draft(draft)
      current.mark_clean!
      reset_draft
    end

    sig { void }
    def reset_draft
      self.draft = T.must(user).draft
      T.must(draft_editor).represented_object = draft
    end
  end

  # Enter applies the draft through the pane; Escape resets it.
  class DraftEditor < Swill::Controller::Editor
    extend T::Sig

    sig { override.returns(T::Boolean) }
    def commit_editing
      pane.apply_draft
      true
    end

    sig { override.void }
    def discard_editing
      pane.reset_draft
    end

    sig { returns(Static::BindingsPane) }
    def pane
      T.cast(T.must(parent), Static::BindingsPane)
    end
  end

  # A nested controller with a binding root: bind="name" reads the
  # represented user, while @note stays local.
  class Card < Swill::Controller
    extend T::Sig

    property :note, type: String, default: ""

    property :note_blank?, type: T::Boolean do
      note.strip.empty?
    end

    sig { override.returns(T.nilable(Symbol)) }
    def binding_root
      :represented_object
    end

    sig { override.void }
    def view_did_load
      self.represented_object = Static::User.from_attributes({"name" => "Ada"})
    end
  end

  # A nested controller with its own state; what it does not handle bubbles
  # to its parent through the responder chain.
  class Counter < Swill::Controller
    extend T::Sig

    property :count, type: Integer, default: 0

    sig { void }
    def increment
      self.count = count + 1
      Swill::NotificationCenter.default.post("counter_changed", self, count)
    end
  end

  class ControlsPane < Pane
    extend T::Sig

    property :selected_person, type: String, default: "ada"

    outlet :standalone_text_field, type: Swill::Control::TextField
    outlet :standalone_select, type: Swill::Control::Select
    outlet :custom_select, type: Swill::Control::CustomSelect
    outlet :segmented, type: Swill::Control::Segmented

    sig { returns(String) }
    def example_name
      "controls"
    end

    sig { override.void }
    def controller_did_load
      super
      select = T.must(standalone_select)
      select.options = ["Ada", "Grace", "Katherine"]
      select.value = "Grace"
      T.must(segmented).options = [
        {"value" => "ada", "label" => "Ada"},
        {"value" => "grace", "label" => "Grace"},
        {"value" => "katherine", "label" => "Katherine"}
      ]
      T.must(custom_select).options = [
        {"value" => "ada", "label" => "Ada Lovelace", "description" => "Mathematician"},
        {"value" => "grace", "label" => "Grace Hopper", "description" => "Computer scientist"},
        {"value" => "katherine", "label" => "Katherine Johnson", "description" => "Engineer"}
      ]
    end
  end

  class DataPane < Pane
    extend T::Sig

    property :activated_person, type: String, default: "None"

    outlet :people_list, type: Swill::Controller::EditableList

    property :selected_people, type: String do
      list = people_list
      list ? list.selected_objects.map { |contact| contact.name }.join(", ") : ""
    end

    sig { returns(String) }
    def example_name
      "data"
    end

    sig { override.void }
    def controller_did_load
      super
      T.must(people_list).represented_object = [
        Static::Contact.new("Ada", "Mathematician"),
        Static::Contact.new("Grace", "Computer scientist"),
        Static::Contact.new("Katherine", "Engineer")
      ]
    end

    sig { params(sender: Swill::Controller::List).void }
    def activate_selection(sender)
      selected = sender.selected_object
      self.activated_person = selected ? selected.name : "None"
    end
  end

  class Palette < Swill::Controller
    extend T::Sig

    outlet :field, type: Swill::View

    sig { override.void }
    def controller_did_load
      application.make_first_responder(T.must(field))
    end

    sig { void }
    def close
      application.dismiss(self)
    end
  end

  # Workspace panes keep their fields in the URL fragment.
  class IntroPane < Swill::Controller
    extend T::Sig

    property :query, type: String, default: "Ruby"
    property :page, type: Integer, default: 1

    restorable :query, key: :q
    restorable :page

    outlet :field, type: Swill::View

    # The number input writes text; the property holds a number.
    sig { override.params(name: String, value: T.untyped, previous: T.untyped).returns(T.untyped) }
    def coerce_property_value(name, value, previous)
      name == "page" ? value.to_i : value
    end

    sig { override.void }
    def controller_did_load
      application.make_first_responder(T.must(field))
    end
  end

  class DetailsPane < Swill::Controller
    extend T::Sig

    property :query, type: String, default: "Details"

    restorable :query, key: :q

    outlet :field, type: Swill::View

    sig { override.void }
    def controller_did_load
      application.make_first_responder(T.must(field))
    end
  end
end
