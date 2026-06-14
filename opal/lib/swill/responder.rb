module Swill
  class Responder
    def next_responder
      nil
    end

    def perform_action(name, sender = nil, event = nil)
      responder = self

      while responder
        if responder.respond_to?(name)
          responder.public_send(name, sender, event)
          return true
        end

        responder = responder.next_responder
      end

      false
    end
  end
end
