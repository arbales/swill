import { wireActionsInto } from "./actions";
import { connectOutlets } from "./outlets";
import { lookupRegisteredClass } from "./registry";
import { wireBindings } from "../bindings/view_bindings";
import {
  Controller,
  attachController,
  finishControllerLoading,
  loadViewTree,
  controllerFor,
  registerControllerDisposer,
} from "../view";
import { appearViewTree, activate, setActivationWiring, View } from "../view";

// The code route (`View.addSubview` -> `activate`) and the markup route
// (`wireSubtree`) share one per-controller lifecycle. `activate` runs
// outlets + bindings between `viewDidLoad` and `awakeFromDOM`; inject
// those here so `view.ts` stays runtime-dependency-free.
setActivationWiring((c) => {
  connectOutlets(c);
  wireBindings(c);
});

export interface WireSubtreeOptions {
  deferActivation?: boolean;
}

/** Hydrate any managed descendants inside `root` and run controller
 * lifecycle hooks. A managed live element has `klass`, `controller`, or
 * `outlet`; elements with only `bind` / `data-action` remain raw DOM.
 * Templates and JSON script outlets are inert. */
export function wireSubtree(root: HTMLElement, options: WireSubtreeOptions = {}): Controller[] {
  const { controllers: newControllers, views: newViews } = hydrateManagedElements(root);
  wireActions(newControllers);
  const topViews = topHydratedViews(newViews);
  if (options.deferActivation) {
    for (const view of topViews) loadViewTree(view);
  } else {
    for (const view of topViews) activate(view);
  }
  return newControllers;
}

export function finishActivation(root: HTMLElement): void {
  const views = topViewsIn(root);
  const controllers = views.flatMap((view) => loadViewTree(view));
  finishControllerLoading(controllers);
  for (const view of views) appearViewTree(view);
}

interface HydrationResult {
  controllers: Controller[];
  views: View[];
}

function hydrateManagedElements(root: HTMLElement): HydrationResult {
  const controllers: Controller[] = [];
  const views: View[] = [];
  const elements = collectManagedElements(root);
  for (const el of elements) {
    let view = View.of(el);
    if (!view) {
      const klass = el.getAttribute("klass");
      if (klass) {
        const viewCtor = lookupRegisteredClass(klass);
        if (!viewCtor) {
          console.warn(`[Swill] no class registered for klass="${klass}"`, el);
          continue;
        }
        if (viewCtor !== View && !(viewCtor.prototype instanceof View)) {
          console.warn(`[Swill] registered klass="${klass}" is not a View subclass`, el);
          continue;
        }
        view = new viewCtor(el) as View;
      } else {
        view = View.wrapping(el);
      }
    }
    views.push(view);

    linkSuperview(view);

    const controllerName = el.getAttribute("controller");
    if (controllerName && !controllerFor(el)) {
      const controllerCtor = lookupRegisteredClass(controllerName);
      if (!controllerCtor) {
        console.warn(`[Swill] no controller registered for "${controllerName}"`, el);
        continue;
      }
      if (controllerCtor !== Controller && !(controllerCtor.prototype instanceof Controller)) {
        console.warn(`[Swill] registered controller="${controllerName}" is not a Controller subclass`, el);
        continue;
      }
      const controller = new (controllerCtor as any)() as Controller;
      attachController(el, controller);
      controllers.push(controller);
    }
  }
  return { controllers, views };
}

function collectManagedElements(root: HTMLElement): HTMLElement[] {
  const list: HTMLElement[] = [];
  if (isManagedElement(root)) list.push(root);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[klass], [controller], [outlet]"))) {
    if (isManagedElement(el)) list.push(el);
  }
  return list;
}

function isManagedElement(el: HTMLElement): boolean {
  if (el instanceof HTMLTemplateElement) return false;
  if (isJsonOutlet(el)) return false;
  return el.hasAttribute("klass") || el.hasAttribute("controller") || el.hasAttribute("outlet");
}

function isJsonOutlet(el: HTMLElement): boolean {
  return el instanceof HTMLScriptElement && el.type === "application/json" && el.hasAttribute("outlet");
}

function linkSuperview(view: View): void {
  const parent = nearestSuperview(view.element.parentElement);
  if (view.superview === parent) return;
  if (view.superview) {
    const prevIndex = view.superview.subviews.indexOf(view);
    if (prevIndex >= 0) view.superview.subviews.splice(prevIndex, 1);
  }
  view.superview = parent;
  if (parent && !parent.subviews.includes(view)) parent.subviews.push(view);
}

function nearestSuperview(el: HTMLElement | null): View | null {
  let node = el;
  while (node) {
    const v = View.of(node);
    if (v) return v;
    node = node.parentElement;
  }
  return null;
}

function wireActions(controllers: Controller[]): void {
  for (const c of controllers) {
    registerControllerDisposer(c, wireActionsInto(c));
  }
}

function topHydratedViews(views: View[]): View[] {
  const viewSet = new Set(views);
  return views.filter((view) => !view.superview || !viewSet.has(view.superview));
}

function topViewsIn(root: HTMLElement): View[] {
  const out: View[] = [];
  const rootView = View.of(root);
  if (rootView) return [rootView];
  function visit(node: HTMLElement): void {
    for (const child of Array.from(node.children) as HTMLElement[]) {
      const view = View.of(child);
      if (view) {
        out.push(view);
        continue;
      }
      visit(child);
    }
  }
  visit(root);
  return out;
}
