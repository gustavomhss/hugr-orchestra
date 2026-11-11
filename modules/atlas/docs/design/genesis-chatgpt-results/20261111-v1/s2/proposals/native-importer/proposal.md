# PREP-S2-01 — native ownership importer proposal

**State: PROPOSAL_NOT_APPLIED.** This is author preparation, not a producer run, acceptance, publication, or evidence that AC-04/05/06 passed.

Source baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Protocol: `2689c516d63488be37de678cc853dd4556fd5c13`.
The 25 source/protocol files listed in `source-index.portable.json` were read through the GitHub connector and verified against their Git blob SHA. Preparation has no candidate implementation commit.

## Delivered patch

`native-importer.patch` proposes three files:

1. New `modules/atlas/packages/adapter-io/src/ownership-native-import.ts`: two-phase private candidate preparation and binding of original S5 decisions.
2. New `modules/atlas/scripts/ownership-native-import.ts`: executable `prepare` / `bind` caller. It accepts an explicitly pinned plan and bundles of original visible requests, responses and coordinator-observed transport receipts.
3. `modules/atlas/packages/knowledge/src/index.ts`: exports six EXISTING ownership shape guards; their implementations and semantics are unchanged.

The existing pilot, stores, projection, runtime composition, authorization, ratification and read gates are untouched. CAS writes create immutable, unserved objects. There is no `emit` mode and no new model API. The output of `bind` remains a private manifest; S3/S5 must use the existing governed activation path and S4 must verify actual host reading.

## Observed fit

The existing pilot fixes the scope `session-input`, fixed L1/L4 populations, historical review identifiers and a special `runtime-import-binding` approval. It cannot become a repo-wide native importer by substituting IDs.

The existing ownership model already distinguishes body bytes, result authority/validity/gaps, receipt bindings and manifest roots. Raw bytes are retained in `OwnershipBody`. Non-NFC body text is preserved: the proposal applies no identifier normalization to the body and rejects only invalid UTF-8/unpaired-surrogate conversion or an empty body. Original JSON response bytes remain separately addressable, so JSON escaping and body extraction are auditable.

A manifest is single-scope. Its dependency keys resolve inside that manifest, and artifact/result authority scopes must match. S1 must select coherent scope boundaries; a differently scoped historical result cannot silently become a predecessor by copying its hash. Full required-key coverage comes from a frozen scope control; there is no assumption of four documents per file or domain.

The current attachment validator checks root closures. The proposal additionally calls `readOwnership` for EVERY required entry and every root before returning an imported private manifest, covering navigation-only entries too.

## Mandatory S1/S5 inputs

The proposed protocol fields are a proposal for serial integration, not an assertion that S1/S5 already delivered them.

The `NativeOwnershipPlan` requires source, protocol and implementation revisions, scope and layer, exact required keys, new entry specifications, roots, source bindings, predecessor result bindings, contract CAS identity and two actual appointed reviewer identities/epochs.

Its mandatory byte-bound control files are:

- `scope`: a JSON `ownership-native-scope/v1` value with campaign, scope, layer, sourceRevision, protocolRevision, requiredKeys, entries and roots. The importer compares these values to the plan.
- `criteria`: the pinned S1 criteria catalog, retained as an explicit input.
- `contract`: an existing-schema `OwnershipContract`; its exact parsed CAS identity must equal the plan contract.
- `envelope`: the pinned S1 quota/envelope. Actual reservation and settlement remain S1/caller obligations, not a financial claim by this adapter.
- `recipe`: the executing script bytes. The caller also requires the helper implementation input in every new entry.
- `reviewers`: `{kind: "ownership-native-reviewers", version: 1, campaign, reviewers: {J1: {id, epoch}, J2: {id, epoch}}}`, supplied from S5's observed roster.
- For L2–L4, `previous-layer`: `ownership-native-layer-acceptance/v1` with the previous layer number, exact previous manifest/import receipt, `ACCEPTED_SCOPED`, scope/campaign and the same appointed pair. The prior manifest and all prior entries must still validate, including the appointed reviewer names.

Each control carries `{commit,path,sha256}` and a real `file:` input version. Source control bytes must satisfy both SHA-256 and Atlas's existing ownership-source identity. Commit authenticity is verified by the coordinator through GitHub, not inferred from the SHA string.

The original visible producer request is JSON with `kind: "ownership-native-request"`, `version: 1`, `plan: id(plan)`, `key`, the exact sorted input bindings, exact dependencies and `task`. Additional dossier data can remain in that original request. The response is JSON with the exact fields `kind`, `version`, `requestSha256`, `key`, `body`, `authorityBasis`, `validity`, `gaps`, `evidence`. It uses `kind: "ownership-native-response"`. Explicit blocked validity yields HOLD; fixture defaults are absent.

The external coordinator preserves a `ownership-native-transport-receipt/v1` recording actual adapter, campaign, completed state, session/agent/attempt identities, request/response SHA-256 and a pinned reservation reference. This is an observation receipt, not cryptographic authentication of the native host. The original tool observations must remain in the campaign handoff. Tokens, billing and physical attempts are UNKNOWN unless actually exposed.

S5's original JSON decisions follow the pinned judging fields, including candidate revision, exact review-document SHA-256, every required criterion, evidence and reasons, no unresolved critical findings, and both PASS decisions. Original judge requests and transport receipts must bind the appointed role/identity/epoch to that same candidate. The importer preserves the raw decisions, then translates their exact PASS bindings to existing `OwnershipReview` objects. It never creates a favorable decision from an absent, malformed, FIX-FIRST, HOLD or REQUEST_EVIDENCE response.

## Commands prepared, not executed

After S5 integrates and pins the candidate, the caller is:

```sh
bun modules/atlas/scripts/ownership-native-import.ts prepare "$ISOLATED_CANDIDATE_REPO" "$BUNDLE_JSON" "$NEW_RESULT_JSON"
bun modules/atlas/scripts/ownership-native-import.ts bind "$ISOLATED_CANDIDATE_REPO" "$BIND_BUNDLE_JSON" "$NEW_BOUND_RESULT_JSON"
```

The variables are discovered absolute paths. Output files use exclusive creation; an existing output is evidence to inspect, not an implicit retry. The command checks its executing code root and candidate HEAD. It does not claim a clean complete checkout merely from HEAD equality: source materialization and dirty-tree evidence remain in the caller's execution receipt.

A bundle is `{kind:"ownership-native-bundle",version:1,plan:{path,sha256},submissions:[...]}` for prepare. Each submission names actual key/sessionId/agentId/attemptId and `request`, `response`, `receipt` file references `{path,sha256}`. Bind uses the same plan, the exact candidate descriptor, and `reviews` with role/reviewer/epoch plus original file references. Paths are relative to the bundle directory; out-of-root paths are refused. Files are never evaluated as code.

## Precise remaining lanes and limits

1. **Historical-body reuse is not implemented by this native lane.** The 20 accepted historical bodies and operational supplement are not native JSON responses. Do not wrap them in new JSON and label that wrapper an original native output. A separate explicitly labelled reuse import must preserve historical bytes, their original decisions and receipts; compare body/authority/source/recipe/contract and scope; then obtain new S5 import-binding decisions for changed identities. The existing pilot continues to be the bounded historical importer. This proposal does not claim repo-wide reuse completeness.
2. Rebuild/cache execution remains in `rebuildOwnershipUpdate`, with callbacks consuming genuinely produced outputs and exact captures. This patch does not run native models inside synchronous recipe callbacks and does not prove zero new interpretations, affected-set correctness or completed rebuild.
3. Real review provenance and authority are coordinator/host facts. Hash integrity and two distinct strings do not authenticate judges; the pinned S5 roster and original tool observations are necessary. The existing governed door still decides publication.
4. The private manifest has not been admitted, activated or served. A low-level private validation read is not an Atlas-only consumer/readback claim.
5. The proposal has not been executed or typechecked. The initial S1 handoff reported by the parent permits preparation only. Production scope, interfaces, per-layer contracts, production quota, two-judge acceptance and integration are still pending.

## Verification actually completed

- 25 fetched files: exact Git blob SHA verification, SHA-256 and byte lengths recorded.
- `git apply --check native-importer.patch` against the verified source materialization: exit 0.
- Static author inspection and explicit body-normalization / malformed-input / original-result-binding corrections.
- Tests: NOT_RUN. Typecheck: NOT_RUN. Native production/importer execution: NOT_RUN. Two-judge acceptance: absent.
- No external model call, GitHub mutation, shared source edit, projection mutation, policy change or activation was performed by this task.
