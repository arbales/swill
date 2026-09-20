import { Controller, observable, register } from "../../../../ts/src";

@register
export class StatusField extends Controller {
  @observable accessor message: string = "";
}
