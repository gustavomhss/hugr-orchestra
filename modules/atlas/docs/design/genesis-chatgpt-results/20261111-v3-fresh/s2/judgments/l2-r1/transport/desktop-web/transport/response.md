# Desktop/web L2r1 literal transport

All four requested `collaboration.send_message` calls completed, in this order:

1. Part 1/2 to `/root/s2_resume_j1`.
2. Part 1/2 to `/root/s2_resume_j2`.
3. Part 2/2 to `/root/s2_resume_j1`.
4. Part 2/2 to `/root/s2_resume_j2`.

Each visible message carried the outside unit/part label and `Wait for principal seal.` followed by the complete corresponding frozen part. Each tool call returned normally with an empty textual result. No delivery ID, recipient acknowledgment or host message digest was exposed. No recipient replies were read.

The immutable manifest SHA-256 was verified as `6970cbfd39c2726bebc24149e752e550b877b6d8e72581d2104d08f15b0c6df4`. Its parts total 48,248 local UTF-8 bytes:

| Part | Local bytes | SHA-256 |
|---|---:|---|
| 1/2 | 25,426 | `9a500eec2f03f738f04216e71e2d0c8152f97f41d9db6983c1c6f92b2f3975a8` |
| 2/2 | 22,822 | `adf7d955814e003416f3361ec7c451a405ba69633cb886e586f5ecca77c48133` |

The `send-*-request.json` and `send-*-message.txt` files reconstruct the actual visible argument form with its exact prefix and full local frozen part. Their local hashes and successful frozen-part comparisons are recorded in `transport-record.json`. These reconstructions are not a host-exported call log; internal serialized bytes are unavailable, so local hashes do not attest internal transport bytes. No literal error is known from the visible calls. The tool acknowledgments establish only that each call returned without error.

The original 18,440-byte body remains SHA-256 `03cd2b45638ff7ce0061f03477dff3d2129dc11ddbdbbc9694e6040a5a70a457`. No semantic or accepted-artifact edit occurred. No judgments, other-author packets, reserved material or agent inventory were read. The producer issued no seal, activation or `followup_task`, and begins no L3 work. The principal owns the seal and subsequent decisions.
