import { Controller, observable, register } from "../../../src";

@register
export class StatusField extends Controller {
  @observable accessor message: string = "";
}
