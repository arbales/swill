import {
  Controller,
  CustomSelect,
  Editor,
  List,
  binding,
  computed,
  observable,
  outlet,
  register,
  selectedObjectIdBinding,
} from "../../../src";
import { MailingList, Member } from "../models";

// Mailing-list app backed by the Giraffic `/api/lists` JSON:API endpoint.
// Bindings do the local data plumbing; model fetch/save handles the wire.

@register
export class MembersApp extends Controller {
  @outlet membersList!: List<Member>;

  @observable accessor members: Member[] = [];

  override awakeFromDOM(): void {
    void this.loadMembers();
  }

  private async loadMembers(): Promise<void> {
    try {
      this.members = await Member.findAll();
    } catch (err) {
      console.error("[members] load failed", err);
    }
  }
}

@register
export class MeProfileApp extends Controller {
  @outlet phoneVisibilitySelect!: CustomSelect;

  @observable accessor member: Member | null = null;
  @observable accessor draftMember: Member | null = null;
  @observable accessor isSaving: boolean = false;
  @observable accessor saveError: string = "";

  @computed([
    "draftMember",
    "draftMember.isDirty",
    "isSaving",
  ])
  get profileActionsDisabled(): boolean {
    return this.isSaving || this.draftMember?.isDirty !== true;
  }

  override awakeFromDOM(): void {
    this.phoneVisibilitySelect.options = [
      {
        value: "Authenticated",
        icon: "handshake",
        label: "Giraffes, Guests & Invitees",
        description: "Including guests and friends on our mailing lists or events",
      },
      {
        value: "Members",
        icon: "tent",
        label: "Giraffes",
        description: "People who're burning or have burned with us",
      },
      {
        value: "Organizers",
        icon: "hard-hat",
        label: "Organizers & Leads",
        description: "People helping to plan camp or organize the Giraffes",
      },
      {
        value: "Owner",
        icon: "venetian-mask",
        label: "Only You",
        description: "No one else can see it",
      },
    ];
    void this.loadProfile();
  }

  async saveProfile(): Promise<void> {
    const draft = this.draftMember;
    if (!draft) return;
    this.isSaving = true;
    this.saveError = "";
    try {
      await draft.save();
      this.member?.applyAttributesFrom(draft);
      this.draftMember = this.member?.draft() ?? draft.draft();
    } catch (err) {
      this.saveError = (err as Error).message;
      console.error("[profile] save failed", err);
    } finally {
      this.isSaving = false;
    }
  }

  discardProfile(): void {
    this.draftMember = this.member?.draft() ?? null;
    this.saveError = "";
  }

  private async loadProfile(): Promise<void> {
    try {
      this.member = await Member.me();
      this.draftMember = this.member.draft();
    } catch (err) {
      console.error("[profile] load failed", err);
    }
  }
}

interface MemberPickerCandidate {
  label: string;
  member: Member | null;
  email: string | null;
}

interface PendingMemberAddition {
  label: string;
  member: Member | null;
  email: string | null;
}

@register
export class MemberPicker extends Controller {
  @outlet results!: List<MemberPickerCandidate>;

  @observable accessor query: string = "";
  @observable accessor candidates: MemberPickerCandidate[] = [];
  @observable accessor isSearching: boolean = false;

  private searchTimer: number | null = null;
  private searchGeneration = 0;

  override get parent(): MailingListDetailView {
    return super.parent as MailingListDetailView;
  }

  queryDidChange(): void {
    this.scheduleSearch();
  }

  override viewDidDisappear(): void {
    if (this.searchTimer != null) window.clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }

  override insertNewline(event: KeyboardEvent): void {
    event.preventDefault();
    this.activateSelection();
  }

  activateSelection(): void {
    const candidate = this.results?.selectedObject ?? this.candidates[0] ?? null;
    if (!candidate) return;
    this.parent.stageMemberAddition(candidate);
    this.clear();
  }

  private scheduleSearch(): void {
    if (this.searchTimer != null) window.clearTimeout(this.searchTimer);
    const query = this.query.trim();
    if (query.length < 2) {
      this.searchGeneration++;
      this.searchTimer = null;
      this.isSearching = false;
      this.candidates = [];
      return;
    }
    this.searchTimer = window.setTimeout(() => {
      this.searchTimer = null;
      void this.search();
    }, 180);
  }

  private async search(): Promise<void> {
    const list = this.parent.representedObject;
    const query = this.query.trim();
    const generation = ++this.searchGeneration;
    if (!list || query.length < 2) {
      this.candidates = [];
      return;
    }
    this.isSearching = true;
    try {
      const candidates = await list.searchMemberCandidates(query);
      if (generation !== this.searchGeneration) return;
      this.candidates = this.pickerCandidates(candidates);
    } catch (err) {
      console.error("[member-picker] search failed", err);
      if (generation === this.searchGeneration) {
        this.candidates = [];
      }
    } finally {
      if (generation === this.searchGeneration) this.isSearching = false;
    }
  }

  private pickerCandidates(members: Member[]): MemberPickerCandidate[] {
    const query = this.query.trim();
    const candidates: MemberPickerCandidate[] = members.map((member) => ({
      label: member.name ? `${member.name} <${member.email}>` : member.email,
      member,
      email: null,
    }));
    if (isEmail(query) && !this.hasExactEmail(members, query)) {
      candidates.push({
        label: `Add ${query}`,
        member: null,
        email: query,
      });
    }
    return candidates;
  }

  private hasExactEmail(members: Member[], email: string): boolean {
    const normalized = email.toLowerCase();
    return members.some((member) => member.email.toLowerCase() === normalized);
  }

  private clear(): void {
    if (this.searchTimer != null) window.clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.searchGeneration++;
    this.isSearching = false;
    this.query = "";
    this.candidates = [];
  }
}

// ---- source list (mailing lists themselves) -------------------------

@register
export class MailingListSourceList extends List<MailingList> {
  @binding(selectedObjectIdBinding()) accessor selectedObjectId: string | null = null;
}

// ---- detail (the editor) --------------------------------------------

@register
export class MailingListDetailView extends Editor<MailingList> {
  @outlet memberList!: List<Member>;
  @outlet memberPicker!: MemberPicker;
  @outlet pendingAdditionsList!: List<PendingMemberAddition>;

  @observable accessor pendingMemberAdditions: PendingMemberAddition[] = [];

  representedObjectDidChange(): void {
    this.pendingMemberAdditions = [];
  }

  stageMemberAddition(candidate: MemberPickerCandidate): void {
    const addition: PendingMemberAddition = { ...candidate };
    if (this.memberAlreadyPresent(addition) || this.memberAlreadyPending(addition)) return;
    this.pendingMemberAdditions = [...this.pendingMemberAdditions, addition];
  }

  removePendingAddition(): void {
    const addition = this.pendingAdditionsList.selectedObject;
    if (!addition) return;
    this.pendingMemberAdditions = this.pendingMemberAdditions.filter((item) => item !== addition);
    this.pendingAdditionsList.selectedIndexes = [];
  }

  async removeMember(): Promise<void> {
    const ml = this.representedObject;
    if (!ml) return;
    const members = this.memberList.selectedObjects;
    for (const member of members) await ml.removeMember(member);
    this.memberList.selectedIndexes = [];
  }

  async saveChanges(): Promise<void> {
    const ml = this.representedObject;
    if (!ml) return;
    try {
      await ml.save();
      for (const addition of this.pendingMemberAdditions) {
        await ml.addMember(addition.member ?? addition.email!);
      }
      this.pendingMemberAdditions = [];
    } catch (err) {
      console.error("[mailing-list] save failed", err);
    }
  }

  private memberAlreadyPresent(addition: PendingMemberAddition): boolean {
    const ml = this.representedObject;
    if (!ml) return false;
    const email = addition.email ?? addition.member?.email ?? "";
    const id = addition.member?.id ?? null;
    return ml.members.some((member) =>
      (id != null && member.id === id) || (email !== "" && member.email.toLowerCase() === email.toLowerCase()),
    );
  }

  private memberAlreadyPending(addition: PendingMemberAddition): boolean {
    const email = addition.email ?? addition.member?.email ?? "";
    const id = addition.member?.id ?? null;
    return this.pendingMemberAdditions.some((item) =>
      (id != null && item.member?.id === id) ||
      (email !== "" && (item.email ?? item.member?.email ?? "").toLowerCase() === email.toLowerCase()),
    );
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ---- app (the main window content) ----------------------------------

@register
export class MailingListsApp extends Controller {
  @outlet sourceList!: MailingListSourceList;

  /** Bound from the source list's `bind="lists"`. */
  @observable accessor lists: MailingList[] = [];

  override awakeFromDOM(): void {
    void this.loadLists();
  }

  restorationBindings(): Record<string, string> {
    return { selected: "sourceList.selectedObjectId" };
  }

  private async loadLists(): Promise<void> {
    try {
      this.lists = await MailingList.findAll();
      queueMicrotask(() => this.sourceList.selectFirstIfNothingSelected());
    } catch (err) {
      console.error("[mailing-list] load failed", err);
    }
  }
}
