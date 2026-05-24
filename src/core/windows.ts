import { Controller } from "./view";

export type FragmentHistoryMode = "push" | "replace" | "none";

export interface WindowEntry {
  root: HTMLElement;
  controller: Controller | null;
  name?: string;
  contentName?: string;
  savedFirstResponder: unknown | null;
  resolve: () => void;
}

export interface CapturedWindowContent {
  fragment: DocumentFragment;
}

export interface RestorationBindingController {
  restorationBindings?(): Record<string, string>;
}

export interface WindowRestoration {
  disposers: Array<() => void>;
  keys: Set<string>;
}

export function windowContainers(root: HTMLElement): HTMLElement[] {
  const containers = Array.from(root.querySelectorAll<HTMLElement>("[window]"));
  if (root.hasAttribute("window")) containers.unshift(root);
  return containers;
}

export function topControllerIn(container: HTMLElement, controllers: Controller[]): Controller | null {
  return (
    controllers.find(
      (c) => container.contains(c.view.element) && (c.parent == null || !container.contains(c.parent.view.element)),
    ) ?? null
  );
}

export function scopedFragmentKey(windowName: string, key: string): string {
  return `${windowName}.${key}`;
}

export function fragmentParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

export function fragmentValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

export function writeFragmentParam(
  key: string,
  value: string | null,
  mode: FragmentHistoryMode,
): void {
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
