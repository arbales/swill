# typed: true

module DataFixture
  class Comment < Swill::Distant::Object
    sig { returns(Integer) }
    def author_id; end
    sig { returns(T::Boolean) }
    def author_id_loaded; end
    sig { returns(T::Boolean) }
    def author_id_loading; end
    sig { returns(T.nilable(String)) }
    def author_id_error; end
    sig { returns(String) }
    def body; end
    sig { returns(T::Boolean) }
    def body_loaded; end
    sig { returns(T::Boolean) }
    def body_loading; end
    sig { returns(T.nilable(String)) }
    def body_error; end
    sig { returns(Integer) }
    def post_id; end
    sig { returns(T::Boolean) }
    def post_id_loaded; end
    sig { returns(T::Boolean) }
    def post_id_loading; end
    sig { returns(T.nilable(String)) }
    def post_id_error; end
    sig { returns(T.nilable(DataFixture::User)) }
    def author; end
    sig { returns(T::Boolean) }
    def author_loaded; end
    sig { returns(T::Boolean) }
    def author_stale; end
    sig { returns(T::Boolean) }
    def author_loading; end
    sig { returns(T.nilable(String)) }
    def author_error; end
    sig { returns(T.nilable(DataFixture::Post)) }
    def post; end
    sig { returns(T::Boolean) }
    def post_loaded; end
    sig { returns(T::Boolean) }
    def post_stale; end
    sig { returns(T::Boolean) }
    def post_loading; end
    sig { returns(T.nilable(String)) }
    def post_error; end
  end
end
