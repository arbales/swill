# Models and Relationships

Model class identity lives on static properties:

```ts
@register
export class Member extends Model {
  static type = "members";
  static url = "/api/members";
}
```

`@register` makes the class available to markup awakening and JSON:API type lookup. The decorator does not describe the model; the class does.

## Attributes

`@attr` records a serializable attribute, marks the instance dirty when it changes, and fires `${name}DidChange(prev, next)`.

```ts
@attr accessor name: string = "";
```

Validation can live on the model:

```ts
validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.includes("@")) throw new Error("email must include @");
  return trimmed;
}
```

## Relationships

```ts
@hasMany({
  type: () => Member,
  url(list) {
    return `/api/collections/${encodeURIComponent(String(list.id))}/members`;
  },
})
accessor members: Member[] = [];
```

```ts
@hasOne({
  key: "mailing_address",
  type: () => MailingAddress,
  url(member) {
    return `/api/members/${encodeURIComponent(String(member.id))}/mailing_address`;
  },
})
accessor mailingAddress: MailingAddress | null = null;
```

Reading a relationship lazily loads it when the owner has an `id` and the relationship has not already loaded. Relationships are observable. Relationships also expose an object-shaped loading API:

```ts
.membersLoading
.mailingAddressLoading
reloadMembers()
reloadMailingAddress()
```

Views can bind progress indicators to `membersLoading`, and controllers can call `reloadMembers()` without knowing route details.

When JSON:API responses include relationship data, the parser assigns included records to the relationship and marks it loaded. A later read will not re-fetch something the server already sent.
