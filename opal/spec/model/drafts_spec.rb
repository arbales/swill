# frozen_string_literal: true

require_relative "../spec_helper"
require "swill/model"

class DraftSpecRecord < Swill::Model::Base
  attribute :name
end

record = DraftSpecRecord.new(name: "Ada")
record.mark_clean!
copy = record.draft
copy.name = "Grace"

raise "draft mutated canonical record" unless record.name == "Ada"
record.apply_draft(copy)
raise "draft was not applied" unless record.name == "Grace"
raise "accepting draft should dirty canonical record" unless record.dirty?

puts "drafts spec: ok"
