# frozen_string_literal: true

module DataFixture
  class User < Sequel::Model(DB[:users])
    plugin :privacy
    include Sequel::Privacy::IActor
    extend Swill::Sig

    one_to_many :posts, class: "DataFixture::Post", key: :author_id
    one_to_many :comments, class: "DataFixture::Comment", key: :author_id

    privacy do
      can :view, Policies::AllowAll
      field :avatar, Policies::AllowSelf
    end

    sig { returns(Swill::Data::Optional[User]) }
    def self.current_user
      for_vc(Swill::Data.context.viewer_context).with_pk(Swill::Data.context.actor.id)
    end

    sig { params(email: String).returns(Swill::Data::Optional[User]) }
    def self.first_by_email(email)
      for_vc(Swill::Data.context.viewer_context).first(email: email)
    end

    sig do
      params(emails: String, exact: T::Boolean, limit: Integer, options: T.untyped)
        .returns(Swill::Data::Optional[User])
    end
    def self.lookup(*emails, exact:, limit: 1, **options)
      dataset = for_vc(Swill::Data.context.viewer_context).limit(limit)
      email = emails.first
      options.empty? && exact ? dataset.first(email: email) : dataset.first
    end
  end
end
