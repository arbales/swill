import { observePath, readPath, writePath } from "./bindings";
import {
  Controller,
  collectControllers,
  controllerFor,
  detachViewTree,
  topViewsIn,
} from "./view";
import { finishActivation, wireSubtree } from "./awakening";
import { Responder, currentFirstResponder, makeFirstResponder, setChainTop } from "./responder";
import { firstResponderFor, syncFirstResponderFromFocus } from "./responder";
import {
  type FragmentHistoryMode,
  type RestorationBindingController,
  type WindowRestoration,
  type CapturedWindowContent,
  type WindowEntry,
  fragmentParams,
  fragmentValue,
  scopedFragmentKey,
  topControllerIn,
  windowContainers,
  writeFragmentParam,
} from "./windows";

/**
 * Cocoa NSApplication analog. App-wide singleton that owns:
 *
 * - The initial wire-pass of the document and the MutationObserver that
 *   keeps later subtree insertions in sync.
 * - Document-level focusin/focusout and keydown/keyup listeners.
 * - Console-debugging hooks (`__controllers`, `__root`, etc.).
 * - The window-template registry and the windows currently on screen.
 *
 * Subclasses can override hook methods. Most apps never touch the class
 * and just call `Application.shared.start(document.body)` at boot.
 */
export class Application extends Responder {
  private static _shared: Application | null = null;
  static get shared(): Application {
    return (this._shared ??= new Application());
  }

  /** Chain terminus — the responder chain bottoms out here (Cocoa
   *  NSApp). No further link. */
  override get nextResponder(): Responder | null {
    return null;
  }

  private rootElement: HTMLElement = document.body;
  private rootControllers: Controller[] = [];
  private windowTemplates = new Map<string, HTMLTemplateElement>();
  private capturedWindowContents = new Map<string, CapturedWindowContent>();
  private windows: WindowEntry[] = [];
  private windowRestoration = new Map<string, WindowRestoration>();
  private applyingFragmentState = false;

  /** One-time startup: install listeners, prepare `[window]`
   * containers, wire their live or templated contents, then apply URL
   * fragment restoration. */
  start(root: HTMLElement = document.body): void {
    Application._shared = this;
    setChainTop(this); // responder chain bottoms out at the Application
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
  showWindow(name: string, opts: { into?: HTMLElement } = {}): Promise<void> {
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

    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    this.windows.push({
      root: node,
      controller: rootCtrl,
      name,
      contentName: name,
      savedFirstResponder: savedFR,
      resolve,
    });
    return promise;
  }

  async loadWindowContent(
    windowName: string,
    contentName: string,
    opts: { history?: FragmentHistoryMode } = {},
  ): Promise<void> {
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

    const entry: WindowEntry = {
      root: container,
      controller,
      name: windowName,
      contentName,
      savedFirstResponder: old?.savedFirstResponder ?? null,
      resolve: old?.resolve ?? (() => {}),
    };
    const idx = this.windows.indexOf(old!);
    if (idx >= 0) this.windows[idx] = entry;
    else this.windows.push(entry);

    container.setAttribute("name", contentName);
    this.writeFragmentParam(windowName, contentName, opts.history ?? "push");
    this.restoreWindowState(entry, {
      pruneStale: opts.history !== "none",
      writeContent: opts.history !== "none",
    });
    finishActivation(container);
    if (controller) makeFirstResponder(controller);
    else if (previous instanceof Controller && previous.view.element.isConnected) makeFirstResponder(previous);
  }

  private instantiateTemplate(name: string, into: HTMLElement): Controller {
    const tpl = this.windowTemplates.get(name);
    if (!tpl) throw new Error(`Application: no window template "${name}"`);
    const node = tpl.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
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
  dismiss(controller: Controller): void {
    const idx = this.windows.findIndex((w) => w.controller === controller || w.root.contains(controller.view.element));
    if (idx < 0) return;
    const win = this.windows[idx]!;
    this.windows.splice(idx, 1);

    if (win.root instanceof HTMLDialogElement && win.root.open) win.root.close();
    if (win.controller) detachViewTree(win.controller.view, { removeElement: true });

    const prev = win.savedFirstResponder;
    if (prev instanceof Controller && prev.view.element.isConnected) {
      makeFirstResponder(prev);
    }
    win.resolve();
  }

  private scanWindowTemplates(): void {
    const tpls = document.querySelectorAll<HTMLTemplateElement>('template[for="window"][name], body > template[name]');
    for (const t of tpls) {
      const name = t.getAttribute("name");
      if (name) this.windowTemplates.set(name, t);
    }
  }

  private prepareWindowContainers(root: HTMLElement): void {
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

  private registerLiveWindows(root: HTMLElement, controllers: Controller[]): void {
    for (const container of windowContainers(root)) {
      const name = container.getAttribute("window")?.trim();
      if (!name) continue;
      const controller = topControllerIn(container, controllers);
      this.windows.push({
        root: container,
        controller,
        name,
        contentName: container.getAttribute("name")?.trim() || undefined,
        savedFirstResponder: null,
        resolve: () => {},
      });
    }
  }

  private windowContainer(name: string): HTMLElement | null {
    return this.rootElement.querySelector<HTMLElement>(`[window="${CSS.escape(name)}"]`);
  }

  private hasWindowContent(name: string): boolean {
    return this.windowTemplates.has(name) || this.capturedWindowContents.has(name);
  }

  private cloneWindowContent(name: string): DocumentFragment {
    const tpl = this.windowTemplates.get(name);
    if (tpl) return tpl.content.cloneNode(true) as DocumentFragment;
    const captured = this.capturedWindowContents.get(name);
    if (captured) return captured.fragment.cloneNode(true) as DocumentFragment;
    throw new Error(`Application: no window content template "${name}"`);
  }

  private restoreWindowStates(): void {
    for (const entry of this.windows) {
      this.restoreWindowState(entry, { pruneStale: false, writeContent: true });
    }
  }

  private restoreWindowState(entry: WindowEntry, opts: { pruneStale: boolean; writeContent: boolean }): void {
    if (!entry.name) return;
    const staleKeys = this.disposeWindowRestoration(entry.name);
    const controller = entry.controller as (Controller & RestorationBindingController) | null;
    const bindings = controller?.restorationBindings?.() ?? {};
    const keys = new Set(Object.keys(bindings).map((key) => scopedFragmentKey(entry.name!, key)));

    if (opts.writeContent && entry.contentName) {
      this.writeFragmentParam(entry.name, entry.contentName, "replace");
    }
    if (opts.pruneStale) {
      for (const key of staleKeys) {
        if (!keys.has(key)) this.writeFragmentParam(key, null, "replace");
      }
    }
    if (!controller || Object.keys(bindings).length === 0) {
      this.windowRestoration.set(entry.name, { disposers: [], keys });
      return;
    }

    const params = fragmentParams();
    let restored = false;
    this.applyingFragmentState = true;
    try {
      for (const [key, path] of Object.entries(bindings)) {
        const scopedKey = scopedFragmentKey(entry.name, key);
        if (!params.has(scopedKey)) continue;
        writePath(controller, path.split("."), params.get(scopedKey));
        restored = true;
      }
    } finally {
      this.applyingFragmentState = false;
    }
    controller.controllerDidRestore({ restored });

    const disposers: Array<() => void> = [];
    for (const [key, path] of Object.entries(bindings)) {
      const scopedKey = scopedFragmentKey(entry.name, key);
      const segments = path.split(".");
      disposers.push(
        observePath(controller, segments, () => {
          if (this.applyingFragmentState) return;
          this.writeFragmentParam(scopedKey, fragmentValue(readPath(controller, segments)), "replace");
        }),
      );
    }
    this.windowRestoration.set(entry.name, { disposers, keys });
  }

  private finishWindowActivation(): void {
    for (const entry of this.windows) finishActivation(entry.root);
  }

  private disposeWindowRestoration(windowName: string): Set<string> {
    const existing = this.windowRestoration.get(windowName);
    if (!existing) return new Set();
    for (const dispose of existing.disposers) dispose();
    this.windowRestoration.delete(windowName);
    return existing.keys;
  }

  private installFragmentRouting(): void {
    if ((globalThis as any).__fragmentRoutingInstalled) return;
    (globalThis as any).__fragmentRoutingInstalled = true;
    const apply = (): void => {
      this.applyFragmentToWindows();
    };
    window.addEventListener("popstate", apply);
    window.addEventListener("hashchange", apply);
  }

  private applyFragmentToWindows(): void {
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

  private writeFragmentParam(key: string, value: string | null, mode: FragmentHistoryMode): void {
    if (mode === "none" || this.applyingFragmentState) return;
    writeFragmentParam(key, value, mode);
  }

  // ---- document-level listeners ----

  private installFocusTracking(): void {
    if ((globalThis as any).__focusTrackingInstalled) return;
    (globalThis as any).__focusTrackingInstalled = true;
    // focusin fires on every DOM focus change inside the document,
    // including the one synthesized by Tab returning from the browser URL
    // bar.
    document.addEventListener(
      "focusin",
      (e) => {
        const fe = e as FocusEvent;
        syncFirstResponderFromFocus(fe.target as HTMLElement | null, fe.relatedTarget as HTMLElement | null);
      },
      { capture: true },
    );
    // focusout with relatedTarget === null means focus is leaving the
    // document entirely (Tab to URL bar, click outside, etc.). Clear the
    // cached first responder so the next focusin starts clean.
    document.addEventListener(
      "focusout",
      (e) => {
        if ((e as FocusEvent).relatedTarget === null) {
          syncFirstResponderFromFocus(null);
        }
      },
      { capture: true },
    );
  }

  private installKeyRouting(): void {
    if ((globalThis as any).__keyRoutingInstalled) return;
    (globalThis as any).__keyRoutingInstalled = true;
    document.addEventListener("keydown", (event) => {
      const target = (event.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
      if (!target) return;
      firstResponderFor(target)?.keyDown(event);
    });
    document.addEventListener("keyup", (event) => {
      const target = (event.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
      if (!target) return;
      firstResponderFor(target)?.keyUp(event);
    });
  }

  private watchForChanges(root: HTMLElement): void {
    const observer = new MutationObserver((records) => {
      const added: HTMLElement[] = [];

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
        for (const el of added) wireSubtree(el);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  private installConsoleHooks(): void {
    const root = this.rootElement;
    Object.defineProperty(globalThis, "__controllers", {
      configurable: true,
      get: () => collectControllers(root),
    });
    Object.defineProperty(globalThis, "__root", {
      configurable: true,
      get: () => collectControllers(root).find((c) => !c.parent) ?? null,
    });
    Object.defineProperty(globalThis, "__controllerFor", {
      configurable: true,
      value: (el: HTMLElement | string): Controller | null => {
        if (typeof el === "string") {
          const found = (root.querySelector(el) ?? document.querySelector(el)) as HTMLElement | null;
          return found ? controllerFor(found) : null;
        }
        return controllerFor(el);
      },
    });
    Object.defineProperty(globalThis, "__firstResponder", {
      configurable: true,
      get: () => currentFirstResponder(),
    });
    Object.defineProperty(globalThis, "__application", {
      configurable: true,
      get: () => this,
    });
  }
}
