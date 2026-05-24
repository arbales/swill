import {
  Model,
  attr,
  hasMany,
  parseJsonApi,
  register,
  requestFormJson,
} from "../../../src";
import { Member } from "./member";

@register
export class MailingList extends Model {
  static type = "list";
  static url = "/api/lists";

  @attr accessor name: string = "";
  @attr accessor description: string = "";
  @attr accessor address: string = "";
  @attr({ key: "notifications_enabled" }) accessor notificationsEnabled: boolean = false;
  @attr accessor hidden: boolean = false;
  @attr accessor open: boolean = false;
  @attr({ key: "history_enabled" }) accessor historyEnabled: boolean = false;
  @attr({ key: "webhook_url" }) accessor webhookUrl: string = "";

  @hasMany({
    type: () => Member,
    url(list) {
      return `/api/collections/${encodeURIComponent(String(list.id))}/members`;
    },
  })
  accessor members: Member[] = [];

  constructor(name?: string, description?: string, members?: Member[]) {
    super();
    if (name !== undefined) this.name = name;
    if (description !== undefined) this.description = description;
    if (members !== undefined) this.members = members;
  }

  async searchMemberCandidates(query: string, limit = 10): Promise<Member[]> {
    if (this.id == null) return [];
    const q = query.trim();
    if (!q) return [];
    return Member.findAll({
      url: `/api/collections/${encodeURIComponent(String(this.id))}/members/candidates`,
      params: new URLSearchParams({ q, limit: String(limit) }),
    });
  }

  async addMember(candidate: Member | string): Promise<Member> {
    if (this.id == null) throw new Error("Cannot add a member before the list is saved");
    const body =
      candidate instanceof Member && candidate.id != null
        ? { member_id: candidate.id }
        : { email: candidate instanceof Member ? candidate.email : candidate };
    const doc = await requestFormJson("PUT", `/api/collections/${encodeURIComponent(String(this.id))}/members`, body);
    const parsed = parseJsonApi(Member, doc);
    if (parsed == null || Array.isArray(parsed)) {
      throw new Error("Expected member from collection add");
    }
    this.members = upsertById(this.members, parsed);
    return parsed;
  }

  async removeMember(member: Member): Promise<void> {
    if (this.id == null) return;
    const body = member.id != null ? { member_id: member.id } : { email: member.email };
    await requestFormJson("DELETE", `/api/collections/${encodeURIComponent(String(this.id))}/members`, body);
    this.members = this.members.filter((m) => m !== member && m.id !== member.id);
  }
}

function upsertById<T extends Model>(items: T[], item: T): T[] {
  if (item.id == null) return [...items, item];
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}
