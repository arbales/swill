import {
  Application,
  Controller,
  SortableList,
  binding,
  observable,
  outlet,
  register,
  makeFirstResponder,
  selectedObjectIdBinding,
  type View,
} from "../../../src";
import { Brewery } from "../models/brewery";

@register
export class BreweriesMenubar extends Controller {
  showObjectBrowser(): void {
    void Application.shared.showWindow("object-browser");
  }
}

// Expose a binding for selectedObjectId so that we can use it to restore state from the URL.
// Not all lists need this, so its not a default property.
@register
export class BreweryList extends SortableList<Brewery> {
  @binding(selectedObjectIdBinding()) accessor selectedObjectId: string | null = null;
}

@register
export class BreweriesPage extends Controller {
  @outlet searchField!: View;
  @outlet breweryList!: BreweryList;

  @observable accessor query: string = "Pittsburgh";
  @observable accessor breweries: Brewery[] = [];
  @observable accessor isLoading: boolean = false;
  @observable accessor errorMessage: string = "";

  // This is what allows this controller to have its state restored from the
  // URL fragment by the framework. You could even expose sorting if you wanted to.
  restorationBindings(): Record<string, string> {
    return {
      q: "query",
      selected: "breweryList.selectedObjectId",
    };
  }

  override controllerDidLoad(): void {
    makeFirstResponder(this.searchField);
    void this.search();
  }

  override insertNewline(event: KeyboardEvent): void {
    void this.search();
  }

  override keyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      makeFirstResponder(this.breweryList);
      return;
    }
    super.keyDown(event);
  }

  async search(): Promise<void> {
    if (this.query.trim() === "") return;
    this.isLoading = true;
    this.errorMessage = "";
    try {
      this.breweries = await Brewery.search(this.query);
      queueMicrotask(() => this.breweryList.selectFirstIfNothingSelected());
    } catch (err) {
      this.breweries = [];
      this.errorMessage = (err as Error).message;
      console.error("[breweries] search failed", err);
    } finally {
      this.isLoading = false;
    }
  }

  clearSearch(): void {
    this.query = "";
    this.breweryList.selectedObject = null;
    this.breweries = [];
    this.errorMessage = "";
    makeFirstResponder(this.searchField);
  }
}
