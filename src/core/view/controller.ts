import { type BindOptions, bind, unbind, unbindAll } from "../bindings";
import {
  Responder,
  _setFirstResponder,
  chainTopResponder,
  currentFirstResponder,
  responderElement,
} from "../responder";
import { View, markDetached } from "./view";

type Disposer = () => void;

const controllerDisposers = new WeakMap<Controller, Set<Disposer>>();

/** NSViewController analog. See docs/lifecycle.md for the activation
 *  order and docs/bindings.md for `bindingRoot()`. */
export class Controller extends Responder {
  /** The `View` this controller manages. Set by `attachController`. */
  declare view: View;

  /** Containing controller via the sparse View tree. Subclasses narrow
   *  with `override get parent()`; the narrowing is a runtime contract. */
  get parent(): Controller | null {
    let v = this.view.superview;
    while (v) {
      if (v.controller) return v.controller;
      v = v.superview;
    }
    return null;
  }

  override get nextResponder(): Responder | null {
    return this.parent ?? chainTopResponder();
  }

  // ---- bindings ----

  /** Path prefix for `bind="…"` (default ""). `Editor` returns
   *  `"representedObject"`. */
  bindingRoot(): string { return ""; }

  /** Coerce JSON from a `<script type="application/json" outlet="…">`
   *  before assignment. */
  decodeOutletData(_name: string, value: unknown): unknown { return value; }

  /** NSObject `bind:toObject:withKeyPath:options:`. Torn down on detach. */
  bind(targetKey: string, source: object, sourcePath: string, options?: BindOptions): void {
    bind(this, targetKey, source, sourcePath, options);
  }

  unbind(targetKey: string): void {
    unbind(this, targetKey);
  }

  /** Detach via the framework teardown path. Call instead of touching
   *  `.view` directly. */
  _destroyView(): void {
    detachViewTree(this.view, { removeElement: true });
  }

  // ---- lifecycle hooks (subclasses override) ----
  viewDidLoad(): void {}
  awakeFromDOM(): void {}
  controllerDidRestore(_context: { restored: boolean }): void {}
  controllerDidLoad(): void {}
  viewWillAppear(): void {}
  viewDidAppear(): void {}
  viewWillDisappear(): void {}
  viewDidDisappear(): void {}

  override becomeFirstResponder(): boolean {
    if (!super.becomeFirstResponder()) return false;
    this.view.focusElement();
    return true;
  }

  override resignFirstResponder(next: Responder | null = null): boolean {
    if (!super.resignFirstResponder(next)) return false;
    this.view.blurElement();
    return true;
  }
}

// ---- internal wiring ----

export function attachController(view: HTMLElement, controller: Controller): void {
  const v = View.wrapping(view);
  v.controller = controller;
  controller.view = v;
}

export function controllerFor(view: HTMLElement | null): Controller | null {
  return View.of(view)?.controller ?? null;
}

export function registerControllerDisposer(controller: Controller, disposer: Disposer): void {
  let disposers = controllerDisposers.get(controller);
  if (!disposers) {
    disposers = new Set();
    controllerDisposers.set(controller, disposers);
  }
  disposers.add(disposer);
}

function runControllerDisposers(controller: Controller): void {
  const disposers = controllerDisposers.get(controller);
  if (!disposers) return;
  for (const dispose of disposers) dispose();
  controllerDisposers.delete(controller);
}

/** Every controller under `root`, in tree order. */
export function collectControllers(root: HTMLElement): Controller[] {
  const out: Controller[] = [];
  for (const view of topViewsIn(root)) visit(view);
  return out;

  function visit(view: View): void {
    if (view.controller) out.push(view.controller);
    for (const child of view.subviews) visit(child);
  }
}

export function topViewsIn(root: HTMLElement): View[] {
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

export function detachViewTree(root: View, opts: { removeElement?: boolean } = {}): Controller[] {
  const views = viewTree(root);
  const controllers = views.map((v) => v.controller).filter((c): c is Controller => c != null);
  for (const c of controllers) c.viewWillDisappear();

  const current = currentFirstResponder();
  const currentEl = current ? responderElement(current) : null;
  if (currentEl && root.element.contains(currentEl)) _setFirstResponder(chainTopResponder());

  for (const c of controllers) {
    runControllerDisposers(c);
    unbindAll(c); // disappearing controller releases its own bindings
    if (c.view.controller === c) c.view.controller = null;
  }
  unlinkViewTree(root, views);
  for (const view of views) markDetached(view);
  if (opts.removeElement) root.element.remove();
  for (const c of controllers) c.viewDidDisappear();
  return controllers;
}

function viewTree(root: View): View[] {
  const out: View[] = [];
  visit(root);
  return out;

  function visit(view: View): void {
    out.push(view);
    for (const child of view.subviews) visit(child);
  }
}

function unlinkViewTree(root: View, views: View[]): void {
  if (root.superview) {
    const index = root.superview.subviews.indexOf(root);
    if (index >= 0) root.superview.subviews.splice(index, 1);
  }
  for (const view of views) {
    view.superview = null;
    view.subviews = [];
  }
}
