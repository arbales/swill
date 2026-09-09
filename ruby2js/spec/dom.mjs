// A small element tree for Node tests: enough DOM for ownership walks,
// attribute scans, simple selectors, bubbling events, and focus. No layout,
// no parsing.
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
    for (const child of children) this.append(child);
  }

  // Like the DOM, string properties coerce what they are assigned.
  get value() { return this._value; }
  set value(v) { this._value = v == null ? "" : String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = v == null ? "" : String(v); }

  append(child) {
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

  contains(other) {
    for (let node = other; node; node = node.parentElement) if (node === this) return true;
    return false;
  }

  ownerDocument() {
    let node = this;
    while (node.parentElement) node = node.parentElement;
    return node;
  }

  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttributeNames() { return Object.keys(this.attributes); }

  matches(selector) {
    return selector.split(",").map(part => part.trim()).some(simple => {
      const attribute = simple.match(/^\[([\w-]+)\]$/);
      if (attribute) return this.hasAttribute(attribute[1]);
      return simple.toUpperCase() === this.tagName;
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

  // ---- events: registration, once, and bubbling ----

  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({listener, once: options?.once === true});
  }

  removeEventListener(type, listener) {
    const entries = this.listeners.get(type);
    if (!entries) return;
    const index = entries.findIndex(entry => entry.listener === listener);
    if (index >= 0) entries.splice(index, 1);
  }

  dispatchEvent(event) {
    Object.defineProperty(event, "target", {value: this, configurable: true});
    for (let node = this; node; node = node.parentElement) {
      Object.defineProperty(event, "currentTarget", {value: node, configurable: true});
      for (const entry of [...(node.listeners.get(event.type) ?? [])]) {
        if (entry.once) node.removeEventListener(event.type, entry.listener);
        entry.listener.call(node, event);
      }
      if (!event.bubbles) break;
    }
    return true;
  }

  click() { this.dispatchEvent(new Event("click", {bubbles: true})); }

  // ---- focus: records activeElement on the document and fires focusin ----

  focus() {
    const document = this.ownerDocument();
    const previous = document.activeElement ?? null;
    if (previous === this) return;
    if (previous) previous._focused = false;
    document.activeElement = this;
    this._focused = true;
    const event = new Event("focusin", {bubbles: true});
    Object.defineProperty(event, "relatedTarget", {value: previous, configurable: true});
    this.dispatchEvent(event);
  }

  blur() {
    const document = this.ownerDocument();
    if (document.activeElement === this) document.activeElement = null;
    this._focused = false;
  }
}

export const element = (tagName, attributes, children) => new Element(tagName, attributes, children);

export const keyEvent = (type, key) => Object.assign(new Event(type, {bubbles: true}), {key});
