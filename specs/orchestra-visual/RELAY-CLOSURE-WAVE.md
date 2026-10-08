# Relay closure wave — 2026-10-08

Owner instruction: "vamos em frente, paralelize oque puder. nao quero debitos nem loose ends".

Baseline: `d0299accb79ed51b4b590801e45ac479d95a6c14`, reconciled with dev `73651a0e69`.
Mode: hybrid. Authors edit isolated, disjoint worktrees; the lead owns shared integration,
generated clients, workflow gates, final native wiring and the milestone PR.

| Slice | Owned files | Dependency | Acceptance |
| --- | --- | --- | --- |
| V1 admission foundation | Schema V1 user/event, Core V1 admission receipt/projection/SQL/migration, narrow tests | Frozen contract below | Atomic single-event persistence; exact retry, conflicting reuse, cross-process winner, rollback/replay; ordinary edit APIs unchanged |
| Nix toolchain | New `nix/bun.nix`, `nix/electron.nix`, measured source manifest | Existing locked Nixpkgs; upstream archive downloads | Bun 1.3.14, Electron 42.3.3; four measured archive hashes; compatible derivations; no guessed hash or shared lock change |
| Python runtime disposition | Unpinned authoring launch pair and affected current docs/catalog/index | Frozen oracle inventory | Remove obsolete production launcher without removing workload tools, test dependencies, guards or pinned bytes; native routing documented; docs and relevant runtime checks pass |
| V1 prompt/delivery/history | Orchestra prompt/save/bridge/serializer/Claude/continuity/compaction and narrow tests | Admission foundation reviewed and integrated | Host-owned sidecar, hooks before prompt effects, stored winning retry, all real provider branches and historical summaries retain ordered notes |
| Nix native closure | CLI/Desktop/dependency derivations, final output checks and Actions jobs | Final clean runtime producer + toolchain | Native four-system hashes/builds and final installed artifact contracts; no warning-only or skipped build accepted |
| W6 binding/lifecycle | Explicitly acknowledged shared Task/Session/Arsenal/Relay files | Archie/host authority handoff + seat baseline | Immutable proposal/publication identity, actual authorship and approved scope; one evaluator/arm; no UI execution or extra provider loop |

## Frozen V1 admission contract

V1 currently upserts message and parts independently. Preserving only the first reminder while
allowing a conflicting prompt overwrite would create silent debt and is rejected.

- Public PromptInput does not accept promptContext. Optional typed User promptContext reuses
  `PromptContext.Info`; existing rows/events without it remain decodable.
- A private creation receipt is not an inbox: it has no pending/delivery/runner state. It binds
  globally unique V1 message ID, Session ID, identity version, canonical original request and
  the immutable winning User-plus-parts snapshot.
- Original request identity includes model/agent/tools/format/system/variant and ordered raw
  multipart inputs. Exclude Session/message IDs (bound separately) and noReply (execution scheduling
  control). Encode through PromptInput schema, sort object keys recursively, preserve array order,
  text bytes and optional-field absence. Do not infer equality from projected or plugin-mutated text.
- One typed V1 PromptAdmitted event carries the receipt, User and all parts. Its projector validates
  identities and inserts all rows in EventV2's existing transaction. No batch publication API,
  outer transaction around publish, new coordinator or provider loop is introduced.
- Existing receipt lookup permits exact retry before hooks. Concurrent first callers may evaluate
  hooks twice; the projector serializes their admission. A narrowly tagged AlreadyAdmitted defect
  rolls back the losing publication before sequence/event/wake/notification writes; the live Session
  entrypoint catches only that tag and reads the winner. Conflicting Session/request or historical
  ID without original provenance fails with a named conflict. Arbitrary defects never become success.
- Replay preserves normal EventV2 checks and reconstructs the receipt. Ordinary message/part edit APIs
  retain their behavior. Legacy UI notification fan-out happens after the single committed event.
- Allocate final message ID before hooks; protect host identity/context from mutable plugin output.
  Denial precedes message/part admission and prompt-side effects. Only newly admitted winner performs
  admission-related mutations; retries may request execution through existing noReply semantics.

## Verification and landing

Each author pushes a first compiling checkpoint, uses explicit staging, and splits source/test
commits for independent review budgets around 400 changed LOC. Run only affected tests through
test:ci on Linux and Windows. Required negative controls must fail runtime assertions, not setup.
No author opens or merges a WP PR; the lead closes one milestone after cold review and applicable CI.

Frozen golden/fixtures/reviews and ORACLE source pins remain byte-exact. Existing Python tooling and
regression dependencies are retained for their named current role, not silently called retired.
Missing runners, consent/accounts/provider registration, schema authority or final producer inputs
are unresolved blockers, not waivers or completed work.
