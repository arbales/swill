# typed: true

module DataFixture
  class PostLookup < Swill::Object
    sig { returns(T.nilable(DataFixture::Post)) }
    def post; end
    sig { returns(String) }
    def status; end
  end
end
