import {
  EditableList,
  type JsonApiDoc,
  makeFirstResponder,
  config as modelConfig,
  Notifications,
  parseJsonApi,
  register,
} from "../../../src";
import type { MainView } from "./main_view";
import { Movie } from "../models/movie";

@register
export class MovieList extends EditableList<Movie> {
  override get parent(): MainView {
    return super.parent as MainView;
  }

  // Cell-backed rows (NSCell perf path): bare elements, zero framework
  // objects per row, for a potentially large movie list.
  protected override rowsAreViews = false;

  // Per-row color coding: priority/verdict need `data-*` attributes that
  // aren't plain text bindings. (Was `MovieRow.representedObjectDidChange`.)
  protected override configureRow(el: HTMLElement, m: Movie): void {
    const pri = el.querySelector<HTMLElement>('[bind="priority"]');
    if (pri) pri.dataset.priority = m.priority ?? "";
    const ver = el.querySelector<HTMLElement>('[bind="verdict"]');
    if (ver) ver.dataset.verdict = m.verdict ?? "";
  }

  private queryGen = 0;
  private unobserveMovieCreated: (() => void) | null = null;

  override awakeFromDOM(): void {
    super.awakeFromDOM();
    // Refresh when any window creates a movie. Decouples this list from
    // whoever did the creating (currently NewMovieForm).
    this.unobserveMovieCreated = Notifications.observe("movie.created", () => {
      void this.applyQuery(this.parent.typeahead.value);
    });
  }

  override viewDidDisappear(): void {
    this.unobserveMovieCreated?.();
    this.unobserveMovieCreated = null;
  }

  async applyQuery(q: string): Promise<void> {
    const gen = ++this.queryGen;
    try {
      const movies = await Movie.findAll({
        params: new URLSearchParams({ q }),
      });
      if (gen !== this.queryGen) return; // stale
      this.representedObject = movies;
    } catch (err) {
      console.error("[search] failed", err);
    }
  }

  /** OMDB lookup + upsert. On hit, the movie is added to the local cache (or
   *  refreshed in place) and selected; status field gets a "new: …" /
   *  "existing: …" message. On miss, status field gets "no match for …".
   *  Returns true on hit, false on miss/error. */
  async lookupOmdb(q: string): Promise<boolean> {
    const status = this.parent.statusField;
    try {
      const url = `${modelConfig.baseUrl}/api/movies/omdb?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { ...modelConfig.headers },
      });
      if (res.status === 404) {
        status.message = `no match for "${q}"`;
        return false;
      }
      if (!res.ok) throw new Error(`/api/movies/omdb ${res.status}`);
      const doc = (await res.json()) as JsonApiDoc;
      const parsed = parseJsonApi(Movie, doc);
      if (parsed == null || Array.isArray(parsed)) {
        throw new Error("/api/movies/omdb: expected single resource");
      }
      const movie = parsed;
      const idx = this.representedObject.findIndex((m) => m.id === movie.id);
      if (idx >= 0) {
        const next = [...this.representedObject];
        next[idx] = movie;
        this.representedObject = next;
      } else {
        this.representedObject = [movie, ...this.representedObject];
      }
      this.selectedObject = movie;
      const lookupStatus = doc.meta?.lookup_status as string | undefined;
      status.message = `${lookupStatus ?? "ok"}: ${movie.title}`;
      return true;
    } catch (err) {
      console.error("[omdb] failed", err);
      status.message = "OMDB lookup failed";
      return false;
    }
  }

  override cancelOperation(event: KeyboardEvent): void {
    if (this.isEditing()) return super.cancelOperation(event);
    this.selectedObject = null;
    makeFirstResponder(this.parent.typeahead);
  }

  protected override editingDidFailValidation(error: Error): void {
    this.parent.statusField.message = `invalid: ${error.message}`;
  }

  protected override editingDidFailSave(error: Error): void {
    this.parent.statusField.message = `save failed: ${error.message}`;
  }
}
