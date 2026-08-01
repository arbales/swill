# frozen_string_literal: true

require_relative "../spec_helper"
require "swill/core"

center = Swill::NotificationCenter.new
sender = Object.new
received = []

token = center.observe(:changed, object: sender) { |notification| received << notification }
center.post(:changed, object: Object.new)
center.post(:changed, object: sender, user_info: { value: 3 })
raise "object filter failed" unless received.length == 1
raise "notification payload failed" unless received.first.user_info == { value: 3 }

token.remove
center.post(:changed, object: sender)
raise "token removal failed" unless received.length == 1

order = []
first = nil
first = center.observe(:stable) do
  order << :first
  first.remove
end
center.observe(:stable) { order << :second }
center.post(:stable)
raise "observer mutation changed delivery" unless order == %i[first second]

puts "notification center spec: ok"
