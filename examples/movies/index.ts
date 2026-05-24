// Importing each module is what triggers @register decorators. Order
// doesn't matter — registration happens at module evaluation, before
// boot() runs.

import { Application, config as modelConfig, controllerFor, ObjectBrowser, Select } from "../../src";
import { MainView } from "./controllers/main_view";
import { Menubar } from "./controllers/menubar";
import { MovieEditor } from "./controllers/movie_editor";
import { MovieList } from "./controllers/movie_list";
import { NewMovieForm } from "./controllers/new_movie_form";
import { StatusField } from "./controllers/status_field";
import { Typeahead } from "./controllers/typeahead";

// Reference imported names so tree-shaking doesn't drop them. The
// @register decorator on each class registers it at module load.
void MainView;
void Menubar;
void MovieEditor;
void MovieList;
void NewMovieForm;
void ObjectBrowser;
void Select;
void StatusField;
void Typeahead;

modelConfig.baseUrl = "http://arb-mini.arbales.net:9292";

document.addEventListener("DOMContentLoaded", () => {
  Application.shared.start(document.body);
  const listEl = document.querySelector('[controller="MovieList"]') as HTMLElement | null;
  const list = listEl ? (controllerFor(listEl) as MovieList | null) : null;
  // Initial fetch — empty query → full list ordered by priority then title.
  list?.applyQuery("");
});
