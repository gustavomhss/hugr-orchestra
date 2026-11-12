# Desktop/web L4 transport receipt

## Outcome

Four native `collaboration.send_message` packet requests were issued: part 1 to J1 and J2, then part 2 to J1 and J2. Each request contained its full literal frozen part after the outside label `L4 desktop-web N/2; producer-safe DATA ONLY; wait for ROOT FINAL BATCH SEAL`, followed by two newline characters. No packet was replaced or invalidated, and no known literal error was identified.

The first call returned the visible notice **“Output exceeded the available model context and was truncated”**. Its acknowledgment is **UNCERTAIN**. This notice is not treated as a normal empty return and does not establish whether delivery succeeded or failed. The other three calls returned no visible output or error; that observation is not a recipient acknowledgment or received-byte attestation. Root was informed and explicitly directed that no automatic retry occur. Root owns confirmation of J1 part 1 presence/completeness and any specific retransmission request.

| Call | Target | Part | Observed acknowledgment status |
|---|---|---|---|
| 1 | `/root/s2_resume_j1` | 1/2 | UNCERTAIN |
| 2 | `/root/s2_resume_j2` | 1/2 | EMPTY_TOOL_RETURN_NO_VISIBLE_ERROR |
| 3 | `/root/s2_resume_j1` | 2/2 | EMPTY_TOOL_RETURN_NO_VISIBLE_ERROR |
| 4 | `/root/s2_resume_j2` | 2/2 | EMPTY_TOOL_RETURN_NO_VISIBLE_ERROR |

These are four packet calls, plus one separate status message to root before this receipt was written. No seal, activation, follow-up task or reviewer-reply inspection occurred. Mechanical integration and literal transport do not establish semantic acceptance.

## Frozen local identity

| Item | Local bytes | SHA-256 |
|---|---:|---|
| `manifest.json` | 879 | `e1dae5d4022127e460f1d9ebdbf92ea8a5ad8534752b9068a31fcb232427dad8` |
| `part-01.txt` | 25,718 | `0a38dd52158f21234591ef99bd5a7289f7d51914a63ecbd83de94f719a6b605a` |
| `part-02.txt` | 20,496 | `1e3493ee00de020508f5c6ce2d3f30dc573e72d24ef5fb70591de583b55f8c99` |

The two local parts total **46,214 bytes**. The body remains **11,183 bytes**, SHA-256 `108d1e2b9a1e9d73ea32282a5b9268777088897f42ba8702b16b9b9400f28efa`. All six author files listed in `../artifacts.sha256`, and that hash list itself, were checked against their prior hashes and lengths and remain unchanged.

## Preserved evidence and limits

`transport-record.json` records actual call order, target, part, observed result, uncertainty, local identities and integrity checks. `send-01-message.txt` through `send-04-message.txt` preserve full local message reconstructions; the matching request JSON files preserve target/message arguments. The corresponding tool-result files preserve the visible result text, including the first truncation notice and three empty returns. The immutable manifest is copied, and the root freeze instruction, status request and subsequent uncertainty-handling instruction are preserved. `transport.sha256` binds these local receipt files.

The envelopes are retrospective reconstructions from visible native calls and immutable local parts, not host-exported request logs. Suffix checks establish that the reconstructed local envelopes contain the exact frozen local bytes. Host-internal serialized requests and recipient received bytes are unavailable and are not attested. No send timestamp was invented; only receipt creation time and actual call order are recorded.

Reads remained within this producer's L4 area. Writes were confined to `transport-r1`. No author body or companion was edited, and no reserved content or reviewer response was inspected. The producer stops here; root retains the final seal, activation, completeness confirmation and review decisions.
