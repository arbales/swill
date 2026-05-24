// Helpers to make DOM stuff easier

type Child = Node | string | number | boolean | null | undefined;
type Props = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  props?: Props | null,
  children?: Child | Child[],
): HTMLElementTagNameMap[K] {
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
        node.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
      } else if (name in node) {
        (node as any)[name] = value === true ? true : value;
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

function appendChildren(parent: Node, children: Child | Child[] = []): void {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}
