# Operator artifact API (I03B, first slice)

Baseline `1bee0e49f1`. This wave gives the host operator protected access to artifacts through the same authority model as connection management. It covers metadata listing, describe, verified bytes with HTTP Range, share, pin and reference removal. Project export, a UI (U03) and jobs (I03C) are out of scope here.

## Frozen decisions

### Selector, authority and placement

A Session ID is a selector only (C1). Placement comes from the stored Session row (`project_id`, `directory`, `workspace_id`). Authority comes from the operator binding. The facade never builds a `Tool.Context` and never consults model `CapabilityPolicy`.

A request is served only when all three of these hold:
- A reference row exists for `(artifact_id, revision, session_id)`.
- The artifact record exists.
- `record.owner` has the same placement as the Session.

Missing records, a placement mismatch and pure authority rejection all collapse to one constant failure, `artifact_unavailable`. There is no existence oracle.

### Operator targets

| Action | Resource | Used by |
|---|---|---|
| `artifact.list` | `{kind:"session", id:sessionID}` | `list` |
| `artifact.read` | `{kind:"artifact", id:artifactID}` | `get` and `content` |
| `artifact.share` | the artifact resource, plus `{kind:"session", id:targetSessionID}` against the target's stored placement | `share`; both targets must pass |
| `artifact.pin` | the artifact resource | `pin` |
| `artifact.reference.delete` | the artifact resource | `removeReference` |

Placement is always the source Session placement, except for the second share target.

### Reads

- `list` returns only references of that Session whose record placement matches. Order is `(artifact_id, revision)` ascending. Limit defaults to 16, maximum 32; the facade fetches limit+1. The cursor is the plain `<id>:<revision>` of the last returned item, so it never names an omitted row. Coverage is `live`.
- The projection is exactly `CapabilityArtifactManagement.Artifact`. `pinned` is true when the reference flag is set or a pin row exists for that Session. Owner, producer and user metadata are never returned.
- `content` returns the whole bounded blob through `ArtifactBlobs.read`, which verifies the hash and MIME. Corruption maps to `artifact_corrupt`. Range slicing is done by the Server.

### Mutations

- Mutations go through `CapabilityRequest.commit(target, payload, write, verify)` with the request idempotency key. Payloads are `{sessionID, artifact, input}`. Write callbacks are SQL-only.
- `verify` runs both on replay and fresh. It rechecks that the Session still has the captured placement and that the artifact record still matches it. It does NOT require the reference to exist, so an exact retry of `removeReference` reconciles after the row is gone. If the record was garbage-collected, the retry is `artifact_unavailable`.
- Fresh `write` callbacks:
  - `share` requires the source reference. The target Session must exist with the same placement; a different placement is `artifact_unavailable`. It inserts the target reference on conflict do nothing. Data is `{artifact, sessionID}`.
  - `pin` requires the reference. It applies the same SQL as the Core `pin` for the source Session (pin row with the owner, plus the reference flag). Data is `{artifact, pinned}`.
  - `removeReference` requires the reference. A pinned reference fails with `reference_pinned`. Otherwise it deletes the reference row. Data is `{artifact, removed:true}`.
- A changed payload under the same idempotency key is a conflict through the ledger.

### HTTP

Protocol group `capability.artifact`, in the flat file `groups/capability-artifacts.ts`. It uses the same middleware chain and ordering as `capability-connections`.

| Route | Endpoint | Body | Response |
|---|---|---|---|
| GET `/api/capability/sessions/:sessionID/artifacts` | `list` | `ArtifactQuery` (query) | `ArtifactPage` |
| GET `/api/capability/sessions/:sessionID/artifacts/:artifactID/:revision` | `get` | | `Artifact` |
| GET `/api/capability/sessions/:sessionID/artifacts/:artifactID/:revision/content` | `content` | | raw bytes |
| POST `.../:revision/share` | `share` | `ShareInput` `{targetSessionID}`, idempotency-key | `Receipt` |
| PUT `.../:revision/pin` | `pin` | `PinInput`, idempotency-key | `Receipt` |
| DELETE `.../:revision` | `removeReference` | idempotency-key | `Receipt` |

Content response rules:
- Headers: `Content-Type` is the record MIME, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`, `Accept-Ranges: bytes`, and `ETag: "sha256-<hash>"`.
- A single `bytes=` range (`a-b`, `a-` or `-n`) returns 206 with `Content-Range`.
- An unsatisfiable range returns 416 with `Content-Range: bytes */<size>`.
- A multi-range or malformed header returns a full 200.

Error mapping:

| Failure | Status |
|---|---|
| `artifact_unavailable` | 403 (same constant body as connections) |
| `invalid_input` | 400 |
| `reference_pinned` | 409 |
| `artifact_corrupt` / IO | 500 |

`content` is omitted from generated Clients, like the binary `fs.read`.

## Ownership

| Owner | Scope |
|---|---|
| Lead | Schema `capability-artifact-management.ts`; Core `management-contract.ts`; shared `CapabilityArtifacts.storage`; Protocol `api.ts` and Server `handlers.ts` aggregation; Client contract and generation; integration |
| Author A | `artifact/management.ts` (reads + composition of mutations), Core read tests, and the pre-existing failing fixture test `capability-artifacts.test.ts` "missing storageID…" (fails at `1bee0e49f1` with "Capability commit requires SQL transaction identity") |
| Author B | `artifact/management-mutation.ts` and Core mutation tests |
| Author C | Protocol group, Server handler, Range and headers, Server HTTP tests against real SQL and the real facade |

Each author slice is at most 400 changed LOC, followed by a cold review. Focused local tests only; one PR+CI at campaign end.

## Landing results

The wave landed on `native-capabilities`. Each author slice passed a cold review of at most 400 LOC, and every check the reviewers flagged as unable to fail was fixed and probed red, then restored green:

| Slice | Head | Content |
|---|---|---|
| Author A, `artifact-reads` | `16c9efb484` | Read facade, shared helpers and Core read tests. |
| Author B, `artifact-mutations` | `5a8f10a313` | Ledger-backed share/pin/removeReference, with race and conflict tests. |
| Author C, `artifact-http` | `d8ec5b5b6a` | Protocol group `server.capability.artifacts`, Server handler with Range and headers, Server and Protocol tests. |

### Lead integration

- The group is registered in Protocol `api.ts` and the handler in Server `handlers.ts`. The handler now uses the shared `Api`.
- `Global.node` was added to the Server routes services and to the Orchestra host app group. The facade needs it for the shared blob root.
- Client generation is updated: group `artifacts`, with `capability.artifact.content` omitted because it is binary.
- `ShareInput` is renamed from `{sessionID}` to `{targetSessionID}`. The old field collided with the `:sessionID` path param in Client generation. The receipt data is now `{artifact, targetSessionID}`.
- Two aggregate route tests were added, one in Server (`capability-artifacts-routes.test.ts`) and one on the full Orchestra host (`httpapi-capability-artifacts.test.ts`). They check that requests are authenticated first and that every selector failure returns the same constant 403 body. Removing the group and handler registration turns the Server test red.

### Fixed along the way

The `capability-artifacts.test.ts` test "missing storageID…" was already failing before this wave. Its fixture was dropping the `inTransaction` identity, and production was correct, so only the fixture changed.

### Verification

This is a local focused run, not campaign CI:

| Test | Result |
|---|---|
| Core read | 7 pass |
| Core mutations | 9 pass |
| Core artifacts | 24 pass |
| Server HTTP | 8 pass |
| Protocol | 9 pass |
| Server aggregate routes | 1 pass |
| Orchestra host routes | 1 pass |

Typecheck passes in schema, core, protocol, server, client, sdk-next, orchestra and app.

### Follow-ups

- Project export.
- Artifact UI (U03).
- Jobs and process control (I03C and J02).
- One shared authority-rejection helper, replacing the copies in connections and artifacts.
- Revisit the status code for SQL failures. It is 500 here and 403 in connections.
