import { Model, attr, register, registerTransformer } from "../../../src";

export type Priority = "high" | "medium" | "someday" | "no_interest";
export type Verdict = "favorite" | "liked" | "mixed" | "dislike";

export const PRIORITY_OPTIONS: Priority[] = ["high", "medium", "someday", "no_interest"];
export const VERDICT_OPTIONS: Verdict[] = ["favorite", "liked", "mixed", "dislike"];

@register
export class Movie extends Model {
  static url = "/api/movies";
  static type = "movie";

  @attr accessor title: string = "";
  @attr accessor year: number | null = null;
  @attr accessor director: string | null = null;
  @attr accessor genre: string | null = null;
  @attr accessor priority: Priority | null = null;
  @attr accessor verdict: Verdict | null = null;
  @attr accessor watched: boolean = false;
  @attr accessor watched_at: string | null = null; // YYYY-MM-DD or null
}

// One-way display: true → "✓", false → "". Checkboxes use the checkbox
// endpoint and bypass transformers.
registerTransformer<boolean>("yesno", {
  parse: (s) => s === "yes",
  format: (v) => (v ? "✓" : ""),
});
