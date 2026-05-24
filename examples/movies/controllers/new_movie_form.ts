import { Application, Controller, Notifications, register, View, outlet } from "../../../src";
import { Movie } from "../models/movie";

@register
export class NewMovieForm extends Controller {
  @outlet titleInput!: View;
  @outlet yearInput!: View;
  @outlet directorInput!: View;

  async save(): Promise<void> {
    const movie = new Movie();
    movie.title = this.titleInput.value.trim();
    const y = Number(this.yearInput.value);
    if (Number.isFinite(y) && y > 0) movie.year = y;
    movie.director = this.directorInput.value.trim() || null;
    await movie.save();
    Notifications.post("movie.created", movie);
    Application.shared.dismiss(this);
  }

  cancel(): void {
    Application.shared.dismiss(this);
  }

  override cancelOperation(_event: KeyboardEvent): void {
    Application.shared.dismiss(this);
  }
}
