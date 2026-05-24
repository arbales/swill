import { makeFirstResponder, register, TextField } from "../../../src";
import type { MainView } from "./main_view";

@register
export class Typeahead extends TextField {
  /** Owning controller region (here, `MainView`). A leaf control reaches
   *  siblings through its owner, not a controller parent-walk (it has none
   *  — it's a View). */
  private get mainView(): MainView {
    return this.owner() as MainView;
  }

  override valueDidChange(_prev: string, next: string): void {
    super.valueDidChange(_prev, next);
    this.mainView.movieList.applyQuery(next);
  }

  override keyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      makeFirstResponder(this.mainView.movieList);
      return;
    }
    super.keyDown(event); // base maps Esc/Enter/Tab to responder methods
  }

  override cancelOperation(_event: KeyboardEvent): void {
    this.value = "";
  }

  /** Enter in the search field triggers an OMDB lookup. On hit, clear the
   *  field; on miss, leave it for the user to tweak. */
  override async insertNewline(_event: KeyboardEvent): Promise<void> {
    const q = this.value.trim();
    if (!q) return;
    await this.mainView.movieList.lookupOmdb(q);
  }
}
