import { observable, register } from "../core/decorators";
import { List } from "./list";

export type SortDir = "asc" | "desc";
export type SortState = SortDir | "";

@register
export class SortableList<T> extends List<T> {
  @observable accessor sortKey: string | null = null;
  @observable accessor sortDir: SortDir = "asc";
  @observable accessor sortStates: Record<string, SortState> = {};

  private changingSort = false;

  override awakeFromDOM(): void {
    super.awakeFromDOM();
    this.sortStates = this.sortStateMap();
  }

  sortKeyDidChange(): void {
    this.sortDidChange();
  }

  sortDirDidChange(): void {
    this.sortDidChange();
  }

  protected override get arrangedObjects(): T[] {
    const key = this.sortKey;
    if (!key) return this.representedObject;
    return [...this.representedObject].sort((a, b) => compareBy(a, b, key, this.sortDir));
  }

  sortBy(sender: HTMLElement): void {
    const key = this.sortKeyFor(sender);
    if (!key) return;
    this.toggleSort(key);
  }

  toggleSort(key: string): void {
    const selected = this.selectedObject;
    this.changingSort = true;
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortKey = key;
      this.sortDir = "asc";
    }
    this.changingSort = false;
    this.sortDidChange();
    this.selectedObject = selected;
  }

  protected sortKeyFor(sender: HTMLElement): string | null {
    return sender.dataset.column ?? null;
  }

  private sortDidChange(): void {
    if (this.changingSort) return;
    this.sortStates = this.sortStateMap();
    this.renderAll();
  }

  private sortStateMap(): Record<string, SortState> {
    const states: Record<string, SortState> = {};
    const header = this.headerView?.element;
    if (!header || !this.sortKey) return states;
    header.querySelectorAll<HTMLElement>("[data-column]").forEach((el) => {
      const key = el.dataset.column;
      if (key === this.sortKey) states[key] = this.sortDir;
    });
    return states;
  }
}

function compareBy<T>(a: T, b: T, key: string, dir: SortDir): number {
  const av = (a as Record<string, unknown>)[key];
  const bv = (b as Record<string, unknown>)[key];
  let cmp: number;
  if (av == null && bv == null) cmp = 0;
  else if (av == null) cmp = 1;
  else if (bv == null) cmp = -1;
  else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else if (typeof av === "boolean" && typeof bv === "boolean") cmp = (av ? 1 : 0) - (bv ? 1 : 0);
  else cmp = String(av).localeCompare(String(bv));
  return dir === "asc" ? cmp : -cmp;
}
