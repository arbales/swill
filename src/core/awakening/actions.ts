import {
  type Controller,
} from "../view";
import { firstResponderFor } from "../responder";
import { ownedDescendants } from "../view/ownership";

const ACTION_BOUND = Symbol.for("framework.actionBound");

interface ActionAnnotatedElement extends HTMLElement {
  [ACTION_BOUND]?: Set<string>;
}

// DOM wiring for target-action attributes. Dispatch starts at
// `firstResponderFor(sender)` and then walks the responder chain.
export function wireActionsInto(c: Controller, host: HTMLElement = c.view.element): () => void {
  const disposers: Array<() => void> = [];
  const els = ownedDescendants(host, {
    includeRoot: true,
    match: (el) => el.hasAttribute("data-action"),
  });
  els.forEach((el) => {
    const spec = el.getAttribute("data-action")!.trim();
    if (!spec) return;
    const annotated = el as ActionAnnotatedElement;
    const bound = (annotated[ACTION_BOUND] ??= new Set<string>());
    if (bound.has(spec)) return;
    bound.add(spec);
    const [maybeEvent, maybeName] = spec.includes(":") ? spec.split(":") : [undefined, spec];
    const eventName = (maybeEvent ?? "click").trim();
    const actionName = (maybeName ?? "").trim();
    if (!actionName) return;
    const handler = (event: Event): void => {
      (firstResponderFor(el) ?? c).performAction(actionName, el, event);
    };
    el.addEventListener(eventName, handler);
    disposers.push(() => {
      el.removeEventListener(eventName, handler);
      bound.delete(spec);
    });
  });
  return () => {
    for (const dispose of disposers) dispose();
  };
}
