import { Controller, makeFirstResponder, outlet, register } from "../../../src";
import type { MovieList } from "./movie_list";
import type { StatusField } from "./status_field";
import type { Typeahead } from "./typeahead";

@register
export class MainView extends Controller {
  @outlet statusField!: StatusField;
  @outlet typeahead!: Typeahead;
  @outlet movieList!: MovieList;

  override awakeFromDOM(): void {
    makeFirstResponder(this.typeahead);
    this.statusField.message =
      "type to filter; ↓/↑ to walk; ⏎ on a row; ␛ to return";
  }
}
