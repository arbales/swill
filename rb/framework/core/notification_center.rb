# typed: true
# frozen_string_literal: true

module Swill
  # What a notification carries: its name, the object that posted it, and
  # whatever the poster attached.
  class Notification < Swill::Object
    extend T::Sig

    sig { params(name: String, object: T.untyped, user_info: T.untyped).void }
    def initialize(name, object, user_info)
      super()
      @name = name
      @object = object
      @user_info = user_info
    end

    sig { returns(String) }
    attr_reader :name

    sig { returns(T.untyped) }
    attr_reader :object

    sig { returns(T.untyped) }
    attr_reader :user_info
  end

  # NSNotificationCenter analog: observers by name, each observation returning
  # the callable that ends it, the same token shape as Observable#observe.
  # Named as Cocoa names it, because observing a notification is not observing
  # a property. A controller goes through observe_notification, which retains
  # the token so the observation ends at unload.
  class NotificationCenter < Swill::Object
    extend T::Sig

    sig { returns(NotificationCenter) }
    def self.default
      center = @default
      return center if center
      @default = T.let(NotificationCenter.new, T.nilable(NotificationCenter))
      T.must(@default)
    end

    sig { void }
    def initialize
      super
      @observers = T.let({}, T::Hash[String, T::Array[T.proc.params(notification: Notification).void]])
    end

    sig { params(name: String, callback: T.proc.params(notification: Notification).void).returns(T.proc.void) }
    def add_observer(name, callback)
      list = @observers[name]
      unless list
        list = []
        @observers[name] = list
      end
      list << callback
      ->() do
        current = @observers[name]
        @observers[name] = current.select { |candidate| candidate != callback } if current
      end
    end

    # Observers are called in the order they subscribed, on a copy of the
    # list, so one may unsubscribe as it runs.
    sig { params(name: String, object: T.untyped, user_info: T.untyped).returns(Notification) }
    def post(name, object, user_info)
      notification = Notification.new(name, object, user_info)
      list = @observers[name]
      list.dup.each { |callback| callback.(notification) } if list
      notification
    end
  end
end
