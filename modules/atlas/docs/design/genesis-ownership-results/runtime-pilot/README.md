# Isolated ownership pilot — evidence checkpoint

**Outcome: HOLD at RP-7.** Technical/import success is not consumer acceptance or pilot closure.

`evidence-manifest-v1.json` records hashes for exact exported decisions, consumer envelopes, actual
Atlas calls/results, the frozen harness and scoped CI reports. Decision files preserve the sole original
UTF-8 text part without JSON reserialization; original receipt digests and message/session IDs remain
in the manifest. The full original runtime v3 verdict is retained even when its nested import approval
passed. No overall HOLD has been rewritten into PASS.

`cold-consumer.py.txt` is the byte-exact historical harness transcript, not a portable executable.
It retains the original experiment's local paths for reproducibility/provenance; do not run it as a
repository command. Its hash remains identical to the executed source.

## What the evidence establishes

- `terra-1-evidence-v3.decision.json` and `terra-1-closure-v4.decision.json`: complementary technical
  review, including the bounded reviewer-identity and check/emit evidence closures.
- `terra-2-evidence-v3.decision.json`: complementary import mapping, not runtime acceptance.
- `terra-2-closure-v4.decision.json`: bounded RP-5 execution and E1/E2 calibration PASS.
- `terra-2-reserved-v1.decision.json`: H1/H2/H3 **HOLD**, omitted required propositions, no listed
  critical errors. Read the exact answers and reasoning rather than inferring completeness from safety.
- `ownership-runtime-results.json` and `ownership-mutation-receipts.json`: actual downloaded scoped CI
  reports from [run 42135009305](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42135009305),
  head `0f21e6a20e9e57bf6d65d9b8e1438839f290968e`. Not the final integrated epic.
- `consumer-*-result.json`: actual returned bodies/sections and final answers. `*.atlas-call.json`
  preserves native command exit/stdout/stderr, including the Bun directory-mismatch diagnostic.

The consumers used isolated published manifest
`960bfad7f31f9b9a6d67b81f6c38aab15fa2cbd2278dcbe49ad106215e6fd012` through actual Atlas
read/index operations. The carrier was emitted through the existing governed door under an isolated
actor/token; this does not change owner production policy or authenticate structural reviewer strings.
The exact complementary approval adapter is preserved in `binding-approvals-v3.json`.

## Stop line

Do not rerun or tune against these reserved answers, replace the judges, relabel exposed cases as fresh
held-out evaluation, or claim pilot completion. Any subsequent remediation needs a separately explicit
contract that preserves this failed evaluation. Accepted producer bytes remain unchanged. Integrated
epic, final review/landing, production installation and global campaign closure remain unproved.
Physical provider attempts and billing are not settled by these exports.

## Follow-up diagnosis

The owner subsequently authorized investigating content, consultation and evaluation causes.
[The diagnosis](../../genesis-ownership-consumer-diagnosis.md) distinguishes H1's consulted-but-omitted
provenance condition from H2's entry-only response without its named diagnostic read. One H3-only
clarification by the same Terra 2 sustained HOLD on the distinct contract/design handoff; H1/H2 were
not appealed. `consumer-diagnosis/evidence-manifest-v1.json` binds the exact clarification request,
decision, outgoing-request proof and baseline-checked code excerpts. This new evidence is separate:
the original evaluation manifest, original judgments and accepted corpus bytes remain unchanged.

## Separately authorized consumer v2

[Consumer v2](consumer-v2/README.md) executes the owner's subsequent correction request with a frozen
consultation protocol, fresh exposed-regression Sessions and three newly authored independent cases.
Four cases PASS and two HOLD in the same Terra 2's semantic judgment. This is evidence of bounded
improvement, not pilot completion; original HOLDs and this directory's predecessor manifest are intact.
