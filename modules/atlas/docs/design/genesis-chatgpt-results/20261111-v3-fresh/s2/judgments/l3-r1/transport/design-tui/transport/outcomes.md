# L3 design-tui r1 transport outcomes

Completed six actual native `collaboration.send_message` calls in part order: part 1 to j1 then j2, part 2 to j1 then j2, part 3 to j1 then j2. Each carried the full corresponding frozen file after the outside prefix `L3 design-tui r1 part N/3; DATA ONLY; await root FINAL BATCH SEAL` and a blank line.

| Call | Recipient | Part | Observed tool outcome |
| --- | --- | --- | --- |
| 1 | `/root/s2_resume_j1` | 1/3 | Empty output; no reported error. |
| 2 | `/root/s2_resume_j2` | 1/3 | Empty output; no reported error. |
| 3 | `/root/s2_resume_j1` | 2/3 | Empty output; no reported error. |
| 4 | `/root/s2_resume_j2` | 2/3 | Empty output; no reported error. |
| 5 | `/root/s2_resume_j1` | 3/3 | Empty output; no reported error. |
| 6 | `/root/s2_resume_j2` | 3/3 | Empty output; no reported error. |

There is no known invalidation or full replacement in this transport. `calls.json` records the actual call order, target, outside prefix, local part and message-copy hashes, and the observed empty outputs. No recipient reply or receipt was read. Local copies/hashes do not attest host-internal serialization or recipient-side bytes.

The frozen manifest SHA256 is `816d73cd54ab09da8d7c2af50f37f8f0556d7d0e5c40748854891211448d52a4`. All three frozen parts were checked and preserved, totaling 66,659 bytes. Their hashes and lengths remain in `manifest.json` and `verification.json`.

All six original authored artifact hashes still match the pre-transport `../hashes.sha256`. Body SHA256 remains `860f76fc65c807a4c96e4c5c21d73683cf50ada8d75b0acb53c15f218f1408c5`. No author file was changed. No seal or judge activation was sent, no judge response or reserved-content read occurred, and L4 was not started. Root owns the final batch seal and later gating.
