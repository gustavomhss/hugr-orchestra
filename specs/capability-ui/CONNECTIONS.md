# Connections (Integrations chapter, C15)

Brownfield. The chapter ships in slice 3: `packages/app-shell/src/orchestra/chapters/integrations*.ts(x)` with copy in
`src/i18n/orchestra-chapters/integrations.ts`. Its model already handles paging, idempotent retries, receipt reuse,
races and privacy. This spec keeps that model and fixes what a user cannot do or understand today.

## Contract

`server.capability.connections` (`packages/protocol/src/groups/capability-connections.ts`):

- Reads: `connection.list`, `connection.get`, `connection.targets`, `target.get`, `binding.list`. Pages hold at most 32
  items, use `after` cursors and report `coverage` (`live`, or `current-actor` for bindings).
- Mutations: `connection.connect` (`CapabilitySetup.Input`: provider, key, label), `connection.disconnect`,
  `target.create`, `target.retarget`, `target.remove`, `binding.put`, `binding.remove`. Each one needs an
  `idempotency-key` header and returns a `Receipt` (`requestID`, `reused`, `data`).
- `Connection`: `connection` ref (id, provider, generation), `label`, `state` (`active`, `disconnected`, `revoked`),
  `credential` (`present`, `missing`).
- `connect` reports `verification`: `verified` or `credential-only`.

## Requirements

- C01. The provider picker lists all ten `CapabilitySetup.Provider` values: slack, discord, cloudflare, supabase, neon,
  linear, stripe, openai, runway, globalping. Today it offers only Slack and Discord, and the
  `orchestra.integrations.supported` copy says so.
- C02. The six OAuth-only providers appear in the picker as unavailable, with "Needs browser sign-in, not available
  yet" (D3). They cannot be selected.
- C03. Each provider shows a one-line hint naming the key it expects, such as "Bot token (xoxb-…)" for Slack or
  "API token" for Cloudflare. The hint is static copy, never a fetched value.
- C04. After connect, the account row shows a verification badge from the `connect` result: "Verified" or "Key valid,
  identity not checked" (D4).
- C05. The host-authorization field shows only when the server answers 401 to a capability read and the page has no
  Basic credential (`basic` is false). With Basic auth, the field never shows.
- C06. The binding form picks a session from the location's sessions (title and relative time) instead of a typed
  Session ID. Typing an ID stays available as a fallback.
- C07. Binding actions are a checklist when the provider declares its actions, and the current one-per-line text field
  otherwise. Open: no backend exposes a per-provider action list yet; until it does, keep the text field with
  provider examples in the hint.
- C08. Target creation keeps the environment field and the Resource JSON editor. The editor validates JSON locally
  before submit and shows the parse error inline.
- C09. Disconnect, remove target and remove binding each confirm with their existing hint text, which says what is not
  revoked or deleted at the provider.
- C10. The chapter keeps the live-page model: an explicit Refresh, "Next page", and no claim of a full snapshot.

## Out of scope

Email and vault (README gaps), OAuth sign-in, revoking a provider token at the provider.

## Tests

Extend the existing `integrations-model*.test.ts` for C04, C05 and C08, and the browser tests under
`test-browser/orchestra/integrations-*` for C01, C02 and C06.
