import { Application, Editor, ObjectBrowser } from "../../src";
import {
  BreweriesMenubar,
  BreweriesPage,
  BreweryList,
} from "./controllers/breweries_page";
import { Brewery } from "./models/brewery";

void BreweriesPage;
void BreweriesMenubar;
void BreweryList;
void Brewery;
void Editor;
void ObjectBrowser;

document.addEventListener("DOMContentLoaded", () => {
  Application.shared.start(document.body);
});
