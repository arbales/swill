import { Application, Controller, register } from "../../../src";

// Persistent app chrome. Window-launching actions belong here so they're
// available regardless of which view is in the main window.
@register
export class Menubar extends Controller {
  newMovie(): void {
    void Application.shared.showWindow("new-movie");
  }

  showObjectBrowser(): void {
    void Application.shared.showWindow("object-browser");
  }
}
