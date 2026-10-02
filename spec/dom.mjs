// A small element tree for the JavaScript tests: enough DOM for ownership walks,
// attribute scans, simple selectors, bubbling events, and focus. No layout,
// a small parser for static test templates.
export class Element {
  constructor(tagName, attributes = {}, children = []) {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.attributes = {...attributes};
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this._value = "";
    this._text = "";
    this._focused = false;
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.readOnly = false;
    this.type = attributes.type ?? "";
    this.open = false;
    // A template's children live in an inert content fragment, as in the DOM.
    if (this.tagName === "TEMPLATE") {
      this.content = new Element("#fragment", {}, children);
      this.content.nodeType = 11;
    } else {
      for (const child of children) this.append(child);
    }
  }

  get firstElementChild() { return this.children[0] ?? null; }

  cloneNode(deep) {
    const template = this.tagName === "TEMPLATE" ? this.content.children : this.children;
    const copy = new Element(this.tagName, this.attributes, deep ? template.map(child => child.cloneNode(true)) : []);
    copy.nodeType = this.nodeType;
    copy._value = this._value;
    copy._text = this._text;
    return copy;
  }

  appendChild(child) { return this.append(child); }
  insertBefore(child, reference) {
    if (reference == null) return this.append(child);
    child.remove();
    child.parentElement = this;
    this.children.splice(this.children.indexOf(reference), 0, child);
    return child;
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) child.remove();
    for (const node of nodes) this.append(node);
  }
  // Opening a dialog runs the browser's focusing steps: its [autofocus]
  // element, else its first focusable descendant, else the dialog itself.
  show() { this.open = true; this.focusDialog(); }
  showModal() { this.open = true; this.modal = true; this.focusDialog(); }
  focusDialog() {
    const target = this.querySelector("[autofocus]") ??
      this.querySelectorAll(FOCUSABLE).find(candidate => !candidate.disabled && !candidate.closest("[hidden]")) ?? this;
    target.focus();
  }
  // Closing drops focus held inside. Browsers then restore the element
  // focused before the dialog opened; this one does not, so the
  // framework's own restoration is what the tests see.
  close() {
    this.open = false;
    this.modal = false;
    const active = this.ownerDocument.activeElement;
    if (active && this.contains(active)) active.leaveFocus(null);
  }

  // Like the DOM, string properties coerce what they are assigned.
  get value() { return this._value; }
  set value(v) { this._value = v == null ? "" : String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = v == null ? "" : String(v); }

  append(child) {
    if (child.nodeType === 11) {
      for (const nested of [...child.children]) this.append(nested);
      return child;
    }
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }

  after(node) {
    const parent = this.parentElement;
    node.remove();
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }

  contains(other) {
    for (let node = other; node; node = node.parentElement) if (node === this) return true;
    return false;
  }

  get ownerDocument() {
    let node = this;
    while (node.parentElement) node = node.parentElement;
    return node;
  }

  // Only the static tag/quoted-attribute subset used by controls.html.
  set innerHTML(html) {
    const root = this.content ?? this;
    root.replaceChildren();
    const stack = [root];
    for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? []) {
      if (token.startsWith("<!--")) continue;
      if (token.startsWith("</")) { stack.pop(); continue; }
      if (!token.startsWith("<")) { if (token.trim()) stack.at(-1).textContent += token; continue; }
      const tag = /^<([\w-]+)/.exec(token)[1];
      const attributes = {};
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) attributes[match[1]] = match[2];
      const node = new Element(tag, attributes);
      stack.at(-1).append(node);
      if (!["input", "img", "br"].includes(tag)) stack.push(node.content ?? node);
    }
  }

  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }

  createElement(tagName) { return new Element(tagName); }

  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttributeNames() { return Object.keys(this.attributes); }

  // Backed by the class attribute, as in the DOM.
  get classList() {
    const names = () => (this.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    const write = list => list.length ? this.setAttribute("class", list.join(" ")) : this.removeAttribute("class");
    const list = {
      contains: name => names().includes(name),
      add: name => { if (!names().includes(name)) write([...names(), name]); },
      remove: name => write(names().filter(other => other !== name)),
      toggle: (name, force) => {
        const on = force ?? !names().includes(name);
        if (on) list.add(name); else list.remove(name);
        return on;
      }
    };
    return list;
  }

  scrollIntoView() { this.ownerDocument.scrolledTo = this; }
  getBoundingClientRect() { return {x: 0, y: 0, width: 0, height: 0}; }
  getSelection() { return null; }

  // tag, .class, tag.class, [attr], [attr=value], and combinations such as
  // template[name].
  matches(selector) {
    return selector.split(",").map(part => part.trim()).some(simple => {
      const classed = simple.match(/^([\w-]*)\.([\w-]+)$/);
      if (classed) return (!classed[1] || classed[1].toUpperCase() === this.tagName) && this.classList.contains(classed[2]);
      const parsed = simple.match(/^([\w-]*)((?:\[[^\]]+\])*)$/);
      if (!parsed) return false;
      const [, tag, attributes] = parsed;
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      for (const clause of attributes.match(/\[[^\]]+\]/g) ?? []) {
        const [, name, , value] = clause.match(/^\[([\w-]+)(=["']?([^"'\]]*)["']?)?\]$/);
        if (!this.hasAttribute(name)) return false;
        if (value !== undefined && this.getAttribute(name) !== value) return false;
      }
      return true;
    });
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  // ---- events: registration, once, capture, and bubbling ----

  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    const capture = options === true || options?.capture === true;
    this.listeners.get(type).push({listener, once: options?.once === true, capture});
  }

  removeEventListener(type, listener, options) {
    const entries = this.listeners.get(type);
    if (!entries) return;
    const capture = options === true || options?.capture === true;
    const index = entries.findIndex(entry => entry.listener === listener && entry.capture === capture);
    if (index >= 0) entries.splice(index, 1);
  }

  // Capture listeners run from the root down to the target, then bubbling
  // ones from the target up, as in the DOM.
  dispatchEvent(event) {
    Object.defineProperty(event, "target", {value: this, configurable: true});
    const path = [];
    for (let node = this; node; node = node.parentElement) path.push(node);
    const run = (node, capture) => {
      Object.defineProperty(event, "currentTarget", {value: node, configurable: true});
      for (const entry of [...(node.listeners.get(event.type) ?? [])]) {
        if (entry.capture !== capture) continue;
        if (entry.once) node.removeEventListener(event.type, entry.listener, capture);
        entry.listener.call(node, event);
      }
    };
    for (const node of [...path].reverse()) {
      run(node, true);
      if (event.cancelBubble) return !event.defaultPrevented;
    }
    for (const node of path) {
      run(node, false);
      if (!event.bubbles || event.cancelBubble) break;
    }
    return !event.defaultPrevented;
  }

  click(init = {}) { this.dispatchEvent(Object.assign(new Event("click", {bubbles: true}), init)); }
  doubleClick() { this.dispatchEvent(new Event("dblclick", {bubbles: true})); }

  // ---- focus: records activeElement on the document and fires focusin ----

  focus(options = {}) {
    this.focusOptions = options;
    const document = this.ownerDocument;
    const previous = document.activeElement ?? null;
    if (previous === this) return;
    if (previous) previous.leaveFocus(this);
    document.activeElement = this;
    this._focused = true;
    const event = new Event("focusin", {bubbles: true});
    Object.defineProperty(event, "relatedTarget", {value: previous, configurable: true});
    this.dispatchEvent(event);
  }

  // Focus leaving this element: focusout carries where it went, or null when
  // it left the document (the URL bar) or landed on dead space.
  leaveFocus(destination) {
    const document = this.ownerDocument;
    if (document.activeElement === this) document.activeElement = null;
    this._focused = false;
    const event = new Event("focusout", {bubbles: true});
    Object.defineProperty(event, "relatedTarget", {value: destination, configurable: true});
    this.dispatchEvent(event);
  }

  // Only the focused element can be blurred; on any other blur does nothing.
  blur() { if (this.ownerDocument.activeElement === this) this.leaveFocus(null); }
}

const FOCUSABLE = "input, select, textarea, button, [tabindex]";

export const element = (tagName, attributes, children) => new Element(tagName, attributes, children);

export const keyEvent = (type, key, modifiers = {}) =>
  Object.assign(new Event(type, {bubbles: true, cancelable: true}), {key, ...modifiers});

// A key pressed on the focused element. A Tab nothing prevented moves focus
// on as the browser would: to the next focusable element in document order,
// inside the topmost modal dialog when one is open (Safari also stops on the
// dialog itself, after its content, when document.dialogIsTabStop is set),
// and out of the page past the last. The browser never wraps; wrapping is
// the framework's to do.
export const pressKey = (target, key, modifiers = {}) => {
  const event = keyEvent("keydown", key, modifiers);
  target.dispatchEvent(event);
  target.dispatchEvent(keyEvent("keyup", key, modifiers));
  if (key !== "Tab" || event.defaultPrevented) return event;
  const document = target.ownerDocument;
  const modal = document.querySelectorAll("dialog").filter(dialog => dialog.open && dialog.modal).at(-1);
  const scope = modal ?? document;
  const stops = scope.querySelectorAll(FOCUSABLE).filter(candidate =>
    !candidate.disabled && candidate.getAttribute("tabindex") !== "-1" && !candidate.closest("[hidden]"));
  if (modal && document.dialogIsTabStop) stops.push(modal);
  const index = stops.indexOf(target);
  const next = index < 0 ? stops[0] : stops[index + (modifiers.shiftKey ? -1 : 1)];
  if (next) next.focus(); else target.leaveFocus(null);
  return event;
};

// A browser window for tests: location and history keep a hash and a stack
// of entries; back() pops one and fires popstate as a browser would.
export class Browser extends EventTarget {
  constructor(hash = "") {
    super();
    this.entries = [hash];
    this.location = {pathname: "/index.html", search: "", hash};
    this.history = {
      pushState: (_state, _title, url) => { this.location.hash = url.replace(/^[^#]*/, ""); this.entries.push(this.location.hash); },
      replaceState: (_state, _title, url) => { this.location.hash = url.replace(/^[^#]*/, ""); this.entries[this.entries.length - 1] = this.location.hash; }
    };
  }

  back() {
    if (this.entries.length < 2) return;
    this.entries.pop();
    this.location.hash = this.entries[this.entries.length - 1];
    this.dispatchEvent(new Event("popstate"));
  }

  navigate(hash) {
    this.location.hash = hash;
    this.entries.push(hash);
    this.dispatchEvent(new Event("hashchange"));
  }
}
