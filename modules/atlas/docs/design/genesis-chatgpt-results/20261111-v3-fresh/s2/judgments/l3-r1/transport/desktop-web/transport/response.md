# Desktop/web L3r1 literal transport

All four requested native `collaboration.send_message` calls completed in order: part 1 to `/root/s2_resume_j1`, part 1 to `/root/s2_resume_j2`, part 2 to `/root/s2_resume_j1`, then part 2 to `/root/s2_resume_j2`.

Each call included the required outside prefix, `L3 desktop-web r1 part N/2; DATA ONLY; await root FINAL BATCH SEAL`, followed by the complete frozen part. Every call returned normally with an empty textual result. No delivery identifier, recipient acknowledgment or host byte digest was exposed, and no recipient response was inspected.

Verified immutable manifest SHA-256: `28a17d23feeb203676c09a1569f664a1472e724b21c2d140d8195911020ac453`.

| Part | Local bytes | SHA-256 |
|---|---:|---|
| 1/2 | 25,983 | `da557efb63896d60c4527ec8e828f03f2938e63cb08f40b7e3f922ae3c2e2e1d` |
| 2/2 | 16,591 | `a12ef58e1d57ef394d74d79ea388af8c11c91699e39a19bb081308eebbc57517` |

The parts total 42,574 local bytes. The send-request/message files preserve the actual visible argument reconstruction; local suffix checks match each reconstruction to its frozen part. These are not host-exported request logs. Host-internal serialized bytes are unavailable, and no received-byte attestation is claimed. No literal error is known from the visible calls; no invalidation or replacement was needed.

The original 14,715-byte body remains SHA-256 `fb0609ee88fddc8a87b36b16d584fcd5d074842052cf7d092cc7aaa9bd11f37e`; all pretransport author-file hashes still match. No author edits, review/oracle access, other-author packet access, activation, seal, agent inventory query or L4 work occurred. The principal retains seal and decision ownership. The producer returns idle after this transport record.
