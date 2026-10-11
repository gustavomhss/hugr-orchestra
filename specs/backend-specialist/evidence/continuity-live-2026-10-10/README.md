# F3 / Q-memory: live continuity run, 2026-10-10

Question: with a real model, does the `backend` seat (1) emit an Atlas Memory checkpoint during work, (2) get its latest own checkpoint admitted once when Maestro resumes the task by `task_id` with `memoryUnit`, and (3) after a compaction of its Session get the fold restored (`residency: "restored"`, ruling M3-1) and still continue the work correctly?

Short answer: (1) and (2) were observed live, in four runs on three free models. (3) was not observed. The restore never ran, and the source shows why: `AtlasResumeRestore.restore` is called only from the legacy `SessionCompaction.process`, and production no longer reaches that function. Manual `/summarize` and automatic compaction both go through `SessionContinuity.compact`, which never calls the restore. This gap is a product finding, not a model failure. It is described under "Product finding" below.

## Setup (executed)

- Orchestra from source at `fork/dev` `50af9197bf`, version `1.18.27`. Command: `bun run --define 'ORCHESTRA_VERSION:"1.18.27"' packages/orchestra/src/index.ts serve --hostname 127.0.0.1 --port 47811`. The bench runner's `ORCHESTRA_VERSION` define is unchanged after the rename.
- Isolation follows `backend-bench/harness/run-seat.ts`. XDG config, data, state and cache are isolated under a scratch host. Ambient `ORCHESTRA_*`/`OPENCODE_*` variables are unset. `ORCHESTRA_INHERIT_CREDENTIALS=0`. `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=0` is set because no hugr-omni addon is built in the worktree. The scripts are in `scripts/` (`env.sh`, `say.sh`, `chain.sh`).
- Fixture: a one-commit git repository with `counter.ts` (a class with `increment()`/`get()`) and `README.md`. Atlas storage is the fixture's `.atlas/memory.jsonl`. Pre-write scanner: `gitleaks` on PATH.
- Models: the Zen free tier through the config `provider.opencode.options.apiKey: "public"`. That is the anonymous public key, not a credential. The rename removed the built-in free-tier loader, so `opencode/*` reports "Provider not found" without this config. Each candidate got a `PONG` probe. `glm-5-free` and `kimi-k2.5-free` are not in the catalog. `exo-free` returned 410 (deprecated). `big-pickle` returned 400. `longcat-2.5-preview-free`, `step-5-preview-free`, `mimo-v2.6-flash-free` and `nemotron-3-ultra-free` answered.
- Each run talks to Maestro, the default agent, over the HTTP API. Maestro delegates to `backend` through the task tool. Run steps:
  1. **dispatch**: phase 1 of unit `T-LIVE-n`, then checkpoint.
  2. **resume**: `task_id` plus `memoryUnit {"kind":"task","id":"T-LIVE-n"}`. The seat must quote the admitted record id and `stoppedAt` without editing.
  3. **interim resume**: `task_id` only, one-line comment. This makes the fold message older than the latest user turn.
  4. **forced compaction**: `POST /session/<seat session>/summarize`. This is the server's `/compact`, and it runs `continuity.compact({ force: true })`.
  5. **continue**: `task_id` only, "the next phase your checkpoint names", plus an updated checkpoint.
- Evidence comes from the HTTP `GET /session/:id/message` exports (and `orchestra export` for attempt E), the fixture's `.atlas/memory.jsonl` and the server log. `verify.txt` in each attempt comes from `scripts/verify.py`. It lists every Atlas tool receipt and every admission part, checks each receipt `ref.eventId` against the log, checks that admission text equals the part text, and groups admissions by key.
- Redaction: the seat's display label is replaced by `backend-label`, scratch paths by `<host>`, and strings over 3000 chars are truncated. A gitleaks scan of this directory found no leaks.

## Runs

| Run | Maestro / seat model | Emit (1) | Resume admission (2) | Forced compaction (4) | Continue (5) |
| --- | --- | --- | --- | --- | --- |
| A | longcat / longcat | admitted `e5487ec4…` | once, `admitted`, ref `e5487ec4…`. Seat quoted id and `stoppedAt` exactly. | no-op: `invalid-schema` (C9) | not run |
| B | step-5 / step-5 | 2× refused `undetermined-kind`, then admitted `6457066d…` | once, ref `6457066d…`. The refused writes did not advance selection. | no-op: `invalid-schema` (C17), later `circuit-open` | added `reset()`, new checkpoint `e7e6dfb8…` |
| C | mimo / mimo | admitted. The seat's edit was held `write-outside-physical-roots` because Maestro omitted `writePaths`. | never reached: Maestro sent `memoryUnit` as a JSON string 8 times (schema error). Aborted. | — | — |
| D | longcat / mimo (task `model`) | admitted `ef3860f0…` | once, ref `ef3860f0…` | forced: `invalid-schema` (C17). Then an **automatic** maintenance pass **applied** at 01:15:11Z, mid-continuation. | `reset()` present, checkpoint `93792520…` |
| E | longcat / nemotron-3-ultra (task `model`) | refused `undetermined-kind`, then admitted `a72d3057…` | once, ref `a72d3057…` | no-op: `invalid-schema` (C17), later `circuit-open` | added `reset()`, new checkpoint `6f0bcbf7…`. `orchestra export` JSON is included. |

Times (UTC 2026-10-11), Session IDs and task IDs are in each `attempt-*/commands.jsonl`, `maestro.sid`, `child.sid` and `task.id`.

## Observed

- **Checkpoint emit during work.** The seat called `atlas_memory_emit` in every run. Every admitted receipt (`atlas-memory-receipt-v1`, `op: emit`, `outcome: admitted`, binding `memoryOwner: backend` + `projectID` + `root` + call identity) names a `ref.eventId` that is the `id` of a line in `.atlas/memory.jsonl` (`inLog= True` in `verify.txt`). Refused writes (`undetermined-kind`) left no log line. The seat's charter does not ask for checkpoints, and every packet asked for one explicitly. Whether the seat would checkpoint on its own was not tested.
- **Admission once per logical resume.** Every resume with `memoryUnit` (A, B, D, E) left exactly one synthetic part with `atlas-resume-admission-v1`, `residency: "admitted"`, key `<maestro session>/<task call id>`, and `verdict.ok` naming the latest admitted checkpoint. Part text and `admission.text` are byte-identical. Resumes without `memoryUnit` (steps 3 and 5) added no admission. In B and E, the refused emits that came before the admitted one did not become the selected checkpoint (F3 cl. 16). The seat read the fold from context and quoted record id and `stoppedAt` without calling recall (A, D, E). In B it had called recall earlier, during phase 1. A replay of the same dispatch call (the strict once-only adverse case) was not exercised live.
- **Compaction and restore.**
  - No run produced a `residency: "restored"` part. No `compaction` part exists in any Session.
  - The four forced compactions all returned `true` and changed nothing. Every free model's working-memory output failed the continuity checks (C9/C17) twice.
  - In D, an automatic continuity pass on the seat Session **did apply**. Its boundary was `msg_1288580da…`, so the admitted fold (`msg_128839777…`) is behind it. The working memory (`attempt-D/continuity-working-memory.json`) holds the checkpoint record id as a model-written value (`m9`, sourced from the emit result `t5`, not from the fold). It does not hold the fold text.
  - After that pass, the seat loaded its skill, read the file, admitted an updated checkpoint (`93792520…`) and finished correctly. Maestro's step-5 packet in D restated the phase-2 spec, so that continuation does not prove that the fold was retained. B and E sent the bare "next phase your checkpoint names" packet, but no compaction applied in those runs.

## Not observed

- A host restore of the fold after compaction (M3-1). This cannot occur through current production compaction (see below).
- The exact provider request after D's applied compaction. Fold eviction from the model's view follows from the v5 `prepare` in `continuity/context.ts` (current user message + messages after the boundary + memory system text). It is source-inferred, not a captured request.
- Any run on `openai/gpt-6-luna`. Not attempted. Under the bench isolation (isolated XDG, no credential inheritance), luna needs the lead-owned proxy (`BENCH_RUNTIME_CONFIG_CONTENT`). Without isolation, the server would open the owner's real `~/.local/share/orchestra/orchestra-local.db`, which holds the CLI login. Either path means handling credentials or the owner's real database, so the run stopped there as the brief requires.

## Product finding (source, confirmed against the live runs)

`packages/orchestra/src/maestro/atlas-resume-restore.ts` is wired only at `session/compaction.ts:469`, inside `SessionCompaction.process`. That function runs only for a stored `compaction` task (`session/prompt.ts:1165`, whose comment reads "Only tasks stored before continuity replaced the legacy compaction reach this; nothing creates them now"). `SessionCompaction.create` has no caller outside its own file. Manual summarize (`server/.../handlers/session.ts:288`) and the automatic paths (`prompt.ts:1180,1360` plus background maintenance) call `SessionContinuity.compact`/maintenance. `src/continuity/` has no reference to Atlas admissions.

As a result:
- `test/session/atlas-resume-compaction.test.ts` proves restore only on a path that production cannot reach.
- An applied continuity pass evicts the admitted fold from the native view with no host re-push. Only the model-written working memory, which is not byte-identical, may carry its substance.

This is not a small fix. Restore has to be re-anchored to continuity's boundary and view, for example by attaching the restored part to the current request message that v5 `prepare` always keeps, and by detecting eviction against `completeIndex`/boundary instead of `filterCompacted`. That needs a design pass, so no code was changed.

Smaller notes from the runs:
- The seat's first emit is often `undetermined-kind`: the model omits a required template key. It is recovered on retry.
- One free model (mimo) stringifies nested tool arguments (`memoryUnit`) and omits `writePaths`.
- Without the explicit `apiKey: "public"` config, the `opencode/*` free tier is unreachable from Orchestra.
