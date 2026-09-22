# frozen_string_literal: true

require "sequel"
require "sequel-privacy"
require_relative "../../../rb/swill"

module DataFixture
  DB = Sequel.sqlite
  DB.create_table(:users) do
    primary_key :id
    String :email, null: false
    String :name, null: false
    String :avatar
    String :surprise
  end
  DB.create_table(:posts) do
    primary_key :id
    foreign_key :author_id, :users, null: false
    String :title, null: false
    String :excerpt
    String :body
    TrueClass :published, null: false, default: false
    DateTime :published_at
  end
  DB.create_table(:comments) do
    primary_key :id
    foreign_key :post_id, :posts, null: false
    foreign_key :author_id, :users, null: false
    String :body, null: false
  end

  DB[:users].multi_insert([
                            { id: 1, email: "ada@example.test", name: "Ada", avatar: "ada.png",
                              surprise: "A party" },
                            { id: 2, email: "grace@example.test", name: "Grace", avatar: "grace.png" }
                          ])
  DB[:posts].insert(id: 1, author_id: 1, title: "Distributed Objects", excerpt: nil,
                    body: "A useful boundary.", published: false)
  DB[:comments].insert(id: 1, post_id: 1, author_id: 2, body: "Ship it.")

  module Policies
    extend Sequel::Privacy::PolicyDSL

    policy :AllowAll, -> { allow }, allow_anonymous: true
    policy :AllowSelf, ->(actor, subject) { allow if actor.id == subject.id }
  end

  Swill::Data.install(Sequel::Model)

end

require_relative "server/models/user"
require_relative "server/models/post"
require_relative "server/models/comment"
require_relative "server/operations/user"
require_relative "server/operations/post"
