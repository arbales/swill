import { controllerFor } from "../view";
import type { Controller } from "../view";
import { isOptionalOutlet, outletNamesOf } from "../decorators";
import { ownedDescendants } from "../view/ownership";
import { View } from "../view";

/**
 * Connect a controller's outlets against its view subtree. Run once per
 * controller during activation, between `viewDidLoad` and
 * `awakeFromDOM`.
 *
 * Explicit `outlet="name"` attributes are the only connection signal.
 * The matched element may own a controller, a View, a template prototype,
 * or a JSON data payload.
 *
 * Unresolved outlets that aren't marked `optional` warn to the console.
 */
export function connectOutlets(controller: Controller): void {
  const names = outletNamesOf(controller);
  if (names.length === 0) return;
  const wanted = new Set(names);

  for (const el of ownedDescendants(controller, { match: (el) => el.hasAttribute("outlet") })) {
    if (wanted.size === 0) break;
    const name = el.getAttribute("outlet");
    if (!name || !wanted.has(name)) continue;
    (controller as any)[name] = outletValueFor(controller, name, el);
    wanted.delete(name);
  }

  if (wanted.size > 0) {
    const required = [...wanted].filter((n) => !isOptionalOutlet(controller, n));
    if (required.length > 0) {
      console.warn(`[Swill] ${controller.constructor.name}: unresolved outlets: ${required.join(", ")}`);
    }
  }
}

function outletValueFor(controller: Controller, name: string, el: HTMLElement): unknown {
  if (el instanceof HTMLScriptElement && el.type === "application/json") {
    const text = el.textContent?.trim() ?? "";
    if (!text) return controller.decodeOutletData(name, null);
    try {
      return controller.decodeOutletData(name, JSON.parse(text) as unknown);
    } catch (err) {
      console.warn("[Swill] invalid JSON outlet", el, err);
      return controller.decodeOutletData(name, null);
    }
  }
  if (el instanceof HTMLTemplateElement) return el;
  const childController = controllerFor(el);
  if (childController) return childController;
  const view = View.of(el);
  if (view) return view;
  console.warn(
    `[Swill] ${controller.constructor.name}.${name}: outlet element was not hydrated; add controller="...", klass="...", or keep outlet on a live non-template element`,
    el,
  );
  return el;
}
