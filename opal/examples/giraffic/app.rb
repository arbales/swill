# backtick_javascript: true

# Read-only first slice of the Giraffic application. It deliberately shares
# the TypeScript example's backend and root dev-server proxy.
Swill::Wire.base_url = "/giraffic-api"

class Member < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "member"

  attribute :email, default: ""
  attribute :name, default: ""
  attribute :nickname, default: ""
end

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

  def self.all
    dataset(url: "/api/lists")
  end
end

class GirafficListsController < Swill::Controller
  property :lists, default: -> { MailingList.all }

  property :status do
    next "Loading mailing lists..." if lists.loading
    next "Could not load lists: #{lists.error.message}" if lists.error

    "#{lists.records.length} mailing lists"
  end

  property :first_name do
    lists.records.first&.name.to_s
  end

  property :first_description do
    lists.records.first&.description.to_s
  end

  property :first_address do
    lists.records.first&.address.to_s
  end

  def after_load
    lists.reload
  end

  def reload(_sender, _event)
    lists.reload
  end
end

class GirafficApplication < Swill::Application
end

GirafficApplication.shared.start
