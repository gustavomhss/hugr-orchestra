# Backend repair landing — compaction checkpoint

Recorded 2026-10-09 after owner asked: "beleza. Porque parou? Salva o estaod pra compact".

## Resume contract

Save this checkpoint and stop for compaction. The completed scope was backend failure repair, product landing and public evidence/protocol publication. Do not reinterpret that bounded closure as completion of every backend architecture work package or integration of all benchmark implementation code.

The next concrete unfinished integration surface is backend-bench `seat-runner` versus `origin/main`: harness implementation, toolkit scenarios 11–21, regression tests and older seat-campaign results remain on the published runner branch. Evidence/protocol PRs changed only data/docs. On resume, inspect that diff and decide coherent dependency-ordered publication slices; do not rerun successful Luna cases merely because context was compacted.

## Authority and repository rules

- Persistent full caveman Portuguese in chat; normal technical English in source, docs, commits and PRs.
- Standing owner authorization covers commits, pushes, PRs and merges: "commit, pr, merge, tudo isso e responsa sua irmaozao." Keep judgment in the lead, use independent cold review, and verify agent outputs before landing.
- Product remote `fork`: `gustavomhss/hugr-orchestra`, default `dev`. Bench remote `origin`: `gustavomhss/backend-bench`, default `main`.
- Branch names at most three hyphenated words; conventional commits/PR titles. Stage exact filenames, inspect full diff and recent history. No force push, published-history rewrite, hook bypass, broad staging, reset/stash of unrelated work or git-config changes.
- Unit tests run on Actions only: `bun run test:ci <package> <exact test files> --os both` from product worktree root. Local package directories: `bun typecheck`; no direct `tsc` or local `bun test`.
- Scoped gates per slice; full CI once per milestone, repeated only for actual new fixes/failures. A skip is not execution; a reused verified input-hash pass is not a fresh run. Guards need positive controls and relevant RED/restored GREEN mutation evidence.
- Preserve Schema → Core/Protocol → Server dependency direction; Client runtime never imports Core/Server. Public Protocol/Server HttpApi change requires client generation; never hand-edit generated clients. Landing changes did not alter public HttpApi schemas.
- Do not touch canonical checkout's owner/peer WIP or stop/restart owner app, server or Docker. Signal only owned processes after fresh identity verification; old saved PIDs are not live identities.
- Model remains `openai/gpt-6-luna` through direct OpenAI OAuth when another evaluation is justified. Real OAuth stays supervisor-only, candidates receive inert credentials. Do not print/persist/refresh owner tokens. Catalog metadata is not provider transport.

## Exact refs and workspaces

| Surface | Path | Ref at checkpoint |
| --- | --- | --- |
| Current product publication checkout | `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-landing` | `backend-compaction`, based on product `4ff4da5d1d3aa0caa1376b53f7037b3d772b3f52` |
| Product `fork/dev` at last fetch | Same product clone | `4ff4da5d1d3aa0caa1376b53f7037b3d772b3f52` |
| Historical integration checkout | `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-failures` | `backend-failures`, `0532e43dda02dbf9037630b0417cb198b65c960f`; do not use as current dev baseline |
| Bench implementation checkout | `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-bench` | `seat-runner`, `0422c41bc73bbcc19d450e891b3a3558c7ff823e` |
| Bench `origin/main` | Same bench clone | `3ef688ba61e5a1667c2c4009821b548617f138be` |
| Bench publication checkout | `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-bench-publication` | Detached at published `origin/main` |

Fetch before further landing: peers may advance either default branch. Product publication and bench implementation status were inspected before saving. Last observed filesystem availability: 57 GiB, subject to concurrent activity.

The canonical checkout is `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical`; its unrelated work was preserved. Numerous peer worktrees share this product clone. Do not prune the whole registry or assume every stale-looking directory belongs to this task.

## Product delivery completed

- Framework #93 and toolkit acquisition #112 landed before the final publication wave.
- Repair slices #146–151, #153–155, #158, #160–162 landed: guidance, Unix broker, exclusive parent plan/rollback, native exact grants, scratch/Unix checks, OpenAPI project pins, literal argv/approval facts, native shell admission, listener context/SDK routing, owned Cassandra runtime, actual acquisition/Go proof and real-engine runtime tests.
- Final functional #162 merge: `16400d9ad778e11c974c28b81ecd290abf3ae21c`.
- Provenance/current contracts #168 merge: `fab026f021cf8b0ec87f9dd96710e5265d41acd9`.
- Scope-remediation #169 merge: `76c17eeb2620b1430d0f593119cb4ef730793773`. Guidance only; HOLD reason and enforcement unchanged.
- Closeout handoff #171 merge: `4ff4da5d1d3aa0caa1376b53f7037b3d772b3f52`.
- Stale pre-rename #90 is closed, not merged. Superseded by #93/#146/#168/#169; original branch/history retained.

Independent reviews found and closed actual cwd symlink/`..` metadata binding, wrong-shell toolkit expansion, stale Darwin listener assertions and generator-provenance coverage gaps. No word cap, acceptance oracle or stored grade was weakened.

## Verification that must not be rediscovered or overstated

Exact final functional head was `0908a6af8522b0a58f9e34023713b5e9284c252f`:

- Full unit Linux/Windows and Linux e2e gate: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982685067
- Typecheck: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982684978
- Native: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982684993
- Nix: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982684955
- Storybook: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982685053

All passed. Atlas scope passed; vendor job skipped. Linux e2e reused verified identical-input prior executed passes. Neither is a fresh-execution claim.

Initial full run https://github.com/gustavomhss/hugr-orchestra/actions/runs/37978401167 failed three native recorded loops. Diagnostic run 37980584146 proved strict second-request mismatch: recorded `city:{}` versus actual/first-response `city:"Paris"`. Only three second-request fields were repaired; all response/header/metadata/other request bytes, recorder matching and test assertions stayed unchanged. Independent review, restored-broken-fixture RED and corrected GREEN established the fix. Final replay gate 37981600850 passed three providers with one unavailable API-key cassette skip per OS.

Later guidance gates: Core 37989903759 (5 pass per OS), Orchestra 37989903382 (34 pass per OS). Final closeout docs/name/skill gate 37991946900 (20 pass per OS).

Actual source-tree comparison tool is approved temp `backend-verify-ci.ts`: compares every intended source entry against the Actions snapshot, excluding only `.ci-run.json`, with a planted bad `AGENTS.md` blob positive control. GitHub triple-dot compare is not an equality oracle for independently-parented snapshots; use source blobs/trees.

## Cassandra and model evidence

- Final owned generator is `3.0.4+orchestra.cassandra2`; upstream library/project pin `3.0.4`.
- Private hash-authorized Scylla-driver catalog backport handles absent optional tables while preserving the original present-table branch and strict query/close errors. Command-only Go Dialer uses ordinary Unix `net.Conn` through scoped fixed-target host broker.
- `ORCHESTRA_TCP_PROXY_ROUTES` admits only declared literal `127.0.0.1:<port>` endpoints; invalid maps/unknown ports/LAN/IPv6 do not fall back to TCP. Kernel still denies raw TCP/UDP/bind. Experimental C/DYLD files were removed, historical experiments retained.
- Real Cassandra 5.0.5 produced `Carts` through actual sandbox: 496 bytes, SHA-256 `6112e7c58a90b3958f39ce98c7db1cfa6bf83aa9098ef263b46ae6df6d1706e4`. Schema/marker/count unchanged; owned database stopped and logs/files retained.
- Final case21 PASS: `2026-10-09-gpt6-luna-cassandra-typed`, source `6417e702b1`; typed `project-prerequisite-missing:cluster`. Native preflight observed no-grant EPERM/zero receipts, then granted EOF/one receipt before candidate start.
- All affected cases have valid recorded PASS across distinct campaigns. Original positives retained; direct-language case07 retired, original grade unchanged. This is not a new full 21/21 campaign. No models reran during landing.
- Exact endpoint runtime proof is Darwin-specific; Linux/Windows named HOLD remains explicit. Scylla runtime/error injection, ARM runtime, in-flight cancellation and write-deadline expiry are not claimed.

## Bench publication completed; implementation integration remains separate

- Evidence PR #1: https://github.com/gustavomhss/backend-bench/pull/1 ; merge `7e431924eae85e5b43ee8eaacb643c8bce5ec94a`.
- Protocol PR #2: https://github.com/gustavomhss/backend-bench/pull/2 ; merge `3ef688ba61e5a1667c2c4009821b548617f138be`.
- Public manifest: https://github.com/gustavomhss/backend-bench/blob/main/evidence/2026-10-09-luna-native-repairs.md
- Archive SHA-256 `94c64efb29e7e6a606f96d624e044f555bff167730b5d53678773b15782d8d19`: 150 files, 13 campaigns, 63 attempts, stored 29 PASS/28 FAIL/6 operational null. Inventory counts, not quality rate. All original/extracted bytes/hashes checked independently with a bad-hash RED/original GREEN control.
- Recorded model IDs: 62 `openai/gpt-6-luna`, one earlier `openrouter/openai/gpt-6-luna` setup record. Original attempts, failures, nulls, reports and absent source fields stayed byte-identical. External diagnostic paths are not all bundled.
- Final evaluated/preserved harness source `734cc61e49bf7f72573317a720c9c892f3b416c7` is not retrospectively assigned to every attempt. Runner branch adopted published data/docs at current `0422c41…`; this did not merge its implementation into `main`.
- Measured `origin/main...seat-runner` at checkpoint: 184 files, +8,208/−280. Includes harness/runtime/process/host/bootstrap/acquisition/preflight/settlement, scenarios 11–21 and shared toolkit grading, test/probe fixtures, README and older Muse/Longcat seat results. Do not land this as one oversized unreviewed PR.
- Original `protocol/PRE-REGISTRATION.md` WIP is committed/pushed; original benchmark checkout now carries published archive/protocol. There is no pending amendment edit from this session.

## Retained resources and cleanup boundary

Approved temp parent: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode`.

- `tcp-adapter-host-proof/evidence-pid.json`: actual generation, endpoint controls, generic TCP denial and broker/socket cleanup.
- `cassandra-5.0.5-fixture-20261008/`: stopped owned bank, schema/marker/logs/prototypes. Never signal historical PID82966 without fresh identity proof.
- `toolkit-repairs-cache/`: owned engines/runtimes, including scanner and final generator. Preserve active binary/source provenance; regenerate only disposable intermediates when needed.
- `backend-publication-archive-verification/`: extracted byte-verification copy; original/public archive remain elsewhere.
- `backend-publish-evidence.ts`: archive/scanner/manifest generation helper; overwrite guards intentionally reject existing outputs. Do not rerun blindly.
- `backend-verified-campaign.ts` and `backend-cassandra-typed.log`: prior supervisor/model outcomes. Supervisor-only auth access; no fresh campaign justified by compaction.
- Disposable closed review worktrees still exist for closeout, scope guidance, provenance, replay fixtures and bench archive/protocol/audit. Verify their current status and ownership before removing; do not touch peer directories. No active subagent or model campaign is assigned by this checkpoint.

## First actions after compaction

1. Read this checkpoint, then the landing update in `session-resume-2026-10-08.md`; older snapshots are historical.
2. Confirm current statuses and fetch both remotes. Continue from current `fork/dev` and `origin/main`, not historical integration tips.
3. For continuing overall delivery, map the remaining bench implementation diff into dependency-ordered, independently reviewed slices and use its documented Actions exporter (`harness/ci-snapshot.ts`). Preserve original scenario/grading blobs and raw evidence.
4. Do not reopen passed repairs or repeat model campaigns without a named invalidating change. Do not claim entire backend roadmap or bench implementation has landed because repair/evidence closure did.
