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
           url: ->(list) { "/api/lists/#{Swill::Wire.escape_component(list.id)}/members" }

  property :clean? do
    !dirty?
  end

  def self.all
    dataset(url: "/api/lists")
  end

  def search_member_candidates(query, limit: 10, wire: Swill::Wire)
    return wire.resolved([]) unless id && !query.to_s.strip.empty?

    url = "/api/collections/#{Swill::Wire.escape_component(id)}/members/candidates"
    wire.get_json(url, params: { q: query.to_s.strip, limit: limit }).then { |payload| Member.parse_many(payload) }
  end

  def add_member(candidate, wire: Swill::Wire)
    raise "Cannot add a member before the list is saved" unless id

    body = if candidate.is_a?(Member) && candidate.id
             { member_id: candidate.id }
           else
             { email: candidate.is_a?(Member) ? candidate.email : candidate.to_s }
           end
    url = "/api/collections/#{Swill::Wire.escape_component(id)}/members"
    wire.request_form_json("PUT", url, body: body).then do |payload|
      member = Member.parse_one(payload)
      raise "Expected member from collection add" unless member

      existing = members.index { |item| item.id == member.id }
      values = members.dup
      existing ? values[existing] = member : values << member
      self.members = values
      member
    end
  end

  def remove_member(member, wire: Swill::Wire)
    return wire.resolved(nil) unless id

    body = member.id ? { member_id: member.id } : { email: member.email }
    url = "/api/collections/#{Swill::Wire.escape_component(id)}/members"
    wire.request_form_json("DELETE", url, body: body).then do
      self.members = members.reject { |item| item.equal?(member) || item.id == member.id }
      nil
    end
  end
end

class MemberPickerController < Swill::Controller
  property :query, default: ""
  property :candidates, default: -> { [] }
  property :searching, default: false

  outlet :results

  def after_load
    results.bind(:represented_object, to: self, key_path: "candidates")
    register_teardown { clear_timer }
  end

  def query_did_change(_previous, _value)
    schedule_search
  end

  def schedule_search
    clear_timer
    value = query.strip
    if value.length < 2
      @search_generation = (@search_generation || 0) + 1
      self.searching = false
      self.candidates = []
      return
    end

    callback = -> { @search_timer = nil; search }
    @search_timer = `window.setTimeout(#{callback}, 180)`
  end

  def search
    list = parent.source_list.selected_object
    value = query.strip
    generation = @search_generation = (@search_generation || 0) + 1
    return unless list && value.length >= 2

    self.searching = true
    list.search_member_candidates(value).then do |members|
      next unless generation == @search_generation

      self.candidates = candidate_rows(members, value)
      self.searching = false
    end.fail do |error|
      next unless generation == @search_generation

      warn("[Giraffic] member search failed: #{error.message}")
      self.candidates = []
      self.searching = false
    end
  end

  def activate_selection(_sender = nil, _event = nil)
    candidate = results.selected_object || candidates.first
    return unless candidate

    parent.stage_member_addition(candidate)
    clear
  end

  def clear
    clear_timer
    @search_generation = (@search_generation || 0) + 1
    self.query = ""
    self.candidates = []
    self.searching = false
  end

  private

  def candidate_rows(members, value)
    rows = members.map do |member|
      { label: member.name.empty? ? member.email : "#{member.name} <#{member.email}>", member: member, email: nil }
    end
    normalized = value.downcase
    if value.match?(/\A[^\s@]+@[^\s@]+\.[^\s@]+\z/) && members.none? { |member| member.email.downcase == normalized }
      rows << { label: "Add #{value}", member: nil, email: value }
    end
    rows
  end

  def clear_timer
    `window.clearTimeout(#{@search_timer})` if @search_timer
    @search_timer = nil
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
      {
        value: "Authenticated",
        icon: "handshake",
        label: "Giraffes, Guests & Invitees",
        description: "Including guests and friends on our mailing lists or events"
      },
      {
        value: "Members",
        icon: "tent",
        label: "Giraffes",
        description: "People who're burning or have burned with us"
      },
      {
        value: "Organizers",
        icon: "hard-hat",
        label: "Organizers & Leads",
        description: "People helping to plan camp or organize the Giraffes"
      },
      {
        value: "Owner",
        icon: "venetian-mask",
        label: "Only You",
        description: "No one else can see it"
      }
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
  property :pending_member_additions, default: -> { [] }

  outlet :source_list
  outlet :detail_editor
  outlet :member_list
  outlet :member_picker
  outlet :pending_additions_list

  restorable_state "source_list.selected_object_id", key: :selected

  property :status do
    next "Loading mailing lists…" if lists.loading
    next "Could not load lists: #{lists.error.message}" if lists.error

    "#{lists.records.length} mailing lists"
  end

  def after_load
    source_list.bind(:represented_object, to: lists, key_path: "records")
    member_list.bind(:represented_object, to: source_list, key_path: "selected_object.members")
    pending_additions_list.bind(:represented_object, to: self, key_path: "pending_member_additions")
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
    self.pending_member_additions = []
    member_picker.clear if member_picker
  end

  def stage_member_addition(candidate)
    return if member_present?(candidate) || member_pending?(candidate)

    self.pending_member_additions = pending_member_additions + [candidate.dup]
  end

  def remove_pending_addition(_sender, _event)
    addition = pending_additions_list.selected_object
    return unless addition

    self.pending_member_additions = pending_member_additions.reject { |item| item.equal?(addition) }
    pending_additions_list.selected_indexes = []
  end

  def remove_selected_members(_sender, _event)
    list = source_list.selected_object
    return unless list

    operation = Swill::Wire.resolved(nil)
    member_list.selected_objects.each do |member|
      operation = operation.then { list.remove_member(member) }
    end
    operation.then { member_list.selected_indexes = [] }
  end

  def save_changes(_sender, _event)
    copy = draft
    return unless copy

    original = source_list.selected_object
    operation = copy.save(wire: Swill::Wire)
    pending_member_additions.each do |addition|
      operation = operation.then { original.add_member(addition[:member] || addition[:email]) }
    end
    operation.then do
      canonical = MailingList.get(copy.id) || copy
      self.draft = canonical.draft
      detail_editor.represented_object = draft
      self.pending_member_additions = []
      self.save_error = ""
    end.fail do |error|
      self.save_error = error.message
    end
  end

  def discard_changes(_sender, _event)
    prepare_draft
  end

  private

  def member_present?(addition)
    list = source_list.selected_object
    return false unless list

    member = addition[:member]
    email = (addition[:email] || member&.email).to_s.downcase
    list.members.any? do |existing|
      (member&.id && existing.id == member.id) || (!email.empty? && existing.email.downcase == email)
    end
  end

  def member_pending?(addition)
    member = addition[:member]
    email = (addition[:email] || member&.email).to_s.downcase
    pending_member_additions.any? do |existing|
      existing_member = existing[:member]
      existing_email = (existing[:email] || existing_member&.email).to_s.downcase
      (member&.id && existing_member&.id == member.id) || (!email.empty? && existing_email == email)
    end
  end
end

class GirafficApplication < Swill::Application; end

GirafficApplication.shared.start
