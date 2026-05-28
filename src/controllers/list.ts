import { htmlAttribute } from "../core/awakening";
import { observable, outlet, register } from "../core/decorators";
import { wireActionsInto } from "../core/awakening/actions";
import { wireBindingsInto } from "../core/bindings";
import { Controller, View } from "../core/view";

/** NSTableView analog. One row per item in `representedObject`. Rows
 *  are not controllers; they are either real `View`s or bare elements,
 *  selected by `rowsAreViews`. Cells bind straight to the item. */
@register
export class List<T> extends Controller {
  /** `true` = real `View` per row; `false` = bare element (NSCell perf). */
  protected rowsAreViews = true;

  /** NSTableHeaderView analog. Sibling of `rows`; never iterated as a row. */
  @outlet({ optional: true }) headerView?: View;

  /** Rows container. Without this outlet, rows go into the list view directly. */
  @outlet({ optional: true }) rows?: View;

  /** NSTableView `allowsMultipleSelection`. Enables shift-click range. */
  @htmlAttribute("multiple", { value: true })
  allowsMultipleSelection: boolean = false;

  /** Shift-click extends from this index; reset on plain click. */
  private selectionAnchor: number | null = null;
  private rowDisposers = new WeakMap<HTMLElement, () => void>();

  @observable accessor representedObject: T[] = [];
  @observable accessor selectedIndexes: number[] = [];

  // ---- selection convenience ----

  get selectedObjects(): T[] {
    return this.selectedIndexes.map((i) => this.arrangedObjects[i]).filter((x): x is T => x !== undefined);
  }

  get selectedObject(): T | null {
    return this.selectedObjects[0] ?? null;
  }

  set selectedObject(o: T | null) {
    if (o == null) {
      this.selectedIndexes = [];
      return;
    }
    const i = this.arrangedObjects.indexOf(o);
    this.selectedIndexes = i >= 0 ? [i] : [];
  }

  selectFirstIfNothingSelected(): void {
    if (this.selectedObject != null || this.arrangedObjects.length === 0) return;
    this.selectedIndexes = [0];
  }

  /** Enter / dblclick hook. Default bubbles a target-action to the owner. */
  activateSelection(): void {
    this.nextResponder?.performAction("activateSelection", this);
  }

  // ---- lifecycle ----

  override viewDidLoad(): void {
    super.viewDidLoad();
    this.view.element.tabIndex = this.view.element.tabIndex >= 0 ? this.view.element.tabIndex : 0;
    this.installRowDelegation();
  }

  override awakeFromDOM(): void {
    super.awakeFromDOM();
    // After outlets connect so `headerView` is known to `isRowElement`.
    this.renderAll();
  }

  representedObjectDidChange(_prev: T[], _next: T[]): void {
    this.renderAll();
    this.selectedIndexes = [];
    this.selectionAnchor = null;
  }

  selectedIndexesDidChange(_prev: number[], next: number[]): void {
    const prevSelectedObject = this.objectAt(_prev[0]);
    const nextSelectedObject = this.objectAt(next[0]);
    const wanted = new Set(next);
    const els = this.rowElements();
    els.forEach((el, i) => {
      const on = wanted.has(i);
      el.classList.toggle("selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (next.length > 0) {
      els[next[0]!]?.scrollIntoView({ block: "nearest" });
    }
    if (!Object.is(prevSelectedObject, nextSelectedObject)) {
      const cb = (this as any).selectedObjectDidChange;
      if (typeof cb === "function") cb.call(this, prevSelectedObject, nextSelectedObject);
    }
  }

  // ---- rendering ----

  /** Where rows mount: the `rows` outlet if present, else the list view. */
  protected get container(): HTMLElement {
    return this.rows?.element ?? this.view.element;
  }

  protected get arrangedObjects(): T[] {
    return this.representedObject;
  }

  protected rowTemplateElement(): HTMLTemplateElement | null {
    return this.view.element.querySelector(':scope > template[for="row"]');
  }

  /** The row element for `item`. Default clones `<template for="row">`;
   *  override to build in code (binding, selection, configureRow still run). */
  protected makeRowElement(_item: T): HTMLElement {
    const node = this.rowTemplateElement()?.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
    if (!node) {
      console.warn(`[Swill] ${this.constructor.name}: no <template for="row"> and no makeRowElement override`);
      return document.createElement("div");
    }
    return node;
  }

  /** NSTableView `willDisplayCell:` analog. */
  protected configureRow(_el: HTMLElement, _item: T): void {}

  protected renderAll(): void {
    this.clearRows();
    for (const item of this.arrangedObjects) this.attachRow(item);
  }

  private attachRow(item: T): void {
    const el = this.makeRowElement(item);
    this.container.appendChild(el);
    // Cells bind straight to the item (no representedObject prefix).
    const disposeBindings = wireBindingsInto(item as object, el, "");
    const disposeActions = wireActionsInto(this, el);
    this.rowDisposers.set(el, () => {
      disposeBindings();
      disposeActions();
    });
    if (this.rowsAreViews) {
      const rv = View.wrapping(el);
      this.view.adoptSubview(rv);
    }
    this.configureRow(el, item);
  }

  protected clearRows(): void {
    for (const child of Array.from(this.container.children)) {
      if (child instanceof HTMLTemplateElement) continue;
      if (!this.isRowElement(child as HTMLElement)) continue;
      const rv = View.of(child as HTMLElement);
      if (rv) {
        this.view.releaseSubview(rv);
      }
      this.rowDisposers.get(child as HTMLElement)?.();
      this.rowDisposers.delete(child as HTMLElement);
      child.remove();
    }
  }

  /** Override when subclasses inject non-row children into the container
   *  (e.g. `EditableList`'s inline editor). */
  protected isRowElement(_el: HTMLElement): boolean {
    return true;
  }

  private objectAt(index: number | undefined): T | null {
    return index == null ? null : (this.arrangedObjects[index] ?? null);
  }

  // ---- row event delegation: click selects, dblclick activates ----

  private installRowDelegation(): void {
    // Shift-click extends the row selection. Suppress the mousedown
    // default so the browser doesn't drag a text caret across rows;
    // plain clicks/drags inside a row still text-select normally.
    this.view.element.addEventListener("mousedown", (e) => {
      if (!this.allowsMultipleSelection || !e.shiftKey) return;
      if (this.indexOfEventTarget(e) < 0) return;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
    });
    this.view.element.addEventListener("click", (e) => {
      const idx = this.indexOfEventTarget(e);
      if (idx < 0) return;
      this.handleRowClick(idx, e);
    }, { capture: true });
    this.view.element.addEventListener("dblclick", (e) => {
      const idx = this.indexOfEventTarget(e);
      if (idx < 0) return;
      this.selectedIndexes = [idx];
      this.selectionAnchor = idx;
      this.activateSelection();
    });
  }

  private handleRowClick(idx: number, e: MouseEvent): void {
    if (this.allowsMultipleSelection && e.shiftKey && this.selectionAnchor != null) {
      const a = this.selectionAnchor;
      const lo = Math.min(a, idx);
      const hi = Math.max(a, idx);
      const range: number[] = [];
      for (let i = lo; i <= hi; i++) range.push(i);
      this.selectedIndexes = range;
      return;
    }
    this.selectedIndexes = [idx];
    this.selectionAnchor = idx;
  }

  private indexOfEventTarget(e: Event): number {
    let node = e.target as HTMLElement | null;
    while (node && node !== this.container) {
      if (node.parentElement === this.container) return this.rowElements().indexOf(node);
      node = node.parentElement;
    }
    return -1;
  }

  /** Mounted row elements in order. Excludes templates and anything
   *  `isRowElement` rejects. */
  rowElements(): HTMLElement[] {
    return Array.from(this.container.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && !(c instanceof HTMLTemplateElement) && this.isRowElement(c),
    );
  }

  // ---- keyboard ----

  override becomeFirstResponder(): boolean {
    const ok = super.becomeFirstResponder();
    if (!ok) return false;
    if (this.selectedIndexes.length === 0 && this.arrangedObjects.length > 0) {
      this.selectedIndexes = [0];
    }
    return true;
  }

  override keyDown(event: KeyboardEvent): void {
    const total = this.arrangedObjects.length;
    if (total === 0) return super.keyDown(event);
    const cur = this.selectedIndexes[0] ?? -1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = cur < 0 ? 0 : Math.min(total - 1, cur + 1);
      this.selectedIndexes = [next];
    } else if (event.key === "ArrowUp") {
      if (cur <= 0) {
        event.preventDefault();
        this.cancelOperation(event);
        return;
      }
      event.preventDefault();
      this.selectedIndexes = [cur - 1];
    } else {
      super.keyDown(event);
    }
  }

  override insertNewline(event: KeyboardEvent): void {
    if (this.selectedIndexes.length === 0) return super.insertNewline(event);
    event.preventDefault();
    this.activateSelection();
  }
}
