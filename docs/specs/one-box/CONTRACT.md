# Inbox contract

Frozen by `contract-freezer`. Id `inbox-wave-1`. Hash `680b9c3d`.

Dependent work transcribes these signatures. It does not rename, add, or drop a field. A change here is a new freeze, not an agent edit.

```ts
type SourceKind = "slack" | "discord" | "mail" | "teams" | "linear" | "jira" | "github"

type Item = {
  readonly id: string
  readonly source: SourceKind
  readonly externalId: string
  readonly actor: string
  readonly snippet: string
  readonly threadId: string
  readonly reply: boolean
  readonly deepLink?: string
  readonly personId?: string
  readonly commitmentId?: string
  readonly waiting: boolean
}

type Pulled = {
  readonly source: SourceKind
  readonly externalId: string
  readonly actor: string
  readonly snippet: string
  readonly threadId: string
  readonly reply: boolean
  readonly deepLink?: string
}

function pull(source: SourceKind): Pulled[]
function upsert(pulled: Pulled): Item
function list(): Item[]
function rank(items: readonly Item[]): Item[]
function link(itemId: string, personId: string | undefined, commitmentId: string | undefined): Item
function archive(id: string): Item
function markRead(id: string): Item
function remindTomorrow(id: string, now: number): Item
function handoff(ids: readonly string[]): { readonly ids: readonly string[] }
function saveDraft(id: string, text: string): Item
function originDraft(id: string, text: string): { readonly drafted: true }
function send(id: string, text: string, click: true): { readonly sent: true }
function door(input: { readonly number?: string; readonly from: "meeting" | "contact" | "commitment" | "none" }): { readonly href: string } | { readonly openApp: true }
```

`packages/protocol/src/api.ts`, `packages/schema/src/inbox.ts`, and the source loader are lead scaffold. No work-package writes them.
