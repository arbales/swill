# typed: true

module DataFixture
  class Comment < Swill::Distant::Object
    sig { returns(Integer) }
    def author_id; end
    sig { returns(String) }
    def body; end
    sig { returns(Integer) }
    def post_id; end
    sig { returns(T.nilable(DataFixture::User)) }
    def author; end
    sig { returns(T.nilable(DataFixture::Post)) }
    def post; end
  end
end
