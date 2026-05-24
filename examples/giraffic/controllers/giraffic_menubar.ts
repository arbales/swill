import { Application, Controller, register } from "../../../src";

@register
export class GirafficMenubar extends Controller {
  showLists(): void {
    void Application.shared.loadWindowContent("main", "lists");
  }

  showMembers(): void {
    void Application.shared.loadWindowContent("main", "members");
  }

  showProfile(): void {
    void Application.shared.loadWindowContent("main", "profile");
  }

  showObjectBrowser(): void {
    void Application.shared.showWindow("object-browser");
  }
}
