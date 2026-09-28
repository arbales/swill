# A bound data form

This small local application connects a Sequel model to a Ruby-authored form.
It uses plain Sequel, explicit non-nilable fields, and an anonymous local data
scope. An authenticated application supplies its own authentication callback
as described in [server data](server_data.md#connecting).

## Dependencies and Database

Use Ruby 3.2+ and `esbuild` on PATH. The Gemfile adds the data server's gems
to the two lines required to [install Swill as a
gem](getting_started.md#installing-as-a-gem); run `bundle install`:

```ruby
source "https://rubygems.org"
gem "swill", github: "arbales/swill"
gem "ruby2js", git: "https://github.com/ruby2js/ruby2js.git", branch: "master"
gem "sqlite3"
gem "async-websocket"
gem "falcon"
gem "rackup"
```

Create the database once with `bundle exec ruby setup.rb`:

```ruby
# setup.rb
require "sequel"
DB = Sequel.sqlite(File.join(__dir__, "notes.sqlite3"))
DB.create_table?(:notes) do
  primary_key :id
  String :title, null: false
end
```

## Server Declaration and Endpoint

```ruby
# server.rb — generation loads this too, so do not start a server here.
require "sequel"
require "swill/server"
Swill::Data.install(Sequel::Model)

module Notes
  DB = Sequel.sqlite(File.join(__dir__, "notes.sqlite3"))

  class Note < Sequel::Model(DB[:notes])
    client_model fields: {title: String}, writable: [:title]

    def validate
      super
      errors.add(:title, "is required") if title.to_s.strip.empty?
    end
  end
end
```

```ruby
# config.ru
require_relative "server"
require "rack/static"

use Rack::Static, urls: ["/assets"], root: "public"

map "/data" do
  run Swill::Data::WebSocket.new(
    schema: Swill::Data::Schema.new([Notes::Note]),
    authenticate: ->(_env) { {viewer_context: nil, actor: nil, scope_token: "local-demo"} }
  )
end

map "/" do
  run ->(_env) { [200, {"content-type" => "text/html"}, [File.read("public/index.html")]] }
end
```

## Client and Bindings

```ruby
# client/app.rb
require_relative "models/generated/schema"
require_relative "models/generated/notes/note"

module Notes
  class Application < Swill::Application
    def initialize
      super
      Swill::Model::DistantClient.configure(url: "/data", schema_hash: Notes::DataSchema::HASH)
    end
  end

  class NewNote < Swill::Controller::Editor
    property :message, type: String, default: ""
    property :saving, type: T::Boolean, default: false

    def view_did_load
      self.represented_object = Note.new
    end

    async def save
      return if saving
      self.saving = true
      self.message = ""
      begin
        note = T.cast(represented_object, Note)
        await note.save
        self.message = "Saved"
        self.represented_object = Note.new
      rescue => error
        self.message = error.message
      ensure
        self.saving = false
      end
    end
  end
end
```

```html
<!-- public/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Notes</title>
  <script defer src="/assets/swill.js"></script>
  <script defer src="/assets/app.js"></script>
</head>
<body application="Notes::Application">
  <section controller="Notes::NewNote">
    <label>Title <input bind="title" bind-disabled="@saving"></label>
    <button type="button" klass="Swill::Control::Button"
            data-action="save" bind-disabled="@saving">Save</button>
    <p role="status" bind="@message"></p>
  </section>
</body>
</html>
```

`Editor` makes the represented object the [binding
root](bindings.md#binding-roots), so the title input edits that object
directly while `@message` and `@saving` bind to the controller; a table of
notes would use a list from [collections](collections.md). Saving sends the
writable dirty fields and runs Sequel validation. A failed save leaves the
input intact and displays the error. This example shows a summary; the form
API has no automatic per-field validation presentation.

## Build and Run

```yaml
# swill.yml
server: server.rb
client: client/app.rb
out: public/assets/app.js
```

Run `bundle exec swill build`, then `bundle exec falcon serve` and open the
address it reports; the [project workflow](getting_started.md#project-workflow)
describes the build and does not manage the server. In another terminal,
`bundle exec swill watch` rebuilds after edits. Reload the page after a build,
and restart the server after server declaration changes. A blank title fails
server validation; a nonblank title creates a record.

`bundle exec swill data check server.rb` verifies generated data artifacts in
CI. To typecheck, install Sorbet, then run `bundle exec srb tc` from `client/`
after building, keeping this generated client typecheck separate from any
server Sorbet configuration; see [typing an
application](sorbet.md#typing-an-application).
