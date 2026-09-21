# frozen_string_literal: true

module DataFixture
  class User
    resolver :current_user, preload: %i[name avatar]
    resolver :first_by_email, preload: [:name]
    resolver :lookup, preload: [:name]
  end
end
