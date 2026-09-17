# typed: true

module Demo
  # Records the runtime tests persist through a fake fetch: JSON:API authors
  # with their books, and plain JSON notes.
  class Book < Swill::Model::Base
    endpoint "/api/books"
    resource_type "books"

    attribute :title, type: String, default: ""
    has_one :author, type: "Author", key: "author"
  end

  class Author < Swill::Model::Base
    extend T::Sig

    endpoint "/api/authors"
    resource_type "authors"

    attribute :name, type: String, default: ""
    attribute :born, type: T.nilable(Integer), default: nil
    has_many :books, type: Book, key: "books", url: "/api/authors/:id/books"

    sig { returns(T.nilable(String)) }
    def validate
      name.strip.empty? ? "name must not be blank" : nil
    end
  end

  class Note < Swill::Model::Base
    endpoint "/api/notes"
    codec Swill::Model::PlainJSON

    attribute :body, type: String, default: ""
  end
end
