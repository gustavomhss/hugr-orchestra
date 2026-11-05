---
name: event-maintenance
description: Maintain Orchestra durable event definitions, manifest, publishing, replay, ordering, storage or seal verification. Use when changing these paths or investigating their compatibility and ordering traps.
---

# Event maintenance

This is a repository-only contributor map, not a runtime seat skill.

| Owner | Responsibility |
| --- | --- |
| `packages/schema/src/event.ts` and `durable-event-manifest.ts` | Event definitions, versioned durable keys and replay/decode inventory. |
| `packages/core/src/event.ts` | Publish, transactional projection, replay, notification and durable reads. |
| `packages/core/src/event/order.ts` | Per-aggregate delivery tickets and release. |
| `packages/core/src/event/sql.ts` and `compaction.ts` | Event/sequence storage and snapshot-compaction marker. |
| `packages/core/src/event/seal.ts` | Canonicalization, hash chain and bounded verification. |
| `packages/core/test/event-order.test.ts` and `event-replay-compaction-marker.test.ts` | Focused ordering and replay-marker coverage. |

## Invariants and traps

- A durable definition has an aggregate field and version; the durable manifest indexes durable definitions by versioned type and rejects duplicate keys. Replay and durable decoding look up that inventory and decode data against the matching definition; an unknown durable type fails. Registering a definition alone is not replay admission. Projectors are currently keyed by event type, with exact type/version binding still a TODO for incompatible historical payloads.
- For persisted durable events, projectors and the optional local commit hook run in the immediate transaction before the sequence and sealed row are written. When ordered notification is requested (normal persisted publish or replay with publish), the notification ticket is taken last in the transaction. Delivery normally follows ticket order for that aggregate within the event service, not a global order. If a waiting delivery is interrupted before its predecessor finishes, its ticket is released and a successor can overtake that still-running predecessor. A listener reentering the same aggregate delivers inline to avoid deadlock. Tickets are released on failed transactions and on delivery exit, including interruption; a committed event is not rolled back by a later interrupted observer. Non-interrupt listener failures on this path are logged and isolated.
- `persist: false` projects locally without writing the durable log or advancing its sequence, and cannot be combined with a commit hook. It is not a durable replay path.
- Replay checks the snapshot-compaction marker inside the transaction before duplicate acceptance or projection. A marked database rejects replay, while local publish still works. A strict owner conflict errors before duplicate checks. Existing-sequence replays must match the stored event or diverge; for a new sequence, a different existing owner with `strictOwner: false` returns without insertion or next-sequence validation. Otherwise the next aggregate sequence is required. `replayAll` requires one aggregate and contiguous input sequences and commits the batch transactionally.
- Sealing hashes canonical stored row fields and the predecessor using SHA-256. The JSON roundtrip normalizes values as storage does, and publish materializes the encoded JSON once for both sealing and storage. Preserve compatibility with the stored canonical representation and both current and legacy hash domains when changing this path. This hash chain checks integrity; it is not an authenticated signature or notary.
- `verifyWindow` is bounded to an aggregate and requested sequence interval (at most 2048 rows and 8 MiB). `VERIFIED_WINDOW` means that window verified, not automatically the whole history; inspect `historyComplete`, anchor and reasons. `UNKNOWN` covers incomplete/unsealed or compacted history where no broken condition was found; `BROKEN` reports detected inconsistencies. Invalid, oversized or acquisition-failed requests are errors, not verification statuses.

## Change checklist

When changing a durable definition, check manifest admission, affected projectors, historical version/data compatibility and relevant existing tests together. If changing public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`; do not edit generated client files by hand.

For focused regression tests, from the repository root use the existing CI runner; select the files relevant to the change:

```sh
bun run test:ci core test/event-order.test.ts test/event-replay-compaction-marker.test.ts
```

Follow repository test instructions; a local result is not a CI result.
