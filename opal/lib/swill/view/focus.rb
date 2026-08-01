# backtick_javascript: true

module Swill
  # The DOM-to-responder adapter: which responder owns a DOM location, and how
  # to reconcile the first-responder singleton when the browser moves focus on
  # its own (a click or Tab into a field).
  module Focus
    module_function

    # The responder that should get first chance at an event/focus at +element+.
    # Walk up to the first managed View: a controller's root View yields its
    # controller; a control/outlet View yields itself.
    def responder_for(element)
      node = element
      while node
        view = View.for(node)
        return (view.controller || view) if view

        node = `#{node}.parentElement`
      end
      nil
    end

    def responder_element(responder)
      return responder.view.element if responder.is_a?(Controller)
      return responder.element if responder.is_a?(View)

      nil
    end

    # Reconcile the FR after the browser has already moved DOM focus. Honors a
    # resign-refusal by restoring focus to the outgoing responder; otherwise
    # records the new FR without re-running `become` (the DOM is already there).
    def sync_from_focus(target, previously_focused = nil)
      responder = responder_for(target)
      current = FirstResponder.current
      return if current.equal?(responder)

      if current && !current.resign_first_responder(responder)
        restore_focus(current, previously_focused)
        return
      end

      FirstResponder.install(responder)
    end

    def restore_focus(responder, previously_focused)
      owner = responder_element(responder)
      return unless owner

      restore =
        if previously_focused && `#{owner}.contains(#{previously_focused})`
          previously_focused
        else
          view = View.for(owner)
          view&.first_focusable_element
        end

      `#{restore} && #{restore}.focus()` if restore
    end
  end
end
