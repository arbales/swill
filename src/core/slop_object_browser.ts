// The object browser is AI-slop.
//
import { Application, Controller, View, collectControllers, currentFirstResponder, outlet, register } from "..";
import { registeredClassEntries } from "./awakening/registry";

type PathPart = string | number | symbol;

interface BrowserNode {
  name: string;
  value: unknown;
  path: PathPart[];
}

@register
export class ObjectBrowser extends Controller {
  @outlet columns!: View;
  @outlet pathField!: View;

  private selectedPath: PathPart[] = [];
  private rootNodes: BrowserNode[] = [];

  override awakeFromDOM(): void {
    this.rootNodes = this.makeRoots();
    this.render();
  }

  refresh(): void {
    this.rootNodes = this.makeRoots();
    this.render();
  }

  close(): void {
    Application.shared.dismiss(this);
  }

  override cancelOperation(_event: KeyboardEvent): void {
    Application.shared.dismiss(this);
  }

  private makeRoots(): BrowserNode[] {
    return [
      { name: "Application", value: Application.shared, path: ["Application"] },
      { name: "Controllers", value: collectControllers(document.body), path: ["Controllers"] },
      { name: "Registered Classes", value: registeredClassesByName(), path: ["Registered Classes"] },
      { name: "First Responder", value: currentFirstResponder(), path: ["First Responder"] },
      { name: "Document Body", value: document.body, path: ["Document Body"] },
    ];
  }

  private render(): void {
    const columns: BrowserNode[][] = [this.rootNodes];
    let nodes = this.rootNodes;
    let current: BrowserNode | null = null;
    for (let i = 0; i < this.selectedPath.length; i++) {
      current = nodes.find((node) => samePart(node.path[node.path.length - 1], this.selectedPath[i])) ?? null;
      if (!current || !isExpandable(current.value)) break;
      nodes = childrenOf(current.value, current.path);
      columns.push(nodes);
    }

    const rendered = columns.map((nodes, i) => this.renderColumn(nodes, i));
    if (current) rendered.push(this.renderPreviewColumn(current));
    this.columns.element.replaceChildren(...rendered);
    this.pathField.setText(this.selectedPath.map(formatPart).join(" / "));
  }

  private renderColumn(nodes: BrowserNode[], columnIndex: number): HTMLElement {
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

  private renderPreviewColumn(node: BrowserNode): HTMLElement {
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

  private pathMatchesAt(path: PathPart[], columnIndex: number): boolean {
    if (this.selectedPath.length <= columnIndex) return false;
    if (path.length !== columnIndex + 1) return false;
    return path.every((part, i) => samePart(part, this.selectedPath[i]));
  }
}

function childrenOf(value: unknown, parentPath: PathPart[]): BrowserNode[] {
  if (!isExpandable(value)) return [];
  const out: BrowserNode[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => out.push({ name: String(i), value: item, path: [...parentPath, i] }));
    return out;
  }

  const obj = value as object;
  const keys = ownKeys(obj);
  for (const key of keys) {
    out.push({
      name: formatPart(key),
      value: safeRead(obj, key),
      path: [...parentPath, key],
    });
  }

  const proto = Object.getPrototypeOf(obj);
  if (proto && proto !== Object.prototype) {
    out.push({ name: "[[Prototype]]", value: proto, path: [...parentPath, "[[Prototype]]"] });
  }
  return out;
}

function ownKeys(obj: object): PathPart[] {
  try {
    return Reflect.ownKeys(obj)
      .filter((key) => typeof key !== "string" || !key.startsWith("__"))
      .sort((a, b) => formatPart(a).localeCompare(formatPart(b)));
  } catch {
    return [];
  }
}

function safeRead(obj: object, key: PathPart): unknown {
  if (key === "[[Prototype]]") return Object.getPrototypeOf(obj);
  try {
    return (obj as Record<PropertyKey, unknown>)[key];
  } catch (err) {
    return err;
  }
}

function isExpandable(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function summaryOf(value: unknown): string {
  if (value == null) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `function ${(value as Function).name || "(anonymous)"}`;
  if (value instanceof Controller) return `Controller ${value.constructor.name}`;
  if (value instanceof View && value.element instanceof HTMLElement) {
    return `View ${elementSummary(value.element)}`;
  }
  if (value instanceof HTMLElement) return elementSummary(value);
  if (isModelLike(value)) return `${constructorName(value)}#${String((value as { id: unknown }).id)}`;
  if (Array.isArray(value)) return `Array(${value.length})`;
  return constructorName(value);
}

function previewOf(value: unknown): string {
  if (!isExpandable(value)) return summaryOf(value);
  if (value instanceof HTMLElement) return value.outerHTML.slice(0, 2000);
  const lines = childrenOf(value, [])
    .slice(0, 80)
    .map((node) => {
      return `${node.name}: ${summaryOf(node.value)}`;
    });
  return `${summaryOf(value)}\n\n${lines.join("\n")}`;
}

function constructorName(value: unknown): string {
  return (value as { constructor?: { name?: string } })?.constructor?.name ?? "Object";
}

function elementSummary(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const classes = Array.from(el.classList)
    .slice(0, 3)
    .map((name) => `.${name}`)
    .join("");
  return `<${tag}${id}${classes}>`;
}

function isModelLike(value: unknown): boolean {
  return typeof value === "object" && value != null && "id" in value && "isDirty" in value && "save" in value;
}

function formatPart(part: PathPart | undefined): string {
  if (typeof part === "symbol") return part.toString();
  return String(part ?? "");
}

function samePart(a: PathPart | undefined, b: PathPart | undefined): boolean {
  return a === b;
}

function registeredClassesByName(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, ctor] of registeredClassEntries()) out[name] = ctor;
  return out;
}
