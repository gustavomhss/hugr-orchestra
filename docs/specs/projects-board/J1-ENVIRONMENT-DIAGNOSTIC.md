# J1 Environment Diagnostic — 2026-11-09

Per Astra order (Block 2 follow-up): document exception evidence, previous synthetic setup availability, and build provenance. Branch `astra-j1-environment` based on snapshot `b164c3d525`. Snapshot pin `snapshot-board-rag-20261109` remains at `b164c3d525`.

## 1. Exception Evidence (Current Isolated App Failure)

**App launched**: `ORCHESTRA_TEST_ONBOARDING=1 electron-vite preview --skipBuild -- --remote-debugging-port=9335 --force-prefers-no-reduced-motion`
- SHA checkout: `8830129c91919eee98dfeba070f61eba6a06bdd2` (converge-rag-foundation, includes Board fixes + rag-admit integration)
- Preview command consumed CLI at: `apps/desktop/resources/cli/orchestra-darwin-x64-baseline`
- Initial command reported by the lead: `electron-vite build`. This direct command does not itself establish that the Bun `prebuild` lifecycle ran; see `apps/desktop/README.md:40–43`. The later explicit lifecycle rebuild is recorded in section 3.

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

**Assessment at a917a60b74**: This is a **prose description of a previous live validation**, not an executable seed/script or independent proof of a CI execution. The remote paths inspected did not provide a checked-in:
- Shell script that launches backend+Vite+seeds data
- SQL dump or API calls to create project/issue/questions
- Node/Bun script that reproduces the synthetic Board state

An existing executable example is `packages/core/test/board.test.ts:66–80`, which creates project → issue → question via the real service. It runs in the test suite, not as a preview seed; this is not a claim that it is the only Board test in the repository.

**Disposition**: **Seed anterior indisponível** as an executable artifact. The gap is identified for Astra to implement.

## 3. Build Provenance (Lead Report)

The lead subsequently reported this explicit lifecycle rebuild from the isolated worktree:

```bash
cd apps/desktop
ORCHESTRA_CHANNEL=dev OMNI_ARTIFACTS=/tmp/omni-source bun run build
```

The lead reported that `prebuild.ts` ran, staged Omni and compiled the CLI without `ORCHESTRA_CLI_PREBUILT_DIR`, completing in 2m36s and producing `apps/desktop/resources/cli/orchestra-darwin-x64-baseline`. These are the lead's execution results, not execution by Astra.

## 4. Executable Preview Disposition

Astra supplies the repository-only `packages/server/script/board-j1.ts` seed/backend and the exact launch recipe in [J1-PREVIEW.md](J1-PREVIEW.md). It uses the real Board service and authenticated HTTP routes with a fresh persistent scratch database, then the shared web shell.

The earlier suggestion to use `--user-data-dir` alone or the installed application's onboarding flow is withdrawn. It does not establish complete isolation: Electron explicitly assigns its userData path, and a separate desktop profile alone does not isolate Core storage (`apps/desktop/src/main/index.ts:170–174`; `apps/desktop/README.md:62–70`).

Next sequence:

1. Lead typechecks the new script's package, runs guards and focused Board HTTP CI.
2. Lead runs the seeded preview recipe and records its actual HTTP readback and browser outcome.
3. Owner judges J1 in dark/light and narrow/wide, including the stated coverage limits.
4. RAG cockpit remains after human J1 acceptance (`astra-j1-receipt.md:61–62`).

The new script has not been executed by Astra. Its publication is not a startup PASS or human acceptance. The Board product code and the pinned snapshot remain unchanged by this tooling change.
