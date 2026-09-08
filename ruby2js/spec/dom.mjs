// A small element tree for Node tests: enough DOM for ownership walks,
// attribute scans, simple selectors, and events. No layout, no parsing.
export class Element extends EventTarget {
  constructor(tagName, attributes = {}, children = []) {
    super();
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.attributes = {...attributes};
    this.children = [];
    this.parentElement = null;
    this.value = "";
    this.textContent = "";
    this.checked = false;
    this.type = attributes.type ?? "";
    for (const child of children) this.append(child);
  }

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

  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  setAttribute(name, value) { this.attributes[name] = String(value); }

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

  click() { this.dispatchEvent(new Event("click")); }
}

export const element = (tagName, attributes, children) => new Element(tagName, attributes, children);
