import { Model, attr, register } from "../../../src";

@register
export class MailingAddress extends Model {
  static type = "mailing_address";
  static url = "/api/mailing_addresses";

  @attr({ key: "address_1" }) accessor address1: string = "";
  @attr({ key: "address_2" }) accessor address2: string = "";
  @attr accessor city: string = "";
  @attr accessor state: string = "";
  @attr({ key: "postal_code" }) accessor postalCode: string = "";
  @attr accessor country: string = "";
}
