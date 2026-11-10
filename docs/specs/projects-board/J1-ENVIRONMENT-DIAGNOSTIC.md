# J1 Environment Diagnostic — 2026-11-09

Per Astra order (Block 2 follow-up): document exception evidence, previous synthetic setup availability, and build provenance. Branch `astra-j1-environment` based on snapshot `b164c3d525`. Snapshot pin `snapshot-board-rag-20261109` remains at `b164c3d525`.

## 1. Exception Evidence (Current Isolated App Failure)

**App launched**: `ORCHESTRA_TEST_ONBOARDING=1 electron-vite preview --skipBuild -- --remote-debugging-port=9335 --force-prefers-no-reduced-motion`
- SHA checkout: `8830129c91919eee98dfeba070f61eba6a06bdd2` (converge-rag-foundation, includes Board fixes + rag-admit integration)
- Preview command consumed CLI at: `apps/desktop/resources/cli/orchestra-darwin-x64-baseline`
- That binary was produced by `electron-vite build` (which runs `prebuild.ts` → compiles CLI via `bun build`)

**Logs collected** (isolated session `orchestra-onboarding-a21d5565-ae4c-4142-b46d-b47674e32181`):

| Log | Key Findings |
|---|---|
| `renderer.log` | Only CSP report-only violation: `Executing inline script violates... script-src 'self' 'wasm-unsafe-eval'`. Policy is report-only — no blocking. |
| `crash.log` | Crashpad started, no crashes recorded. |
| `main.log` | App starts, sidecar connects, CLI version 1.18.27, owned serve starts on `http://127.0.0.1:51198`, server ready after ~34s, loading task finished. Onboarding handed to Home. |
| `server.log` | Server listening, project copy refresh, location services booting. Clean shutdown (code 143 = SIGTERM). |

**No JavaScript exception with stack trace found** in any log. The CSP violation is report-only and does not block execution.

**CDP endpoint**: `ws://127.0.0.1:9335/devtools/page/AB9347BC588D2DF3B11F9D091EEA01F3` — accessible but no console errors captured during brief observation.

**Conclusion**: The "erro de javascript não funciona" reported by the owner appears to be the **absence of Board data** (onboarding screen, no project/issue created), not a runtime exception. The isolated `ORCHESTRA_TEST_ONBOARDING=1` mode creates an in-memory DB, no credentials, and lands on Home — it does not seed a Board.

## 2. Previous Synthetic Setup Availability

**Source**: `docs/specs/projects-board/CARD-REDESIGN.md:353–357` (Actions run 42015087086)

> "Live-source validation now uses separate backend/Vite processes on 4096/3000, a scratch DB/home/XDG environment and a dedicated `agent-browser` session, not an adapter or the installed app. Synthetic questions went through actual authenticated HTTP writes: a note-triggered refresh retained the optional reply, issue→inbox shared the matching draft, and switching questions kept separate text. An independent read-only SQLite connection confirmed the exact first answer persisted while the second remained open with no answer. Screenshots were inspected in dark/wide and light/narrow; this is not human sign-off."

**Assessment**: This is a **prose description of a past CI run**, not an executable seed/script. No checked-in:
- Shell script that launches backend+Vite+seeds data
- SQL dump or API calls to create project/issue/questions
- Node/Bun script that reproduces the synthetic Board state

The only executable Board test is `packages/core/test/board.test.ts:66–80` which creates project → issue → question via the real service — but this runs in the test suite, not as a preview seed.

**Disposition**: **Seed anterior indisponível** as an executable artifact. The gap is identified for Astra to implement.

## 3. Build Provenance (Re-establishing)

Per Astra: rebuild in worktree with `ORCHESTRA_CHANNEL=dev` and **without** `ORCHESTRA_CLI_PREBUILT_DIR`, so `prebuild.ts` compiles the CLI from source.

**Commands to run** (from `apps/desktop`):
```bash
ORCHESTRA_CHANNEL=dev bun run build
# (prebuild.ts runs: compiles CLI via bun build, stages omni, copies to resources/cli)
```

Then launch preview **without** `ORCHESTRA_TEST_ONBOARDING=1` (to use real DB/filesystem) but with isolated profile via `--user-data-dir` pointing to a temp directory, or by using the installed app's onboarding flow with a fresh project.

---

## Next Steps (for Astra)

1. **Implement executable seed**: a script that, against a running backend, creates a project, an issue with Overview sections (Description, Proof, Questions, Steps, Git), a trail with long branch, and questions — so the Board is populated for J1 visual judgment.

2. **Provide launch recipe**: how to start backend + frontend with that seed, isolated from owner's installed app (separate DB, XDG, ports).

3. **Then**: lead runs the recipe, opens the app, owner judges J1 in dark/light/narrow/wide.

The corrected Board code (gap 16px in Overview, `overflow-wrap:anywhere` in Trail) is already in `b164c3d525` and confirmed in this branch.