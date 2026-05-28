var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/core/core_ext.ts
String.prototype.toLowerCamel = function() {
  if (!this) return this;
  if (this.includes("_")) {
    return this.split("_").map((part, i) => i === 0 ? part.toLowerCase() : (part[0]?.toUpperCase() ?? "") + part.slice(1).toLowerCase()).join("");
  }
  return this[0].toLowerCase() + this.slice(1);
};
String.prototype.toUpperCamel = function() {
  const lc = this.toLowerCamel();
  if (!lc) return lc;
  return lc[0].toUpperCase() + lc.slice(1);
};

// src/core/bindings/object_bindings.ts
function readPath(root, segments) {
  let cur = root;
  for (const s of segments) cur = cur?.[s];
  return cur;
}
function writePath(root, segments, value) {
  if (segments.length === 0) return;
  let cur = root;
  for (let i = 0; i < segments.length - 1; i++) {
    cur = cur?.[segments[i]];
    if (cur == null) return;
  }
  cur[segments[segments.length - 1]] = value;
}
function observePath(root, segments, onChange) {
  if (segments.length === 0) return () => {
  };
  let disposed = false;
  const activeOwners = new Array(segments.length).fill(null);
  const rehookFromLevel = (startLevel) => {
    let owner = root;
    for (let i = 0; i < startLevel; i++) {
      if (owner == null) return;
      owner = owner[segments[i]];
    }
    for (let i = startLevel; i < segments.length; i++) {
      if (owner == null) {
        for (let j = i; j < segments.length; j++) activeOwners[j] = null;
        return;
      }
      const level = i;
      const currentOwner = owner;
      if (activeOwners[level] !== currentOwner) {
        activeOwners[level] = currentOwner;
        const cbName = `${segments[level]}DidChange`;
        const orig = currentOwner[cbName];
        currentOwner[cbName] = function(prev, next) {
          if (!disposed && activeOwners[level] === currentOwner) {
            onChange();
            rehookFromLevel(level + 1);
          }
          if (typeof orig === "function") orig.call(this, prev, next);
        };
      }
      owner = currentOwner[segments[level]];
    }
  };
  rehookFromLevel(0);
  return () => {
    disposed = true;
  };
}
var bindings = /* @__PURE__ */ new WeakMap();
function bind(target, targetKey, source, sourcePath, _options3 = {}) {
  unbind(target, targetKey);
  const segments = sourcePath.split(".");
  const sync = () => {
    target[targetKey] = readPath(source, segments);
  };
  sync();
  const disposer = observePath(source, segments, sync);
  let perTarget = bindings.get(target);
  if (!perTarget) {
    perTarget = /* @__PURE__ */ new Map();
    bindings.set(target, perTarget);
  }
  perTarget.set(targetKey, disposer);
}
function unbind(target, targetKey) {
  const perTarget = bindings.get(target);
  const disposer = perTarget?.get(targetKey);
  if (!disposer) return;
  disposer();
  perTarget.delete(targetKey);
}
function unbindAll(target) {
  const perTarget = bindings.get(target);
  if (!perTarget) return;
  for (const disposer of perTarget.values()) disposer();
  bindings.delete(target);
}

// src/core/bindings/transformers.ts
var transformers = /* @__PURE__ */ new Map();
function registerTransformer(name, t) {
  transformers.set(name, t);
}
function getTransformer(name) {
  return transformers.get(name) ?? transformers.get("string");
}
function applyTransform(name, value) {
  const fn = valueTransforms.get(name);
  if (!fn) {
    console.warn(`[bindings] unknown transform "${name}"`);
    return value;
  }
  return fn(value);
}
registerTransformer("string", {
  parse: (s) => s,
  format: (v) => v == null ? "" : String(v)
});
registerTransformer("number", {
  parse: (s) => s.trim() === "" ? null : Number(s),
  format: (v) => v == null || Number.isNaN(v) ? "" : String(v)
});
registerTransformer("boolean", {
  parse: (s) => s === "true" || s === "1" || s === "on",
  format: (v) => v ? "true" : "false"
});
registerTransformer("date", {
  parse: (s) => s.trim() === "" ? null : new Date(s),
  format: (v) => v instanceof Date ? v.toISOString().slice(0, 10) : v ?? ""
});
registerTransformer("phone", {
  parse: (s) => s,
  format(value) {
    if (!value) return "";
    const raw = String(value).trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return raw;
  }
});
registerTransformer("url-display", {
  parse: (s) => s,
  format(value) {
    if (!value) return "";
    return String(value).trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
});
var valueTransforms = /* @__PURE__ */ new Map();
valueTransforms.set("isBlank", (value) => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
});
valueTransforms.set("isEmpty", (value) => {
  if (value == null) return true;
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  return false;
});
valueTransforms.set("isPresent", (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
});

// src/core/bindings/binding_adapters.ts
function selectedObjectIdBinding(options = {}) {
  const collectionKey = options.collection ?? "representedObject";
  const selectedObjectKey = options.selectedObject ?? "selectedObject";
  return {
    dependencies: options.dependencies ?? [collectionKey, selectedObjectKey],
    get(pending) {
      const selected = this[selectedObjectKey];
      const id = selected?.id;
      return id == null ? pending : String(id);
    },
    set(id) {
      if (id == null || id === "") {
        this[selectedObjectKey] = null;
        return true;
      }
      const collection = this[collectionKey];
      if (!Array.isArray(collection)) return false;
      const match = collection.find((item) => {
        const candidate = item;
        return candidate?.id != null && String(candidate.id) === id;
      });
      if (!match) return false;
      this[selectedObjectKey] = match;
      return true;
    }
  };
}

// src/core/responder/responder.ts
var firstResponder = null;
var chainTop = null;
function currentFirstResponder() {
  return firstResponder;
}
function setChainTop(r) {
  chainTop = r;
}
function chainTopResponder() {
  return chainTop;
}
function _setFirstResponder(r) {
  firstResponder = r;
}
function makeFirstResponder(responder) {
  if (responder === firstResponder) return true;
  const current = firstResponder;
  if (current && !current.resignFirstResponder(responder)) return false;
  firstResponder = null;
  if (responder == null) {
    firstResponder = chainTop;
    return true;
  }
  if (responder.becomeFirstResponder()) {
    firstResponder = responder;
    return true;
  }
  firstResponder = chainTop;
  return true;
}
var Responder = class {
  /** Cocoa NSResponder predicates. Override to gate transitions declaratively;
   * the side-effecting `becomeFirstResponder`/`resignFirstResponder` consult
   * these before doing anything. */
  get canBecomeFirstResponder() {
    return true;
  }
  get canResignFirstResponder() {
    return true;
  }
  get isFirstResponder() {
    return firstResponder === this;
  }
  /**
   * Pure protocol (Cocoa `NSResponder.becomeFirstResponder()`): the
   * accept-or-refuse decision *and* the "about to become FR"
   * notification. Return `false` to refuse. Do setup here (focus,
   * etc.). Does NOT touch the global FR or run the handshake — that's
   * `makeFirstResponder`'s job. There is no separate `did*` hook;
   * `become`/`resign` ARE the notifications (Cocoa has none).
   */
  becomeFirstResponder() {
    return this.canBecomeFirstResponder;
  }
  /**
   * Pure protocol (Cocoa `NSResponder.resignFirstResponder()`). Return
   * `false` to refuse — `makeFirstResponder` then aborts the transition
   * and the outgoing responder stays FR. `next` is the proposed
   * incoming responder (null when focus is going nowhere); subclasses
   * inspect it to delegate, validate, or prompt before allowing.
   */
  resignFirstResponder(_next = null) {
    return this.canResignFirstResponder;
  }
  // ---- event chain ----
  //
  // Default behavior matches Cocoa's NSResponder: keyDown routes well-known
  // keys to named methods (cancelOperation/insertNewline/complete); other
  // keys, and the named methods themselves, bubble up via nextResponder.
  keyDown(event) {
    switch (event.key) {
      case "Escape":
        return this.cancelOperation(event);
      case "Enter":
        return this.insertNewline(event);
      case "Tab":
        return this.complete(event);
      default:
        this.nextResponder?.keyDown(event);
    }
  }
  keyUp(event) {
    this.nextResponder?.keyUp(event);
  }
  cancelOperation(event) {
    this.nextResponder?.cancelOperation(event);
  }
  insertNewline(event) {
    this.nextResponder?.insertNewline(event);
  }
  complete(event) {
    this.nextResponder?.complete(event);
  }
  /** Walk the responder chain looking for a method with this name. Used by
   * target-action: `<button data-action="save">` starts at
   * `firstResponderFor(buttonElement)`, then walks up until something
   * handles it. */
  performAction(name, sender, event) {
    let node = this;
    while (node) {
      const fn = node[name];
      if (typeof fn === "function") {
        fn.call(node, sender, event);
        return true;
      }
      node = node.nextResponder;
    }
    return false;
  }
};

// src/core/responder/focus.ts
function firstResponderFor(el2) {
  let node = el2;
  while (node) {
    const v = View.of(node);
    if (v) return v.controller ?? v;
    node = node.parentElement;
  }
  return null;
}
function responderElement(r) {
  if (r instanceof Controller) return r.view.element;
  if (r instanceof View) return r.element;
  return null;
}
function syncFirstResponderFromFocus(target, previouslyFocused = null) {
  const responder = firstResponderFor(target);
  const current = currentFirstResponder();
  if (current === responder) return;
  if (current && !current.resignFirstResponder(responder)) {
    const ownerEl = responderElement(current);
    if (ownerEl) {
      let restore = null;
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

// src/core/awakening/attribute_mappings.ts
var SYMBOL_METADATA = Symbol.metadata ?? /* @__PURE__ */ Symbol.for("Symbol.metadata");
var classMeta = (ctor) => ctor?.[SYMBOL_METADATA];
function htmlAttribute(attribute, options = {}) {
  return function(_target, context) {
    const meta = context.metadata;
    if (!Object.prototype.hasOwnProperty.call(meta, "htmlAttributes")) {
      meta.htmlAttributes = [...meta.htmlAttributes ?? []];
    }
    meta.htmlAttributes.push({ attribute, property: String(context.name), ...options });
  };
}
function applyAttributeMappings(instance, element) {
  for (const mapping of mappingsFor(instance)) {
    if (!element.hasAttribute(mapping.attribute)) continue;
    const raw = element.getAttribute(mapping.attribute);
    instance[mapping.property] = "value" in mapping ? mapping.value : getTransformer(mapping.transform ?? "string").parse(raw ?? "true");
  }
}
function mappingsFor(instance) {
  const out = [];
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    out.unshift(...classMeta(proto.constructor)?.htmlAttributes ?? []);
    proto = Object.getPrototypeOf(proto);
  }
  return out;
}

// src/core/view/view.ts
var VIEW_KEY = /* @__PURE__ */ Symbol.for("framework.view");
var FOCUSABLE_TAGS = ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"];
function isFocusable(el2) {
  if (el2.tabIndex >= 0) return true;
  return FOCUSABLE_TAGS.includes(el2.tagName);
}
function firstFocusable(el2) {
  if (isFocusable(el2)) return el2;
  return el2.querySelector("input, select, textarea, [tabindex], button");
}
var View = class _View extends Responder {
  /** The element this View owns; only Views should interact with elements. */
  element;
  superview = null;
  /** Only children that are managed by a View, not every random HTMLElement. */
  subviews = [];
  /** Set if this view is expliclty managed by a controller; essentially the root view in a Controller's
   * heierachy of views.
   */
  controller = null;
  /** `new View("button", "Ping")` creates a new HTMLElement; `new View(el)` adopts an existing one. */
  constructor(source, content) {
    super();
    if (typeof source === "string") {
      this.element = document.createElement(source);
      if (content != null) this.element.textContent = content;
    } else {
      this.element = source;
    }
    this.element[VIEW_KEY] = this;
  }
  /**
   * Responder-chain link. If this View is directly managed by a Controller then
   * its next in the chain by default, otherwise its superview.
   */
  get nextResponder() {
    return this.controller ?? this.superview ?? null;
  }
  /** The nearest containing controller region, derived from the sparse
   *  View tree. For a controller root view this is its own controller. */
  owner() {
    let v = this;
    while (v) {
      if (v.controller) return v.controller;
      v = v.superview;
    }
    return null;
  }
  /** Adopt an existing element as a base `View` (the controller-root
   *  path used by `attachController`). Idempotent: returns the existing
   *  View if `el` is already wrapped (re-scans, code-built elements). */
  static wrapping(el2) {
    return _View.of(el2) ?? new _View(el2);
  }
  /** The View wrapping `el`, or null. */
  static of(el2) {
    return el2 ? el2[VIEW_KEY] ?? null : null;
  }
  /** Append `child` as a subview: DOM `appendChild`, tree link, then
   *  `activate`. The same call the awaken walk makes per managed node. */
  addSubview(child) {
    this.element.appendChild(child.element);
    this.adoptSubview(child);
    activate(child);
  }
  /** Insert `child` before an existing subview. */
  insertSubview(child, before) {
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
  adoptSubview(child) {
    child.releaseFromSuperviewLink();
    child.superview = this;
    if (!this.subviews.includes(child)) this.subviews.push(child);
  }
  /** Release a child from this View's sparse tree without removing DOM. */
  releaseSubview(child) {
    if (child.superview !== this) return;
    const i = this.subviews.indexOf(child);
    if (i >= 0) this.subviews.splice(i, 1);
    child.superview = null;
  }
  removeFromSuperview() {
    this.releaseFromSuperviewLink();
    this.element.remove();
  }
  releaseFromSuperviewLink() {
    const sv = this.superview;
    if (!sv) return;
    sv.releaseSubview(this);
  }
  setText(s) {
    if (this.element.textContent !== s) this.element.textContent = s;
  }
  get value() {
    return this.element.value ?? "";
  }
  set value(s) {
    const el2 = this.element;
    if (el2.value !== s) el2.value = s;
  }
  get checked() {
    return !!this.element.checked;
  }
  set checked(b) {
    const el2 = this.element;
    if (el2.checked !== b) el2.checked = b;
  }
  setProp(name, v) {
    this.element[name] = v;
  }
  // DOM focus stuff; Don't ever use this stuff.
  focusElement() {
    this.firstFocusableElement()?.focus({ preventScroll: true });
  }
  blurElement() {
    const t = this.firstFocusableElement();
    if (t && document.activeElement === t) t.blur();
  }
  get isFocused() {
    const t = this.firstFocusableElement();
    return !!t && document.activeElement === t;
  }
  firstFocusableElement() {
    return firstFocusable(this.element);
  }
  // Use this stuff instead.
  becomeFirstResponder() {
    if (!super.becomeFirstResponder()) return false;
    this.focusElement();
    return true;
  }
  resignFirstResponder(next = null) {
    if (!super.resignFirstResponder(next)) return false;
    this.blurElement();
    return true;
  }
};
var connectOutletsAndWireBindings = null;
function setActivationWiring(fn) {
  connectOutletsAndWireBindings = fn;
}
var loaded = /* @__PURE__ */ new WeakSet();
var controllerLoaded = /* @__PURE__ */ new WeakSet();
var appeared = /* @__PURE__ */ new WeakSet();
function activate(view, options = {}) {
  const controllers = loadViewTree(view);
  options.configure?.(controllers);
  finishControllerLoading(controllers);
  appearViewTree(view);
  return controllers;
}
function loadViewTree(root) {
  const views = viewTree(root);
  const controllers = [];
  for (let i = views.length - 1; i >= 0; i--) {
    const view = views[i];
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
function finishControllerLoading(controllers) {
  for (const controller of controllers) {
    if (controllerLoaded.has(controller)) continue;
    controllerLoaded.add(controller);
    controller.controllerDidLoad();
  }
}
function appearViewTree(root) {
  const views = viewTree(root);
  for (let i = views.length - 1; i >= 0; i--) {
    const view = views[i];
    const c = view.controller;
    if (!c || appeared.has(view)) continue;
    appeared.add(view);
    c.viewWillAppear();
    c.viewDidAppear();
  }
}
function markDetached(view) {
  appeared.delete(view);
}
function viewTree(root) {
  const out = [];
  visit(root);
  return out;
  function visit(view) {
    out.push(view);
    for (const child of view.subviews) visit(child);
  }
}

// src/core/view/controller.ts
var controllerDisposers = /* @__PURE__ */ new WeakMap();
var Controller = class extends Responder {
  /** Containing controller via the sparse View tree. Subclasses narrow
   *  with `override get parent()`; the narrowing is a runtime contract. */
  get parent() {
    let v = this.view.superview;
    while (v) {
      if (v.controller) return v.controller;
      v = v.superview;
    }
    return null;
  }
  get nextResponder() {
    return this.parent ?? chainTopResponder();
  }
  // ---- bindings ----
  /** Path prefix for `bind="…"` (default ""). `Editor` returns
   *  `"representedObject"`. */
  bindingRoot() {
    return "";
  }
  /** Coerce JSON from a `<script type="application/json" outlet="…">`
   *  before assignment. */
  decodeOutletData(_name2, value) {
    return value;
  }
  /** NSObject `bind:toObject:withKeyPath:options:`. Torn down on detach. */
  bind(targetKey, source, sourcePath, options) {
    bind(this, targetKey, source, sourcePath, options);
  }
  unbind(targetKey) {
    unbind(this, targetKey);
  }
  /** Detach via the framework teardown path. Call instead of touching
   *  `.view` directly. */
  _destroyView() {
    detachViewTree(this.view, { removeElement: true });
  }
  // ---- lifecycle hooks (subclasses override) ----
  viewDidLoad() {
  }
  awakeFromDOM() {
  }
  controllerDidRestore(_context) {
  }
  controllerDidLoad() {
  }
  viewWillAppear() {
  }
  viewDidAppear() {
  }
  viewWillDisappear() {
  }
  viewDidDisappear() {
  }
  becomeFirstResponder() {
    if (!super.becomeFirstResponder()) return false;
    this.view.focusElement();
    return true;
  }
  resignFirstResponder(next = null) {
    if (!super.resignFirstResponder(next)) return false;
    this.view.blurElement();
    return true;
  }
};
function attachController(view, controller) {
  const v = View.wrapping(view);
  v.controller = controller;
  controller.view = v;
}
function controllerFor(view) {
  return View.of(view)?.controller ?? null;
}
function registerControllerDisposer(controller, disposer) {
  let disposers = controllerDisposers.get(controller);
  if (!disposers) {
    disposers = /* @__PURE__ */ new Set();
    controllerDisposers.set(controller, disposers);
  }
  disposers.add(disposer);
}
function runControllerDisposers(controller) {
  const disposers = controllerDisposers.get(controller);
  if (!disposers) return;
  for (const dispose of disposers) dispose();
  controllerDisposers.delete(controller);
}
function collectControllers(root) {
  const out = [];
  for (const view of topViewsIn(root)) visit(view);
  return out;
  function visit(view) {
    if (view.controller) out.push(view.controller);
    for (const child of view.subviews) visit(child);
  }
}
function topViewsIn(root) {
  const out = [];
  const rootView = View.of(root);
  if (rootView) return [rootView];
  function visit(node) {
    for (const child of Array.from(node.children)) {
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
function detachViewTree(root, opts = {}) {
  const views = viewTree2(root);
  const controllers = views.map((v) => v.controller).filter((c) => c != null);
  for (const c of controllers) c.viewWillDisappear();
  const current = currentFirstResponder();
  const currentEl = current ? responderElement(current) : null;
  if (currentEl && root.element.contains(currentEl)) _setFirstResponder(chainTopResponder());
  for (const c of controllers) {
    runControllerDisposers(c);
    unbindAll(c);
    if (c.view.controller === c) c.view.controller = null;
  }
  unlinkViewTree(root, views);
  for (const view of views) markDetached(view);
  if (opts.removeElement) root.element.remove();
  for (const c of controllers) c.viewDidDisappear();
  return controllers;
}
function viewTree2(root) {
  const out = [];
  visit(root);
  return out;
  function visit(view) {
    out.push(view);
    for (const child of view.subviews) visit(child);
  }
}
function unlinkViewTree(root, views) {
  if (root.superview) {
    const index = root.superview.subviews.indexOf(root);
    if (index >= 0) root.superview.subviews.splice(index, 1);
  }
  for (const view of views) {
    view.superview = null;
    view.subviews = [];
  }
}

// src/core/view/ownership.ts
function ownedDescendants(owner, options = {}) {
  const root = owner instanceof Controller ? owner.view.element : owner;
  const includeRoot = options.includeRoot ?? false;
  const includeBoundary = options.includeBoundary ?? true;
  const skipTemplates = options.skipTemplates ?? true;
  const match = options.match ?? (() => true);
  const out = [];
  if (includeRoot && match(root)) out.push(root);
  visit(root);
  return out;
  function visit(node) {
    for (const child of Array.from(node.children)) {
      if (skipTemplates && child instanceof HTMLTemplateElement) continue;
      const isBoundary = child !== root && controllerFor(child) != null;
      if ((!isBoundary || includeBoundary) && match(child)) out.push(child);
      if (isBoundary) continue;
      visit(child);
    }
  }
}

// src/core/bindings/view_bindings.ts
function wireBindings(controller) {
  const prefix = controller.bindingRoot?.() ?? "";
  registerControllerDisposer(controller, wireBindingsInto(controller, controller.view.element, prefix));
}
function wireBindingsInto(root, hostEl, rootPrefix) {
  const disposers = [];
  for (const el2 of ownedDescendants(hostEl, { match: hasBindingAttr })) {
    const path = el2.getAttribute("bind");
    if (path) disposers.push(wireValueBinding(root, rootPrefix, el2, path));
    for (const attr2 of Array.from(el2.attributes)) {
      if (!attr2.name.startsWith("bind-")) continue;
      const prop = attr2.name.slice("bind-".length);
      if (!prop) continue;
      disposers.push(wirePropertyBinding(root, rootPrefix, el2, prop, attr2.value));
    }
  }
  return () => {
    for (const dispose of disposers) dispose();
  };
}
function wireValueBinding(root, rootPrefix, el2, path) {
  const expression = parseBindingExpression(rootPrefix, path);
  const transformer = getTransformer(el2.getAttribute("transform") ?? "string");
  const binding2 = viewBindingForValue(el2, transformer, controllerFor(el2));
  const sync = () => binding2.apply(expression.read(root));
  sync();
  const disposeObservation = observePath(root, expression.segments, sync);
  const disposeInput = binding2.onUserInput?.((v) => {
    if (expression.transforms.length > 0) {
      console.warn(`[bindings] cannot write through transformed binding "${path}"`);
      return;
    }
    writePath(root, expression.segments, v);
  });
  return () => {
    disposeObservation();
    disposeInput?.();
  };
}
function wirePropertyBinding(root, rootPrefix, el2, prop, path) {
  const expression = parseBindingExpression(rootPrefix, path);
  const binding2 = viewBindingForProperty(el2, normalizePropertyName(prop));
  const sync = () => binding2.apply(expression.read(root));
  sync();
  return observePath(root, expression.segments, sync);
}
function normalizePropertyName(prop) {
  return PROPERTY_ALIASES.get(prop) ?? prop;
}
function parseBindingExpression(rootPrefix, path) {
  const [pathPart, ...transforms] = path.split(":");
  const segments = resolveSegments(rootPrefix, pathPart ?? "");
  return {
    segments,
    transforms,
    read(root) {
      let value = readPath(root, segments);
      for (const transform of transforms) value = applyTransform(transform, value);
      return value;
    }
  };
}
function resolveSegments(rootPrefix, path) {
  if (path.startsWith("@")) return path.slice(1).split(".");
  return (rootPrefix ? rootPrefix.split(".") : []).concat(path.split("."));
}
function hasBindingAttr(el2) {
  if (el2.hasAttribute("bind")) return true;
  for (const attr2 of Array.from(el2.attributes)) {
    if (attr2.name.startsWith("bind-")) return true;
  }
  return false;
}
function viewBindingForValue(el2, transformer, childController) {
  if (childController && "representedObject" in childController) {
    return controllerEndpoint(childController);
  }
  if (el2 instanceof HTMLInputElement && el2.type === "checkbox") {
    return checkboxEndpoint(el2);
  }
  if (el2 instanceof HTMLInputElement || el2 instanceof HTMLTextAreaElement || el2 instanceof HTMLSelectElement) {
    return formControlEndpoint(el2, transformer);
  }
  const view = View.of(el2);
  if (view && "value" in view) {
    return controlValueEndpoint(view, transformer);
  }
  return textEndpoint(el2, transformer);
}
function viewBindingForProperty(el2, prop) {
  const isBool = BOOLEAN_PROPS.has(prop);
  return {
    apply(value) {
      if (prop.startsWith("data-") || prop.startsWith("aria-")) {
        if (value == null || value === "") el2.removeAttribute(prop);
        else el2.setAttribute(prop, String(value));
        return;
      }
      if (value == null && NULLABLE_URL_PROPS.has(prop)) {
        el2.removeAttribute(prop.toLowerCase());
        el2[prop] = "";
        return;
      }
      el2[prop] = isBool ? Boolean(value) : value;
    }
  };
}
var PROPERTY_ALIASES = /* @__PURE__ */ new Map([
  ["readonly", "readOnly"]
]);
var BOOLEAN_PROPS = /* @__PURE__ */ new Set([
  "disabled",
  "checked",
  "hidden",
  "readOnly",
  "required",
  "open"
]);
var NULLABLE_URL_PROPS = /* @__PURE__ */ new Set([
  "href",
  "src"
]);
function controllerEndpoint(ctrl) {
  return {
    apply(value) {
      if (value === void 0) return;
      ctrl.representedObject = value;
    }
  };
}
function checkboxEndpoint(el2) {
  return {
    apply(value) {
      const checked = Boolean(value);
      if (el2.checked !== checked) el2.checked = checked;
    },
    onUserInput(handler) {
      const listener = () => handler(el2.checked);
      el2.addEventListener("change", listener);
      return () => el2.removeEventListener("change", listener);
    }
  };
}
function formControlEndpoint(el2, transformer) {
  return {
    apply(value) {
      const formatted = transformer.format(value);
      if (el2.value !== formatted) el2.value = formatted;
    },
    onUserInput(handler) {
      const listener = () => handler(transformer.parse(el2.value));
      el2.addEventListener("input", listener);
      return () => el2.removeEventListener("input", listener);
    }
  };
}
function controlValueEndpoint(view, transformer) {
  return {
    apply(value) {
      const formatted = transformer.format(value);
      if (view.value !== formatted) view.value = formatted;
    },
    onUserInput(handler) {
      const listener = () => handler(transformer.parse(String(view.value ?? "")));
      view.element.addEventListener("input", listener);
      return () => view.element.removeEventListener("input", listener);
    }
  };
}
function textEndpoint(el2, transformer) {
  return {
    apply(value) {
      el2.textContent = transformer.format(value);
    }
  };
}

// src/core/awakening/actions.ts
var ACTION_BOUND = /* @__PURE__ */ Symbol.for("framework.actionBound");
function wireActionsInto(c, host = c.view.element) {
  const disposers = [];
  const els = ownedDescendants(host, {
    includeRoot: true,
    match: (el2) => el2.hasAttribute("data-action")
  });
  els.forEach((el2) => {
    const spec = el2.getAttribute("data-action").trim();
    if (!spec) return;
    const annotated = el2;
    const bound = annotated[ACTION_BOUND] ??= /* @__PURE__ */ new Set();
    if (bound.has(spec)) return;
    bound.add(spec);
    const [maybeEvent, maybeName] = spec.includes(":") ? spec.split(":") : [void 0, spec];
    const eventName = (maybeEvent ?? "click").trim();
    const actionName = (maybeName ?? "").trim();
    if (!actionName) return;
    const handler = (event) => {
      (firstResponderFor(el2) ?? c).performAction(actionName, el2, event);
    };
    el2.addEventListener(eventName, handler);
    disposers.push(() => {
      el2.removeEventListener(eventName, handler);
      bound.delete(spec);
    });
  });
  return () => {
    for (const dispose of disposers) dispose();
  };
}

// src/core/awakening/registry.ts
var classes = /* @__PURE__ */ new Map();
function registerClass(name, ctor) {
  classes.set(name, ctor);
}
function registeredClasses() {
  return classes.values();
}
function registeredClassEntries() {
  return [...classes.entries()];
}
function lookupRegisteredClass(name) {
  return classes.get(name) ?? classes.get(name.toUpperCamel());
}
function __debugRegistry() {
  const out = {};
  for (const [k, v] of classes) out[k] = v.name;
  return out;
}
Object.defineProperty(globalThis, "__classRegistry", {
  configurable: true,
  get: () => __debugRegistry()
});

// src/core/awakening/decorators.ts
var SYMBOL_METADATA2 = Symbol.metadata ?? /* @__PURE__ */ Symbol.for("Symbol.metadata");
function metaFor(context) {
  return context.metadata;
}
function ensureOwnSet(meta, key) {
  if (!Object.prototype.hasOwnProperty.call(meta, key)) {
    meta[key] = new Set(meta[key] ?? []);
  }
  return meta[key];
}
function classMeta2(ctor) {
  return ctor?.[SYMBOL_METADATA2];
}
function outletField(context, options) {
  const meta = metaFor(context);
  const name = String(context.name);
  ensureOwnSet(meta, "outlets").add(name);
  if (options.optional) ensureOwnSet(meta, "optionalOutlets").add(name);
}
function register(...args) {
  if (args.length === 2 && typeof args[0] === "function") {
    const [ctor, context] = args;
    registerClass(String(context.name ?? ctor.name), ctor);
    return ctor;
  }
  const explicitName = args[0];
  return function(ctor, _context) {
    registerClass(explicitName, ctor);
    return ctor;
  };
}
function outlet(...args) {
  if (args.length === 2 && args[0] === void 0) {
    return outletField(args[1], {});
  }
  const options = args[0] ?? {};
  return function(_target, context) {
    outletField(context, options);
  };
}
function outletNamesOf(instance) {
  const meta = classMeta2(instance.constructor);
  return meta?.outlets ? [...meta.outlets] : [];
}
function isOptionalOutlet(instance, name) {
  const meta = classMeta2(instance.constructor);
  return meta?.optionalOutlets?.has(name) ?? false;
}

// src/core/bindings/decorators.ts
function observable(target, context) {
  const name = String(context.name);
  const callbackName = `${name}DidChange`;
  return {
    get() {
      return target.get.call(this);
    },
    set(value) {
      const prev = target.get.call(this);
      target.set.call(this, value);
      const cb = this[callbackName];
      if (typeof cb === "function") cb.call(this, prev, value);
    }
  };
}
var bindingState = /* @__PURE__ */ new WeakMap();
function bindingSlotFor(obj, name) {
  let perInstance = bindingState.get(obj);
  if (!perInstance) {
    perInstance = /* @__PURE__ */ new Map();
    bindingState.set(obj, perInstance);
  }
  let slot = perInstance.get(name);
  if (!slot) {
    slot = { installed: false, cached: void 0, pending: void 0, hasPending: false };
    perInstance.set(name, slot);
  }
  return slot;
}
function binding(adapter) {
  return function(target, context) {
    const name = String(context.name);
    const callbackName = `${name}DidChange`;
    const readCurrent = (instance, slot) => {
      const pending = slot.hasPending ? slot.pending : target.get.call(instance);
      return adapter.get ? adapter.get.call(instance, pending) : pending;
    };
    const fireIfChanged = (instance, slot, prev) => {
      const next = readCurrent(instance, slot);
      if (slot.hasPending && !Object.is(next, slot.pending)) slot.hasPending = false;
      slot.cached = next;
      if (Object.is(prev, next)) return;
      const cb = instance[callbackName];
      if (typeof cb === "function") cb.call(instance, prev, next);
    };
    const retryPending = (instance, slot) => {
      if (!slot.hasPending || !adapter.set) return;
      const applied = adapter.set.call(instance, slot.pending);
      if (applied !== false) slot.hasPending = false;
    };
    const install = (instance) => {
      const slot = bindingSlotFor(instance, name);
      if (slot.installed) return slot;
      slot.installed = true;
      slot.cached = readCurrent(instance, slot);
      let changeQueued = false;
      const onDepChange = () => {
        if (changeQueued) return;
        changeQueued = true;
        queueMicrotask(() => {
          changeQueued = false;
          const prev = slot.cached;
          retryPending(instance, slot);
          fireIfChanged(instance, slot, prev);
        });
      };
      for (const dep of adapter.dependencies) {
        const segments = dep.split(".");
        const first = segments[0];
        if (first == null || !(first in instance)) {
          console.error(
            `[binding] ${instance.constructor.name}.${name}: unknown dependency \`${first}\` (path "${dep}") - typo or missing observable?`
          );
          continue;
        }
        observePath(instance, segments, onDepChange);
      }
      return slot;
    };
    return {
      get() {
        const slot = install(this);
        return readCurrent(this, slot);
      },
      set(value) {
        const slot = install(this);
        const prev = readCurrent(this, slot);
        target.set.call(this, value);
        slot.pending = value;
        slot.hasPending = true;
        if (adapter.set) {
          const applied = adapter.set.call(this, value);
          if (applied !== false) slot.hasPending = false;
        } else {
          slot.hasPending = false;
        }
        fireIfChanged(this, slot, prev);
      }
    };
  };
}

// src/core/awakening/outlets.ts
function connectOutlets(controller) {
  const names = outletNamesOf(controller);
  if (names.length === 0) return;
  const wanted = new Set(names);
  for (const el2 of ownedDescendants(controller, { match: (el3) => el3.hasAttribute("outlet") })) {
    if (wanted.size === 0) break;
    const name = el2.getAttribute("outlet");
    if (!name || !wanted.has(name)) continue;
    controller[name] = outletValueFor(controller, name, el2);
    wanted.delete(name);
  }
  if (wanted.size > 0) {
    const required = [...wanted].filter((n) => !isOptionalOutlet(controller, n));
    if (required.length > 0) {
      console.warn(`[Swill] ${controller.constructor.name}: unresolved outlets: ${required.join(", ")}`);
    }
  }
}
function outletValueFor(controller, name, el2) {
  if (el2 instanceof HTMLScriptElement && el2.type === "application/json") {
    const text = el2.textContent?.trim() ?? "";
    if (!text) return controller.decodeOutletData(name, null);
    try {
      return controller.decodeOutletData(name, JSON.parse(text));
    } catch (err) {
      console.warn("[Swill] invalid JSON outlet", el2, err);
      return controller.decodeOutletData(name, null);
    }
  }
  if (el2 instanceof HTMLTemplateElement) return el2;
  const childController = controllerFor(el2);
  if (childController) return childController;
  const view = View.of(el2);
  if (view) return view;
  console.warn(
    `[Swill] ${controller.constructor.name}.${name}: outlet element was not hydrated; add controller="...", klass="...", or keep outlet on a live non-template element`,
    el2
  );
  return el2;
}

// src/core/awakening/hydrate.ts
setActivationWiring((c) => {
  connectOutlets(c);
  wireBindings(c);
});
function wireSubtree(root, options = {}) {
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
function finishActivation(root) {
  const views = topViewsIn2(root);
  const controllers = views.flatMap((view) => loadViewTree(view));
  finishControllerLoading(controllers);
  for (const view of views) appearViewTree(view);
}
function hydrateManagedElements(root) {
  const controllers = [];
  const views = [];
  const elements = collectManagedElements(root);
  for (const el2 of elements) {
    let view = View.of(el2);
    if (!view) {
      const klass = el2.getAttribute("klass");
      if (klass) {
        const viewCtor = lookupRegisteredClass(klass);
        if (!viewCtor) {
          console.warn(`[Swill] no class registered for klass="${klass}"`, el2);
          continue;
        }
        if (viewCtor !== View && !(viewCtor.prototype instanceof View)) {
          console.warn(`[Swill] registered klass="${klass}" is not a View subclass`, el2);
          continue;
        }
        view = new viewCtor(el2);
      } else {
        view = View.wrapping(el2);
      }
    }
    views.push(view);
    linkSuperview(view);
    const controllerName = el2.getAttribute("controller");
    if (controllerName && !controllerFor(el2)) {
      const controllerCtor = lookupRegisteredClass(controllerName);
      if (!controllerCtor) {
        console.warn(`[Swill] no controller registered for "${controllerName}"`, el2);
        continue;
      }
      if (controllerCtor !== Controller && !(controllerCtor.prototype instanceof Controller)) {
        console.warn(`[Swill] registered controller="${controllerName}" is not a Controller subclass`, el2);
        continue;
      }
      const controller = new controllerCtor();
      attachController(el2, controller);
      controllers.push(controller);
    }
  }
  return { controllers, views };
}
function collectManagedElements(root) {
  const list = [];
  if (isManagedElement(root)) list.push(root);
  for (const el2 of Array.from(root.querySelectorAll("[klass], [controller], [outlet]"))) {
    if (isManagedElement(el2)) list.push(el2);
  }
  return list;
}
function isManagedElement(el2) {
  if (el2 instanceof HTMLTemplateElement) return false;
  if (isJsonOutlet(el2)) return false;
  return el2.hasAttribute("klass") || el2.hasAttribute("controller") || el2.hasAttribute("outlet");
}
function isJsonOutlet(el2) {
  return el2 instanceof HTMLScriptElement && el2.type === "application/json" && el2.hasAttribute("outlet");
}
function linkSuperview(view) {
  const parent = nearestSuperview(view.element.parentElement);
  if (view.superview === parent) return;
  if (view.superview) {
    const prevIndex = view.superview.subviews.indexOf(view);
    if (prevIndex >= 0) view.superview.subviews.splice(prevIndex, 1);
  }
  view.superview = parent;
  if (parent && !parent.subviews.includes(view)) parent.subviews.push(view);
}
function nearestSuperview(el2) {
  let node = el2;
  while (node) {
    const v = View.of(node);
    if (v) return v;
    node = node.parentElement;
  }
  return null;
}
function wireActions(controllers) {
  for (const c of controllers) {
    registerControllerDisposer(c, wireActionsInto(c));
  }
}
function topHydratedViews(views) {
  const viewSet = new Set(views);
  return views.filter((view) => !view.superview || !viewSet.has(view.superview));
}
function topViewsIn2(root) {
  const out = [];
  const rootView = View.of(root);
  if (rootView) return [rootView];
  function visit(node) {
    for (const child of Array.from(node.children)) {
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

// src/core/windows.ts
function windowContainers(root) {
  const containers = Array.from(root.querySelectorAll("[window]"));
  if (root.hasAttribute("window")) containers.unshift(root);
  return containers;
}
function topControllerIn(container, controllers) {
  return controllers.find(
    (c) => container.contains(c.view.element) && (c.parent == null || !container.contains(c.parent.view.element))
  ) ?? null;
}
function scopedFragmentKey(windowName, key) {
  return `${windowName}.${key}`;
}
function fragmentParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}
function fragmentValue(value) {
  if (value == null || value === "") return null;
  return String(value);
}
function writeFragmentParam(key, value, mode) {
  if (mode === "none") return;
  const params = fragmentParams();
  if (value == null) params.delete(key);
  else params.set(key, value);
  const query = params.toString();
  const next = `${window.location.pathname}${window.location.search}${query ? `#${query}` : ""}`;
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

// src/core/application.ts
var Application = class _Application extends Responder {
  static _shared = null;
  static get shared() {
    return this._shared ??= new _Application();
  }
  /** Chain terminus — the responder chain bottoms out here (Cocoa
   *  NSApp). No further link. */
  get nextResponder() {
    return null;
  }
  rootElement = document.body;
  rootControllers = [];
  windowTemplates = /* @__PURE__ */ new Map();
  capturedWindowContents = /* @__PURE__ */ new Map();
  windows = [];
  windowRestoration = /* @__PURE__ */ new Map();
  applyingFragmentState = false;
  /** One-time startup: install listeners, prepare `[window]`
   * containers, wire their live or templated contents, then apply URL
   * fragment restoration. */
  start(root = document.body) {
    _Application._shared = this;
    setChainTop(this);
    this.rootElement = root;
    this.scanWindowTemplates();
    this.prepareWindowContainers(root);
    this.installKeyRouting();
    this.installFocusTracking();
    this.installFragmentRouting();
    this.watchForChanges(root);
    this.rootControllers = wireSubtree(root, { deferActivation: true });
    this.registerLiveWindows(root, this.rootControllers);
    this.restoreWindowStates();
    this.finishWindowActivation();
    this.installConsoleHooks();
  }
  // ---- windows ----
  /** Show a window from a registered template. Multiple windows can be
   * open simultaneously. Returns a Promise that resolves when the window
   * is dismissed. */
  showWindow(name, opts = {}) {
    const container = this.windowContainer(name);
    if (container) {
      return this.loadWindowContent(name, name);
    }
    this.scanWindowTemplates();
    const rootCtrl = this.instantiateTemplate(name, opts.into ?? document.body);
    const node = rootCtrl.view.element;
    if (node instanceof HTMLDialogElement) node.show();
    const savedFR = currentFirstResponder();
    makeFirstResponder(rootCtrl);
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    this.windows.push({
      root: node,
      controller: rootCtrl,
      name,
      contentName: name,
      savedFirstResponder: savedFR,
      resolve
    });
    return promise;
  }
  async loadWindowContent(windowName, contentName, opts = {}) {
    this.scanWindowTemplates();
    const container = this.windowContainer(windowName);
    if (!container) throw new Error(`Application: no window="${windowName}" container`);
    const old = this.windows.find((w) => w.root === container);
    const previous = currentFirstResponder();
    for (const view of topViewsIn(container)) {
      detachViewTree(view, { removeElement: false });
    }
    container.replaceChildren();
    const fragment = this.cloneWindowContent(contentName);
    container.appendChild(fragment);
    const controllers = wireSubtree(container, { deferActivation: true });
    const controller = topControllerIn(container, controllers);
    const entry = {
      root: container,
      controller,
      name: windowName,
      contentName,
      savedFirstResponder: old?.savedFirstResponder ?? null,
      resolve: old?.resolve ?? (() => {
      })
    };
    const idx = this.windows.indexOf(old);
    if (idx >= 0) this.windows[idx] = entry;
    else this.windows.push(entry);
    container.setAttribute("name", contentName);
    this.writeFragmentParam(windowName, contentName, opts.history ?? "push");
    this.restoreWindowState(entry, {
      pruneStale: opts.history !== "none",
      writeContent: opts.history !== "none"
    });
    finishActivation(container);
    if (controller) makeFirstResponder(controller);
    else if (previous instanceof Controller && previous.view.element.isConnected) makeFirstResponder(previous);
  }
  instantiateTemplate(name, into) {
    const tpl = this.windowTemplates.get(name);
    if (!tpl) throw new Error(`Application: no window template "${name}"`);
    const node = tpl.content.firstElementChild?.cloneNode(true);
    if (!node) throw new Error(`Application: empty window template "${name}"`);
    into.appendChild(node);
    wireSubtree(node);
    const rootCtrl = controllerFor(node);
    if (!rootCtrl) {
      const views = topViewsIn(node);
      if (views.length) {
        for (const view of views) detachViewTree(view);
      }
      node.remove();
      throw new Error(`Application: window "${name}" root has no controller="..." attribute`);
    }
    return rootCtrl;
  }
  /** Tear down the window that owns `controller`. Restores the
   * first-responder that was active when the window was presented. */
  dismiss(controller) {
    const idx = this.windows.findIndex((w) => w.controller === controller || w.root.contains(controller.view.element));
    if (idx < 0) return;
    const win = this.windows[idx];
    this.windows.splice(idx, 1);
    if (win.root instanceof HTMLDialogElement && win.root.open) win.root.close();
    if (win.controller) detachViewTree(win.controller.view, { removeElement: true });
    const prev = win.savedFirstResponder;
    if (prev instanceof Controller && prev.view.element.isConnected) {
      makeFirstResponder(prev);
    }
    win.resolve();
  }
  scanWindowTemplates() {
    const tpls = document.querySelectorAll('template[for="window"][name], body > template[name]');
    for (const t of tpls) {
      const name = t.getAttribute("name");
      if (name) this.windowTemplates.set(name, t);
    }
  }
  prepareWindowContainers(root) {
    for (const container of windowContainers(root)) {
      const windowName = container.getAttribute("window")?.trim();
      if (!windowName) continue;
      const contentName = container.getAttribute("name")?.trim();
      const hasLiveContent = container.childNodes.length > 0;
      const requestedContent = fragmentParams().get(windowName)?.trim() || null;
      if (contentName && hasLiveContent && !this.windowTemplates.has(contentName)) {
        const fragment = document.createDocumentFragment();
        for (const node of Array.from(container.childNodes)) {
          fragment.appendChild(node.cloneNode(true));
        }
        this.capturedWindowContents.set(contentName, { fragment });
      }
      if (hasLiveContent) {
        if (requestedContent && requestedContent !== contentName) {
          if (this.hasWindowContent(requestedContent)) {
            container.replaceChildren(this.cloneWindowContent(requestedContent));
            container.setAttribute("name", requestedContent);
          } else {
            console.warn(`[Swill] window="${windowName}" requested unknown content "${requestedContent}"`);
          }
        }
        continue;
      }
      const defaultContent = requestedContent || contentName || (this.hasWindowContent(windowName) ? windowName : null);
      if (!defaultContent) continue;
      if (!this.hasWindowContent(defaultContent)) {
        console.warn(`[Swill] window="${windowName}" has no content "${defaultContent}"`);
        continue;
      }
      container.appendChild(this.cloneWindowContent(defaultContent));
      if (contentName == null || requestedContent) container.setAttribute("name", defaultContent);
    }
  }
  registerLiveWindows(root, controllers) {
    for (const container of windowContainers(root)) {
      const name = container.getAttribute("window")?.trim();
      if (!name) continue;
      const controller = topControllerIn(container, controllers);
      this.windows.push({
        root: container,
        controller,
        name,
        contentName: container.getAttribute("name")?.trim() || void 0,
        savedFirstResponder: null,
        resolve: () => {
        }
      });
    }
  }
  windowContainer(name) {
    return this.rootElement.querySelector(`[window="${CSS.escape(name)}"]`);
  }
  hasWindowContent(name) {
    return this.windowTemplates.has(name) || this.capturedWindowContents.has(name);
  }
  cloneWindowContent(name) {
    const tpl = this.windowTemplates.get(name);
    if (tpl) return tpl.content.cloneNode(true);
    const captured = this.capturedWindowContents.get(name);
    if (captured) return captured.fragment.cloneNode(true);
    throw new Error(`Application: no window content template "${name}"`);
  }
  restoreWindowStates() {
    for (const entry of this.windows) {
      this.restoreWindowState(entry, { pruneStale: false, writeContent: true });
    }
  }
  restoreWindowState(entry, opts) {
    if (!entry.name) return;
    const staleKeys = this.disposeWindowRestoration(entry.name);
    const controller = entry.controller;
    const bindings2 = controller?.restorationBindings?.() ?? {};
    const keys = new Set(Object.keys(bindings2).map((key) => scopedFragmentKey(entry.name, key)));
    if (opts.writeContent && entry.contentName) {
      this.writeFragmentParam(entry.name, entry.contentName, "replace");
    }
    if (opts.pruneStale) {
      for (const key of staleKeys) {
        if (!keys.has(key)) this.writeFragmentParam(key, null, "replace");
      }
    }
    if (!controller || Object.keys(bindings2).length === 0) {
      this.windowRestoration.set(entry.name, { disposers: [], keys });
      return;
    }
    const params = fragmentParams();
    let restored = false;
    this.applyingFragmentState = true;
    try {
      for (const [key, path] of Object.entries(bindings2)) {
        const scopedKey = scopedFragmentKey(entry.name, key);
        if (!params.has(scopedKey)) continue;
        writePath(controller, path.split("."), params.get(scopedKey));
        restored = true;
      }
    } finally {
      this.applyingFragmentState = false;
    }
    controller.controllerDidRestore({ restored });
    const disposers = [];
    for (const [key, path] of Object.entries(bindings2)) {
      const scopedKey = scopedFragmentKey(entry.name, key);
      const segments = path.split(".");
      disposers.push(
        observePath(controller, segments, () => {
          if (this.applyingFragmentState) return;
          this.writeFragmentParam(scopedKey, fragmentValue(readPath(controller, segments)), "replace");
        })
      );
    }
    this.windowRestoration.set(entry.name, { disposers, keys });
  }
  finishWindowActivation() {
    for (const entry of this.windows) finishActivation(entry.root);
  }
  disposeWindowRestoration(windowName) {
    const existing = this.windowRestoration.get(windowName);
    if (!existing) return /* @__PURE__ */ new Set();
    for (const dispose of existing.disposers) dispose();
    this.windowRestoration.delete(windowName);
    return existing.keys;
  }
  installFragmentRouting() {
    if (globalThis.__fragmentRoutingInstalled) return;
    globalThis.__fragmentRoutingInstalled = true;
    const apply = () => {
      this.applyFragmentToWindows();
    };
    window.addEventListener("popstate", apply);
    window.addEventListener("hashchange", apply);
  }
  applyFragmentToWindows() {
    const params = fragmentParams();
    for (const entry of [...this.windows]) {
      if (!entry.name) continue;
      const requestedContent = params.get(entry.name)?.trim() || null;
      if (requestedContent && requestedContent !== entry.contentName && this.windowContainer(entry.name)) {
        if (this.hasWindowContent(requestedContent)) {
          void this.loadWindowContent(entry.name, requestedContent, { history: "none" });
        } else {
          console.warn(`[Swill] window="${entry.name}" requested unknown content "${requestedContent}"`);
        }
        continue;
      }
      this.restoreWindowState(entry, { pruneStale: false, writeContent: false });
    }
  }
  writeFragmentParam(key, value, mode) {
    if (mode === "none" || this.applyingFragmentState) return;
    writeFragmentParam(key, value, mode);
  }
  // ---- document-level listeners ----
  installFocusTracking() {
    if (globalThis.__focusTrackingInstalled) return;
    globalThis.__focusTrackingInstalled = true;
    document.addEventListener(
      "focusin",
      (e) => {
        const fe = e;
        syncFirstResponderFromFocus(fe.target, fe.relatedTarget);
      },
      { capture: true }
    );
    document.addEventListener(
      "focusout",
      (e) => {
        if (e.relatedTarget === null) {
          syncFirstResponderFromFocus(null);
        }
      },
      { capture: true }
    );
  }
  installKeyRouting() {
    if (globalThis.__keyRoutingInstalled) return;
    globalThis.__keyRoutingInstalled = true;
    document.addEventListener("keydown", (event) => {
      const target = event.target ?? document.activeElement;
      if (!target) return;
      firstResponderFor(target)?.keyDown(event);
    });
    document.addEventListener("keyup", (event) => {
      const target = event.target ?? document.activeElement;
      if (!target) return;
      firstResponderFor(target)?.keyUp(event);
    });
  }
  watchForChanges(root) {
    const observer = new MutationObserver((records) => {
      const added = [];
      for (const rec of records) {
        rec.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          for (const view of topViewsIn(n)) detachViewTree(view);
        });
        rec.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) added.push(n);
        });
      }
      if (added.length) {
        for (const el2 of added) wireSubtree(el2);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }
  installConsoleHooks() {
    const root = this.rootElement;
    Object.defineProperty(globalThis, "__controllers", {
      configurable: true,
      get: () => collectControllers(root)
    });
    Object.defineProperty(globalThis, "__root", {
      configurable: true,
      get: () => collectControllers(root).find((c) => !c.parent) ?? null
    });
    Object.defineProperty(globalThis, "__controllerFor", {
      configurable: true,
      value: (el2) => {
        if (typeof el2 === "string") {
          const found = root.querySelector(el2) ?? document.querySelector(el2);
          return found ? controllerFor(found) : null;
        }
        return controllerFor(el2);
      }
    });
    Object.defineProperty(globalThis, "__firstResponder", {
      configurable: true,
      get: () => currentFirstResponder()
    });
    Object.defineProperty(globalThis, "__application", {
      configurable: true,
      get: () => this
    });
  }
};

// src/core/dom.ts
function el(tagName, props, children) {
  const node = document.createElement(tagName);
  if (props) {
    for (const [name, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (name === "class") {
        node.className = String(value);
      } else if (name === "dataset" && isRecord(value)) {
        for (const [key, datasetValue] of Object.entries(value)) {
          if (datasetValue != null) node.dataset[key] = String(datasetValue);
        }
      } else if (name.startsWith("on") && typeof value === "function") {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (name in node) {
        node[name] = value === true ? true : value;
      } else if (value === true) {
        node.setAttribute(name, "");
      } else {
        node.setAttribute(name, String(value));
      }
    }
  }
  appendChildren(node, children);
  return node;
}
function appendChildren(parent, children = []) {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
function isRecord(value) {
  return typeof value === "object" && value != null;
}

// src/controllers/list.ts
var _selectedIndexes_dec, _representedObject_dec, _allowsMultipleSelection_dec, _rows_dec, _headerView_dec, _a, _List_decorators, _init, _representedObject, _selectedIndexes;
_List_decorators = [register];
var List = class extends (_a = Controller, _headerView_dec = [outlet({ optional: true })], _rows_dec = [outlet({ optional: true })], _allowsMultipleSelection_dec = [htmlAttribute("multiple", { value: true })], _representedObject_dec = [observable], _selectedIndexes_dec = [observable], _a) {
  constructor() {
    super(...arguments);
    /** `true` = real `View` per row; `false` = bare element (NSCell perf). */
    __publicField(this, "rowsAreViews", true);
    __publicField(this, "headerView", __runInitializers(_init, 16, this)), __runInitializers(_init, 19, this);
    __publicField(this, "rows", __runInitializers(_init, 20, this)), __runInitializers(_init, 23, this);
    __publicField(this, "allowsMultipleSelection", __runInitializers(_init, 24, this, false)), __runInitializers(_init, 27, this);
    /** Shift-click extends from this index; reset on plain click. */
    __publicField(this, "selectionAnchor", null);
    __publicField(this, "rowDisposers", /* @__PURE__ */ new WeakMap());
    __privateAdd(this, _representedObject, __runInitializers(_init, 8, this, [])), __runInitializers(_init, 11, this);
    __privateAdd(this, _selectedIndexes, __runInitializers(_init, 12, this, [])), __runInitializers(_init, 15, this);
  }
  // ---- selection convenience ----
  get selectedObjects() {
    return this.selectedIndexes.map((i) => this.arrangedObjects[i]).filter((x) => x !== void 0);
  }
  get selectedObject() {
    return this.selectedObjects[0] ?? null;
  }
  set selectedObject(o) {
    if (o == null) {
      this.selectedIndexes = [];
      return;
    }
    const i = this.arrangedObjects.indexOf(o);
    this.selectedIndexes = i >= 0 ? [i] : [];
  }
  selectFirstIfNothingSelected() {
    if (this.selectedObject != null || this.arrangedObjects.length === 0) return;
    this.selectedIndexes = [0];
  }
  /** Enter / dblclick hook. Default bubbles a target-action to the owner. */
  activateSelection() {
    this.nextResponder?.performAction("activateSelection", this);
  }
  // ---- lifecycle ----
  viewDidLoad() {
    super.viewDidLoad();
    this.view.element.tabIndex = this.view.element.tabIndex >= 0 ? this.view.element.tabIndex : 0;
    this.installRowDelegation();
  }
  awakeFromDOM() {
    super.awakeFromDOM();
    this.renderAll();
  }
  representedObjectDidChange(_prev, _next) {
    this.renderAll();
    this.selectedIndexes = [];
    this.selectionAnchor = null;
  }
  selectedIndexesDidChange(_prev, next) {
    const prevSelectedObject = this.objectAt(_prev[0]);
    const nextSelectedObject = this.objectAt(next[0]);
    const wanted = new Set(next);
    const els = this.rowElements();
    els.forEach((el2, i) => {
      const on = wanted.has(i);
      el2.classList.toggle("selected", on);
      el2.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (next.length > 0) {
      els[next[0]]?.scrollIntoView({ block: "nearest" });
    }
    if (!Object.is(prevSelectedObject, nextSelectedObject)) {
      const cb = this.selectedObjectDidChange;
      if (typeof cb === "function") cb.call(this, prevSelectedObject, nextSelectedObject);
    }
  }
  // ---- rendering ----
  /** Where rows mount: the `rows` outlet if present, else the list view. */
  get container() {
    return this.rows?.element ?? this.view.element;
  }
  get arrangedObjects() {
    return this.representedObject;
  }
  rowTemplateElement() {
    return this.view.element.querySelector(':scope > template[for="row"]');
  }
  /** The row element for `item`. Default clones `<template for="row">`;
   *  override to build in code (binding, selection, configureRow still run). */
  makeRowElement(_item) {
    const node = this.rowTemplateElement()?.content.firstElementChild?.cloneNode(true);
    if (!node) {
      console.warn(`[Swill] ${this.constructor.name}: no <template for="row"> and no makeRowElement override`);
      return document.createElement("div");
    }
    return node;
  }
  /** NSTableView `willDisplayCell:` analog. */
  configureRow(_el, _item) {
  }
  renderAll() {
    this.clearRows();
    for (const item of this.arrangedObjects) this.attachRow(item);
  }
  attachRow(item) {
    const el2 = this.makeRowElement(item);
    this.container.appendChild(el2);
    const disposeBindings = wireBindingsInto(item, el2, "");
    const disposeActions = wireActionsInto(this, el2);
    this.rowDisposers.set(el2, () => {
      disposeBindings();
      disposeActions();
    });
    if (this.rowsAreViews) {
      const rv = View.wrapping(el2);
      this.view.adoptSubview(rv);
    }
    this.configureRow(el2, item);
  }
  clearRows() {
    for (const child of Array.from(this.container.children)) {
      if (child instanceof HTMLTemplateElement) continue;
      if (!this.isRowElement(child)) continue;
      const rv = View.of(child);
      if (rv) {
        this.view.releaseSubview(rv);
      }
      this.rowDisposers.get(child)?.();
      this.rowDisposers.delete(child);
      child.remove();
    }
  }
  /** Override when subclasses inject non-row children into the container
   *  (e.g. `EditableList`'s inline editor). */
  isRowElement(_el) {
    return true;
  }
  objectAt(index) {
    return index == null ? null : this.arrangedObjects[index] ?? null;
  }
  // ---- row event delegation: click selects, dblclick activates ----
  installRowDelegation() {
    this.view.element.addEventListener("mousedown", (e) => {
      if (!this.allowsMultipleSelection || !e.shiftKey) return;
      if (this.indexOfEventTarget(e) < 0) return;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
    });
    this.view.element.addEventListener("click", (e) => {
      const idx = this.indexOfEventTarget(e);
      if (idx < 0) return;
      this.handleRowClick(idx, e);
    }, { capture: true });
    this.view.element.addEventListener("dblclick", (e) => {
      const idx = this.indexOfEventTarget(e);
      if (idx < 0) return;
      this.selectedIndexes = [idx];
      this.selectionAnchor = idx;
      this.activateSelection();
    });
  }
  handleRowClick(idx, e) {
    if (this.allowsMultipleSelection && e.shiftKey && this.selectionAnchor != null) {
      const a = this.selectionAnchor;
      const lo = Math.min(a, idx);
      const hi = Math.max(a, idx);
      const range = [];
      for (let i = lo; i <= hi; i++) range.push(i);
      this.selectedIndexes = range;
      return;
    }
    this.selectedIndexes = [idx];
    this.selectionAnchor = idx;
  }
  indexOfEventTarget(e) {
    let node = e.target;
    while (node && node !== this.container) {
      if (node.parentElement === this.container) return this.rowElements().indexOf(node);
      node = node.parentElement;
    }
    return -1;
  }
  /** Mounted row elements in order. Excludes templates and anything
   *  `isRowElement` rejects. */
  rowElements() {
    return Array.from(this.container.children).filter(
      (c) => c instanceof HTMLElement && !(c instanceof HTMLTemplateElement) && this.isRowElement(c)
    );
  }
  // ---- keyboard ----
  becomeFirstResponder() {
    const ok = super.becomeFirstResponder();
    if (!ok) return false;
    if (this.selectedIndexes.length === 0 && this.arrangedObjects.length > 0) {
      this.selectedIndexes = [0];
    }
    return true;
  }
  keyDown(event) {
    const total = this.arrangedObjects.length;
    if (total === 0) return super.keyDown(event);
    const cur = this.selectedIndexes[0] ?? -1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = cur < 0 ? 0 : Math.min(total - 1, cur + 1);
      this.selectedIndexes = [next];
    } else if (event.key === "ArrowUp") {
      if (cur <= 0) {
        event.preventDefault();
        this.cancelOperation(event);
        return;
      }
      event.preventDefault();
      this.selectedIndexes = [cur - 1];
    } else {
      super.keyDown(event);
    }
  }
  insertNewline(event) {
    if (this.selectedIndexes.length === 0) return super.insertNewline(event);
    event.preventDefault();
    this.activateSelection();
  }
};
_init = __decoratorStart(_a);
_representedObject = new WeakMap();
_selectedIndexes = new WeakMap();
__decorateElement(_init, 4, "representedObject", _representedObject_dec, List, _representedObject);
__decorateElement(_init, 4, "selectedIndexes", _selectedIndexes_dec, List, _selectedIndexes);
__decorateElement(_init, 5, "headerView", _headerView_dec, List);
__decorateElement(_init, 5, "rows", _rows_dec, List);
__decorateElement(_init, 5, "allowsMultipleSelection", _allowsMultipleSelection_dec, List);
List = __decorateElement(_init, 0, "List", _List_decorators, List);
__runInitializers(_init, 1, List);

// src/controllers/sortable_list.ts
var _sortStates_dec, _sortDir_dec, _sortKey_dec, _a2, _SortableList_decorators, _init2, _sortKey, _sortDir, _sortStates;
_SortableList_decorators = [register];
var SortableList = class extends (_a2 = List, _sortKey_dec = [observable], _sortDir_dec = [observable], _sortStates_dec = [observable], _a2) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _sortKey, __runInitializers(_init2, 8, this, null)), __runInitializers(_init2, 11, this);
    __privateAdd(this, _sortDir, __runInitializers(_init2, 12, this, "asc")), __runInitializers(_init2, 15, this);
    __privateAdd(this, _sortStates, __runInitializers(_init2, 16, this, {})), __runInitializers(_init2, 19, this);
    __publicField(this, "changingSort", false);
  }
  awakeFromDOM() {
    super.awakeFromDOM();
    this.sortStates = this.sortStateMap();
  }
  sortKeyDidChange() {
    this.sortDidChange();
  }
  sortDirDidChange() {
    this.sortDidChange();
  }
  get arrangedObjects() {
    const key = this.sortKey;
    if (!key) return this.representedObject;
    return [...this.representedObject].sort((a, b) => compareBy(a, b, key, this.sortDir));
  }
  sortBy(sender) {
    const key = this.sortKeyFor(sender);
    if (!key) return;
    this.toggleSort(key);
  }
  toggleSort(key) {
    const selected = this.selectedObject;
    this.changingSort = true;
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortKey = key;
      this.sortDir = "asc";
    }
    this.changingSort = false;
    this.sortDidChange();
    this.selectedObject = selected;
  }
  sortKeyFor(sender) {
    return sender.dataset.column ?? null;
  }
  sortDidChange() {
    if (this.changingSort) return;
    this.sortStates = this.sortStateMap();
    this.renderAll();
  }
  sortStateMap() {
    const states = {};
    const header = this.headerView?.element;
    if (!header || !this.sortKey) return states;
    header.querySelectorAll("[data-column]").forEach((el2) => {
      const key = el2.dataset.column;
      if (key === this.sortKey) states[key] = this.sortDir;
    });
    return states;
  }
};
_init2 = __decoratorStart(_a2);
_sortKey = new WeakMap();
_sortDir = new WeakMap();
_sortStates = new WeakMap();
__decorateElement(_init2, 4, "sortKey", _sortKey_dec, SortableList, _sortKey);
__decorateElement(_init2, 4, "sortDir", _sortDir_dec, SortableList, _sortDir);
__decorateElement(_init2, 4, "sortStates", _sortStates_dec, SortableList, _sortStates);
SortableList = __decorateElement(_init2, 0, "SortableList", _SortableList_decorators, SortableList);
__runInitializers(_init2, 1, SortableList);
function compareBy(a, b, key, dir) {
  const av = a[key];
  const bv = b[key];
  let cmp;
  if (av == null && bv == null) cmp = 0;
  else if (av == null) cmp = 1;
  else if (bv == null) cmp = -1;
  else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else if (typeof av === "boolean" && typeof bv === "boolean") cmp = (av ? 1 : 0) - (bv ? 1 : 0);
  else cmp = String(av).localeCompare(String(bv));
  return dir === "asc" ? cmp : -cmp;
}

// src/model/decorators.ts
function metaFor2(context) {
  return context.metadata;
}
function ensureOwnAttrMap(meta) {
  if (!Object.prototype.hasOwnProperty.call(meta, "attrs")) {
    meta.attrs = new Map(meta.attrs ?? []);
  }
  return meta.attrs;
}
var SYMBOL_METADATA3 = Symbol.metadata ?? /* @__PURE__ */ Symbol.for("Symbol.metadata");
function attrDescriptorsOf(instance) {
  const meta = instance.constructor?.[SYMBOL_METADATA3];
  return meta?.attrs ? [...meta.attrs.values()] : [];
}
function relationshipDescriptorOf(instance, name) {
  const meta = instance.constructor?.[SYMBOL_METADATA3];
  return meta?.relationships?.get(name) ?? null;
}
function relationshipDescriptorsOf(instance) {
  const meta = instance.constructor?.[SYMBOL_METADATA3];
  return meta?.relationships ? [...meta.relationships.values()] : [];
}
function attr(targetOrOptions, context) {
  if (context) {
    return decorateAttr(targetOrOptions, context, {});
  }
  const options = targetOrOptions;
  return (target, context2) => decorateAttr(target, context2, options);
}
function decorateAttr(target, context, options) {
  const name = String(context.name);
  ensureOwnAttrMap(metaFor2(context)).set(name, { name, key: options.key ?? name });
  const callbackName = `${name}DidChange`;
  const validateName = `validate${name[0].toUpperCase()}${name.slice(1)}`;
  return {
    get() {
      return target.get.call(this);
    },
    set(value) {
      const prev = target.get.call(this);
      const validator = this[validateName];
      if (typeof validator === "function") {
        try {
          const coerced = validator.call(this, value, prev);
          if (coerced !== void 0) value = coerced;
        } catch (err) {
          console.warn(
            `[model] ${this.constructor.name}.${name} rejected: ${err.message}`
          );
          return;
        }
      }
      target.set.call(this, value);
      this.markDirty(name, prev, value);
      const cb = this[callbackName];
      if (typeof cb === "function") cb.call(this, prev, value);
    }
  };
}

// src/model/store.ts
var ModelStore = class {
  instances = /* @__PURE__ */ new Map();
  get(id) {
    return this.instances.get(id) ?? null;
  }
  has(id) {
    return this.instances.has(id);
  }
  /**
   * Pool an instance by its id. If an instance with the same id is
   * already pooled, the pooled one wins: its attributes are updated
   * from the incoming object and the pooled instance is returned. This
   * keeps a single canonical instance per record so observers see one
   * source of truth.
   */
  put(instance) {
    if (instance.id == null) throw new Error("ModelStore.put requires an id");
    const existing = this.instances.get(instance.id);
    if (existing && existing !== instance) {
      existing.applyAttributesFrom(instance);
      return existing;
    }
    this.instances.set(instance.id, instance);
    return instance;
  }
  remove(id) {
    this.instances.delete(id);
  }
  clear() {
    this.instances.clear();
  }
  values() {
    return this.instances.values();
  }
};

// src/model/codec.ts
function codecFor(cls) {
  return cls.codec ?? jsonApiCodec();
}
function jsonApiCodec() {
  return requireJsonApiCodec();
}
var cachedJsonApiCodec = null;
function requireJsonApiCodec() {
  if (cachedJsonApiCodec) return cachedJsonApiCodec;
  throw new Error("jsonApiCodec has not been installed");
}
function installDefaultCodec(codec) {
  cachedJsonApiCodec = codec;
}

// src/model/jsonapi.ts
function lookupModelType(type) {
  for (const cls of registeredClasses()) {
    if (cls.type === type) {
      return cls;
    }
  }
  return null;
}
function parseJsonApi(cls, doc) {
  const resources = [
    ...doc.included ?? [],
    ...doc.data == null ? [] : Array.isArray(doc.data) ? doc.data : [doc.data]
  ];
  if (doc.included) {
    for (const r of doc.included) instantiateOrRefresh(r);
  }
  if (doc.data != null) {
    for (const r of Array.isArray(doc.data) ? doc.data : [doc.data]) instantiateOrRefresh(r);
  }
  for (const r of resources) hydrateRelationships(r);
  if (doc.data == null) return null;
  if (Array.isArray(doc.data)) return doc.data.map((r) => findPooledResource(r));
  return findPooledResource(doc.data);
}
var jsonApiCodec2 = {
  parseOne(cls, payload) {
    const result = parseJsonApi(cls, payload);
    if (Array.isArray(result)) {
      throw new Error("expected single JSON:API resource");
    }
    return result;
  },
  parseMany(cls, payload) {
    const result = parseJsonApi(cls, payload);
    if (!Array.isArray(result)) {
      throw new Error("expected JSON:API collection");
    }
    return result;
  },
  serialize(instance, options) {
    return serializeModel(instance, options);
  }
};
installDefaultCodec(jsonApiCodec2);
function instantiateOrRefresh(resource) {
  const cls = lookupModelType(resource.type);
  if (!cls) {
    console.warn(`[model] no class registered for type "${resource.type}"`);
    return null;
  }
  if (resource.id == null) {
    console.warn(`[model] response resource missing id (type=${resource.type})`);
    return null;
  }
  const store = modelStoreFor(cls);
  let instance = store.get(resource.id);
  if (!instance) {
    instance = new cls();
    instance.id = resource.id;
  }
  if (resource.attributes) {
    instance.applyAttributesFrom(resource.attributes);
  }
  if (resource.relationships) {
    instance._relationships = resource.relationships;
  }
  store.put(instance);
  return instance;
}
function findPooledResource(resource) {
  const cls = lookupModelType(resource.type);
  if (!cls || resource.id == null) return null;
  return modelStoreFor(cls).get(resource.id) ?? null;
}
function hydrateRelationships(resource) {
  const instance = findPooledResource(resource);
  if (!instance || !resource.relationships) return;
  for (const descriptor of relationshipDescriptorsOf(instance)) {
    const linkage = resource.relationships[descriptor.key] ?? resource.relationships[descriptor.name];
    if (!linkage) continue;
    if (descriptor.kind === "hasOne") {
      if (Array.isArray(linkage.data)) continue;
      if (linkage.data == null) {
        instance[descriptor.name] = null;
        instance.markRelationshipLoaded(descriptor.name);
        continue;
      }
      const related2 = findPooledResource(linkage.data);
      if (!related2) continue;
      instance[descriptor.name] = related2;
      instance.markRelationshipLoaded(descriptor.name);
      continue;
    }
    if (!Array.isArray(linkage.data)) continue;
    const related = linkage.data.map(findPooledResource).filter((m) => m != null);
    if (related.length !== linkage.data.length) continue;
    instance[descriptor.name] = related;
    instance.markRelationshipLoaded(descriptor.name);
  }
}
function serializeModel(instance, options = { dirtyOnly: true }) {
  const ctor = instance.constructor;
  const dirty = options.dirtyOnly ? new Set(instance.dirty) : null;
  const filtered = {};
  for (const attr2 of attrDescriptorsOf(instance)) {
    if (dirty == null || dirty.has(attr2.name)) {
      filtered[attr2.key] = instance[attr2.name];
    }
  }
  return {
    data: {
      type: ctor.type,
      ...instance.id != null ? { id: instance.id } : {},
      attributes: filtered
    }
  };
}

// src/model/transport.ts
var config = {
  /** Prefix prepended to every model class's `url`. */
  baseUrl: "",
  /** Headers sent with every request. */
  headers: {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json"
  }
};
async function request(method, url, body, headers = {}) {
  const init = { method, headers: { ...config.headers, ...headers } };
  if (body === void 0) delete init.headers["Content-Type"];
  if (body instanceof URLSearchParams) {
    init.body = body.toString();
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (body !== void 0) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(requestUrl(url), init);
  if (!res.ok) {
    throw new Error(`${method} ${url} \u2192 ${res.status}`);
  }
  return res;
}
function requestUrl(url) {
  return /^https?:\/\//.test(url) ? url : config.baseUrl + url;
}
async function readJson(res) {
  if (res.status === 204) return { data: null };
  return await res.json();
}
async function fetchOne(cls, id, params = new URLSearchParams()) {
  const qs = params.toString();
  const url = `${cls.url}/${encodeURIComponent(String(id))}${qs ? `?${qs}` : ""}`;
  return fetchOneFrom(cls, url);
}
async function fetchOneFrom(cls, url, codec = codecFor(cls)) {
  const res = await request("GET", url);
  const payload = await readJson(res);
  const result = codec.parseOne(cls, payload);
  if (result == null) {
    throw new Error(`expected single resource at ${url}`);
  }
  return result;
}
async function fetchAllFrom(cls, url, params = new URLSearchParams(), codec = codecFor(cls)) {
  const qs = params.toString();
  const requestUrl2 = `${url}${qs ? `?${qs}` : ""}`;
  const res = await request("GET", requestUrl2);
  const payload = await readJson(res);
  return codec.parseMany(cls, payload);
}
async function updateOne(instance) {
  if (instance.id == null) throw new Error("updateOne requires an id");
  const ctor = instance.constructor;
  const url = `${ctor.url}/${encodeURIComponent(String(instance.id))}`;
  const codec = codecFor(ctor);
  const body = serializeWith(codec, instance, { dirtyOnly: true });
  const res = await request("PATCH", url, body);
  const payload = await readJson(res);
  const result = codec.parseOne(ctor, payload);
  if (result == null) {
    throw new Error(`expected single resource from PATCH ${url}`);
  }
  return result;
}
async function createOne(instance) {
  const ctor = instance.constructor;
  const url = ctor.url;
  const codec = codecFor(ctor);
  const body = serializeWith(codec, instance, { dirtyOnly: false });
  const res = await request("POST", url, body);
  const payload = await readJson(res);
  const result = codec.parseOne(ctor, payload);
  if (result == null) {
    throw new Error(`expected single resource from POST ${url}`);
  }
  return result;
}
async function deleteOne(instance) {
  if (instance.id == null) return;
  const ctor = instance.constructor;
  const url = `${ctor.url}/${encodeURIComponent(String(instance.id))}`;
  await request("DELETE", url);
}
function serializeWith(codec, instance, options) {
  if (!codec.serialize) {
    throw new Error(`${instance.constructor.name} codec does not support serialization`);
  }
  return codec.serialize(instance, options);
}

// src/model/model.ts
var Model = class _Model {
  id = null;
  // Server-provided relationship pointers, keyed by relation name. Inert
  // until HasOne/HasMany wrappers consume them in a later step. Public for
  // the parser; not part of the user API.
  _relationships;
  // ---- dirty tracking ----
  _baseline = {};
  _dirty = /* @__PURE__ */ new Set();
  _suspendDirty = 0;
  _loadedRelationships = /* @__PURE__ */ new Set();
  /** Called by @attr setters. Records the first pre-edit value so a
   * mutation followed by un-mutation clears the dirty mark. */
  markDirty(name, prev, next) {
    if (this._suspendDirty > 0) return;
    const prevDirty = this.dirty;
    const prevIsDirty = this.isDirty;
    if (!this._dirty.has(name)) {
      if (Object.is(prev, next)) return;
      this._dirty.add(name);
      this._baseline[name] = prev;
    } else if (Object.is(this._baseline[name], next)) {
      this._dirty.delete(name);
      delete this._baseline[name];
    }
    this.notifyDirtyChanged(prevDirty, prevIsDirty);
  }
  get dirty() {
    return [...this._dirty];
  }
  get isDirty() {
    return this._dirty.size > 0;
  }
  notifyDirtyChanged(prevDirty, prevIsDirty) {
    const nextDirty = this.dirty;
    if (!sameStrings(prevDirty, nextDirty)) {
      const cb = this.dirtyDidChange;
      if (typeof cb === "function") cb.call(this, prevDirty, nextDirty);
    }
    if (prevIsDirty !== this.isDirty) {
      const cb = this.isDirtyDidChange;
      if (typeof cb === "function") cb.call(this, prevIsDirty, this.isDirty);
    }
  }
  clearDirty() {
    const prevDirty = this.dirty;
    const prevIsDirty = this.isDirty;
    this._dirty.clear();
    this._baseline = {};
    this.notifyDirtyChanged(prevDirty, prevIsDirty);
  }
  // ---- attribute access (used by JSON:API parse / serialize) ----
  /** Apply attributes from a plain object (server response) to this
   * instance, bypassing dirty tracking. */
  applyAttributesFrom(other) {
    const source = other instanceof _Model ? other.collectAttributes() : other;
    const attrs = attrDescriptorsOf(this);
    this._suspendDirty++;
    try {
      for (const attr2 of attrs) {
        if (Object.prototype.hasOwnProperty.call(source, attr2.key)) {
          this[attr2.name] = source[attr2.key];
        } else if (Object.prototype.hasOwnProperty.call(source, attr2.name)) {
          this[attr2.name] = source[attr2.name];
        }
      }
    } finally {
      this._suspendDirty--;
    }
  }
  /** Build a plain object of @attr values for serialization. */
  collectAttributes() {
    const out = {};
    for (const attr2 of attrDescriptorsOf(this)) out[attr2.key] = this[attr2.name];
    return out;
  }
  // ---- read ----
  static async find(id, options = {}) {
    const cached = modelStoreFor(this).get(id);
    if (cached && !options.reload) return cached;
    return await fetchOne(this, id, options.params);
  }
  static async findAll(options = {}) {
    const url = options.url ?? this.url;
    return await fetchAllFrom(this, url, options.params, options.codec);
  }
  async loadHasMany(name, options = {}) {
    const existing = this[name];
    if (!options.reload && this.hasLoadedRelationship(name) && Array.isArray(existing)) {
      return existing;
    }
    const descriptor = relationshipDescriptorOf(this, name);
    if (!descriptor || descriptor.kind !== "hasMany") {
      throw new Error(`${this.constructor.name}.${name} is not a hasMany relationship`);
    }
    const cls = descriptor.type();
    const url = options.url ?? descriptor.url?.(this);
    if (!url) {
      throw new Error(`${this.constructor.name}.${name} has no relationship URL`);
    }
    const values = await fetchAllFrom(cls, url);
    this[name] = values;
    this.markRelationshipLoaded(name);
    return values;
  }
  async loadHasOne(name, options = {}) {
    const existing = this[name];
    if (!options.reload && this.hasLoadedRelationship(name)) {
      return existing;
    }
    const descriptor = relationshipDescriptorOf(this, name);
    if (!descriptor || descriptor.kind !== "hasOne") {
      throw new Error(`${this.constructor.name}.${name} is not a hasOne relationship`);
    }
    const cls = descriptor.type();
    const url = options.url ?? descriptor.url?.(this);
    if (!url) {
      throw new Error(`${this.constructor.name}.${name} has no relationship URL`);
    }
    const value = await fetchOneFrom(cls, url);
    this[name] = value;
    this.markRelationshipLoaded(name);
    return value;
  }
  hasLoadedRelationship(name) {
    return this._loadedRelationships.has(name);
  }
  markRelationshipLoaded(name) {
    this._loadedRelationships.add(name);
  }
  // ---- write ----
  /** PATCH (or POST if no id) sending only dirty attributes. Server response
   * is applied back to this instance and the dirty set is cleared. */
  async save() {
    const ctor = this.constructor;
    if (this.id == null) {
      const created = await createOne(this);
      if (created !== this) this.applyAttributesFrom(created);
      this.id = created.id;
      modelStoreFor(ctor).put(this);
    } else if (this.isDirty) {
      const updated = await updateOne(this);
      if (updated !== this) this.applyAttributesFrom(updated);
    }
    this.clearDirty();
    return this;
  }
  /** DELETE on the server, then remove from the pool. */
  async delete() {
    const ctor = this.constructor;
    await deleteOne(this);
    if (this.id != null) modelStoreFor(ctor).remove(this.id);
  }
  /** Force a re-fetch from the server; updates this instance and the pool. */
  async reload(params) {
    if (this.id == null) throw new Error("reload requires an id");
    const ctor = this.constructor;
    await fetchOne(ctor, this.id, params);
    return this;
  }
  /** Cross-field validation (Cocoa: validateForUpdate:). Override to return
   * an Error when fields are individually valid but the combination is not
   * (e.g. `watched_at` set with `watched=false`). The EditableListController
   * consults this before saving. Return undefined to allow the save. */
  validate() {
    return void 0;
  }
  /** Produce an editing buffer: a fresh instance carrying the same id and
   * a copy of all @attr values, intentionally NOT registered in the pool.
   * Mutations on the draft mark *its* dirty set; `draft.save()` PATCHes the
   * server using the draft's id, then propagates the response onto the
   * pooled instance (firing its `*DidChange` callbacks). The draft itself
   * is single-use and can be discarded. */
  draft() {
    const ctor = this.constructor;
    const d = new ctor();
    d.id = this.id;
    d.applyAttributesFrom(this);
    return d;
  }
  // ---- bindings ----
  /**
   * Cocoa `bind:toObject:withKeyPath:options:`. Keep `this[targetKey]` in
   * sync with `source.sourcePath`. Unlike a Controller, a Model has no
   * detach lifecycle — call `unbind` explicitly when done.
   */
  bind(targetKey, source, sourcePath, options) {
    bind(this, targetKey, source, sourcePath, options);
  }
  /** Cocoa `unbind:`. Tear down the binding for `targetKey`. */
  unbind(targetKey) {
    unbind(this, targetKey);
  }
};
function modelStoreFor(cls) {
  if (!Object.prototype.hasOwnProperty.call(cls, "store") || cls.store == null) {
    cls.store = new ModelStore();
  }
  return cls.store;
}
function sameStrings(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// src/controllers/editable_list.ts
var _editedObject_dec, _a3, _init3, _editedObject;
var EditableList = class extends (_a3 = SortableList, _editedObject_dec = [observable], _a3) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _editedObject, __runInitializers(_init3, 8, this, null)), __runInitializers(_init3, 11, this);
    __publicField(this, "editor", null);
    __publicField(this, "editingIndex", null);
  }
  editorTemplateElement() {
    return this.view.element.querySelector(':scope > template[for="editor"]');
  }
  // Default activation = open the editor for the selected row.
  activateSelection() {
    const idx = this.selectedIndexes[0];
    if (idx == null) return;
    this.beginEditing(idx);
  }
  isEditing() {
    return this.editor !== null;
  }
  beginEditing(index) {
    if (this.editor) void this.endEditing(true);
    const original = this.arrangedObjects[index];
    let editedObject;
    if (original instanceof Model) {
      editedObject = original.draft();
    } else if (original && typeof original === "object") {
      editedObject = { ...original };
    } else {
      editedObject = original ?? null;
    }
    this.openEditor(index, editedObject);
  }
  // Mount the editor view. Used for fresh edits AND for re-entering edit
  // mode after a save failure (the same draft is preserved).
  openEditor(index, editedObject) {
    const tpl = this.editorTemplateElement();
    if (!tpl) {
      console.warn(`[Swill] ${this.constructor.name}: no <template for="editor"> inside the list view`);
      return;
    }
    const node = tpl.content.firstElementChild?.cloneNode(true);
    if (!node) return;
    const rowEl = this.rowElements()[index];
    if (!rowEl) return;
    this.editedObject = editedObject;
    rowEl.classList.add("being-edited");
    rowEl.after(node);
    wireSubtree(node);
    const editor = controllerFor(node);
    editor.bind("representedObject", this, "editedObject");
    makeFirstResponder(editor);
    this.editor = editor;
    this.editingIndex = index;
  }
  /** Returns false only when a commit was refused (validation or save). */
  async endEditing(commit) {
    const editor = this.editor;
    const idx = this.editingIndex;
    if (!editor || idx == null) return true;
    let editedObject;
    if (commit) {
      editedObject = editor.commit();
      if (editedObject instanceof Model) {
        const error = editedObject.validate();
        if (error) {
          this.editingDidFailValidation(error);
          return false;
        }
      }
    } else {
      editor.discard();
      editedObject = null;
    }
    this.editor = null;
    this.editingIndex = null;
    this.editedObject = null;
    editor._destroyView();
    if (editedObject == null) {
      const row = this.rowElements()[idx];
      row?.classList.remove("being-edited");
      makeFirstResponder(this);
      return true;
    }
    let final;
    if (editedObject instanceof Model) {
      try {
        await editedObject.save();
      } catch (err) {
        this.editingDidFailSave(err);
        this.openEditor(idx, editedObject);
        return false;
      }
      const ctor = editedObject.constructor;
      final = editedObject.id != null ? ctor.store?.get(editedObject.id) ?? editedObject : editedObject;
    } else {
      final = editedObject;
    }
    const original = this.arrangedObjects[idx];
    if (original === void 0) return true;
    const sourceIndex = this.representedObject.indexOf(original);
    const arr = [...this.representedObject];
    if (sourceIndex >= 0) arr[sourceIndex] = final;
    this.representedObject = arr;
    this.selectedObject = final;
    makeFirstResponder(this);
    return true;
  }
  /** NSEditor `commitEditing:` query. Call before any action that can't
   *  proceed past in-progress edits. */
  async commitEditingIfNeeded() {
    if (!this.editor) return true;
    return this.endEditing(true);
  }
  /** Default: prompt, validate, commit. Return false to refuse the focus
   *  transition (DOM focus snaps back to the editor). */
  editorShouldEndEditing(editor) {
    const obj = editor.commit();
    if (!this.editedObjectHasChanges(obj)) {
      void this.endEditing(false);
      return true;
    }
    if (!window.confirm("Save changes?")) return false;
    if (obj instanceof Model) {
      const error = obj.validate();
      if (error) {
        this.editingDidFailValidation(error);
        return false;
      }
    }
    void this.endEditing(true);
    return true;
  }
  editedObjectHasChanges(obj) {
    if (obj instanceof Model) return obj.isDirty;
    return obj != null;
  }
  /** Override to surface validation errors in the UI. */
  editingDidFailValidation(error) {
    console.warn(`[edit] ${this.constructor.name}: ${error.message}`);
  }
  /** Override to surface save errors. Editor has been re-mounted with
   *  the draft by the time this fires. */
  editingDidFailSave(error) {
    console.error(`[edit] ${this.constructor.name}: save failed`, error);
  }
  cancelOperation(event) {
    if (this.editor) {
      void this.endEditing(false);
      return;
    }
    super.cancelOperation(event);
  }
  // The editor view lives in the rows container while editing; exclude it.
  isRowElement(el2) {
    return super.isRowElement(el2) && el2 !== this.editor?.view.element;
  }
};
_init3 = __decoratorStart(_a3);
_editedObject = new WeakMap();
__decorateElement(_init3, 4, "editedObject", _editedObject_dec, EditableList, _editedObject);
__decoratorMetadata(_init3, EditableList);

// src/controllers/editor.ts
var _representedObject_dec2, _a4, _Editor_decorators, _init4, _representedObject2;
_Editor_decorators = [register];
var Editor = class extends (_a4 = Controller, _representedObject_dec2 = [observable], _a4) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _representedObject2, __runInitializers(_init4, 8, this, null)), __runInitializers(_init4, 11, this);
  }
  bindingRoot() {
    return "representedObject";
  }
  /** Default returns `representedObject` as-is — two-way bindings have
   *  already mutated it. Override for coercion. */
  commit() {
    return this.representedObject;
  }
  discard() {
  }
  insertNewline(_event) {
    this.commit();
  }
  cancelOperation(_event) {
    this.discard();
  }
};
_init4 = __decoratorStart(_a4);
_representedObject2 = new WeakMap();
__decorateElement(_init4, 4, "representedObject", _representedObject_dec2, Editor, _representedObject2);
Editor = __decorateElement(_init4, 0, "Editor", _Editor_decorators, Editor);
__runInitializers(_init4, 1, Editor);

// src/controls/control.ts
var Control = class extends View {
  delegate;
  resignFirstResponder(next = null) {
    if (this.delegate?.controlShouldResignFirstResponder?.(this, next) === false) {
      return false;
    }
    return super.resignFirstResponder(next);
  }
};

// src/controls/custom_select.ts
var _value_dec, _options_dec, _a5, _CustomSelect_decorators, _init5, _options, _value;
_CustomSelect_decorators = [register];
var CustomSelect = class extends (_a5 = Control, _options_dec = [observable], _value_dec = [observable], _a5) {
  constructor(el2) {
    super(el2);
    __privateAdd(this, _options, __runInitializers(_init5, 8, this, [])), __runInitializers(_init5, 11, this);
    __privateAdd(this, _value, __runInitializers(_init5, 12, this, "")), __runInitializers(_init5, 15, this);
    __publicField(this, "button");
    __publicField(this, "buttonIconEl");
    __publicField(this, "labelEl");
    __publicField(this, "popup");
    __publicField(this, "isOpen", false);
    __publicField(this, "onDocumentPointerDown", (event) => {
      if (!this.element.contains(event.target)) this.close();
    });
    this.installChrome();
    this.renderOptions();
    this.close(true);
  }
  optionsDidChange() {
    this.renderOptions();
  }
  valueDidChange(_prev, _next) {
    this.syncButton();
    this.syncSelectedOption();
  }
  cancelOperation(event) {
    if (!this.isOpen) return super.cancelOperation(event);
    event.preventDefault();
    this.close();
  }
  keyDown(event) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!this.isOpen) return;
        this.moveSelection(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!this.isOpen) return;
        this.moveSelection(-1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        this.toggle();
        return;
      default:
        super.keyDown(event);
    }
  }
  installChrome() {
    this.element.classList.add("custom-select");
    this.element.tabIndex = 0;
    this.element.setAttribute("role", "combobox");
    this.element.setAttribute("aria-haspopup", "listbox");
    this.element.innerHTML = "";
    this.buttonIconEl = el("span", {
      class: "custom-select-trigger-icon",
      ariaHidden: "true"
    });
    this.labelEl = el("span", { class: "custom-select-label" });
    this.button = el(
      "button",
      {
        type: "button",
        class: "custom-select-button",
        tabIndex: -1,
        onclick: (event) => {
          if (event.detail === 0) return;
          this.toggle();
        }
      },
      [this.buttonIconEl, this.labelEl]
    );
    this.element.addEventListener("focusout", (event) => {
      const next = event.relatedTarget;
      if (!next || !this.element.contains(next)) this.close();
    });
    this.popup = el("div", { class: "custom-select-popup", role: "listbox" });
    this.element.append(this.button, this.popup);
  }
  renderOptions() {
    this.popup.innerHTML = "";
    for (const option of this.allOptions()) {
      this.popup.appendChild(this.optionElement(option));
    }
    this.syncButton();
    this.syncSelectedOption();
  }
  optionElement(option) {
    return el(
      "button",
      {
        type: "button",
        class: "custom-select-option",
        role: "option",
        tabIndex: -1,
        dataset: { value: option.value },
        onclick: () => {
          this.setValueFromUser(option.value);
          this.close();
        }
      },
      [
        option.icon ? el("span", {
          class: `custom-select-icon icon-${option.icon}`,
          ariaHidden: "true"
        }) : null,
        el("span", { class: "custom-select-option-text" }, [
          el("span", { class: "custom-select-option-label" }, option.label),
          option.description ? el("span", { class: "custom-select-option-description" }, option.description) : null
        ])
      ]
    );
  }
  allOptions() {
    return this.options;
  }
  selectedOption() {
    return this.allOptions().find((option) => option.value === this.value) ?? null;
  }
  syncButton() {
    const option = this.selectedOption();
    this.buttonIconEl.className = option?.icon ? `custom-select-trigger-icon icon-${option.icon}` : "custom-select-trigger-icon";
    this.buttonIconEl.hidden = !option?.icon;
    this.labelEl.textContent = option?.label ?? "";
  }
  syncSelectedOption() {
    for (const row of Array.from(this.popup.querySelectorAll("[role='option']"))) {
      const selected = row.dataset.value === this.value;
      row.setAttribute("aria-selected", selected ? "true" : "false");
    }
  }
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.element.classList.add("open");
    this.element.setAttribute("aria-expanded", "true");
    this.button.setAttribute("aria-expanded", "true");
    this.popup.hidden = false;
    document.addEventListener("pointerdown", this.onDocumentPointerDown);
  }
  close(force = false) {
    if (!force && !this.isOpen) return;
    this.isOpen = false;
    this.element.classList.remove("open");
    this.element.setAttribute("aria-expanded", "false");
    this.button.setAttribute("aria-expanded", "false");
    this.popup.hidden = true;
    document.removeEventListener("pointerdown", this.onDocumentPointerDown);
  }
  moveSelection(delta) {
    const options = this.allOptions();
    if (options.length === 0) return;
    const current = options.findIndex((option) => option.value === this.value);
    const next = current < 0 ? 0 : (current + delta + options.length) % options.length;
    this.setValueFromUser(options[next].value);
  }
  setValueFromUser(value) {
    if (this.value === value) return;
    this.value = value;
    this.element.dispatchEvent(new Event("input", { bubbles: true }));
    this.element.dispatchEvent(new Event("change", { bubbles: true }));
  }
};
_init5 = __decoratorStart(_a5);
_options = new WeakMap();
_value = new WeakMap();
__decorateElement(_init5, 4, "options", _options_dec, CustomSelect, _options);
__decorateElement(_init5, 4, "value", _value_dec, CustomSelect, _value);
CustomSelect = __decorateElement(_init5, 0, "CustomSelect", _CustomSelect_decorators, CustomSelect);
__runInitializers(_init5, 1, CustomSelect);

// src/controls/select.ts
var _value_dec2, _options_dec2, _a6, _Select_decorators, _init6, _options2, _value2;
_Select_decorators = [register];
var Select = class extends (_a6 = Control, _options_dec2 = [observable], _value_dec2 = [observable], _a6) {
  constructor(el2) {
    super(el2);
    __privateAdd(this, _options2, __runInitializers(_init6, 8, this, [])), __runInitializers(_init6, 11, this);
    __privateAdd(this, _value2, __runInitializers(_init6, 12, this, "")), __runInitializers(_init6, 15, this);
    __publicField(this, "templateOptionCount", 0);
    __publicField(this, "onChange", () => {
      this.value = this.selectEl.value;
    });
    this.templateOptionCount = this.selectEl.options.length;
    this.selectEl.addEventListener("change", this.onChange);
  }
  optionsDidChange(_prev, next) {
    const sel = this.selectEl;
    while (sel.options.length > this.templateOptionCount) {
      sel.remove(this.templateOptionCount);
    }
    for (const v of next) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
    if (this.value && Array.from(sel.options).some((o) => o.value === this.value)) {
      sel.value = this.value;
    }
  }
  valueDidChange(_prev, next) {
    if (this.selectEl.value !== next) this.selectEl.value = next;
  }
  get selectEl() {
    return this.element;
  }
};
_init6 = __decoratorStart(_a6);
_options2 = new WeakMap();
_value2 = new WeakMap();
__decorateElement(_init6, 4, "options", _options_dec2, Select, _options2);
__decorateElement(_init6, 4, "value", _value_dec2, Select, _value2);
Select = __decorateElement(_init6, 0, "Select", _Select_decorators, Select);
__runInitializers(_init6, 1, Select);

// src/controls/text_field.ts
var _value_dec3, _a7, _init7, _value3;
var TextField = class extends (_a7 = Control, _value_dec3 = [observable], _a7) {
  constructor(el2) {
    super(el2);
    __privateAdd(this, _value3, __runInitializers(_init7, 8, this, "")), __runInitializers(_init7, 11, this);
    __publicField(this, "onInput", (e) => {
      const t = e.target;
      if (t === this.inputElement && t.value !== this.value) this.value = t.value;
    });
    const input = this.inputElement;
    if (input) {
      if (input.value !== this.value) this.value = input.value;
      input.addEventListener("input", this.onInput);
    }
  }
  get inputElement() {
    const el2 = this.element;
    if (el2 instanceof HTMLInputElement) return el2;
    return el2.querySelector("input");
  }
  valueDidChange(_prev, next) {
    const input = this.inputElement;
    if (input && input.value !== next) input.value = next;
  }
};
_init7 = __decoratorStart(_a7);
_value3 = new WeakMap();
__decorateElement(_init7, 4, "value", _value_dec3, TextField, _value3);
__decoratorMetadata(_init7, TextField);

// src/model/plain_json.ts
var plainJsonCodec = {
  parseOne(cls, payload) {
    if (payload == null) return null;
    if (Array.isArray(payload) || typeof payload !== "object") {
      throw new Error("expected plain JSON object");
    }
    return instantiateOrRefresh2(cls, payload);
  },
  parseMany(cls, payload) {
    if (!Array.isArray(payload)) throw new Error("expected plain JSON array");
    return payload.map((item) => this.parseOne(cls, item)).filter((item) => item != null);
  },
  serialize(model, options) {
    const dirty = options.dirtyOnly ? new Set(model.dirty) : null;
    const out = {};
    for (const attr2 of attrDescriptorsOf(model)) {
      if (dirty == null || dirty.has(attr2.name)) out[attr2.key] = model[attr2.name];
    }
    return out;
  }
};
function instantiateOrRefresh2(cls, payload) {
  const id = payload.id;
  const store = modelStoreFor(cls);
  const existing = isModelId(id) ? store.get(id) : null;
  const instance = existing ?? new cls();
  instance.id = isModelId(id) ? id : null;
  instance.applyAttributesFrom(payload);
  if (instance.id != null) store.put(instance);
  return instance;
}
function isModelId(value) {
  return typeof value === "string" || typeof value === "number";
}

// src/core/slop_object_browser.ts
var _pathField_dec, _columns_dec, _a8, _ObjectBrowser_decorators, _init8;
_ObjectBrowser_decorators = [register];
var ObjectBrowser = class extends (_a8 = Controller, _columns_dec = [outlet], _pathField_dec = [outlet], _a8) {
  constructor() {
    super(...arguments);
    __publicField(this, "columns", __runInitializers(_init8, 8, this)), __runInitializers(_init8, 11, this);
    __publicField(this, "pathField", __runInitializers(_init8, 12, this)), __runInitializers(_init8, 15, this);
    __publicField(this, "selectedPath", []);
    __publicField(this, "rootNodes", []);
  }
  awakeFromDOM() {
    this.rootNodes = this.makeRoots();
    this.render();
  }
  refresh() {
    this.rootNodes = this.makeRoots();
    this.render();
  }
  close() {
    Application.shared.dismiss(this);
  }
  cancelOperation(_event) {
    Application.shared.dismiss(this);
  }
  makeRoots() {
    return [
      { name: "Application", value: Application.shared, path: ["Application"] },
      { name: "Controllers", value: collectControllers(document.body), path: ["Controllers"] },
      { name: "Registered Classes", value: registeredClassesByName(), path: ["Registered Classes"] },
      { name: "First Responder", value: currentFirstResponder(), path: ["First Responder"] },
      { name: "Document Body", value: document.body, path: ["Document Body"] }
    ];
  }
  render() {
    const columns = [this.rootNodes];
    let nodes = this.rootNodes;
    let current = null;
    for (let i = 0; i < this.selectedPath.length; i++) {
      current = nodes.find((node) => samePart(node.path[node.path.length - 1], this.selectedPath[i])) ?? null;
      if (!current || !isExpandable(current.value)) break;
      nodes = childrenOf(current.value, current.path);
      columns.push(nodes);
    }
    const rendered = columns.map((nodes2, i) => this.renderColumn(nodes2, i));
    if (current) rendered.push(this.renderPreviewColumn(current));
    this.columns.element.replaceChildren(...rendered);
    this.pathField.setText(this.selectedPath.map(formatPart).join(" / "));
  }
  renderColumn(nodes, columnIndex) {
    const col = document.createElement("section");
    col.className = "object-column";
    col.setAttribute("role", "listbox");
    if (nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "object-empty";
      empty.textContent = "No children";
      col.appendChild(empty);
      return col;
    }
    for (const node of nodes) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "object-row";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", this.pathMatchesAt(node.path, columnIndex) ? "true" : "false");
      row.innerHTML = "";
      const name = document.createElement("span");
      name.className = "object-name";
      name.textContent = node.name;
      row.appendChild(name);
      const value = document.createElement("span");
      value.className = "object-value";
      value.textContent = summaryOf(node.value);
      row.appendChild(value);
      if (isExpandable(node.value)) {
        const arrow = document.createElement("span");
        arrow.className = "object-arrow";
        arrow.textContent = ">";
        row.appendChild(arrow);
      }
      row.addEventListener("click", () => {
        this.selectedPath = node.path;
        this.render();
      });
      col.appendChild(row);
    }
    return col;
  }
  renderPreviewColumn(node) {
    const col = document.createElement("section");
    col.className = "object-column object-preview-column";
    const heading = document.createElement("div");
    heading.className = "object-preview-heading";
    heading.textContent = node.name;
    const pre = document.createElement("pre");
    pre.textContent = previewOf(node.value);
    col.append(heading, pre);
    return col;
  }
  pathMatchesAt(path, columnIndex) {
    if (this.selectedPath.length <= columnIndex) return false;
    if (path.length !== columnIndex + 1) return false;
    return path.every((part, i) => samePart(part, this.selectedPath[i]));
  }
};
_init8 = __decoratorStart(_a8);
__decorateElement(_init8, 5, "columns", _columns_dec, ObjectBrowser);
__decorateElement(_init8, 5, "pathField", _pathField_dec, ObjectBrowser);
ObjectBrowser = __decorateElement(_init8, 0, "ObjectBrowser", _ObjectBrowser_decorators, ObjectBrowser);
__runInitializers(_init8, 1, ObjectBrowser);
function childrenOf(value, parentPath) {
  if (!isExpandable(value)) return [];
  const out = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push({ name: String(i), value: item, path: [...parentPath, i] }));
    return out;
  }
  const obj = value;
  const keys = ownKeys(obj);
  for (const key of keys) {
    out.push({
      name: formatPart(key),
      value: safeRead(obj, key),
      path: [...parentPath, key]
    });
  }
  const proto = Object.getPrototypeOf(obj);
  if (proto && proto !== Object.prototype) {
    out.push({ name: "[[Prototype]]", value: proto, path: [...parentPath, "[[Prototype]]"] });
  }
  return out;
}
function ownKeys(obj) {
  try {
    return Reflect.ownKeys(obj).filter((key) => typeof key !== "string" || !key.startsWith("__")).sort((a, b) => formatPart(a).localeCompare(formatPart(b)));
  } catch {
    return [];
  }
}
function safeRead(obj, key) {
  if (key === "[[Prototype]]") return Object.getPrototypeOf(obj);
  try {
    return obj[key];
  } catch (err) {
    return err;
  }
}
function isExpandable(value) {
  return typeof value === "object" && value !== null || typeof value === "function";
}
function summaryOf(value) {
  if (value == null) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `function ${value.name || "(anonymous)"}`;
  if (value instanceof Controller) return `Controller ${value.constructor.name}`;
  if (value instanceof View && value.element instanceof HTMLElement) {
    return `View ${elementSummary(value.element)}`;
  }
  if (value instanceof HTMLElement) return elementSummary(value);
  if (isModelLike(value)) return `${constructorName(value)}#${String(value.id)}`;
  if (Array.isArray(value)) return `Array(${value.length})`;
  return constructorName(value);
}
function previewOf(value) {
  if (!isExpandable(value)) return summaryOf(value);
  if (value instanceof HTMLElement) return value.outerHTML.slice(0, 2e3);
  const lines = childrenOf(value, []).slice(0, 80).map((node) => {
    return `${node.name}: ${summaryOf(node.value)}`;
  });
  return `${summaryOf(value)}

${lines.join("\n")}`;
}
function constructorName(value) {
  return value?.constructor?.name ?? "Object";
}
function elementSummary(el2) {
  const tag = el2.tagName.toLowerCase();
  const id = el2.id ? `#${el2.id}` : "";
  const classes2 = Array.from(el2.classList).slice(0, 3).map((name) => `.${name}`).join("");
  return `<${tag}${id}${classes2}>`;
}
function isModelLike(value) {
  return typeof value === "object" && value != null && "id" in value && "isDirty" in value && "save" in value;
}
function formatPart(part) {
  if (typeof part === "symbol") return part.toString();
  return String(part ?? "");
}
function samePart(a, b) {
  return a === b;
}
function registeredClassesByName() {
  const out = {};
  for (const [name, ctor] of registeredClassEntries()) out[name] = ctor;
  return out;
}

// examples/breweries/models/brewery.ts
var _websiteURL_dec, _phone_dec, _latitude_dec, _longitude_dec, _country_dec, _postalCode_dec, _stateProvince_dec, _city_dec, _address3_dec, _address2_dec, _address1_dec, _breweryType_dec, _name_dec, _a9, _Brewery_decorators, _init9, _name, _breweryType, _address1, _address2, _address3, _city, _stateProvince, _postalCode, _country, _longitude, _latitude, _phone, _websiteURL;
_Brewery_decorators = [register];
var Brewery = class extends (_a9 = Model, _name_dec = [attr], _breweryType_dec = [attr({ key: "brewery_type" })], _address1_dec = [attr({ key: "address_1" })], _address2_dec = [attr({ key: "address_2" })], _address3_dec = [attr({ key: "address_3" })], _city_dec = [attr], _stateProvince_dec = [attr({ key: "state_province" })], _postalCode_dec = [attr({ key: "postal_code" })], _country_dec = [attr], _longitude_dec = [attr], _latitude_dec = [attr], _phone_dec = [attr], _websiteURL_dec = [attr({ key: "website_url" })], _a9) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _name, __runInitializers(_init9, 8, this, "")), __runInitializers(_init9, 11, this);
    __privateAdd(this, _breweryType, __runInitializers(_init9, 12, this, "")), __runInitializers(_init9, 15, this);
    __privateAdd(this, _address1, __runInitializers(_init9, 16, this, "")), __runInitializers(_init9, 19, this);
    __privateAdd(this, _address2, __runInitializers(_init9, 20, this, "")), __runInitializers(_init9, 23, this);
    __privateAdd(this, _address3, __runInitializers(_init9, 24, this, "")), __runInitializers(_init9, 27, this);
    __privateAdd(this, _city, __runInitializers(_init9, 28, this, "")), __runInitializers(_init9, 31, this);
    __privateAdd(this, _stateProvince, __runInitializers(_init9, 32, this, "")), __runInitializers(_init9, 35, this);
    __privateAdd(this, _postalCode, __runInitializers(_init9, 36, this, "")), __runInitializers(_init9, 39, this);
    __privateAdd(this, _country, __runInitializers(_init9, 40, this, "")), __runInitializers(_init9, 43, this);
    __privateAdd(this, _longitude, __runInitializers(_init9, 44, this, "")), __runInitializers(_init9, 47, this);
    __privateAdd(this, _latitude, __runInitializers(_init9, 48, this, "")), __runInitializers(_init9, 51, this);
    __privateAdd(this, _phone, __runInitializers(_init9, 52, this, "")), __runInitializers(_init9, 55, this);
    __privateAdd(this, _websiteURL, __runInitializers(_init9, 56, this, "")), __runInitializers(_init9, 59, this);
  }
  static async search(query) {
    const params = new URLSearchParams({
      query,
      per_page: "50"
    });
    return this.findAll({
      url: `${this.url}/search`,
      params
    });
  }
};
_init9 = __decoratorStart(_a9);
_name = new WeakMap();
_breweryType = new WeakMap();
_address1 = new WeakMap();
_address2 = new WeakMap();
_address3 = new WeakMap();
_city = new WeakMap();
_stateProvince = new WeakMap();
_postalCode = new WeakMap();
_country = new WeakMap();
_longitude = new WeakMap();
_latitude = new WeakMap();
_phone = new WeakMap();
_websiteURL = new WeakMap();
__decorateElement(_init9, 4, "name", _name_dec, Brewery, _name);
__decorateElement(_init9, 4, "breweryType", _breweryType_dec, Brewery, _breweryType);
__decorateElement(_init9, 4, "address1", _address1_dec, Brewery, _address1);
__decorateElement(_init9, 4, "address2", _address2_dec, Brewery, _address2);
__decorateElement(_init9, 4, "address3", _address3_dec, Brewery, _address3);
__decorateElement(_init9, 4, "city", _city_dec, Brewery, _city);
__decorateElement(_init9, 4, "stateProvince", _stateProvince_dec, Brewery, _stateProvince);
__decorateElement(_init9, 4, "postalCode", _postalCode_dec, Brewery, _postalCode);
__decorateElement(_init9, 4, "country", _country_dec, Brewery, _country);
__decorateElement(_init9, 4, "longitude", _longitude_dec, Brewery, _longitude);
__decorateElement(_init9, 4, "latitude", _latitude_dec, Brewery, _latitude);
__decorateElement(_init9, 4, "phone", _phone_dec, Brewery, _phone);
__decorateElement(_init9, 4, "websiteURL", _websiteURL_dec, Brewery, _websiteURL);
Brewery = __decorateElement(_init9, 0, "Brewery", _Brewery_decorators, Brewery);
__publicField(Brewery, "type", "brewery");
__publicField(Brewery, "url", "https://api.openbrewerydb.org/v1/breweries");
__publicField(Brewery, "codec", plainJsonCodec);
__runInitializers(_init9, 1, Brewery);

// examples/breweries/controllers/breweries_page.ts
var _BreweriesMenubar_decorators, _init10, _a10;
_BreweriesMenubar_decorators = [register];
var BreweriesMenubar = class extends (_a10 = Controller) {
  showObjectBrowser() {
    void Application.shared.showWindow("object-browser");
  }
};
_init10 = __decoratorStart(_a10);
BreweriesMenubar = __decorateElement(_init10, 0, "BreweriesMenubar", _BreweriesMenubar_decorators, BreweriesMenubar);
__runInitializers(_init10, 1, BreweriesMenubar);
var _selectedObjectId_dec, _a11, _BreweryList_decorators, _init11, _selectedObjectId;
_BreweryList_decorators = [register];
var BreweryList = class extends (_a11 = SortableList, _selectedObjectId_dec = [binding(selectedObjectIdBinding())], _a11) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _selectedObjectId, __runInitializers(_init11, 8, this, null)), __runInitializers(_init11, 11, this);
  }
};
_init11 = __decoratorStart(_a11);
_selectedObjectId = new WeakMap();
__decorateElement(_init11, 4, "selectedObjectId", _selectedObjectId_dec, BreweryList, _selectedObjectId);
BreweryList = __decorateElement(_init11, 0, "BreweryList", _BreweryList_decorators, BreweryList);
__runInitializers(_init11, 1, BreweryList);
var _errorMessage_dec, _isLoading_dec, _breweries_dec, _query_dec, _breweryList_dec, _searchField_dec, _a12, _BreweriesPage_decorators, _init12, _query, _breweries, _isLoading, _errorMessage;
_BreweriesPage_decorators = [register];
var BreweriesPage = class extends (_a12 = Controller, _searchField_dec = [outlet], _breweryList_dec = [outlet], _query_dec = [observable], _breweries_dec = [observable], _isLoading_dec = [observable], _errorMessage_dec = [observable], _a12) {
  constructor() {
    super(...arguments);
    __publicField(this, "searchField", __runInitializers(_init12, 24, this)), __runInitializers(_init12, 27, this);
    __publicField(this, "breweryList", __runInitializers(_init12, 28, this)), __runInitializers(_init12, 31, this);
    __privateAdd(this, _query, __runInitializers(_init12, 8, this, "Pittsburgh")), __runInitializers(_init12, 11, this);
    __privateAdd(this, _breweries, __runInitializers(_init12, 12, this, [])), __runInitializers(_init12, 15, this);
    __privateAdd(this, _isLoading, __runInitializers(_init12, 16, this, false)), __runInitializers(_init12, 19, this);
    __privateAdd(this, _errorMessage, __runInitializers(_init12, 20, this, "")), __runInitializers(_init12, 23, this);
  }
  // This is what allows this controller to have its state restored from the
  // URL fragment by the framework. You could even expose sorting if you wanted to.
  restorationBindings() {
    return {
      q: "query",
      selected: "breweryList.selectedObjectId"
    };
  }
  controllerDidLoad() {
    makeFirstResponder(this.searchField);
    void this.search();
  }
  insertNewline(event) {
    void this.search();
  }
  keyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      makeFirstResponder(this.breweryList);
      return;
    }
    super.keyDown(event);
  }
  async search() {
    if (this.query.trim() === "") return;
    this.isLoading = true;
    this.errorMessage = "";
    try {
      this.breweries = await Brewery.search(this.query);
      queueMicrotask(() => this.breweryList.selectFirstIfNothingSelected());
    } catch (err) {
      this.breweries = [];
      this.errorMessage = err.message;
      console.error("[breweries] search failed", err);
    } finally {
      this.isLoading = false;
    }
  }
  clearSearch() {
    this.query = "";
    this.breweryList.selectedObject = null;
    this.breweries = [];
    this.errorMessage = "";
    makeFirstResponder(this.searchField);
  }
};
_init12 = __decoratorStart(_a12);
_query = new WeakMap();
_breweries = new WeakMap();
_isLoading = new WeakMap();
_errorMessage = new WeakMap();
__decorateElement(_init12, 4, "query", _query_dec, BreweriesPage, _query);
__decorateElement(_init12, 4, "breweries", _breweries_dec, BreweriesPage, _breweries);
__decorateElement(_init12, 4, "isLoading", _isLoading_dec, BreweriesPage, _isLoading);
__decorateElement(_init12, 4, "errorMessage", _errorMessage_dec, BreweriesPage, _errorMessage);
__decorateElement(_init12, 5, "searchField", _searchField_dec, BreweriesPage);
__decorateElement(_init12, 5, "breweryList", _breweryList_dec, BreweriesPage);
BreweriesPage = __decorateElement(_init12, 0, "BreweriesPage", _BreweriesPage_decorators, BreweriesPage);
__runInitializers(_init12, 1, BreweriesPage);

// examples/breweries/breweries.ts
document.addEventListener("DOMContentLoaded", () => {
  Application.shared.start(document.body);
});
//# sourceMappingURL=breweries.js.map
