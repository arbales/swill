// Minimal DOM shim for exercising the compiled Swill bundle under Node.
//
// It implements only the surface Swill actually touches: attribute access,
// a children/parent tree, a tiny selector matcher (tag names and `[attr]`
// presence, comma-separated groups), event listeners with manual dispatch,
// form-control value/checked, textContent, and a no-op MutationObserver. It is
// deliberately not a real DOM — just enough to drive awakening, bindings,
// actions, and (later) outlets and the responder chain in tests.

class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    if (this.tagName === "TEMPLATE") this.content = new Fragment();
    this.parentElement = null;
    this.nodeType = 1;
    this._listeners = {};
    this._value = "";
    this.checked = false;
    this._text = "";
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  cloneNode(deep = false) {
    const clone = createElement(this.tagName.toLowerCase(), this.attributes);
    clone.value = this.value;
    clone.checked = this.checked;
    clone.textContent = this.textContent;
    if (deep) {
      const target = clone.tagName === "TEMPLATE" ? clone.content : clone;
      const source = this.tagName === "TEMPLATE" ? this.content.children : this.children;
      for (const child of source) target.appendChild(child.cloneNode(true));
    }
    return clone;
  }

  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    const i = parent.children.indexOf(this);
    if (i >= 0) parent.children.splice(i, 1);
    this.parentElement = null;
  }

  get type() {
    return this.attributes.type || (this.tagName === "INPUT" ? "text" : "");
  }

  get value() { return this._value; }
  set value(v) { this._value = v == null ? "" : String(v); }

  // We never aggregate child text; bindings only set textContent on leaf
  // display elements, which is all the tests need.
  get textContent() { return this._text; }
  set textContent(v) { this._text = v == null ? "" : String(v); }

  _matchToken(token) {
    if (token === "*") return true;
    if (token.startsWith("[") && token.endsWith("]")) {
      return this.hasAttribute(token.slice(1, -1));
    }
    return this.tagName === token.toUpperCase();
  }

  matches(selector) {
    return selector.split(",").some((part) => this._matchToken(part.trim()));
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }

  contains(other) {
    if (other === this) return true;
    for (const child of this.children) {
      if (child.contains(other)) return true;
    }
    return false;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  addEventListener(type, listener) {
    (this._listeners[type] || (this._listeners[type] = [])).push(listener);
  }

  removeEventListener(type, listener) {
    const list = this._listeners[type];
    if (!list) return;
    const i = list.indexOf(listener);
    if (i >= 0) list.splice(i, 1);
  }

  // Test helper: synchronously fire listeners. Opal lambdas compile to plain
  // JS functions, so calling them directly invokes the block.
  dispatch(type, event = {}) {
    if (!event.target) event.target = this;
    for (const listener of this._listeners[type] || []) listener(event);
  }

  focus() {
    if (globalThis.document && globalThis.document.activeElement && globalThis.document.activeElement !== this) {
      globalThis.document.activeElement._focused = false;
    }
    this._focused = true;
    if (globalThis.document) globalThis.document.activeElement = this;
  }

  blur() {
    this._focused = false;
    if (globalThis.document && globalThis.document.activeElement === this) {
      globalThis.document.activeElement = null;
    }
  }
}

class Fragment {
  constructor() {
    this.children = [];
    this.nodeType = 11;
  }

  appendChild(child) {
    child.parentElement = null;
    this.children.push(child);
    return child;
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  cloneNode(deep = false) {
    const clone = new Fragment();
    if (deep) {
      for (const child of this.children) clone.appendChild(child.cloneNode(true));
    }
    return clone;
  }
}

function createElement(tag, attributes = {}) {
  const el = new El(tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

// Build a tree from a compact spec: ["tag", {attrs}, [children...]].
function build(spec) {
  const [tag, attrs = {}, children = []] = spec;
  const el = createElement(tag, attrs);
  const parent = el.tagName === "TEMPLATE" ? el.content : el;
  for (const child of children) parent.appendChild(build(child));
  return el;
}

class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() {}
}

// Install the globals the bundle expects, with `body` as the document root.
function install(body) {
  const document = {
    body,
    activeElement: null,
    querySelector(selector) {
      if (body.matches && body.matches(selector)) return body;
      return body.querySelector(selector);
    },
    querySelectorAll(selector) {
      const out = body.matches && body.matches(selector) ? [body] : [];
      return out.concat(body.querySelectorAll(selector));
    },
  };
  globalThis.document = document;
  globalThis.MutationObserver = MutationObserver;
  return document;
}

module.exports = { El, createElement, build, MutationObserver, install };
