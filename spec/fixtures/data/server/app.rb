# frozen_string_literal: true

require "roda"
require_relative "../server"

module DataFixture
  SCHEMA = Swill::Distant::Schema.discover

  class App < Roda
    ROOT = File.expand_path("../../../..", __dir__)
    DATA_ENDPOINT = Swill::Distant::Connection.new(
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

      request.get "swill.js" do
        response["content-type"] = "text/javascript"
        File.binread(File.join(ROOT, "rb/dist/swill.js"))
      end

      request.get "app.js" do
        response["content-type"] = "text/javascript"
        File.binread(File.join(ROOT, "build/data_client.js"))
      end

      request.root do
        response["content-type"] = "text/html"
        <<~HTML
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Swill data fixture</title>
            </head>
            <body application="Swill::Application">
              <main controller="DataFixture::BrowserController">
                <p data-field="status" bind="status"></p>
                <h1 data-field="title" bind="post.display_title"></h1>
                <p data-field="author" bind="post.author.name"></p>
                <p data-field="body" bind="post.body"></p>
                <output data-field="comments" bind="comment_count"></output>
                <output data-field="published" bind="post.published"></output>
                <output data-field="published-at" bind="post.published_at"></output>
                <button type="button" data-action="publish">Publish</button>
              </main>
              <script src="/swill.js"></script>
              <script src="/app.js"></script>
              <script>
                Swill.Runtime.configureData(
                  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/data`,
                  #{SCHEMA.hash.to_json}
                );
              </script>
            </body>
          </html>
        HTML
      end

      response.status = 404
      "Not found"
    end
  end
end
