# A bound data form

This small local application connects a Sequel model to a Ruby-authored form.
It uses plain Sequel, explicit non-nilable fields, and an anonymous local data
scope. An authenticated application supplies its own authentication callback
as described in [server data](server_data.md#connecting).

## Dependencies and database

Use Ruby 3.2+ and `esbuild` on PATH. Add these gems and run `bundle install`:

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

## Server declaration and endpoint

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

## Client and bindings

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

`Editor` makes the represented object the default binding root. The title
input edits that object directly; `@message` and `@saving` bind to the
controller. Saving sends writable dirty fields and runs Sequel validation.
A failed save leaves the input intact and displays the error. This example
shows a summary; automatic per-field validation presentation is not yet part
of the form API.

## Build and run

```yaml
# swill.yml
server: server.rb
client: client/app.rb
out: public/assets/app.js
```

Run `bundle exec swill build`, then start `bundle exec falcon serve` manually
and open the address it reports. In another terminal, `bundle exec swill watch`
rebuilds after edits. Reload the page after a build, and restart the server
after server declaration changes. Blank titles demonstrate server validation;
nonblank titles create records.

The project workflow generates proxies before compiling and copies the
framework alongside the app. `bundle exec swill data check server.rb` verifies
generated data artifacts in CI. To typecheck, install Sorbet, then run
`bundle exec srb tc` from `client/` after building. Keep this generated client
typecheck separate from any server Sorbet configuration.
