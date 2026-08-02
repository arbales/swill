# frozen_string_literal: true

module Swill
  Notification = Struct.new(:name, :object, :user_info, keyword_init: true)

  class NotificationCenter
    class << self
      def default
        @default ||= new
      end
    end

    def initialize
      @observers = Hash.new { |hash, name| hash[name] = [] }
    end

    # Returns a lambda that unsubscribes — the same token shape as
    # Observable#observe and FirstResponder.observe.
    def observe(name, object: nil, &handler)
      raise ArgumentError, "notification observer requires a block" unless handler

      entry = { object: object, handler: handler }
      @observers[name.to_sym] << entry
      -> { @observers[name.to_sym].delete(entry) }
    end

    def post(name, object: nil, user_info: nil)
      notification = Notification.new(name: name.to_sym, object: object, user_info: user_info)
      @observers[name.to_sym].dup.each do |entry|
        next if entry[:object] && !entry[:object].equal?(object)

        entry[:handler].call(notification)
      end
      notification
    end
  end
end
