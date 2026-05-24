// Importing each module is what triggers @register decorators. Order
// doesn't matter — registration happens at module evaluation, before
// boot() runs.

import { Application, config as modelConfig, CustomSelect, ObjectBrowser, Select } from "../../src";
import { GirafficMenubar } from "./controllers/giraffic_menubar";
import {
  MailingListSourceList,
  MailingListDetailView,
  MailingListsApp,
  MeProfileApp,
  MemberPicker,
  MembersApp,
} from "./controllers/mailing_list";

// Reference imported names so tree-shaking doesn't drop them. The
// @register decorator on each class registers it at module load.
void GirafficMenubar;
void MailingListSourceList;
void MailingListDetailView;
void MailingListsApp;
void MeProfileApp;
void MemberPicker;
void MembersApp;
void ObjectBrowser;
void CustomSelect;
void Select;

modelConfig.baseUrl = "/giraffic-api";

document.addEventListener("DOMContentLoaded", () => {
  Application.shared.start(document.body);
});
