import { Controller } from "../view";
import {
  type Responder,
  _setFirstResponder,
  currentFirstResponder,
} from "./responder";
import { View } from "../view";

/**
 * The responder that should get first chance for a DOM event/focus
 * location. This is the DOM-to-responder adapter: raw elements walk up to
 * their first managed View; controller root Views yield their controller,
 * while control/outlet Views yield the View itself.
 */
export function firstResponderFor(el: HTMLElement | null): Responder | null {
  let node = el;
  while (node) {
    const v = View.of(node);
    if (v) return v.controller ?? v;
    node = node.parentElement;
  }
  return null;
}

export function responderElement(r: Responder): HTMLElement | null {
  if (r instanceof Controller) return r.view.element;
  if (r instanceof View) return r.element;
  return null;
}

export function syncFirstResponderFromFocus(
  target: HTMLElement | null,
  previouslyFocused: HTMLElement | null = null,
): void {
  const responder = firstResponderFor(target);
  const current = currentFirstResponder();
  if (current === responder) return;

  // Focus-DRIVEN path: the browser already moved DOM focus. We only
  // reconcile the FR singleton, and still honor a resign-refusal.
  if (current && !current.resignFirstResponder(responder)) {
    const ownerEl = responderElement(current);
    if (ownerEl) {
      let restore: HTMLElement | null = null;
      if (previouslyFocused && ownerEl.contains(previouslyFocused)) {
        restore = previouslyFocused;
      } else {
        restore = View.of(ownerEl)?.firstFocusableElement() ?? null;
      }
      if (restore) restore.focus();
    }
    return;
  }
  _setFirstResponder(responder);
}
