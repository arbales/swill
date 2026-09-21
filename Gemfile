source "https://rubygems.org"

# Pragma is not in the latest published release. Gemfile.lock pins upstream
# to a reproducible commit; bundle update advances it along with the other gems.
gem "ruby2js", git: "https://github.com/ruby2js/ruby2js.git", branch: "master"
gem "sorbet"
gem "sorbet-runtime"
gem "rake"
gem "minitest"
gem "msgpack"
gem "sequel"
gem "sequel-privacy"
group :development do
  gem "async-websocket"
  gem "falcon"
  gem "roda"
  gem "sqlite3"
  gem "ruby-lsp"
  gem "rubocop"
  gem "rubocop-rubycw", "~> 0.2.2"
  gem "rubocop-on-rbs", "~> 2.0"
  gem "kanayago", "~> 0.9.0"
end
