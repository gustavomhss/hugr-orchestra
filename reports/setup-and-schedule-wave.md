# Provider key setup (F05a) and schedule_manage (S01)

Baseline `99ffc83e62`. Two independent tracks run in one wave. Provider auth research is in `reports/provider-auth-research.md`. No live or paid provider calls are made: every test uses loopback fixtures.

## Track F05a: key/bearer setup for more providers

### Frozen decisions

#### Providers

- `CapabilitySetup.Provider` is widened to: slack, discord, cloudflare, supabase, neon, linear, stripe, openai, runway, globalping.
- `CapabilitySetup.Result.verification` is now `"verified" | "credential-only"`.
- OAuth-only hosted MCPs are a separate F05 OAuth wave: sentry, vercel, grafana, railway, netlify and prisma-postgres. Grafana also needs a stack URL. Vercel additionally needs client approval.

#### Descriptors

- Each provider is described once, in `connection/verifiers/<provider>.ts`, by a `CapabilityVerifierContract.Descriptor`. The registry is `connection/verifiers/index.ts`, which exports `descriptors` and `descriptor(provider)`.
- A descriptor carries:
  - the **stored endpoint**: exactly what the consuming leaf compares against, i.e. the channel base, `CapabilityMedia` endpoints for openai/runway, or the platform MCP URL that service execution resolves;
  - the integration ID `capability.<provider>`;
  - a fixed identity origin, the auth header and an `identify` function.

#### Identity calls

All identity calls are free and read-only, and run against fixed production origins. Only trusted fixture options can swap in a loopback origin.

| Provider | Verification | Identity call | Subject |
|---|---|---|---|
| cloudflare | verified | `GET /client/v4/user/tokens/verify` | `token:<id>` |
| supabase | verified | `GET /v1/profile` | `gotrue_id` |
| neon | verified | `GET /api/v2/auth` | `account_id` |
| linear | verified | GraphQL `viewer{id organization{id}}`, raw key header | `[orgID, userID]` as JSON |
| stripe | verified | `GET /v1/account` | `acct_…` |
| openai | credential-only | `GET /v1/models` (validity only) | `key:` + sha256(key)[0..16] |
| runway | credential-only | `GET /v1/organization` (validity only) | `key:` + sha256(key)[0..16] |
| globalping | credential-only | `GET /v1/limits` | `key:` + sha256(key)[0..16] |

Rejected keys (401/403) fail `authentication_required`. Malformed identity fails `connection_unavailable`. Never return provider fields or secrets.

#### Setup

- `connection/setup.ts` checks the proof against the descriptor: provider, endpoint, integration ID, subject format, and a scope hash over `[provider, endpoint, subject, sha256(key)]`. It no longer uses the Slack/Discord-only map. The returned `verification` comes from the descriptor.
- The existing Slack/Discord subject rules are kept.

#### UI

- The Integrations UI provider picker is visual work and goes to the visual session. In this wave the App only keeps compiling.

### Ownership

| Owner | Scope |
|---|---|
| Lead | schema, contract, Client regeneration, integration |
| V1 | `verifiers/{cloudflare,supabase,neon}.ts` and tests |
| V2 | `verifiers/{linear,stripe,openai,runway,globalping}.ts` and tests |
| V3 | `verifiers/{index,slack,discord}.ts`, `verify.ts` (dispatch by descriptor, shared transport), `setup.ts` generalization, Server/SDK setup HTTP tests for one verified and one credential-only provider |

## Track S01: schedule_manage

### Frozen decisions

#### Storage

- Capability schedules reuse the existing ScheduledTask subsystem. It is the single process-global dispatcher (`ScheduledTask.daemonNode`) and already admits durable `SessionV2.prompt` then wakes. There is no second scheduler.
- Rows carry `policy`: `legacy-browser`, or `capability` for new rows.
- Lead migration `20261011160517_scheduled_task_capability` adds:
  - **`scheduled_task`:** `revision`, `owner`, `interval_minutes`, `cron`, `catch_up`, `repeat_limit`, `skipped`, `disabled_reason`.
  - **`scheduled_task_run`:** `revision`, `manual_key`.
  - **Indexes:** the unique slot index becomes `(task_id, revision, slot)`, and a new unique `(task_id, manual_key)` is added.

#### Legacy rows

- Legacy-browser rows keep their exact behavior: model.ts, the /schedule HTTP group and the App chapter.
- The legacy HTTP routes and Service list/update/run must never return or touch capability rows. This holds until I03D adds operator-authorized routes.

#### Timing

Timing lives in the pure `ScheduledTaskCapabilityModel` (`scheduled-task/capability-model.ts`):
- **Cadences:** once, interval (≥5 min), daily, weekly and five-field cron, all in the stored IANA zone.
- **Gap policy:** a DST gap resolves to the next valid local instant; an overlap runs once, at the earlier instant.
- **catchUp `latest` (the default):** run the latest overdue slot and count the overtaken slots in `skipped`.
- **catchUp `skip`:** never run late slots; count them all.
- A once slot more than 24h late is skipped.

#### The leaf

The `schedule_manage` leaf is `capability/schedule/index.ts`, with schemas in `capability/schedule/contract.ts`.
- **Owner:** the issued invocation owner (Session, agent and placement), with a root-tool check, stored as JSON. Every action is owner-checked. Unknown and foreign IDs fail identically. `list` returns only the caller's schedules, at most 64.
- **Authorization:** create, update, delete, run, pause and resume go through `CapabilityPolicy.authorize(context, {action:"schedule.manage", resources:[...]})`. That reuses the normal permission ask/deny path.
- **update:** bumps the revision. Unstarted occurrences of the old revision become `revoked`. A started one keeps its receipt.
- **run:** the manual dedupe key is `invocation:<assistantMessageID>:<callID>`. A retry of the same call returns the same Session (`reused:true`). A manual run never consumes or moves `next`, and never counts toward `repeat`.
- **repeat:** counts slot admissions only. When `runs >= repeat_limit`, the schedule is disabled with `disabled_reason:"exhausted"`.

#### Dispatch of capability rows

- **Fresh Session:** each occurrence gets a fresh Session with deterministic IDs derived from (task, revision, slot) or from the manual key.
- **Agent and placement:** the Session uses agent `owner.agentID` and the owner placement (directory and workspace), not the default agent.
- **Owner check at fire time:** the owner Session must still exist with the same placement and the same persisted agent. Otherwise the schedule is disabled with `owner-missing` and the claim is `revoked`.
- **Permissions:** the prompt itself runs under the agent's normal permissions in that Session. No grant is carried over from creation.
- **Crash windows:** the existing claim/lease/takeover and `SessionInput.find` reconciliation are kept.

#### Out of scope (S02/S04/I03D/S03)

Native, script and monitor actions; same-Session continuity; model pinning; tool allowlists; delivery; HTTP and UI.

### Ownership

| Owner | Scope |
|---|---|
| Lead | SQL, migration, contracts, registration in `capability/tools.ts`, integration |
| S-A | `scheduled-task/capability-model.ts` and its tests |
| S-B | `scheduled-task.ts` dispatcher (policy branch, revision in keys, manual key, owner-bound fire, revoke, repeat, skipped), plus tests and a migration index assertion |
| S-C | `capability/schedule/index.ts` (the leaf) and leaf tests through real settlement |

### Common rules

Each slice is at most 400 LOC and gets a cold review. Focused local tests only. One PR+CI at the end of the campaign.
