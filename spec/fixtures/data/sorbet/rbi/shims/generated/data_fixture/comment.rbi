# typed: true

module DataFixture
  class Comment < Swill::Model::DistantObject
    sig { returns(Integer) }
    def author_id; end
    sig { returns(String) }
    def body; end
    sig { returns(Integer) }
    def post_id; end
  end
end
