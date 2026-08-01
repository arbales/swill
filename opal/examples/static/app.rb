# backtick_javascript: true

# A client model parsed from plain JSON. Attributes are observable, serialized
# through their wire keys, validated on assignment, and dirty-tracked.
class User < Swill::Model::Base
  attribute :name, default: "world"
  attribute :email, key: :email_address, default: ""

  def validate_email(value, _previous)
    value.to_s.strip.downcase
  end

  property :blank_email? do
    email.strip.empty?
  end

  property :present_email? do
    !blank_email?
  end

  property :clean? do
    !dirty?
  end
end

# The first backend-backed model slice mirrors the TypeScript breweries demo.
# A Dataset owns observable request state while PlainJSON decodes and pools the
# returned Brewery instances.
class Brewery < Swill::Model::Base
  ENDPOINT = "https://api.openbrewerydb.org/v1/breweries/search"

  attribute :name, default: ""
  attribute :brewery_type, default: ""
  attribute :city, default: ""
  attribute :state_province, default: ""

  def self.search(query)
    dataset(url: ENDPOINT, params: { query: query, per_page: 50 })
  end
end

class DemoContact
  include Swill::Observable

  property :name
  property :role

  def initialize(name, role)
    self.name = name
    self.role = role
  end
end

class HelloController < Swill::Controller
  property :user, default: -> { User.parse_one(id: "demo", name: "world", email_address: "") }
  property :draft, default: -> { user.draft }
  property :saving, default: false
  property :first_responder_debug, default: "None"
  property :selected_person, default: "ada"
  property :activated_person, default: "None"

  outlet :name_field
  outlet :people_list
  outlet :draft_editor
  outlet :standalone_text_field
  outlet :standalone_select
  outlet :custom_select

  # Auto-tracked: it reads user.name, so it recomputes whenever the name
  # changes through the key-path binding below — no dependency list.
  property :greeting do
    "Hello, #{user.name}!"
  end

  property :summary do
    email = user.email.strip
    email.empty? ? "No email." : "Email: #{email}"
  end

  property :selected_people do
    people_list ? people_list.selected_objects.map(&:name).join(", ") : ""
  end

  # Make the field the first responder rather than poking the DOM: the View
  # focuses itself as it becomes first responder, so DOM access stays in View.
  def after_load
    update_first_responder_debug(Swill::FirstResponder.current)
    register_teardown do
      @first_responder_observer&.call
      @first_responder_observer = nil
    end
    @first_responder_observer = Swill::FirstResponder.observe do |responder, _previous|
      update_first_responder_debug(responder)
    end
    application.make_first_responder(name_field)
    people_list.represented_object = [
      DemoContact.new("Ada", "Mathematician"),
      DemoContact.new("Grace", "Computer scientist"),
      DemoContact.new("Katherine", "Engineer")
    ]
    draft_editor.represented_object = draft
    standalone_select.options = ["Ada", "Grace", "Katherine"]
    standalone_select.value = "Grace"
    custom_select.options = [
      { value: "ada", label: "Ada Lovelace", description: "Mathematician" },
      { value: "grace", label: "Grace Hopper", description: "Computer scientist" },
      { value: "katherine", label: "Katherine Johnson", description: "Engineer" }
    ]
  end

  def update_first_responder_debug(responder)
    self.first_responder_debug = describe_responder(responder)
  end

  def describe_responder(responder)
    return "None" unless responder
    return responder.class.name unless responder.is_a?(Swill::View)

    element = responder.element
    tag = `#{element}.tagName`.to_s.downcase
    id = `#{element}.getAttribute("id")`
    outlet = `#{element}.getAttribute("outlet")`
    identity = id ? "##{id}" : (outlet ? %[#{tag}[outlet="#{outlet}"]] : tag)
    "#{responder.class.name} — #{identity}"
  end

  def clear(_sender, _event)
    user.name = ""
    user.email = ""
  end

  def activate_selection(sender, _event)
    self.activated_person = sender.selected_object&.name || "None"
  end

  def fake_save(_sender, _event)
    self.saving = true
    user.mark_clean!
  end

  # Drafts are detached editing buffers: changes do not touch the canonical
  # model until they are explicitly applied.
  def apply_draft(_sender, _event)
    user.apply_attributes(draft)
    user.mark_clean!
    self.draft = user.draft
    draft_editor.represented_object = draft
  end

  def reset_draft(_sender, _event)
    self.draft = user.draft
    draft_editor.represented_object = draft
  end

  def show_palette(_sender, _event)
    DemoApplication.shared.show_window("palette")
  end

  def show_intro(_sender, _event)
    DemoApplication.shared.load_window_content("workspace", "intro-pane")
  end

  def show_details(_sender, _event)
    DemoApplication.shared.load_window_content("workspace", "details-pane")
  end
end

class DemoDraftEditor < Swill::Controller::Editor
  def commit
    parent.apply_draft(self, nil)
    super
  end

  def discard
    parent.reset_draft(self, nil)
  end
end

# A child controller with a binding root. Its markup can say `bind="name"`
# instead of `bind="represented_object.name"`, while `@note` remains local to
# the controller.
class CardController < Swill::Controller
  property :represented_object, default: -> { User.new(name: "Ada") }
  property :note, default: ""

  def binding_root = "represented_object"

  property :note_blank? do
    note.strip.empty?
  end
end

# A nested controller. It owns its own subtree and state; its bindings and
# actions don't leak to HelloController, and anything it doesn't handle bubbles
# up the responder chain to its parent.
class CounterController < Swill::Controller
  property :count, default: 0

  def increment(_sender, _event)
    self.count = count + 1
  end
end

class BrewerySearchController < Swill::Controller
  property :query, default: "Portland"
  property :results, default: -> { Brewery.search(query) }

  property :result_summary do
    records = results.records
    next "No results." if records.empty?

    first = records.first
    "#{records.length} breweries; first: #{first.name} (#{first.city}, #{first.state_province})"
  end

  property :error_message do
    results.error ? results.error.message : ""
  end

  property :search_disabled? do
    query.strip.empty? || results.loading
  end

  def search(_sender, _event)
    self.results = Brewery.search(query)
    results.reload
  end
end

class PaletteController < Swill::Controller
  outlet :field

  def after_load
    application.make_first_responder(field)
  end

  def close(_sender, _event)
    DemoApplication.shared.dismiss(self)
  end
end

class IntroPaneController < Swill::Controller
  outlet :field

  def after_load
    application.make_first_responder(field)
  end
end

class DetailsPaneController < Swill::Controller
  outlet :field

  def after_load
    application.make_first_responder(field)
  end
end

class DemoApplication < Swill::Application
end

DemoApplication.shared.start
