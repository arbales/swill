# frozen_string_literal: true

require "roda"
require_relative "../server"

module DataFixture
  SCHEMA = Swill::Data::Schema.discover

  class App < Roda
    DATA_ENDPOINT = Swill::Data::WebSocket.new(
      schema: SCHEMA,
      authenticate: ->(_env) do
        omniscient = Sequel::Privacy::ViewerContext.omniscient(:fixture_authentication)
        actor = User.for_vc(omniscient).with_pk!(1)
        viewer_context = Sequel::Privacy::ViewerContext.for_actor(actor)
        actor.reset_viewer_context(viewer_context, :authenticated_connection)
        { viewer_context:, actor:, scope_token: "fixture-user-#{actor.id}" }
      end
    )

    route do |request|
      request.on "data" do
        request.halt DATA_ENDPOINT.call(request.env)
      end

      response["content-type"] = "text/plain"
      "Swill data fixture"
    end
  end
end
