# Protected genesis restart — checkpoint contract

Owner decision: **“Autorizar recomeço protegido”** accepts only the missing responses from
41974029272. The nine preserved claims remain the restart seed. No quality or publication gate changes.

## Boundaries

- Repo-only orchestration invokes the real compiled `driveMineArms`/`driveMinePass`, with one shared
  history instance, sequential arms and the real single-writer `DiskStore`. No alternate admission door.
- Before model execution, acknowledge a dispatch receipt externally. Before returning any completed
  command's stdout, acknowledge its original stdout/stderr and exit code externally. Prompts are never
  exported: their SHA-256 and byte length identify the request. A killed, unacknowledged request is an
  explicitly in-flight request, never an accepted completion or a fabricated abstention.
- After a changed staging commit, acknowledge a snapshot containing original staging/CAS bytes and
  available plan/report evidence before allowing that write to return. Also snapshot initial state,
  each plan/arm boundary and final state. Local atomic writes alone are not external durability.
- Immutable gzip envelopes live on the dedicated `genesis-checkpoints` Git branch, under run/attempt
  identities, not on `dev` or the implementation branch. Each envelope binds source revision, index run,
  retained run IDs, execution mode, budget, arms, model wrapper/profile hashes, sequence, previous envelope and per-file
  hashes. The writer serializes writes and verifies the remote Git blob before acknowledging success.
- Scan decoded payload bytes with the existing credential scanner before any upload. No credentials or
  full prompts enter checkpoint content. Missing configuration, scan failure, upload/readback failure,
  conflicting identity or corrupt content fails closed; no subsequent model output is delivered.
- Restore validates identity, complete hash chain and every payload before writing to a new directory.
  Unchanged payloads reference an earlier acknowledged content hash rather than repeatedly uploading CAS
  bytes. The real Atlas canonical encoder verifies each CAS address; per-claim carrier coverage is mandatory.
  Candidate snapshots return through retained-candidate import and fresh grounding, not direct ratification.
  Response receipts survive independently of admission; dispatches, completions, claims and rows remain
  different counts. A checkpoint is recovery evidence, never permission to publish an incomplete campaign.

## Execution and verification

The protected wrapper supervises its one Grok child, forwards termination and waits for it; the original
unlinked-regular-stdin wrapper, pinned model, effort, one-turn policy and 600000ms command cap remain.
The runner has a bounded execution window below the job deadline, reserving collection headroom.
Termination may interrupt unacknowledged work, but cannot erase already acknowledged checkpoints.

Required controls before mining: real store snapshot/restore and original receipt equality; dispatch and
completion ordering; rejected upload/readback/scan/identity/hash/path/chain corruption; interrupted
checkpoint rejection; actual remote write/readback and restore after an abruptly killed fixture producer.
The remote control makes no model calls. Existing genesis integration/mutations still run unchanged.
