import { InlineEditor, outlet, register, Select } from "../../../src";
import { PRIORITY_OPTIONS, VERDICT_OPTIONS, type Movie } from "../models/movie";

@register
export class MovieEditor extends InlineEditor<Movie> {
  @outlet prioritySelect!: Select;
  @outlet verdictSelect!: Select;

  override awakeFromDOM(): void {
    this.prioritySelect.options = [...PRIORITY_OPTIONS];
    this.verdictSelect.options = [...VERDICT_OPTIONS];
    this.prioritySelect.delegate = this;
    this.verdictSelect.delegate = this;
  }
}
