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

class ReactiveMember < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "members"
  endpoint "/members"
  attribute :name, default: "Ada"
end

class RowItem
  include Swill::Observable
  property :name
  property :id

  def initialize(name)
    self.name = name
    self.id = name.downcase
  end
end

class ListHostController < Swill::Controller
  outlet :item_list
  outlet :text_control
  outlet :select_control
  outlet :custom_select
  property :selected_person, default: "ada"

  property :selection_summary do
    item_list ? item_list.selected_objects.map(&:name).join(", ") : ""
  end

  def after_load
    @old_item = RowItem.new("Ada")
    item_list.represented_object = [@old_item, RowItem.new("Grace"), RowItem.new("Katherine")]
    select_control.options = ["Ada", "Grace"]
    select_control.value = "Grace"
    custom_select.options = [
      { value: "ada", label: "Ada" },
      { value: "grace", label: "Grace" }
    ]
    `globalThis.__replaceList__ = #{lambda { item_list.represented_object = [RowItem.new("Katherine")] }}`
    `globalThis.__mutateRemovedRow__ = #{lambda { @old_item.name = "Removed" }}`
    `globalThis.__selectFirstListItem__ = #{lambda { item_list.selected_object = item_list.represented_object.first }}`
    `globalThis.__restoreListSelection__ = #{lambda do
      records = item_list.represented_object
      item_list.represented_object = []
      item_list.selected_object_id = "grace"
      item_list.represented_object = records
      item_list.selected_object&.name
    end}`
    `globalThis.__rewireFirstListRow__ = #{lambda do
      first_row = item_list.send(:row_elements).first
      Swill::Awakening.wire(first_row)
    end}`
    first_row = item_list.send(:row_elements).first
    `globalThis.__list_row_owner_ok__ = #{Swill::View.for(first_row)&.owner.equal?(item_list)}`
  end

  def activate_selection(sender, _event)
    `globalThis.__activated_list_item__ = #{sender.selected_object&.name}`
  end

  def row_ping(_sender, _event)
    `globalThis.__row_pinged__ = true`
  end
end

class RecordingEditor < Swill::Controller::Editor
  def commit
    `globalThis.__editor_events__.push("commit")`
    super
  end

  def discard
    `globalThis.__editor_events__.push("discard")`
  end
end

class EditorHostController < Swill::Controller
  outlet :editor

  def after_load
    editor.represented_object = RowItem.new("Draft")
    `globalThis.__commitEditor__ = #{lambda { editor.insert_newline(nil) }}`
    `globalThis.__discardEditor__ = #{lambda { editor.cancel_operation(nil) }}`
  end
end

class EditableHostController < Swill::Controller
  outlet :editable_list

  def after_load
    editable_list.represented_object = [RowItem.new("Original")]
    `globalThis.__beginEditable__ = #{lambda { editable_list.begin_editing(0) }}`
    `globalThis.__commitEditable__ = #{lambda { editable_list.end_editing(true) }}`
    `globalThis.__cancelEditable__ = #{lambda { editable_list.end_editing(false) }}`
  end
end


integration_member = ReactiveMember.new
integration_model_values = []
integration_member.observe(:name) { |value| integration_model_values << value }
integration_member.name = "Grace"
`globalThis.__model__ = #{[integration_member.name, integration_member.dirty?, integration_model_values.last]}`

integration_dataset = ReactiveMember.dataset(url: "/members", params: { page: 2 })
integration_dataset.reload.then do
  `globalThis.__dataset__ = #{[integration_dataset.records.first.name, integration_dataset.loading,
                               integration_dataset.error.nil?]}`
  persisted_member = integration_dataset.records.first
  persisted_member.name = "Local edit"
  persisted_member.save.then do
    `globalThis.__persistence__ = #{[persisted_member.name, persisted_member.dirty?]}`
  end
end

class RecordingController < Swill::Controller
  property :message, default: "hi"
  property :user, default: -> { User.new }

  outlet :message_field
  outlet :missing, optional: true

  # Reads user.name across the object boundary; the key-path binding writes
  # user.name, which must recompute this and push to its binding.
  property :greeting do
    "Hi #{user.name}"
  end

  def before_load = `globalThis.__hooks__.push("before_load")`

  def after_load
    `globalThis.__hooks__.push("after_load")`
    # Make the outlet the first responder; the View focuses itself.
    application.make_first_responder(message_field)
    # owner() walks the sparse view tree: the outlet View was adopted into this
    # controller's view, so its owner is this controller.
    `globalThis.__owner_ok__ = #{message_field.owner.equal?(self)}`
    `globalThis.__invalidBinding__ = #{lambda do
      input = `document.createElement("input")`
      `#{input}.setAttribute("bind", "user.name.upcase")`
      `#{view.element}.appendChild(#{input})`
      begin
        Swill::Bindings.wire(self, input)
      rescue Swill::BindingError => error
        `#{input}.remove()`
        next error.message
      end
      `#{input}.remove()`
      nil
    end}`
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

  def after_load
    bind(:count, to: COUNTER_SOURCE, key_path: "value")
  end

  def increment(_sender, _event)
    self.count = count + 1
  end

  def before_disappear = `globalThis.__disappeared__.push("counter:before")`
  def after_disappear = `globalThis.__disappeared__.push("counter:after")`
end

class CounterSource
  include Swill::Observable
  property :value, default: 0
end

COUNTER_SOURCE = CounterSource.new
`globalThis.__setCounterSource__ = #{lambda { |value| COUNTER_SOURCE.value = value }}`

class RootedController < Swill::Controller
  property :represented_object, default: -> { User.new.tap { |user| user.name = "rooted" } }
  property :local_message, default: ""

  def binding_root = "represented_object"
end

class PaletteController < Swill::Controller
  outlet :palette_field

  def after_load
    `globalThis.__palette__.push("after_load")`
    application.make_first_responder(palette_field)
  end

  def before_disappear = `globalThis.__palette__.push("before_disappear")`
  def after_disappear = `globalThis.__palette__.push("after_disappear")`

  def close(_sender, _event)
    TestApp.shared.dismiss(self)
  end
end

class PaneOneController < Swill::Controller
  property :query, default: "default"
  restorable_state :query, key: :q

  outlet :pane_one_field

  def after_load
    `globalThis.__panes__.push("one:load")`
    application.make_first_responder(pane_one_field)
  end

  def before_disappear = `globalThis.__panes__.push("one:before")`
  def after_disappear = `globalThis.__panes__.push("one:after")`

  def swap(_sender, _event)
    TestApp.shared.load_window_content("workspace", "pane-two")
  end
end

class PaneTwoController < Swill::Controller
  outlet :pane_two_field

  def after_load
    `globalThis.__panes__.push("two:load")`
    application.make_first_responder(pane_two_field)
  end

  def before_disappear = `globalThis.__panes__.push("two:before")`
  def after_disappear = `globalThis.__panes__.push("two:after")`
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
