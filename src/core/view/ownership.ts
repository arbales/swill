import { Controller, controllerFor } from "./controller";

export interface OwnedDescendantsOptions {
  includeRoot?: boolean;
  includeBoundary?: boolean;
  skipTemplates?: boolean;
  match?: (el: HTMLElement) => boolean;
}

export function ownedDescendants(
  owner: Controller | HTMLElement,
  options: OwnedDescendantsOptions = {},
): HTMLElement[] {
  const root = owner instanceof Controller ? owner.view.element : owner;
  const includeRoot = options.includeRoot ?? false;
  const includeBoundary = options.includeBoundary ?? true;
  const skipTemplates = options.skipTemplates ?? true;
  const match = options.match ?? (() => true);
  const out: HTMLElement[] = [];

  if (includeRoot && match(root)) out.push(root);
  visit(root);
  return out;

  function visit(node: HTMLElement): void {
    for (const child of Array.from(node.children) as HTMLElement[]) {
      if (skipTemplates && child instanceof HTMLTemplateElement) continue;
      const isBoundary = child !== root && controllerFor(child) != null;
      if ((!isBoundary || includeBoundary) && match(child)) out.push(child);
      if (isBoundary) continue;
      visit(child);
    }
  }
}
