# backtick_javascript: true
#
# Test fixture compiled into the integration bundle. It records every lifecycle
# hook into globalThis.__hooks__ so the Node harness can assert ordering, and
# exposes a `clear` action plus a two-way `message` binding.

require "swill"

class User
  include Swill::Observable

  property :name, default: "world"
end

class RecordingController < Swill::Controller
  property :message, default: "hi"
  property :user, default: -> { User.new }

  outlet :message_field
  outlet :missing, optional: true

  # Reads user.name across the object boundary; the key-path binding writes
  # user.name, which must recompute this and push to its binding.
  computed :greeting do
    "Hi #{user.name}"
  end

  def before_load = `globalThis.__hooks__.push("before_load")`

  def after_load
    `globalThis.__hooks__.push("after_load")`
    # Make the outlet the first responder; the View focuses itself.
    make_first_responder(message_field)
    # owner() walks the sparse view tree: the outlet View was adopted into this
    # controller's view, so its owner is this controller.
    `globalThis.__owner_ok__ = #{message_field.owner.equal?(self)}`
  end

  def before_appear = `globalThis.__hooks__.push("before_appear")`
  def after_appear = `globalThis.__hooks__.push("after_appear")`

  def clear(_sender, _event)
    self.message = ""
  end

  # Escape on the first-responder field (a View deep in the chain) must bubble
  # up the responder chain to here.
  def cancel_operation(_event)
    `globalThis.__escaped__ = true`
  end
end

class CounterController < Swill::Controller
  property :count, default: 0

  def increment(_sender, _event)
    self.count = count + 1
  end

  def before_disappear = `globalThis.__disappeared__.push("counter:before")`
  def after_disappear = `globalThis.__disappeared__.push("counter:after")`
end

class RootedController < Swill::Controller
  property :represented_object, default: -> { User.new.tap { |user| user.name = "rooted" } }
  property :local_message, default: ""

  def binding_root = "represented_object"
end

class PaletteController < Swill::Controller
  outlet :palette_field

  def after_load
    `globalThis.__palette__.push("after_load")`
    make_first_responder(palette_field)
  end

  def before_disappear = `globalThis.__palette__.push("before_disappear")`
  def after_disappear = `globalThis.__palette__.push("after_disappear")`

  def close(_sender, _event)
    TestApp.shared.dismiss(self)
  end
end

class TestApp < Swill::Application
  def before_launch = `globalThis.__hooks__.push("before_launch")`
  def after_launch = `globalThis.__hooks__.push("after_launch")`
end

TestApp.shared.start
`globalThis.__showPalette__ = #{lambda { TestApp.shared.show_window("palette") }}`

# Let the Node harness drive detach (the shim's MutationObserver is a no-op).
`globalThis.__swillDetach__ = #{lambda { |node| Swill::Awakening.detach(node) }}`

# Opal-runtime guard for the ISO-8601 date polyfill. The MRI parity spec
# proves compliance against native Date.iso8601, but it cannot catch Opal-only
# behavior (e.g. `/` being float division there, which broke the week-date
# math). Round-trip a few forms through the real Opal Date so a regression
# surfaces here.
iso_check = lambda do |string|
  begin
    date = Date.iso8601(string)
    "#{date.year}-#{date.month}-#{date.day}"
  rescue ArgumentError
    "invalid"
  end
end

iso = `{}`
{
  "calendar" => iso_check.call("2026-06-23"),
  "basic"    => iso_check.call("20260623"),
  "ordinal"  => iso_check.call("2026-174"),
  "week"     => iso_check.call("2026-W26-2"),
  "week53"   => iso_check.call("2020-W53-7"),
  "invalid"  => iso_check.call("2025-02-29")
}.each { |key, value| `#{iso}[#{key}] = #{value}` }
`globalThis.__iso__ = #{iso}`
