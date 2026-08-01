# frozen_string_literal: true

require_relative "../spec_helper"
require "swill/transport"

class CommandDispatcherSpecWire
  attr_reader :request

  def request_json(method, url, body: nil, params: {})
    @request = { method: method, url: url, body: body, params: params }
    :promise
  end
end

wire = CommandDispatcherSpecWire.new
dispatcher = Swill::CommandDispatcher.new(
  endpoint: "/commands",
  manifest: { rename: { params: { name: :string, count: :integer } } },
  wire: wire
)
result = dispatcher.call(:rename, params: { "name" => "Friends", "count" => "3" })
raise "wire result was not returned" unless result == :promise
expected = { command: "rename", params: { name: "Friends", count: 3 } }
raise "command request mismatch: #{wire.request.inspect}" unless wire.request == {
  method: "POST", url: "/commands", body: expected, params: {}
}

begin
  dispatcher.call(:rename, params: { name: [] })
  raise "invalid params were accepted"
rescue Swill::Sig::Error
  # expected
end

begin
  dispatcher.call(:missing)
  raise "unknown command was accepted"
rescue Swill::Sig::Error
  # expected
end

puts "command dispatcher spec: ok"
