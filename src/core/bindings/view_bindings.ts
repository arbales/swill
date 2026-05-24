import { observePath, readPath, writePath } from "./object_bindings";
import { applyTransform, type Transformer, getTransformer } from "./transformers";
import { Controller, View, controllerFor, registerControllerDisposer } from "../view";
import { ownedDescendants } from "../view/ownership";

// Loader for `bind` / `bind-*` markup attributes. See docs/bindings.md
// for syntax and roots. KVO + path machinery lives in object_bindings.ts.

/** Wire a controller's view subtree. Thin wrapper over `wireBindingsInto`
 *  with the prefix supplied by `bindingRoot()`. */
export function wireBindings(controller: Controller): void {
  const prefix = (controller as any).bindingRoot?.() ?? "";
  registerControllerDisposer(controller, wireBindingsInto(controller, controller.view.element, prefix));
}

/** Generalized loader. `root` is any object observable via the
 *  `${name}DidChange` convention; `rootPrefix` is prepended to non-`@`
 *  paths. List cells call this with the item as root and prefix `""`. */
export function wireBindingsInto(
  root: object,
  hostEl: HTMLElement,
  rootPrefix: string,
): () => void {
  const disposers: Array<() => void> = [];
  for (const el of ownedDescendants(hostEl, { match: hasBindingAttr })) {
    const path = el.getAttribute("bind");
    if (path) disposers.push(wireValueBinding(root, rootPrefix, el, path));
    for (const attr of Array.from(el.attributes)) {
      if (!attr.name.startsWith("bind-")) continue;
      const prop = attr.name.slice("bind-".length);
      if (!prop) continue;
      disposers.push(wirePropertyBinding(root, rootPrefix, el, prop, attr.value));
    }
  }
  return () => {
    for (const dispose of disposers) dispose();
  };
}

function wireValueBinding(
  root: object,
  rootPrefix: string,
  el: HTMLElement,
  path: string,
): () => void {
  const expression = parseBindingExpression(rootPrefix, path);
  const transformer = getTransformer(el.getAttribute("transform") ?? "string");
  const binding = viewBindingForValue(el, transformer, controllerFor(el));
  const sync = (): void => binding.apply(expression.read(root));
  sync();
  const disposeObservation = observePath(root, expression.segments, sync);
  const disposeInput = binding.onUserInput?.((v) => {
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

function wirePropertyBinding(
  root: object,
  rootPrefix: string,
  el: HTMLElement,
  prop: string,
  path: string,
): () => void {
  const expression = parseBindingExpression(rootPrefix, path);
  const binding = viewBindingForProperty(el, normalizePropertyName(prop));
  const sync = (): void => binding.apply(expression.read(root));
  sync();
  return observePath(root, expression.segments, sync);
}

function normalizePropertyName(prop: string): string {
  return PROPERTY_ALIASES.get(prop) ?? prop;
}

interface BindingExpression {
  segments: string[];
  transforms: string[];
  read(root: object): unknown;
}

function parseBindingExpression(rootPrefix: string, path: string): BindingExpression {
  const [pathPart, ...transforms] = path.split(":");
  const segments = resolveSegments(rootPrefix, pathPart ?? "");
  return {
    segments,
    transforms,
    read(root: object): unknown {
      let value = readPath(root, segments);
      for (const transform of transforms) value = applyTransform(transform, value);
      return value;
    },
  };
}

function resolveSegments(rootPrefix: string, path: string): string[] {
  // `@` ignores the prefix (root-relative).
  if (path.startsWith("@")) return path.slice(1).split(".");
  return (rootPrefix ? rootPrefix.split(".") : []).concat(path.split("."));
}

function hasBindingAttr(el: HTMLElement): boolean {
  if (el.hasAttribute("bind")) return true;
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("bind-")) return true;
  }
  return false;
}

// One ViewBinding per `bind` / `bind-*` element: how to push a value
// in, and (for form controls) how the user drives changes out.

interface ViewBinding {
  /** Model → DOM. */
  apply(value: unknown): void;
  /** Two-way only: install a listener for user-driven changes. */
  onUserInput?(handler: (value: unknown) => void): () => void;
}

function viewBindingForValue(
  el: HTMLElement,
  transformer: Transformer<any>,
  childController: Controller | null,
): ViewBinding {
  if (childController && "representedObject" in childController) {
    return controllerEndpoint(childController);
  }
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    return checkboxEndpoint(el);
  }
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return formControlEndpoint(el, transformer);
  }
  const view = View.of(el);
  if (view && "value" in view) {
    return controlValueEndpoint(view as View & { value: unknown }, transformer);
  }
  return textEndpoint(el, transformer);
}

/** Sink for `bind-<prop>`. Boolean props are coerced so
 *  `bind-disabled="emailEmpty"` reads as "disabled when emailEmpty." */
function viewBindingForProperty(el: HTMLElement, prop: string): ViewBinding {
  const isBool = BOOLEAN_PROPS.has(prop);
  return {
    apply(value: unknown): void {
      if (prop.startsWith("data-") || prop.startsWith("aria-")) {
        if (value == null || value === "") el.removeAttribute(prop);
        else el.setAttribute(prop, String(value));
        return;
      }
      if (value == null && NULLABLE_URL_PROPS.has(prop)) {
        el.removeAttribute(prop.toLowerCase());
        (el as any)[prop] = "";
        return;
      }
      (el as any)[prop] = isBool ? Boolean(value) : value;
    },
  };
}

// HTML attribute names are lowercased, but DOM property names are not always.
const PROPERTY_ALIASES = new Map([
  ["readonly", "readOnly"],
]);

// DOM properties we coerce to boolean on assignment.
const BOOLEAN_PROPS = new Set([
  "disabled",
  "checked",
  "hidden",
  "readOnly",
  "required",
  "open",
]);

const NULLABLE_URL_PROPS = new Set([
  "href",
  "src",
]);

function controllerEndpoint(ctrl: Controller): ViewBinding {
  return {
    apply(value: unknown): void {
      // Don't overwrite the child's default with an undefined initial pull.
      if (value === undefined) return;
      (ctrl as any).representedObject = value;
    },
  };
}

function checkboxEndpoint(el: HTMLInputElement): ViewBinding {
  return {
    apply(value: unknown): void {
      const checked = Boolean(value);
      if (el.checked !== checked) el.checked = checked;
    },
    onUserInput(handler: (value: unknown) => void): () => void {
      const listener = (): void => handler(el.checked);
      el.addEventListener("change", listener);
      return () => el.removeEventListener("change", listener);
    },
  };
}

function formControlEndpoint(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  transformer: Transformer<any>,
): ViewBinding {
  return {
    apply(value: unknown): void {
      const formatted = transformer.format(value);
      if (el.value !== formatted) el.value = formatted;
    },
    onUserInput(handler: (value: unknown) => void): () => void {
      const listener = (): void => handler(transformer.parse(el.value));
      el.addEventListener("input", listener);
      return () => el.removeEventListener("input", listener);
    },
  };
}

function controlValueEndpoint(
  view: View & { value: unknown },
  transformer: Transformer<any>,
): ViewBinding {
  return {
    apply(value: unknown): void {
      const formatted = transformer.format(value);
      if (view.value !== formatted) view.value = formatted;
    },
    onUserInput(handler: (value: unknown) => void): () => void {
      const listener = (): void => handler(transformer.parse(String(view.value ?? "")));
      view.element.addEventListener("input", listener);
      return () => view.element.removeEventListener("input", listener);
    },
  };
}

function textEndpoint(el: HTMLElement, transformer: Transformer<any>): ViewBinding {
  return {
    apply(value: unknown): void {
      el.textContent = transformer.format(value);
    },
  };
}
