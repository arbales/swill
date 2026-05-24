import { applyAttributeMappings } from "../awakening/attribute_mappings";
import type { Controller } from "./controller";
import { Responder } from "../responder";

const VIEW_KEY = Symbol.for("framework.view");
type ViewElement = HTMLElement & { [VIEW_KEY]?: View };

const FOCUSABLE_TAGS = ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"];
function isFocusable(el: HTMLElement): boolean {
  if (el.tabIndex >= 0) return true;
  return FOCUSABLE_TAGS.includes(el.tagName);
}

function firstFocusable(el: HTMLElement): HTMLElement | null {
  if (isFocusable(el)) return el;
  return el.querySelector<HTMLElement>("input, select, textarea, [tabindex], button");
}

export class View extends Responder {
  /** The element this View owns; only Views should interact with elements. */
  readonly element: HTMLElement;

  superview: View | null = null;
  /** Only children that are managed by a View, not every random HTMLElement. */
  subviews: View[] = [];

  /** Set if this view is expliclty managed by a controller; essentially the root view in a Controller's
   * heierachy of views.
   */
  controller: Controller | null = null;

  /** `new View("button", "Ping")` creates a new HTMLElement; `new View(el)` adopts an existing one. */
  constructor(source: string | HTMLElement, content?: string) {
    super();
    if (typeof source === "string") {
      this.element = document.createElement(source);
      if (content != null) this.element.textContent = content;
    } else {
      this.element = source;
    }
    (this.element as ViewElement)[VIEW_KEY] = this;
  }

  /**
   * Responder-chain link. If this View is directly managed by a Controller then
   * its next in the chain by default, otherwise its superview.
   */
  override get nextResponder(): Responder | null {
    return this.controller ?? this.superview ?? null;
  }

  /** The nearest containing controller region, derived from the sparse
   *  View tree. For a controller root view this is its own controller. */
  owner(): Controller | null {
    let v: View | null = this;
    while (v) {
      if (v.controller) return v.controller;
      v = v.superview;
    }
    return null;
  }

  /** Adopt an existing element as a base `View` (the controller-root
   *  path used by `attachController`). Idempotent: returns the existing
   *  View if `el` is already wrapped (re-scans, code-built elements). */
  static wrapping(el: HTMLElement): View {
    return View.of(el) ?? new View(el);
  }

  /** The View wrapping `el`, or null. */
  static of(el: HTMLElement | null): View | null {
    return el ? ((el as ViewElement)[VIEW_KEY] ?? null) : null;
  }

  /** Append `child` as a subview: DOM `appendChild`, tree link, then
   *  `activate`. The same call the awaken walk makes per managed node. */
  addSubview(child: View): void {
    this.element.appendChild(child.element);
    this.adoptSubview(child);
    activate(child);
  }

  /** Insert `child` before an existing subview. */
  insertSubview(child: View, before: View): void {
    this.element.insertBefore(child.element, before.element);
    this.adoptSubview(child);
    const i = this.subviews.indexOf(before);
    if (i >= 0) {
      const current = this.subviews.indexOf(child);
      if (current >= 0) this.subviews.splice(current, 1);
      this.subviews.splice(i, 0, child);
    }
    activate(child);
  }

  /** Link an already-placed child element into this View's sparse tree. */
  adoptSubview(child: View): void {
    child.releaseFromSuperviewLink();
    child.superview = this;
    if (!this.subviews.includes(child)) this.subviews.push(child);
  }

  /** Release a child from this View's sparse tree without removing DOM. */
  releaseSubview(child: View): void {
    if (child.superview !== this) return;
    const i = this.subviews.indexOf(child);
    if (i >= 0) this.subviews.splice(i, 1);
    child.superview = null;
  }

  removeFromSuperview(): void {
    this.releaseFromSuperviewLink();
    this.element.remove();
  }

  private releaseFromSuperviewLink(): void {
    const sv = this.superview;
    if (!sv) return;
    sv.releaseSubview(this);
  }

  setText(s: string): void {
    if (this.element.textContent !== s) this.element.textContent = s;
  }

  get value(): string {
    return (this.element as HTMLInputElement).value ?? "";
  }
  set value(s: string) {
    const el = this.element as HTMLInputElement;
    if (el.value !== s) el.value = s;
  }

  get checked(): boolean {
    return !!(this.element as HTMLInputElement).checked;
  }
  set checked(b: boolean) {
    const el = this.element as HTMLInputElement;
    if (el.checked !== b) el.checked = b;
  }

  setProp(name: string, v: unknown): void {
    (this.element as unknown as Record<string, unknown>)[name] = v;
  }

  // DOM focus stuff; Don't ever use this stuff.

  focusElement(): void {
    this.firstFocusableElement()?.focus({ preventScroll: true });
  }

  blurElement(): void {
    const t = this.firstFocusableElement();
    if (t && document.activeElement === t) t.blur();
  }

  get isFocused(): boolean {
    const t = this.firstFocusableElement();
    return !!t && document.activeElement === t;
  }

  firstFocusableElement(): HTMLElement | null {
    return firstFocusable(this.element);
  }

  // Use this stuff instead.

  override becomeFirstResponder(): boolean {
    if (!super.becomeFirstResponder()) return false;
    this.focusElement();
    return true;
  }

  override resignFirstResponder(next: Responder | null = null): boolean {
    if (!super.resignFirstResponder(next)) return false;
    this.blurElement();
    return true;
  }
}

// Activation runs the same hook order for both `addSubview` and the
// awaken walk (see docs/lifecycle.md). The outlet/binding step is
// injected at boot so view.ts stays runtime-dependency-free.

type ActivationWiring = (controller: Controller) => void;
export type ActivationConfiguration = (controllers: Controller[]) => void;

export interface ActivationOptions {
  configure?: ActivationConfiguration;
}

let connectOutletsAndWireBindings: ActivationWiring | null = null;

export function setActivationWiring(fn: ActivationWiring): void {
  connectOutletsAndWireBindings = fn;
}

const loaded = new WeakSet<View>();
const controllerLoaded = new WeakSet<Controller>();
const appeared = new WeakSet<View>();

/** Bring a View tree online. Loading and `controllerDidLoad` are once per
 * controller instance; appearance can run again after explicit detach. */
export function activate(view: View, options: ActivationOptions = {}): Controller[] {
  const controllers = loadViewTree(view);
  options.configure?.(controllers);
  finishControllerLoading(controllers);
  appearViewTree(view);
  return controllers;
}

export function loadViewTree(root: View): Controller[] {
  const views = viewTree(root);
  const controllers: Controller[] = [];
  for (let i = views.length - 1; i >= 0; i--) {
    const view = views[i]!;
    const c = view.controller;
    if (!c) continue;
    controllers.unshift(c);
    if (loaded.has(view)) continue;
    loaded.add(view);
    applyAttributeMappings(c, view.element);
    c.viewDidLoad();
    connectOutletsAndWireBindings?.(c);
    c.awakeFromDOM();
  }
  return controllers;
}

export function finishControllerLoading(controllers: readonly Controller[]): void {
  for (const controller of controllers) {
    if (controllerLoaded.has(controller)) continue;
    controllerLoaded.add(controller);
    controller.controllerDidLoad();
  }
}

export function appearViewTree(root: View): void {
  const views = viewTree(root);
  for (let i = views.length - 1; i >= 0; i--) {
    const view = views[i]!;
    const c = view.controller;
    if (!c || appeared.has(view)) continue;
    appeared.add(view);
    c.viewWillAppear();
    c.viewDidAppear();
  }
}

export function markDetached(view: View): void {
  appeared.delete(view);
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
