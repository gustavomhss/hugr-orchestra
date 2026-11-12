# s2.l4.entry transport r1 outcome

Four original native calls were issued in part order, followed by one complete literal replacement to judge 2. Global call 8 contained a known transcription substitution in the design/TUI L1 navigation heading and is invalidated. Global call 9 explicitly superseded it. Its tool result was truncated, so acknowledgment is uncertain. No automatic retry followed.

**Native send attempts and local records are complete. Delivery confirmation is unavailable.** This is transport recordkeeping, not semantic acceptance. No seal or review activation was sent, and no judge response was inspected.

## Actual native calls

| Global call | Part | Destination | Observed outcome |
|---:|---|---|---|
| 5 | 1/2 | `/root/s2_resume_j1` | Empty result; no explicit acknowledgment |
| 6 | 1/2 | `/root/s2_resume_j2` | Empty result; no explicit acknowledgment |
| 7 | 2/2 | `/root/s2_resume_j1` | Empty result; no explicit acknowledgment |
| 8 | 2/2 | `/root/s2_resume_j2` | Empty result; no explicit acknowledgment; INVALIDATED: known transcription error |
| 9 | 2/2 | `/root/s2_resume_j2` | FULL REPLACEMENT for call 8; tool result truncated; acknowledgment uncertain |

This artifact has 5 actual native calls against 4 original expected calls. Across the two artifacts there were 9 judge calls against 8 expected original calls, with one known invalidation and one full replacement. The first eight tool results were empty; the ninth was explicitly truncated. Neither outcome supplies independently verified delivery. No host or received-byte hash is claimed.

## Local verification

The frozen manifest, both complete parts, prepared envelopes and authored body hash were checked against the expected local pins. The authored files and frozen part files were not edited.

- Manifest SHA256: `606b33da8b2a65731506cc859d7745f341f8011ac8424a24d00859cd2fe3c4bd`.
- Body SHA256: `5a91d69ebe975b4c6dff50ad7cb1e76102ed8c35a4d1d43931737d52d6187c67`.
- Total local part bytes: 30321.

| Part file | Bytes | Local SHA256 |
|---|---:|---|
| part-01.txt | 25989 | `a2e9853fdc176e9439612f461d23215be99100232844996852c8ac7c51bbe71f` |
| part-02.txt | 4332 | `b49e3d3fe165ba7094d163b22113212507e16d9caa8bee60bc6522fc52dbee22` |

Exact prepared envelopes are preserved as `payload-01.txt` and `payload-02.txt`; `receipts.json` records each actual call, destination, local hash, result and acknowledgment limitation. `hashes.json` pins these local records and this report; it excludes itself.

## Invalidation and storage recovery

The invalid call used `V2 actions and prompt admission` where the frozen part says `V2 session action boundary`. The local invalid input record is `payload-02-call08-invalid.txt`; the complete replacement record is `payload-02-call09-replacement.txt`. These are reconstructed local records of the actual call inputs, not attestations of host serialization or received bytes. The replacement was caused by a known input error, not by an uncertain acknowledgment.

The initial write of the call 7 receipt failed before process creation because the execution transport disconnected. Storage subsequently recovered. Calls 7, 8 and 9, their outcomes and the local input reconstructions are now persisted. Exact native call timestamps were not available; persistence timestamps are labeled as such.

## Completion boundary

No further send, automatic retry, authoring, product execution, or semantic review was performed. The producer reports these actual outcomes to root and remains idle for explicit continuation.
