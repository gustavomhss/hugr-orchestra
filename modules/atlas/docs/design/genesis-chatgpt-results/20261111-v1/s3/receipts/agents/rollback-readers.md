# S3 / readers and rollback preparation

- Campaign: `20261111-v1`.
- Native agent: `/root/rollback_readers`.
- Attempt: `s3-prep-rollback-001`.
- Source anchor: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocol: `2689c516d63488be37de678cc853dd4556fd5c13`.
- State: **PREPARED; product execution NOT_RUN; acceptance INDETERMINATE**.
- Candidate, scope/quota S1, accepted generations S2 and S5 judgments: not supplied to this agent. The parent observed S1/S2 branch lookups returning 404.
- Source files were fetched through the GitHub connector, materialized exactly and verified against Git blob IDs. This is a partial source materialization, not a Git checkout and not runtime evidence.

## Deciding findings

### Current and historical reads

`createOwnershipAccess` selects a single ownership carrier from the provenance-filtered current projection, checks per-claim receipts and then calls `readOwnership`. Zero matches hold as `ownership-unpublished`; multiple matches hold as `ownership-ambiguous`; untrusted access refuses before touching the projection. A CAS put alone is not publication.

`readOwnership` validates the manifest, selected artifact and its required closure; it checks closed shapes, CAS identity, review/result/contract/input bindings, validity and dependency result equality. Navigation edges do not create required build edges. A stale declared input produces `ownership-input-changed`; unavailable input produces `ownership-input-unavailable`. A required dependency whose result changed produces `ownership-dependency-changed`.

Historical mode skips only the current-input comparison. It still validates integrity, scope, supported validity, reviews, dependency bindings and output limits, and a successful response explicitly contains `historical: true`. `OwnershipQuery` has no historical-manifest selector: the governed access still selects the presently published carrier. Consequently a historical read of a published generation after source drift is expressible today, but selecting an arbitrary previously published generation is not established by this route.

The sibling agent inspected `ownership-pilot.ts` at blob `6d560596653d640b86f1f0111119340d47dce689`: its read mode prints the complete JSON from `runtime.ownership.read(request)`, so it does not strip the historical flag. This sibling report is a lead for final source verification, not an execution receipt.

### Compatibility comes from inputs and contracts

The host observer computes versions from actual `file:` bytes and `members:` membership. `absent` and `unavailable` remain distinct observations; the legacy currentness function projects both to undefined and cannot recover absence from that value.

The reader's receipt contract is loaded from CAS; whether a changed external contract/recipe invalidates an artifact depends on explicit declared input bindings. S1/S2 must provide those bindings. A numeric manifest version or Git commit order is not compatibility. Historical mode is not activation authority.

`ownershipAttachmentRefusal` checks every declared root with `readOwnership` and the current oracle, never historical mode. A compatible prior manifest can pass that validation. This alone does not show that the actual write reactivates it.

### Source-inspected defect candidate: retained carrier rollback

The exact sequence is an accepted compatible carrier A, a distinct compatible carrier B at the same place, then exact A again. Both CAS objects remain retained.

1. `upsert.ts` computes `contentHashHit` from the append-only projection CAS set.
2. `routeWrite` chooses DEDUP first on that hit, independent of the current row and of `replace`.
3. DEDUP leaves the row pointing to B.
4. `createGovernedEmit` discards the reducer decision and advertises `emitted: true`.

For an authored replay, the inferred result is success reported with B still current. For a promoted replay carrying A's claim receipt, `retainClaimReceipt` can bind the surviving stable ownership claim to A while the representative contentHash remains B. `prepareClaimReceipts` rejects a row whose surviving receipts do not include its representative, so the inferred readback is a carrier HOLD. Neither path demonstrates restored A.

This is **source inspection**, not a reproduced failure. The frozen regression must execute against the exact integrated candidate before a failure or fix is claimed.

## Narrow proposal for serial S5 integration

`proposals/rollback-activation-refusal.patch` adds one check inside the existing atomic governed emit decision: an ownership write whose resulting current contentHash is not its requested contentHash returns `ownership-activation-not-applied` without returning a next projection. It preserves the old generation, CAS retention, authority/ratification, incumbent validation, DEDUP semantics, provenance, replica behavior and spawn policy.

The patch deliberately **does not implement compatible rollback**. It prevents a no-op or inconsistent receipt update from being reported as activation. It makes the unsupported restoration operation an explicit blocker rather than silently changing global DEDUP semantics. Ordinary DEDUP of the actually current carrier still succeeds. The proposed test exercises the existing composed runtime and disk-backed fixture, with explicit synthetic bodies/reviews; it is mechanical regression preparation, not S2 production or semantic acceptance.

An actual compatible rollback still requires a reviewed reactivation contract through the governed door. S5/S1 must decide that contract before changing reducer semantics. No dummy salt, fabricated body, emptied CAS retention set, direct projection edit or invented generation ordering is an acceptable substitute.

Preflight `check` currently validates gates without simulating this reducer outcome. The narrow patch therefore adds an emit-time refusal analogous to other commit-time failures; callers must inspect emitted result and readback. If product policy requires preflight parity for this new condition, that additional scope must be designed and checked serially before integration.

## Prepared cases and execution limits

`cases-readers.json` freezes seven scenario shapes and evidence requirements. Bind actual S1 scope IDs, required closure and independent control before execution. All cases remain NOT_RUN; expected results are source-derived or contract-required, never observed results.

The independent control must have disjoint required inputs/artifacts and no dependency on the deliberately corrupted authority. Two roots sharing the corrupted manifest are not independent. A physical sidecar fallback may choose an earlier readable projection; the composed current reader must still hold if its required inputs are stale. The separate durable/rebuild work item owns causing rebuild failure; this recorte supplies the readback oracle.

The source tests read in this preparation use explicit mechanical review fixtures and an in-process CAS. They do not demonstrate repository-wide coverage, independent judge acceptance, a separate reader process or restoration.

## Verification and next action

No product process, reader, publisher, test, typecheck, guard or CI run was invoked by this agent. No GitHub writes or shared-code edits occurred. Only source acquisition, exact blob verification and preparation-file creation ran. No model API or paid external service was used; native physical attempts/tokens/billing remain UNKNOWN.

The next executable action is to consume verified S1 quota/scope and S2 accepted generations at exact commits, obtain S5's integrated candidate and run these cases through the real allowed runner and read surfaces. The proposed regression requires scoped GitHub Actions under AGENTS.md. Neither the patch's existence nor successful source hashing is a recovery result.
