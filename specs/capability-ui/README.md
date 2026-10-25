# Capability UI

Frontend specification for the native capability campaign (PR #328, ported to the `capability-epic` bundle).

The original asset map (`specs/orchestra-capabilities/ASSET-MAP.md`) was lost with the hermes worktrees. This corpus
is lifted from the shipped code instead: the catalog in `modules/capability-assets/src/catalog.ts`, the Core runtime in
`packages/core/src/capability` and `packages/core/src/scheduled-task`, and the HTTP groups in `packages/protocol/src/groups`.
Every requirement names the contract it consumes. A surface whose backend does not exist is listed as a gap, not specified.

## Surfaces

| Spec | Surface | Backend today | Work |
|---|---|---|---|
| [CONNECTIONS.md](CONNECTIONS.md) | Integrations chapter (C15) | `server.capability.connections`, 12 endpoints | Brownfield: the chapter exists; make it usable |
| [ARTIFACTS.md](ARTIFACTS.md) | Session artifacts panel | `server.capability.artifacts`, 6 endpoints | New |
| [SCHEDULES.md](SCHEDULES.md) | Schedule chapter | `server.schedule` (legacy rows only) | Backend gap first, then UI |
| [PROCESSES.md](PROCESSES.md) | Session process indicator | None over HTTP | Read-only from the transcript; stop needs a route |

## What the campaign integrated

- Skills, 14, text only, no screen: api-discovery, office-operations, document-pdf, document-sheets, github-operations,
  site-publish, edge-preview, stack-provision, resource-watch, notion-operations, mail-operations, mcp-client-build,
  platform-cli, vault-operations. No skill root loads them yet.
- Platform providers, 12, used by the agent through `service_discover` and `service_call`. Key setup exists for
  cloudflare, supabase, neon, linear, stripe and globalping. Vercel, railway, sentry, grafana, netlify and
  prisma-postgres are OAuth-only and need the F05 OAuth work (`packages/schema/src/capability-setup.ts`).
- Native tools: `channel_read`/`channel_send`/`channel_update` (Slack, Discord), `image_create` and `video_create`
  (OpenAI, Runway), `artifact_show`, `document_read`/`document_edit`, `sheet_read`/`sheet_edit`, `process_control`,
  `schedule_manage`.
- Operator authority (`capability.operator.inspect`): infrastructure, no screen. With configured Basic auth the
  server grants the configured authority; a bearer is needed only on a server without Basic auth.

## Decisions

- D1. Artifacts live in the session, not in a global chapter. The API lists artifacts per session; a global list would
  need a new endpoint and has no current consumer.
- D2. Sharing an artifact copies a reference into another local session (`ShareInput.targetSessionID`). Nothing leaves
  the machine, so it needs a session picker, not a publication warning.
- D3. Providers without key setup appear in the provider list as unavailable, with the reason, instead of being hidden.
- D4. Verification is shown as the server reports it: `verified` (identity confirmed) or `credential-only` (key valid,
  no identity endpoint).

## Gaps (no backend, no UI in this campaign)

- Email: only the `mail-operations` skill body exists. The catalog plans `mail_read`, `mail_send` and `mail_update`,
  but no ref implements them and there is no mail connection or verifier. The skill drives the himalaya CLI.
- Vault: only the `vault-operations` skill body exists. `vault_list` and `vault_bind` are planned in the catalog and
  not implemented.
- OAuth providers (D3).
- Agent schedules over HTTP (SCHEDULES.md).
- Process status and stop over HTTP (PROCESSES.md).

## Delivery

One PR per surface into `capability-epic`, after the HTTP slice (slice 2) lands. Each PR runs its own browser and model
tests through `bun run test:ci app-shell <files>` plus a typecheck.yml dispatch; the full suite runs once on the bundle.
Visual work follows the `orchestra-design-system` skill.
