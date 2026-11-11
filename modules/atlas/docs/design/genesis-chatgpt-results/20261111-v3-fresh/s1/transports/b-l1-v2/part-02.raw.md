## Promise transport and errors

The inspected runtime composes URL/path/query values, applies client then endpoint then request headers, encodes JSON bodies, and invokes fetch. It distinguishes transport failures, malformed responses, unsupported content types, unexpected statuses, and declared JSON error statuses through `ClientError` plus declared error shapes. A declared error response is parsed and thrown; this code does not independently validate its full declared schema.

JSON success requires a JSON or `+json` media type, nonempty well-formed JSON, and maps read failures into transport errors. No-content cancels any response body and returns undefined. Binary success reads an ArrayBuffer into Uint8Array, but that await is not wrapped by the JSON reader's catch; this packet does not claim that every binary-body failure becomes a `ClientError`. The SSE reader is described in the streaming artifact.

The imported Effect emitter calls `HttpApiClient.make` with the authoritative API value, preserving transformations rather than serializing guessed codecs. Its client-error mapping preserves unrelated errors. Default header snapshots are validated/frozen; unsafe descriptors, invalid header names/values, and CRLF are rejected by the implementation. A default content type is removed for FormData unless explicitly supplied by the request.

## Handwritten streaming transfers

`actions-transfer.ts` shares base URL/fetch/header configuration with the generated client but keeps successful response bodies streaming. The caller owns response-body consumption and cancellation. Requests use manual redirect handling so credentials are not automatically forwarded to a provider-signed redirect. Upload accepts streaming bodies through a duplex support probe and returns an explicit unsupported-streaming reason when the probe fails; this source probe is not a cross-browser compatibility result.

Transfer errors use bounded capture: at most 16 KiB and a five-second read deadline, with truncation and structured reasons retained. They preserve an unknown-outcome state and parse retry information. This specialized error contract is not identical to every generated endpoint's declared error union.

## Evidence and gaps

Full reads: `src/contract.ts`, `src/index.ts`, `src/effect.ts`, `src/wire.ts`, handwritten transfer/error files, build script, package manifest, README, small generated request/client-error modules and both generation manifests. Representative regions of the large generated clients were read; `generated/types.ts` and `generated/errors.ts` were captured without claiming full semantic inspection. Their identities and all omitted generated family members remain explicit in coverage.

`generated/types.ts` is 462,732 bytes. The protocol's current runtime input observer refuses files over 256,000 bytes, so faithful runtime binding of that input needs an explicit later solution. The source is retained and not split to evade the boundary. No code generation, type conformance test, Promise/Effect test, transfer request, or browser execution occurred. Source-supported projection claims do not certify generated-output freshness or client interoperability.
END EXACT BODY


## Candidate s1.api.codegen

```json
{
  "key": "s1.api.codegen",
  "title": "HTTP client generation authority",
  "layer": 1,
  "need": "maintenance",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Regeneration/freshness and generator test fixtures were not executed.",
    "Line-bounded selected type modules do not guarantee every generated input is below the runtime observer byte limit."
  ],
  "build_dependencies": [],
  "body": {
    "path": "producers/b/bodies/codegen.md",
    "encoding": "utf-8",
    "byte_length": 4752,
    "sha256": "2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270"
  }
}
```

BEGIN EXACT BODY
# L1: HTTP client generation authority and failure boundaries

Key: `s1.api.codegen`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Regeneration authority

Root `AGENTS.md` requires regeneration after public Protocol or Server HttpApi changes and prohibits manual edits under Client `src/generated` and `src/generated-effect`. Client `package.json` defines `generate` as its build script, and `check:generated` as generation followed by a Git diff check of those two directories. The maintenance action is `bun run generate` from `packages/client`; it was not executed during this evidence task.

`packages/client/script/build.ts` compiles one reflected contract from `ClientApi`, product group/endpoint naming functions, and the omission set. It emits a Promise product and an Effect imported-contract product. It supplies selected encoded event type references, a configured set of split groups, and output paths. Filesystem services are used by this build-time script, not proof that the generated browser transport imports the Server runtime.

The generic `tooling/httpapi-codegen` package owns compile/emitter/writer behavior. Product naming and endpoint policy remain in Client. The generic README's separation of policy from generation does not mean the compiler lacks an omission parameter; Client deliberately supplies one.

## Compiler constraints

The compiler reflects the HttpApi definition. It rejects required client middleware without a supplied adapter; accepts a single success schema (defaulting an absent one to no content); rejects multiple success or payload schemas; and flattens params/query/headers/payload into one public input object. Those inputs must be supported object shapes, and duplicate field names are rejected. It derives no-input, optional-input, or required-input signatures from the actual fields.

Only an exact `{data: A}` success envelope is unwrapped. Responses with location, pagination cursors, or `hasMore` retain their envelopes. Public name collisions are rejected. This is an explicit generator rule, not a general rule that every API response is unwrapped.

The Promise emitter supports JSON payloads, JSON/no-content/binary success, and supported SSE forms; declared transport errors must have supported JSON/tagged shapes. Structural type emission has explicit unsupported cases, including recursive references. The Effect imported mode imports the original API value so codecs and transformations remain authoritative. A portable emitter cannot silently reconstruct unsupported transformations and is allowed to fail.

## Output ownership and layout

The writer validates flat safe filenames, rejects path traversal/reserved/absolute forms and case-folded name collisions, parses the previous ownership manifest, removes stale files only from that owned list, rejects output symlinks, formats with Prettier, and writes a sorted generation manifest. These safeguards establish intended file ownership. The observed procedure is not an atomic transaction: this packet makes no atomicity or crash-recovery claim for generation.

`layout.ts` splits selected oversized generated type modules at complete declaration boundaries with its configured line targets (400-line threshold, 350-line target in the inspected helper). This is not a global source byte-size ceiling. The actual generated main `types.ts` remains 462,732 bytes; the line-layout helper therefore does not solve the runtime observer's 256,000-byte input limit.

The preserved generated manifests list the exact producer-owned output names. Generated outputs are classified as a family with these manifests and the build script as authority. Representative clients and error/request modules were read; the other generated modules are inventory entries, not separately inferred semantic facts. The generator's test fixtures and generated fixture outputs are also grouped separately from production outputs.

## Evidence and gaps

Full generator reads: `src/index.ts`, `src/layout.ts`, `src/imported-effect.ts`, `src/effect-headers.ts`, `src/error-symbol.ts`, README and manifest. Product authority: Client build, contract, manifest, and root instruction. Exact compile, emitter, writer, layout, and generation-command excerpts are provided to the judges in `review-evidence.md`.

No build, generation, formatting run, test, or Git diff freshness check was executed. The captured generated output is evidence of the pin's bytes, not a locally reproduced result. Browser transitive imports, codegen compatibility across Effect upgrades, filesystem failure behavior, and all unsupported-schema branches need their own real checks when that work is authorized. No fabricated build dependency or runtime version is supplied here.
END EXACT BODY


## Candidate s1.api.sdk-composition

```json
{
  "key": "s1.api.sdk-composition",
  "title": "Embedded SDK and operator transport",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Embedded tests were read but not run; Core lifecycle/recovery and all concurrency isolation remain unproven."
  ],
  "build_dependencies": [],
  "body": {
    "path": "producers/b/bodies/sdk-composition.md",
    "encoding": "utf-8",
    "byte_length": 3478,
    "sha256": "a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3"
  }
}
```

BEGIN EXACT BODY
# L1: embedded SDK composition and operator transport

Key: `s1.api.sdk-composition`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Composition observed in source

SDK Next exposes a single public package entrypoint. `src/orchestra.ts` uses its caller's Effect scope and creates a shared layer memo map, supplies application tools, saved permission and account services, and composes Server routes with Core services. It creates an operator for the local principal with an instance placement scope and wildcard action allowance, then constructs the SDK transport around that authority. This call supplies no additional host contributions.

The embedded path calls `HttpRouter.toWebHandler` over `createEmbeddedRoutes`, acquires/releases the web handler, and invokes its disposer on release. It replaces `FetchHttpClient.Fetch` with the local transport's fetch implementation and uses `http://orchestra.local` as the client base URL. It returns the resulting client methods plus the tool registration interface.

This path does not create a TCP listener. It still executes real Core/Server services through a local HTTP request/response boundary, so “embedded” does not mean providers, tools, databases, or files cannot perform I/O. Server's embedded route construction deliberately disables Basic-password authentication. Capability operator authorization remains active.

## Authority refresh and explicit credentials

`src/operator-transport.ts` issues an SDK-origin credential, freezes the default Authorization header, and forwards requests to the local handler. It changes only a request whose Authorization value still exactly matches the initially issued default bearer. Explicit alternate credentials remain the caller's choice.

A one-permit semaphore serializes refresh. The transport authenticates the current credential; only a pure `CapabilityFailure` of `authentication_required` triggers renewal. Other failures propagate. After renewal it updates the matching request header before invoking the local handler. This is a narrow refresh path, not a promise to recover every revoked, forbidden, malformed, or failed request automatically.

The principal is based on operating-system account identity through the server helper, with a local fallback. Basic usernames do not imply independent local authorization accounts. Host merge rejects reserved service replacements and duplicate composition as described in the boundary artifact; this source supports deliberate reuse of server composition rather than an independently reimplemented session service.

## Evidence and intended checks

Full reads: SDK `src/index.ts`, `src/orchestra.ts`, `src/operator-transport.ts`, README, package manifest, embedded test, and import-boundary test; plus Server `routes.ts`, `principal.ts`, `auth.ts`, relevant authorization modules, and Core `host.ts`. Exact excerpts are in `review-evidence.md`.

The embedded tests contain intended checks for admit-only prompts, waking execution, durable event sequences, missing-session errors, and host instance isolation. Those tests were inspected, not executed. This packet does not assert test passage, real model execution, durable recovery, or host isolation under every concurrency pattern. The separate operator transport tests in the assigned population were inventoried but not read. L1 source support ends at the composition and branching shown above; lifecycle claims need accepted Core and runtime evidence.
END EXACT BODY


## Candidate s1.api.surface-disposition

```json
{
  "key": "s1.api.surface-disposition",
  "title": "Assigned API population and evidence depth",
  "layer": 1,
  "need": "entry",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "183 assigned entries are inventory-only; 190 captured source modules have literal surface depth, not full semantic reading.",
    "Required oversized generated input retained; no unavailable runtime observation is relabeled absent or supplied with a fabricated version."
  ],
  "build_dependencies": [],
  "body": {
    "path": "producers/b/bodies/surface-disposition.md",
    "encoding": "utf-8",
    "byte_length": 5168,
    "sha256": "611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda"
  }
}
```

BEGIN EXACT BODY
# L1: assigned API population and evidence depth

Key: `s1.api.surface-disposition`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This artifact establishes disposition and reproducible source identity, not semantic acceptance of every implementation in the population.

## Population ownership

`population.json` supplies 472 assigned Git blobs: four architecture briefs; 76 Client entries; 65 Protocol entries; 124 Schema entries; 13 SDK Next entries; 157 Server entries; and 33 HTTP API codegen entries. `coverage.json` gives every assigned path exactly one primary family, kind, depth, justification, source-read status, need, and artifact key. Secondary artifact references retain useful overlaps without duplicating ownership.

The capture contains 291 exact sources: 289 assigned paths and two explicit boundary authorities, root `AGENTS.md` and `packages/core/src/host.ts`. All 252 handwritten production TypeScript modules under assigned `src/` trees are captured. The reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading. These totals include the two boundary authorities. Capturing bytes or extracting imports does not imply full implementation review.

`surface-index.json` preserves literal import/export/endpoint/handler lines and source identity for 253 production modules: the 252 assigned modules plus Core's host boundary. It is a navigation and inspection aid. The associated family mapping identifies domain surfaces such as Actions, Atlas, Board, capability management, Relay, RAG Studio, scheduling, MCP, integration, meeting, permissions/questions, project, skills, and VCS. For modules outside the decisive session/transport/composition reads, this packet claims their declared names/import seams only. Their domain rules, database effects, and failure semantics remain unproved.

## Rational grouping

| Family | Treatment |
| --- | --- |
| Decisive Schema, Protocol, Server, Client, SDK and generator sources | Full reads feed the bounded factual bodies, with exact evidence excerpts. |
| Other handwritten production modules | Exact byte capture and literal surface index; implementation semantics not accepted by inventory. |
| Generated Client output | Build script, generic generator, and both output ownership manifests identify regeneration authority; selected output is representative, remaining entries are inventory-only. |
| Tests and exercise harnesses | Ten test files read as intended assertions; the remainder grouped by package and test/fixture/harness role. None executed. |
| Generator test fixture output | Test material, not the public Client generation product; grouped with generator verification support. |
| Package manifests, README, guides, architecture briefs | Manifests and guides inspected; historical briefs remain intent evidence. Unread config/support files are explicitly inventory-only. |

## Provenance and verification boundary

All remote source reads used the GitHub connector at the immutable source revision. Base64 contents were decoded unchanged into `sources/<repo path>`. Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path. The Git blob identity was recomputed from the preserved bytes, then source/body/coverage transport checks were performed locally. These checks validate artifact mechanics, not the product.

No local product test, package install, code generation, network server, provider call, remote mutation, or runtime importer was run. No reserved answer/oracle was read. No L2 predecessor is invented and no judge or runtime receipt is asserted. The fragment remains in progress until the parent performs the required two-judge review and subsequent exact binding.

## Gaps that remain visible

1. The 183 assigned paths without captured source content are classified from their complete pinned inventory metadata, not semantic reading. Grouped test/generated/support claims are deliberately limited.
2. Most domain production modules received surface indexing only. Their presence is accounted for, while deeper ownership questions require targeted reads or the relevant domain artifact.
3. Generated `types.ts` is 462,732 bytes, beyond the protocol's current runtime observer limit. Its required input is retained; the later binding must explicitly handle or remain blocked on that boundary.
4. Generated freshness, runtime import boundaries, HTTP interoperability, lifecycle behavior, and observed test outcomes remain unverified in execution.
5. The pinned client README disagrees with actual generation of binary `fs.read`; the handwritten Actions upload path lacks a matching declaration in the inspected Actions transfer group/handler; and public V2 annotations remain despite normalization intent. These are source mismatches, not silently repaired conclusions.

This body is supported for the bounded population/provenance statements above. It is not a substitute for acceptance of every assigned file, a complete end-to-end architecture, or a successful Atlas runtime binding.
END EXACT BODY


# Correction provenance and original preserved diff

Exact supplied data; SHA256 `64ac8e480700d842cd59eac7bf753574062b412c8f9260cead913e152100d404`; bytes 1733.

--- producers/b/bodies/session-contract.md
+++ revisions/b-l1-evidence-v1/corrected/session-contract.md
@@ -19,5 +19,5 @@
 The prompt handler forwards the request fields to `session.prompt`. It maps `PromptConflictError` and `PromptBlocked` to the declared 409 conflict shape. The protocol describes admission separately from execution, including optional resume. This source supports the API admission result and adapter mapping; it does not on its own prove transactional persistence, crash recovery, scheduling, or exactly-once execution inside Core.
 
-Command admission resolves and renders a slash command, applies any resolved agent/model choices, combines attachments, and calls the prompt path. Missing command resolution maps to an invalid request; an MCP-backed command failure is logged and returned as an unknown server error. Explicit agent/model switching, rename, archive, and remove use their declared no-content responses. Archive is described as a visibility toggle without stopping execution. Recursive history removal and interruption on delete are declared responsibilities delegated to Core.
+Command admission resolves and renders a slash command, applies any resolved agent/model choices, combines attachments, and calls the prompt path. Missing command resolution maps to an invalid request; MCP-backed command failures map to `UnknownError`. The inspected mapping branch contains no logging call. Explicit agent/model switching, rename, archive, and remove use their declared no-content responses. Archive is described as a visibility toggle without stopping execution. Recursive history removal and interruption on delete are declared responsibilities delegated to Core.
 
 ## Error and location behavior


# Original decisive evidence, unchanged

Exact supplied data; SHA256 `b16b4f18dad4c2910f7d0b7a8327004063a198ed1637a85e747e24ba5db13edd`; bytes 62330.

# Compact exact review evidence

All source below is from commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This is an economic projection of the preserved full `review-evidence.md`, SHA-256 `e83ac99c3f78c23dfb5f6c1c597796e6fa8857b4b9f73f3003e613094a4729c9`. Ranges are inclusive. Code-fence contents are copied unchanged; gaps between ranges are explicit. No source was rewritten and no test was executed. The full source manifest and full evidence archive remain available for follow-up.

## Artifact → exact source map

- `s1.api.boundaries`: C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12.
- `s1.api.client-projection`: C06, C10, C17, C34, C35, C36, C37, C38, C39, C42, C43.
- `s1.api.codegen`: C01, C06, C08, C40, C41, C42, C43, C44.
- `s1.api.schema-contracts`: C02, C13, C14, C15, C16, C17, C18, C19, C20.
- `s1.api.sdk-composition`: C07, C12, C45, C46, C47.
- `s1.api.server-edge`: C05, C09, C24, C25, C26, C27, C28, C29, C30, C31, C32, C47.
- `s1.api.session-contract`: C16, C21, C22, C23, C24.
- `s1.api.stream-contract`: C18, C19, C20, C33, C34.
- `s1.api.surface-disposition`: P1.

## P1 — population and fidelity observations

The source manifest has 291 captures: 289 of 472 assigned files plus root AGENTS and Core host. All 252 assigned handwritten production src/*.ts modules are preserved; the literal surface index has 253 modules including Core host. Read register: 97 full source reads, 2 representative generated reads, 190 literal surface-indexed sources, 2 captured without semantic reading. The other 183 assigned paths remain inventory-only. The local checks validate source bytes, inventory identity, coverage bijection, excerpt/body hashes and transport shape; they do not validate the product or grant semantic acceptance.

Required generated input `packages/client/src/generated/types.ts`: 462732 bytes, Git blob `fca4633666a639d550065312a13e48c6ce221d12`, SHA-256 `2763d389d2694a6737719865cbabbbdfee937d81a86497b783c246cdaf76ef0f`. The protocol's current 256,000-byte observer limit remains an unresolved binding boundary. This is captured-but-unread source, not an accepted semantic type inventory. The two output manifests in the full archive establish 40 Promise output names and 14 Effect output names; generated members are not all semantically read.

The three source discrepancies are kept visible: README raw-file omission versus generated binary fs.read; handwritten upload path versus the inspected two-operation Actions transfer group/handler; V2 identifiers versus unversioned guide intent. No regeneration, bundler, HTTP request, model turn, judge acceptance or runtime binding is asserted.

## C01 — `AGENTS.md`

Git blob `ef3b523b0c00aed722582b870c1919188edc4c4f`.

Lines 1–2:

```
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
```

## C02 — `packages/schema/AGENTS.md`

Git blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`.

Lines 3–3:

```
`@orchestra/schema` owns browser-safe wire and storage contracts shared by protocol, server, core, and generated SDKs. Keep runtime behavior, service layers, side effects, and host-local implementation details in the domain package that owns them.
```

Lines 14–14:

```
- Contracts are unversioned: use names like `Session`, `Permission`, `Question`, and identifiers like `Permission.Request`.
```

Lines 28–28:

```
- Core may compose Schema contracts with runtime behavior into a deliberate domain facade, but the facade must re-export the exact canonical Schema value. Do not create a second schema identity.
```

Lines 41–41:

```
- Use the package `optional(...)` helper for optional object properties, including nested structs and event payloads, so encoded objects omit `undefined` keys.
```

## C03 — `packages/schema/package.json`

Git blob `ecf66e31d4fe2d72b2e503a978cedaf09db0080f`.

Lines 122–124:

```
  "dependencies": {
    "effect": "catalog:"
  },
```

## C04 — `packages/protocol/package.json`

Git blob `517e462e6c645c726c26b9027d03ee55d6bc2dfc`.

Lines 69–72:

```
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "effect": "catalog:"
  },
```

## C05 — `packages/server/package.json`

Git blob `1e2d83907eaac06d0da1571ac7ceab9f528102b7`.

Lines 36–45:

```
  "dependencies": {
    "@orchestra/core": "workspace:*",
    "@orchestra/llm": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/rag-studio": "workspace:*",
    "@orchestra/relay": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "drizzle-orm": "catalog:",
    "effect": "catalog:"
  },
```

## C06 — `packages/client/package.json`

Git blob `4cd0244e98ff18b5e65d3c2808196705095b6691`.

Lines 7–10:

```
  "exports": {
    ".": "./src/index.ts",
    "./effect": "./src/effect.ts",
    "./contract": "./src/contract.ts"
```

Lines 13–14:

```
    "generate": "bun run script/build.ts",
    "check:generated": "bun run generate && git diff --exit-code -- src/generated src/generated-effect",
```

Lines 18–29:

```
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "@orchestra/protocol": "workspace:*"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.83"
  },
  "peerDependenciesMeta": {
    "effect": {
      "optional": true
    }
  },
```

## C07 — `packages/sdk-next/package.json`

Git blob `7b96125b9aa768181cc99c19028659e6d9e72da3`.

Lines 7–9:

```
  "exports": {
    ".": "./src/index.ts"
  },
```

Lines 14–21:

```
  "dependencies": {
    "@orchestra/client": "workspace:*",
    "@orchestra/core": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "@orchestra/server": "workspace:*",
    "effect": "catalog:"
  },
```

## C08 — `tooling/httpapi-codegen/package.json`

Git blob `72c383d240c98fbc21e463cb60b3b3533fbd7553`.

Lines 13–16:

```
  "dependencies": {
    "effect": "catalog:",
    "prettier": "3.6.2"
  },
```

## C09 — `packages/protocol/src/api.ts`

Git blob `40b5b5bd266b8a9bd3893f74d5429bf535dc01d7`.

Lines 59–59:

```
// Protocol owns middleware placement, while Server injects concrete keys so Core service identities stay downstream.
```

Lines 73–79:

```
    .add(LocationGroup.middleware(locationMiddleware))
    .add(AgentGroup.middleware(locationMiddleware))
    .add(makeSessionGroup(sessionLocationMiddleware))
    .add(makeResearchArtifactGroup(sessionLocationMiddleware))
    .add(MessageGroup.middleware(sessionLocationMiddleware))
    .add(ModelGroup.middleware(locationMiddleware))
    .add(ProviderGroup.middleware(locationMiddleware))
```

Lines 121–126:

```
    // Last-applied middleware runs first: authenticate before caller-selected Location construction.
    .add(makeCapabilityOperatorGroup(locationMiddleware))
    .add(makeCapabilityConnectionsGroup(locationMiddleware))
    .add(makeCapabilityArtifactsGroup(locationMiddleware))
    .add(makeCapabilitySchedulesGroup(locationMiddleware))
    .add(CapabilityContentGroup)
```

Lines 134–135:

```
    .middleware(Authorization)
    .middleware(SchemaErrorMiddleware)
```

## C10 — `packages/client/src/contract.ts`

Git blob `1dccaeb657cc106b7a8cba93f5f5c34a8faf8680`.

Lines 1–5:

```
import { makeDefaultApi } from "@orchestra/protocol/api"
import { InvalidRequestError, SessionNotFoundError } from "@orchestra/protocol/errors"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

class LocationMiddleware extends HttpApiMiddleware.Service<LocationMiddleware>()(
```

Lines 10–19:

```
class SessionLocationMiddleware extends HttpApiMiddleware.Service<SessionLocationMiddleware>()(
  "@orchestra/client/SessionLocationMiddleware",
  { error: [InvalidRequestError, SessionNotFoundError] },
) {}

export const ClientApi = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

```

Lines 119–126:

```
export const omitEndpoints = new Set([
  "pty.connect",
  "pty.connectToken",
  "actions.transfer.read",
  "actions.transfer.upload",
  "capability.artifact.content",
  "capability.content.read",
])
```

## C11 — `packages/server/src/api.ts`

Git blob `e1ab621208cf063ff1ce846ded0205e9b8dae93e`.

Lines 1–8:

```
import { makeDefaultApi } from "@orchestra/protocol/api"
import { LocationMiddleware } from "./location"
import { SessionLocationMiddleware } from "./middleware/session-location"

export const Api = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})
```

## C12 — `packages/core/src/host.ts`

Git blob `a0fc5bc9a36e50315b0ddddf4de3566555711250`.

Lines 40–56:

```
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions in order; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const duplicate = repeated(contributions.map((item) => item.id))
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const locationNodes = contributions.flatMap((item) => item.locationNodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
  const node = repeated(nodes.map((item) => item.name))
  if (node) throw new Error(`Host contribution node is not unique: ${node}`)
  // A contributed Location node may not shadow a built-in one either; changing a built-in is a replacement.
  const builtIn = new Set(locationServices.dependencies.map((item) => item.name))
  const location = repeated(locationNodes.map((item) => item.name)) ?? locationNodes.find((item) => builtIn.has(item.name))?.name
  if (location) throw new Error(`Host contribution Location node is not unique: ${location}`)
```

## C13 — `packages/schema/src/schema.ts`

Git blob `d19a39b9708cfcaeedc1d7c62503afbadfee5dd7`.

Lines 6–16:

```
export const RelativePath = Schema.String.pipe(Schema.brand("RelativePath"))
export type RelativePath = typeof RelativePath.Type

export const AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"))
export type AbsolutePath = typeof AbsolutePath.Type

export const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
```

Lines 25–30:

```
export const DateTimeUtcFromMillis = Schema.Finite.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
    encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value)),
  }),
)
```

## C14 — `packages/schema/src/session-id.ts`

Git blob `3603ebe703b7b350018626a74e794f94e33079a3`.

Lines 5–12:

```
export const SessionID = Schema.String.check(Schema.isStartsWith("ses")).pipe(
  Schema.brand("SessionID"),
  statics((schema) => {
    const create = () => schema.make("ses_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
```

