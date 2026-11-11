# Durable economic reservation and evidence separation

Layer: **L1 — pinned factual basis**. Need: `evidence`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

The economy envelope names authority, scope, provider/model/route, admitted stages, attempt/in-flight and optional token limits plus retry policy. A sealed request fingerprints those fields, logical identity/snapshot, endpoint/protocol, final request-body digest and per-attempt bounds. Required bound dimensions must be present and positive safe integers within an envelope's limit. A request-body digest is identity evidence; it is not a provider usage receipt. [1]

`reserveAttempt` requires database storage identity, refuses an ambient transaction and performs admission in its own immediate transaction. It checks the exact stored envelope, reconciles the predecessor-derived admission ordinal, rejects conflicting fingerprints, reuses retained completion when available and holds a previously forwarded response whose body is unavailable. Occupancy sums actual settled usage and retained bounds for unsettled obligations; a slot is counted until explicitly released. Corrupt or incomplete accounted dimensions hold/refuse rather than becoming zero. New rows retain exact body snapshot, bound and a forward intent; physical forward observation is separately recorded. [1]

`observeTerminal` records exact remote terminal evidence and releases the in-flight slot. `settleAttempt` additionally requires terminal evidence, matching evidence identity, complete bound usage dimensions and valid numeric relationships. It stores confirmed usage; exceeding an admitted bound blocks the envelope. An HTTP transport error by itself is explicitly not remote terminus. Completion body/reference, physical forward observation and semantic accepted/refused outcome are separate fields. Semantic rejection has no refund path for confirmed usage or held obligations. Recovery reads persisted obligations and does not infer missing evidence. [1]

## Authority and gaps

These facts describe the Core admission ledger module. The existence of these functions does not prove every provider path is governed by them; sender/route integration and the owning executor are required to establish that claim. Nor does this product module measure this Genesis conversation's tokens, physical attempts or billing. Those session economics remain unknown unless exposed by separate observed receipts. No reservation, settlement, fault injection or provider call was run.

## Source anchors

- **1.** `packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — sealed request, reservation, independent observations and recovery, lines 41–110,242–284,409–510,550–615,630–734,783–823.
