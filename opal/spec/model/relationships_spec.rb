# frozen_string_literal: true

require_relative "../spec_helper"
require "swill/model"

class RelationshipAuthor < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "relationship_authors"
  attribute :name
end

class RelationshipComment < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "relationship_comments"
  attribute :body
end

class RelationshipPost < Swill::Model::Base
  codec Swill::Model::JSONAPI
  json_api_type "relationship_posts"
  attribute :title
  has_one :author, type: -> { RelationshipAuthor }
  has_many :comments, type: -> { RelationshipComment }
end

[RelationshipAuthor, RelationshipComment, RelationshipPost].each(&:clear)
post = RelationshipPost.parse_one(
  data: {
    type: "relationship_posts", id: "1", attributes: { title: "Ruby" },
    relationships: {
      author: { data: { type: "relationship_authors", id: "2" } },
      comments: { data: [{ type: "relationship_comments", id: "3" }] }
    }
  },
  included: [
    { type: "relationship_authors", id: "2", attributes: { name: "Ada" } },
    { type: "relationship_comments", id: "3", attributes: { body: "Hello" } }
  ]
)

raise "has-one relationship was not hydrated" unless post.author.equal?(RelationshipAuthor.get("2"))
raise "has-many relationship was not hydrated" unless post.comments == [RelationshipComment.get("3")]
raise "has-one relationship not marked loaded" unless post.relationship_loaded?(:author)
raise "has-many relationship not marked loaded" unless post.relationship_loaded?(:comments)

puts "relationships spec: ok"
