# typed: true
# frozen_string_literal: true

module Swill
  # Framework notices share Alert's presentation. Retrying leaves the notice
  # open; a required reload cannot be dismissed with Escape.
  class SystemAlert < Alert
    extend T::Sig

    RETRY_TITLE = "Retry Now"
    RELOAD_TITLE = "Reload"
    REFRESH_TITLE = "Refresh"

    sig { void }
    def initialize
      super
      @retry_action = T.let(nil, T.nilable(T.proc.void))
      @required = T.let(false, T::Boolean)
    end

    sig { params(retry_action: T.nilable(T.proc.void)).void }
    attr_writer :retry_action

    sig { params(required: T::Boolean).void }
    attr_writer :required

    sig { override.params(sender: Element).void }
    def choose(sender)
      action = @retry_action
      if sender.textContent == RETRY_TITLE && action
        action.()
      elsif [RELOAD_TITLE, REFRESH_TITLE].include?(sender.textContent)
        application.browser.location.reload
      else
        super
      end
    end

    sig { override.params(event: KeyboardEvent).void }
    def cancel_operation(event)
      if @required
        event.preventDefault
      else
        super
      end
    end
  end
end
