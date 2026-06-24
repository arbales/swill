# backtick_javascript: true

# A plain observable value object — not a controller. It can stand alone on
# the client, or later be the shared shape of a server record.
class User
  include Swill::Observable

  property :name, default: "world"
end

class HelloController < Swill::Controller
  property :user, default: -> { User.new }

  outlet :name_field

  # Auto-tracked: it reads user.name, so it recomputes whenever the name
  # changes through the key-path binding below — no dependency list.
  computed :greeting do
    "Hello, #{user.name}!"
  end

  # Make the field the first responder rather than poking the DOM: the View
  # focuses itself as it becomes first responder, so DOM access stays in View.
  def after_load
    make_first_responder(name_field)
  end

  def clear(_sender, _event)
    user.name = ""
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

class DemoApplication < Swill::Application
end

DemoApplication.shared.start
