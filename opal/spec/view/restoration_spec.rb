# frozen_string_literal: true

require_relative "../spec_helper"
require "swill/controller"

class RestorationSpecController < Swill::Controller
  property :query, default: "default"
  property :page, default: 1
  property :enabled, default: false

  restorable_state :query, key: :q
  restorable_state :page, codec: Swill::Restoration::Codecs::Integer
  restorable_state :enabled, codec: Swill::Restoration::Codecs::Boolean
end

class InheritedRestorationSpecController < RestorationSpecController
  property :selection
  restorable_state :selection
end

controller = InheritedRestorationSpecController.new
controller.restore_state(Swill::Restoration::Coder.new("q" => "opal", "page" => "4", "enabled" => "true"))
raise "string state was not restored" unless controller.query == "opal"
raise "integer state was not restored" unless controller.page == 4
raise "boolean state was not restored" unless controller.enabled == true

controller.selection = "42"
coder = Swill::Restoration::Coder.new
controller.encode_restorable_state(coder)
expected = { "q" => "opal", "page" => "4", "enabled" => "true", "selection" => "42" }
raise "encoded state mismatch: #{coder.encoded.inspect}" unless coder.encoded == expected

controller.page = 7
controller.restore_state(Swill::Restoration::Coder.new("page" => "bad"))
raise "malformed state replaced the current value" unless controller.page == 7

puts "restoration spec: ok"
