import { Model, attr, plainJsonCodec, register } from "../../../src";

@register
export class Brewery extends Model {
  static type = "brewery";
  static url = "https://api.openbrewerydb.org/v1/breweries";
  static codec = plainJsonCodec;

  @attr accessor name: string = "";
  @attr({ key: "brewery_type" }) accessor breweryType: string = "";
  @attr({ key: "address_1" }) accessor address1: string = "";
  @attr({ key: "address_2" }) accessor address2: string = "";
  @attr({ key: "address_3" }) accessor address3: string = "";
  @attr accessor city: string = "";
  @attr({ key: "state_province" }) accessor stateProvince: string = "";
  @attr({ key: "postal_code" }) accessor postalCode: string = "";
  @attr accessor country: string = "";
  @attr accessor longitude: string = "";
  @attr accessor latitude: string = "";
  @attr accessor phone: string = "";
  @attr({ key: "website_url" }) accessor websiteURL: string = "";

  static async search(query: string): Promise<Brewery[]> {
    const params = new URLSearchParams({
      query,
      per_page: "50",
    });
    return this.findAll({
      url: `${this.url}/search`,
      params,
    });
  }
}
