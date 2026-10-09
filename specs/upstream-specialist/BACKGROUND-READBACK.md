# Canonical background readback handoff

2026-10-09. Candidate baseline: runtime-composed `3fc77d8b172128382edd455c878701be56a92af8`. Append only exact background reader/writer patches; preserve current foreground extraction and runtime credential source pins. No old provisional W6 overwrite.

## Reader source

`e032d61e7c19cd4af1ecefacec78b7619e16cf22` is published as `fork/upstream-background`, adding the background extension only to:

- `packages/orchestra/src/maestro/upstream-provenance.ts`.
- `packages/orchestra/test/maestro/upstream-provenance.test.ts`.

Consumer source review `ses_ee0b80707ffeBOJHf7BZFW0C0h` APPROVE. Prepared-case reviewer `ses_ee0b806e4ffeetf6SJfP7iny9y` found one later-author fixture issue, corrected with actual SeatWork.record, persisted Task reread and explicit selected card/author IDs. Source/fixtures are UNVALIDATED: no tests, typecheck, mutations, CI, launcher, private-auth or model execution.

## Frozen private port

ACK `msg_11f3590e7001Z4VlhB0nt14OBe`; supersedes hostTaskReturn proposal. Only on exact native original Task metadata:

```ts
upstreamSettlement: {
  parentMessageID,
  parentCallID,
  workResult,
  deliveryMessageID,
  deliveryPartID?,
}
```

Canonical UpstreamAttribution.V1 and observe(input7refs) stay unchanged. No new record ID/store/event/drain/approval/provider loop. V1 port is state.metadata; V2 port is state.structured.metadata. Delivery part ID is required for legacy multipart V1.

Relay producer captures actual returned bound WorkResult/assistant before async/resume, durably admits exact notice ID/part, then writes receipt through exact existing Task/Session ownership. It preserves the receipt against initial completion/metadata races and reconciles exact retry. Fork-and-ignore, later lastAssistant lookup, CoreBackgroundJob status/output/clocks and caller synthetic metadata never substitute for this trusted record.

Reader verifies original Task/parent anchors, actual native registry/project/child/LogicalTask/selected stored author, actual successful parsed terminal result and the referenced durable parent delivery. V1 requires indicated owned synthetic/nonignored User text part with exact child source/result. V2 requires owned projected synthetic message and embedded parent Session; arbitrary synthetic metadata is not required. Conflicting same-ID views and any parent/Task failure refuse. Initial running result can remain only when trusted final receipt supplies the exact successful result.

## Remaining readiness

Writer implementation is Relay-owned and still active. Consume exact writer source once published, reconcile with this reader, then run one scoped combined validation batch and one final typecheck per affected package before isolated real-model qualification. No foreground-only Maestro closure claim.

Runtime launcher fe376 remains unchanged and UNRUN; four guarded credential source blobs are retained. Installed private auth source compatibility is unproved; do not invoke any prepare/default/run mode during incomplete source. Nix stale hashes/ready=false remain final measurement/consumer validation blockers, not permission to gate or rerun unrelated W6 preparation.

## Workspace recovery

Canonical active worktree is `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/maestro-final`. A failed attempt at `maestro-combined` hit No space left on device and is not a valid registered candidate. Removed only own clean inactive attribution-schema, attribution-host and V3-regressions worktrees after verifying status/HEAD; commits and branch refs are preserved. `upstream-combined` dirty candidate and all peer work remain preserved.
