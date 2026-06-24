# backtick_javascript: true

# A plain observable value object — not a controller. It can stand alone on
# the client, or later be the shared shape of a server record.
class User
  include Swill::Observable

  property :name, default: "world"
  property :email, default: ""

  computed :blank_email? do
    email.strip.empty?
  end

  computed :present_email? do
    !blank_email?
  end
end

class HelloController < Swill::Controller
  property :user, default: -> { User.new }
  property :saving, default: false

  outlet :name_field

  # Auto-tracked: it reads user.name, so it recomputes whenever the name
  # changes through the key-path binding below — no dependency list.
  computed :greeting do
    "Hello, #{user.name}!"
  end

  computed :summary do
    email = user.email.strip
    email.empty? ? "No email." : "Email: #{email}"
  end

  # Make the field the first responder rather than poking the DOM: the View
  # focuses itself as it becomes first responder, so DOM access stays in View.
  def after_load
    make_first_responder(name_field)
  end

  def clear(_sender, _event)
    user.name = ""
    user.email = ""
  end

  def fake_save(_sender, _event)
    self.saving = true
  end

  def show_palette(_sender, _event)
    DemoApplication.shared.show_window("palette")
  end
end

# A child controller with a binding root. Its markup can say `bind="name"`
# instead of `bind="represented_object.name"`, while `@note` remains local to
# the controller.
class CardController < Swill::Controller
  property :represented_object, default: -> { User.new.tap { |user| user.name = "Ada" } }
  property :note, default: ""

  def binding_root = "represented_object"

  computed :note_blank? do
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

class PaletteController < Swill::Controller
  outlet :field

  def after_load
    make_first_responder(field)
  end

  def close(_sender, _event)
    DemoApplication.shared.dismiss(self)
  end
end

class DemoApplication < Swill::Application
end

DemoApplication.shared.start
