import { Model, attr, hasOne, parseJsonApi, register, registerTransformer, requestJson } from "../../../src";
import { MailingAddress } from "./mailing_address";

@register
export class Member extends Model {
  static type = "member";
  static url = "/api/members";

  @attr accessor email: string = "";
  @attr accessor name: string = "";
  @attr accessor nickname: string = "";
  @attr accessor points: number = 0;
  @attr accessor tier: string = "";
  @attr({ key: "venmo_handle" }) accessor venmoHandle: string | null = null;
  @attr accessor phone: string = "";
  @attr({ key: "phone_visibility" }) accessor phoneVisibility: string = "";
  @attr({ key: "phone_country_code" }) accessor phoneCountryCode: string = "";
  @attr({ key: "phone_number" }) accessor phoneNumber: string = "";
  @attr({ key: "photo_url" }) accessor photoUrl: string = "";
  @attr({ key: "robodial_opt_out" }) accessor robodialOptOut: boolean = false;

  @hasOne({
    key: "mailing_address",
    type: () => MailingAddress,
    url(member) {
      return `/api/members/${encodeURIComponent(String(member.id))}/mailing_address`;
    },
  })
  accessor mailingAddress: MailingAddress | null = null;

  static async me(): Promise<Member> {
    const doc = await requestJson("GET", "/api/me");
    const member = parseJsonApi(Member, doc);
    if (member == null || Array.isArray(member)) {
      throw new Error("Expected current member from /api/me");
    }
    return member;
  }
}
