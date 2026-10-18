# Actions compaction handoff — 2026-10-14

## Owner stop line

Latest owner instruction, verbatim:

> caralho que demora absurda. So to vendo bun test atras de bun test, nao tem agent paralelizando trabalho ,ta TUDO ERRADO. salva o estado, vou te compactar

**Work is paused for compaction. Do not start another test, typecheck, generation,
build, agent wave or provider call before the owner resumes.** Owner is unhappy
with excessive validation loops and ineffective delivery cadence. Resume must
prioritize concrete mock/UI gaps through disjoint parallel execution, with one
change-scoped integration verification, not another serial test campaign.

Communication: Portuguese, persistent caveman full. Be direct about remaining
work; do not defend elapsed time or claim 100% parity.

## Active checkout and authority

- Integration: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/actions-runtime`.
- Branch: `actions-runtime`; known HEAD `e6d9a35f1b2434262ae846f37d5725b1f062e085`.
- All Actions changes remain local/uncommitted. Latest CI snapshot uploaded 271
  changed files. No implementation commit/push/PR/merge performed.
- `git status --short --branch` inspected at pause: branch unchanged; tracked
  manifest/lock/generated/registries plus untracked Actions source/tests/specs.
- Canonical checkout is unrelated dirty user/peer work; do not clean or integrate it.
- Scope is **100% approved mock**, including resources/settings/dialogs/source
  review. Not universal GitHub/GitLab API parity.
- Mock authority:
  `/Users/gustavoschneiter/Documents/HuGR/_worktrees/actions-campaign/artifacts/actions-mock`.
- `UI-MOCK-PARITY.md` P01–P20 remain OPEN. No final visual/function/lifetime
  qualification; do not mark closed from source or passing unit tests alone.
- Existing W1/W2/W3 evidence/briefs are retained under `docs/specs/actions`; the large
  backend foundations were already reviewed before this continuation.

## Owner authorization clarification

See `AUTHORIZATION-POLICY.md` for exact question and verbatim answer:
**“Permitir pedido (Recommended)”**.

- Unknown authorization permits an explicit, structurally valid native request.
- Unknown never becomes Available or a permission claim.
- Existing mock confirmations and native binding/actor/target/version checks remain.
- Known denials, historical mutations, inherited restrictions and unresolved
  identities remain blocked. Ambiguous outcomes never automatically retry.
- No live provider mutation was authorized for validation. Browser work performed
  provider reads and local binding creation only.

## Completed during continuation

### UI and routing

- Dialog centering fixed with scoped logical insets and auto margin.
- `ErrorState.message` now typed `ActionKey`; views translate it instead of
  rendering `orchestra.actions.*` literally. Native/server auth have safe copy.
- Removed duplicated library headings/provider strips through explicit embedded
  props; contextual global header hidden. Source graph does not show fake execution
  Unknown statuses; terminal glyph matches approved node style.
- Native `Workflow.defaultRef` projected from GH/GL catalog metadata. No recent-run
  branch inference. Missing native default stays unresolved; no guessed `main`.
- Shared `WorkflowTabs`: Job graph / Runs / Source. Workflow history filters exact
  workflow ID, separate from source ref. Native identity completion replaces URL
  entry; real Back/Forward round trip verified.
- Run graph loads exact attempt jobs. GitLab historical links no longer infer
  current configuration path as historical pipeline identity.
- GH workflow search/state filtering now local to bounded page, avoiding unsupported
  native GH query/state parameters.
- `request-policy.ts` implements owner-approved explicit Unknown request policy;
  hooks added to library/detail/context/resource/source controls. Do not assume
  every old control/command path was audited for identical policy.

### Source proposals

- Schema `Actions.SourceBase { bindingID, ref, commit }` added; native branch head
  can be observed without an existing workflow file.
- Core `authoring/base.ts`: immutable project lookup, actual short branch/default
  branch, exact head SHA; missing default fails. Draft validation rechecks commit,
  uses explicit `draft:sha256:<digest>` local identity, never fabricated blob SHA.
- Core facade + Protocol/Server source routes:
  `GET /api/actions/source/:bindingID/base` and
  `POST /api/actions/source/:bindingID/validate-draft`.
- Client regenerated after public API change.
- Critical authoring bug fixed: `branch(...)` previously returned no string;
  now returns validated value. `Schema.is(String)` narrowing replaced with
  decodeUnknownOption/Option to avoid `never` inference.
- Source draft controller asynchronously observes base, keeps new-file Source idle,
  guards binding/revision/route/generation, cancels late reads and validation.
- Publish remains three separate stable-UUID leases: branch → write → review,
  with branch-head/file readbacks, exact ACKs and explicit unknown recovery.
- Sent latch prevents late prepared receipt authorizing a duplicate send.
- Owner-only command output retained transiently; cleanup and persistence redaction
  covered by controller tests.
- Historical/SHA source remains immutable. Current local edits do not falsely
  present Unknown permission as Available.
- Source dialogs accept draftBase; model refresh skips nonexistent draft file.
- **New workflow GUI flow has not yet been browser-verified.**

### Resource integration and concrete preservation fixes

- `resource-payload.ts`: hidden create-only flag omitted on GL edits; blank optional
  numbers omitted; numeric group ID converted; schedule redacted overrides preserved
  unless replacement explicitly selected; namespace choice added.
- Exact runner label/tag arrays preserved via JSON-array input. Unknown platform
  no longer silently selects Linux; group ID collected for GH JIT enrollment.
- GH installed runner name/platform and immutable secret/type/scope edits constrained.
- Native artifact metadata shared between run/resources views. GH artifact downloads
  omit unsupported numeric attempt; raw run/pipeline IDs, bytes and expiry preserved.
- Artifact dialogs search both artifact and resource pages.
- Local binding policy loaded separately from native provider settings; dialog
  reads local policy fields and native inherited evidence remains distinct.
- GL cache snapshot request omits unsupported pagination.
- GH cache delete carries exact native key/ref into input and admission target.
- Selected GL environment editor resolves compatible reviewer IDs to exact usernames
  through bounded GET lookups. Unresolved group/role/wildcard policy stays read-only;
  no blank reviewer value silently replaces native rules. See `dialog-data.ts` and
  `config-environment-reviewers.ts`.
- One-time runner/review output is no longer discarded by API `.operation` projection.
  `command-output.tsx` is lazy, masked enrollment display, explicit copy, owner-only
  live state, no preferences/receipt persistence.

### Output safety/lifetime

- Artifact mutations use shared native authority/actor/send boundary; exact native
  project/run/scope and sanitized version checks. Unsupported commit/source/attempt
  preconditions reject before send. Preflight errors stay definitely_unsent; GL keep
  requires post-send identity and explicit null expiry.
- Output and GH byte transport watchdogs now preserve typed deadline failure even
  if downstream holds last chunk or upstream EOF was cached. Dedicated process
  scope prevents early disposal adopting a live transfer child; monitor failures
  captured as Exit values.
- Signed HTTPS production trust policy was not weakened.
- Conformance fixture fixes: optional client-cert Bun event no longer destroys
  credential-free signed peers; native mTLS and signed CA separated; fresh compiler
  process avoids stale repeated Bun.build state; TLS negatives use fresh listeners
  because Bun 1.3.14 setSecureContext does not change live default certificate.
- Independent Node TLS fingerprint oracle checks actual served certificate before
  negative trust/hostname assertions. Effect v4 oracle constructor fixed to
  `Effect.try({ try, catch })`.
- Resource transport fixture changed from retrying Bun fetch to fresh raw Node HTTP
  request; peer-consumed DELETE reset must not be replayed by the fixture itself.

## Exact latest verification evidence

No new verification is running at pause. Tests run remotely, never locally.

| Evidence | Result / reach |
| --- | --- |
| App CI `38556178871` | Linux + Windows: 68 pass, 0 fail, 400 assertions, 9 explicit controller/helper files. Includes source proposal cancellation, phase order, readbacks, unknown/manual recovery, redaction. Not DOM/visual parity. |
| Earlier App CI `38525980329` | 41 pass per OS, 5 files, native default/ref/history changes. Superseded for controller source by 68-test run. |
| Catalog CI `38527206685` | 20 pass per OS; native defaultRef/read semantics. |
| Backend CI `38560201762` | 113 tests: Linux 103 pass/10 fail; Windows 104 pass/9 fail. Source/authoring/config cases passed; failures drove output fixture/lifetime fixes. Do not call whole batch green. |
| Focal backend CI `38566931111` | 40 tests: 37 pass/3 fail per OS. Runner/cache/schedules, typed watchdogs and GH mutation guards passed; two TLS negative oracle faults + GL fixture metadata fault remained. |
| Focal CI `38571003301` | 8 tests: 6 pass/2 fail per OS. Both artifact mutation tests passed; TLS fingerprint oracle had incorrect Effect.try signature. |
| **Latest CI `38574604017`** | **Signed output: 6 pass, 0 fail, 111 assertions per OS; Omni positive control 45 real spawns.** Includes positive reads, pre-byte expiry, partial/no retry, unsafe redirects, cancellation/watchdog, native-CA isolation and wrong hostname with fingerprint controls. |

URLs: `https://github.com/gustavomhss/hugr-orchestra/actions/runs/<ID>`.
Combine evidence by changed scope; do not rerun the whole backend list because a
later focal lane closed its known failures. Strength/mutation controls are still
required before landing; no implementation merge is authorized.

Latest local package checks:
- App/Core/Server typechecks passed after source-base integration.
- Core latest typecheck passed immediately before final signed CI after oracle fix.
- Client generation passed serially after source routes; direct Client typecheck
  predates the new SourceBase routes and has not been repeated.
- App production build passed with backend host127.0.0.1/port4101.
- Initial parallel generation/typechecks hit120s timeout under shared machine CPU
  load; serial600s calls passed. They are not additional code failures.

## Browser evidence / processes

Verification-owned processes; do not restart or stop existing app/server processes.

- Production app preview `http://127.0.0.1:4478` serves current `packages/app/dist`.
- Latest own backend `http://127.0.0.1:4101`, log TEMP `actions-current-backend.log`,
  isolated XDG `actions-current-{data,config,state}`, DB `actions-current.sqlite`.
- Prior own backends4098/4099/4100 remain;4101 started before latest raw transport
  watchdog fixes. Do not claim current process loaded later module changes.
- Native GH auth confirmed as `gustavomhss`; `GH_CONFIG_DIR=/Users/gustavoschneiter/.config/gh`
  preserves legitimate CLI config without copying credentials. Isolated XDG hid it
  in earlier signed-out verification.
- Required native Omni env points to TEMP `desktop-native-omni.es0JyC/darwin-x64/`
  `hugr_omni.node` and `hugr-omni-supervisor`.
- Build must use `VITE_ORCHESTRA_SERVER_HOST=127.0.0.1` and matching backend port.
  Otherwise production entry seeds app-origin as another server and subscribes to
  HTML `/api/event`. Default selection alone does not exclude subscriptions.

Artifact root: `$TEMP_ROOT`, the original reserved temporary root for this capture.
Set `TEMP_ROOT` to that capture root before resolving the unchanged filenames below.

- `actions-first-view-20261014.ts` now targets4101 and outputs
  `actions-current-browser-20261014.*`.
- Latest real journey: local binding200 → connected native workflow library →
  graph on actual `dev` → scoped Runs → Source → Back/Forward, asset/dist hashes
  checked. No page exceptions; overall diagnostic gate still FAIL due existing
  shell `GET /api/relay/run`404. Do not erase/classify that as clean.
- Earlier continuation screenshots: `actions-continued-browser-20261014-*`.
- `actions-error-check-20261014.{ts,json}` used signed-out backend4099:
  native400/not_authenticated → translated safe message; modal centered in English
  LTR/dark, forced RTL/dark and narrow420px/light; buttons inside; Escape/focus return.
- New current library/workflow images were captured after duplicate heading fixes
  but latest images have not all been read/reviewed against mock.
- `actions-ui-baseline.{ts,json}` and `actions-ui-baseline-native-cicd.png`: original
  before-UI production baseline. 5 warmups/20 serial cycles, live heap/DOM/listener
  controls. Home retained heap/DOM NOISY; documents/listeners flat. Existing HTML SSE
  retry noise recorded. **Final retained-memory/performance comparison not done.**

## Remaining concrete work — do not claim complete

1. Browser-verify New workflow → native base → local editor → Validate → review
   dialog, without sending live provider mutations. Verify dirty-draft escape/reload
   behavior and known-denial/historical states. Source phases have controller/native
   fixture evidence, not a real provider mutation journey.
2. Audit remaining old controls against shared request policy. Legacy RunControls/
   JobSteps paths may not yet enforce the same known-denial/historical button state.
   Schedule non-owner play/delete still interacts with universal `writable()` guard
   in command selection; action-specific eligibility needs correction.
3. Dispatch modal currently derives typed inputs from main graph/route. Opening
   from library may fall back to raw JSON rather than mock's native typed fields.
   Need view-owned dialog-scoped graph/ref inspection, lazy and bounded.
4. Variables scope picker still lacks independently loaded environment choices and
   variable-list selected scope. Do not use a variables-only page as environment list.
5. GL New configuration path currently constrained by native config-slot authoring;
   actual local template/file proposals need a carefully scoped contract if mock
   promises them. Never pretend multiple independent GL workflows.
6. GL environment newly created policy semantics and unresolved native group/role
   forms need honest native-specific UI. Read-only metadata is not a proof every
   promised mock action works. Reviewer lookup helper tests written in worker were
   not copied to root; selected editor path needs focal proof.
7. Desktop `platform.downloadResponse` streaming bridge still absent/unverified;
   current web save uses FSA or optional platform seam. No whole-file Blob fallback.
8. Remaining P01–P20 visual/state/interaction checks: actual recorded CI definition/
   run38177025125, real run/jobs/log/artifact journeys, all resource dialogs, keyboard,
   full RTL/light/narrow matrix. Screenshots/controller tests do not close them.
9. Final production retained-memory/DOM/listener comparison and cleanup controls.
10. Update stale inventory/implementation docs and parity ledger with precise scope
    evidence. This handoff is current authority for continuation state.

## Agents and isolated sources

No active writers at pause. Completed tasks/sources remain recoverable; never copy
older worker files over parent fixes without reading diff.

- Actual Luna auth/URL audit: session `ses_ec6e01709ffemMPkAaaNZYWAsh`.
- Luna workflow parity: `ses_ec6e1638bffeFWrx2Xpj8ahd75`.
- Luna payload helper: `actions-ui-dialogs`, `ses_ec6ae5effffeTrcL7Hew1c8BmP`.
- Luna artifact projection: `actions-ui-resources`, `ses_ec6aebe1affeh3xSRuvLYqcL5U`.
- Luna native SourceBase: `actions-source-review`, `ses_ec635ce2cffevYbJZosSA2SCd5`;
  helper integrated with parent branch-return and case-normalization fixes.
- Frontend source proposal writer: task `ses_ec6382ae5ffeoGw9HSoHs55Zzs`,
  `actions-ui-data`; requests/commands/source-view deltas integrated. Exact test
  copy SHA256 `f4906ca22d1d8bcd63fe559224e4be39f74a9f6eac5c1b3579644fa6dc367df4`.
- Luna env reviewer helper: `actions-resource-config`, `ses_ec60df8dfffeXoWXwsNERBhr21`;
  helper integrated, worker test still isolated.
- Watchdog writer: task `ses_ec5b2a5abffeYZWf4TIa8Ndoxm`, `actions-qualification`;
  production/test deltas integrated; parent branded ExitCode test fix retained.
- Signed fixture writer: task `ses_ec5b2a5c1ffeCz9pB9aFTpio7d`, `actions-output`;
  deltas integrated. Parent latest Effect.try({try,catch}) fix may not exist in worker.
- Root-owned registry/Schema/Protocol/Server/generated/i18n/model changes were
  integrated by lead. Do not let every next worker touch these shared sites.

## Standing repository rules

- Honor root/package AGENTS. Tests only `bun run test:ci` from repository root;
  explicit file lists and requested OS. No local tests/full suites/per-edit loops.
- `bun typecheck` from package only. After public API changes generate from client;
  no handwritten generated edits.
- Cap6 nontrivial agents, truly disjoint files/worktrees; Luna for simple work,
  actual CLI/model proof, compact returns. Lead keeps architecture/review judgment.
- Runtime dependency directions remain Schema → Core/Protocol → Server; Client
  runtime never imports Core/Server.
- Preserve native identities/ref/commit/attempts, durable leases/redaction/unknown
  outcomes, streaming bounds and Location/process ownership. No Session/timeline drift.
- Do not commit/push/PR/merge without explicit owner authorization. Do not stop/
  restart existing app/server; preserve peer/user worktrees and dirty files.
