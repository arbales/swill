# backtick_javascript: true

Swill::Wire.base_url = "/giraffic-api"

class MailingAddress < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "mailing_address"

  attribute :address_1, default: ""
  attribute :address_2, default: ""
  attribute :city, default: ""
  attribute :state, default: ""
  attribute :postal_code, default: ""
  attribute :country, default: ""
end

class Member < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "member"
  endpoint "/api/members"

  attribute :name, default: ""
  attribute :email, default: ""
  attribute :nickname, default: ""
  attribute :points, default: 0
  attribute :tier, default: ""
  attribute :venmo_handle
  attribute :phone, default: ""
  attribute :phone_visibility, default: ""
  attribute :phone_country_code, default: ""
  attribute :phone_number, default: ""
  attribute :photo_url, default: ""
  attribute :robodial_opt_out, default: false

  has_one :mailing_address,
          type: -> { MailingAddress },
          url: ->(member) { "/api/members/#{Swill::Wire.escape_component(member.id)}/mailing_address" }

  property :clean? do
    !dirty?
  end

  def self.all
    dataset(url: "/api/members")
  end

  def self.me(wire: Swill::Wire)
    wire.get_json("/api/me").then do |payload|
      member = parse_one(payload)
      raise "Expected current member from /api/me" unless member

      member
    end
  end
end

class MailingList < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "list"
  endpoint "/api/lists"

  attribute :name, default: ""
  attribute :description, default: ""
  attribute :address, default: ""
  attribute :notifications_enabled, default: false
  attribute :hidden, default: false
  attribute :open, default: false
  attribute :history_enabled, default: false
  attribute :webhook_url, default: ""

  has_many :members,
           type: -> { Member },
           url: ->(list) { "/api/collections/#{Swill::Wire.escape_component(list.id)}/members" }

  property :clean? do
    !dirty?
  end

  def self.all
    dataset(url: "/api/lists")
  end
end

class GirafficMenubarController < Swill::Controller
  def show_lists(_sender, _event)
    application.load_window_content("main", "lists")
  end

  def show_members(_sender, _event)
    application.load_window_content("main", "members")
  end

  def show_profile(_sender, _event)
    application.load_window_content("main", "profile")
  end
end

class MembersController < Swill::Controller
  property :members, default: -> { Member.all }

  outlet :members_list

  property :status do
    next "Loading members…" if members.loading
    next "Could not load members: #{members.error.message}" if members.error

    "#{members.records.length} members"
  end

  def after_load
    members_list.bind(:represented_object, to: members, key_path: "records")
    members.reload
  end
end

class ProfileController < Swill::Controller
  property :member
  property :draft_member
  property :saving, default: false
  property :save_error, default: ""

  outlet :phone_visibility_select

  property :profile_actions_disabled? do
    saving || !draft_member || !draft_member.dirty?
  end

  def after_load
    phone_visibility_select.options = [
      { value: "Authenticated", label: "Giraffes, Guests & Invitees", description: "Members and invited guests" },
      { value: "Members", label: "Giraffes", description: "Current and former members" },
      { value: "Organizers", label: "Organizers & Leads", description: "Planning and camp leads" },
      { value: "Owner", label: "Only You", description: "Private" }
    ]
    load_profile
  end

  def load_profile
    Member.me.then do |value|
      self.member = value
      self.draft_member = value.draft
    end.fail { |error| self.save_error = error.message }
  end

  def save_profile(_sender, _event)
    copy = draft_member
    return unless copy

    self.saving = true
    self.save_error = ""
    copy.save(wire: Swill::Wire).then do
      self.member = Member.get(copy.id) || copy
      self.draft_member = member.draft
      self.saving = false
    end.fail do |error|
      self.save_error = error.message
      self.saving = false
    end
  end

  def discard_profile(_sender, _event)
    self.draft_member = member&.draft
    self.save_error = ""
  end
end

class GirafficListsController < Swill::Controller
  property :lists, default: -> { MailingList.all }
  property :draft
  property :save_error, default: ""

  outlet :source_list
  outlet :detail_editor
  outlet :member_list

  restorable_state "source_list.selected_object_id", key: :selected

  property :status do
    next "Loading mailing lists…" if lists.loading
    next "Could not load lists: #{lists.error.message}" if lists.error

    "#{lists.records.length} mailing lists"
  end

  def after_load
    source_list.bind(:represented_object, to: lists, key_path: "records")
    member_list.bind(:represented_object, to: source_list, key_path: "selected_object.members")
    @selection_disposer = Swill::KeyPath.observe(source_list, ["selected_object"]) { prepare_draft }
    register_teardown { @selection_disposer&.call }
  end

  def restore_state(coder)
    super
    reload
  end

  def reload(_sender = nil, _event = nil)
    lists.reload.then do
      source_list.select_first_if_nothing_selected
      prepare_draft
    end
  end

  def prepare_draft
    self.draft = source_list.selected_object&.draft
    detail_editor.represented_object = draft
    self.save_error = ""
  end

  def save_changes(_sender, _event)
    copy = draft
    return unless copy

    copy.save(wire: Swill::Wire).then do
      canonical = MailingList.get(copy.id) || copy
      self.draft = canonical.draft
      detail_editor.represented_object = draft
      self.save_error = ""
    end.fail do |error|
      self.save_error = error.message
    end
  end

  def discard_changes(_sender, _event)
    prepare_draft
  end
end

class GirafficApplication < Swill::Application; end

GirafficApplication.shared.start
