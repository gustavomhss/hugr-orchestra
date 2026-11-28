WP-R0 implementation is complete as a proposed candidate. **The final code is frozen in eight repository-relative files** under `/workspace/scratch/aff930d22ec7/s4/producers/runtime/modules/atlas/`.

## Handoff

- [implementation-report.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/implementation-report.md) contains the implementation decisions, exact operational sequence, authority requirements, limitations and final file hashes.
- [implementation-files.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/implementation-files.json) lists all eight changed paths, byte lengths, SHA-256 values and Git blob IDs. Its SHA-256 is `7cc3030936807ca61a26d0a065642fd577f875837a7ec23fbc53f4d255cfaf6a`.
- [native-package.example.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/native-package.example.json) and [binding-record.example.json](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/binding-record.example.json) give the complete structural shapes. Their placeholders deliberately prevent treating examples as executed evidence.
- [original-request.md](sandbox:/workspace/scratch/aff930d22ec7/s4/producers/runtime/original-request.md) preserves the visible producer dispatch.

## Implemented boundary

The adapter prepares exact body/result/contract objects in the existing CAS, validates transport structure and source/reference bytes, uses the actual observer's kernel input versions, and preserves build/navigation separation. Publication recreates the candidate and requires two distinct, externally supplied, exact binding decisions covering the candidate, contract, every criterion, every result and every input/dependency identity. It then uses existing ownership validation and `composeRuntime.check` → `atlas-emit`. CLI index/read calls return the actual ownership-port responses.

The original pilot is unchanged. The only existing-file modification exports the existing `isOwnershipNeed` validator from the knowledge package. No new store, automatic policy, reviewer identity or synthetic acceptance was introduced.

For this host, a binding decision can use `decision_id_kind: "response-sha256"` and `decision_id: "sha256:<response_ref.sha256>"`; it is explicitly a content identifier, never an invented host message ID. Original judge prose remains preserved by reference and CAS body.

## Authority and limits

The explicit user authorization for an isolated execution permits ordinary local policy setup. The report specifies a policy authorizing the actual `/root` principal for the exact candidate scope, optionally binding the root anchor to that scope. `ATLAS_RATIFY_TOKEN=/root` can truthfully name that authorized principal as the responsible ratifier: the baseline defines this value as a named declaration, not a secret or authentication proof. This setup does not replace either binding decision or relax any existing gate. Its actual check/emit outcome must still be recorded.

The initial adapter explicitly refuses cross-package build dependencies, unavailable inputs and the existing observer's excluded or oversized sources. Those domain entries remain open coverage work. Historical commit membership is labeled `external-capture-evidence-required`; local bytes and blob identities do not fabricate Git history. Rebuild, recovery, rollback and migration remain separately scoped capabilities.

## Validation status

No product tests ran locally. I authored `packages/adapter-io/test/genesis-native.test.ts` for the authorized remote route, covering byte preservation, source identity, malformed payloads, symlinks, bounds, binding completeness, CLI query validation, blocked artifacts, authority-sensitive identity, governed publication and real index/read with explicitly synthetic test fixtures. Eighteen connector-fetched baseline captures were verified against their Git blob IDs.

The primary reported a successful candidate typecheck and was notified to refresh the final code before its final typecheck and remote snapshot. **Use the primary's final receipts for execution, CI and release claims.** All producer writes stayed in the exclusive area, with no remote writes and no reserved-oracle inspection.
