// @atlas/e2e-blackbox — test/s22-scip-device-read.blackbox.test.ts  (S22 — the build input that never EOFs)
//
// THE DEFECT. `readScipOrEmpty` (adapter-io/scip.ts) degrades a MISSING dump and a CORRUPT dump to
// `{documents: []}`, and both legs are pinned (`wire-scip-guard`, `scip-corrupt-guard`). Both absorb a
// THROW. A read that never RETURNS is not a throw: `readFileSync` on a character device reads until EOF
// and `/dev/zero` has none. BOTH entrypoints read `.atlas/index.scip` at STARTUP (`composeRuntime`,
// `assembleHandler`), so the CLI and the MCP server hang before any door opens, silently — no stdout, no
// stderr, no exit code. Measured on the real bin: killed at 25s, still nothing; the same read left running
// bare went 3 minutes without returning.
//
// It is the hazard `wire.ts` already names one door over — "a `../` traversal to an unbounded file like
// /dev/zero is a MISS — rejected BEFORE any filesystem read, so it can never hang/OOM" — applied to the
// `atlas node` content address and never to the dump. The fix is the degrade the other two failure modes
// already take: a path that is not a REGULAR file is not an indexer dump, so it fails closed to the empty
// projection and the product boots on a files-only index.
//
// THE DUMP IS READ FROM THE WORKING TREE, INDEPENDENT OF GIT (`join(repoPath, '.atlas/index.scip')` —
// exactly what S9 relies on when it overwrites the dump without committing), so tracking is irrelevant to
// this door: an indexer run, a stale artifact, or an install step that drops the file is enough.
//
// ── A SECOND, WIDER HOLE OF THE SAME SHAPE, NOT FIXED HERE AND NOT ASSERTED HERE ────────────────────────
// `walkFileTree` (adapter-io/src/fs.ts) calls `readFileSync(abs, 'utf8')` on EVERY `git ls-files` path
// through `readFileOrSkip`, whose try/catch has the identical blind spot. Git tracks symlinks (mode
// `120000`), so ANY tracked symlink to `/dev/zero` — anywhere in the repo, not only under `.atlas/` —
// hangs the walk, and both bins walk at boot. That was reproduced (a TRACKED `.atlas/index.scip` symlink
// still hangs the product with the dump-read guard in place) and it is reported, not patched: `fs.ts`
// belongs to another seat. This story therefore keeps the device symlink UNTRACKED, which isolates the
// dump-read door and is the only reason it can go green while that hole is open.
//
// SYNTHETIC: the fixture repo is built under `os.tmpdir()`; `/dev/zero` is the OS device, read-only, and
// the suite SKIPS where it does not exist rather than passing vacuously.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { CLI_BIN, makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

/** The unbounded character device. Absent on Windows ⇒ the suite SKIPS, never silently green. */
const DEV_ZERO = "/dev/zero"
const HAVE_DEV_ZERO = existsSync(DEV_ZERO)

/** How long the product gets to boot and answer. A healthy `atlas query` over a one-file fixture is well
 *  inside this; the pre-fix binary is inside NO bound — it was still running at 3 minutes. */
const BOOT_BUDGET_MS = 60_000

let repo: FixtureRepo
let scipPath: string

beforeAll(() => {
  repo = makeFixtureRepo({ files: { "src/a.ts": "export const a = 1;\n" } })
  scipPath = join(repo.repoPath, ".atlas", "index.scip")
  if (!HAVE_DEV_ZERO) return
  // Ignore the dump so the (separate, unfixed) `walkFileTree` hole above cannot be what this case measures.
  writeFileSync(join(repo.repoPath, ".gitignore"), ".atlas/*\n!.atlas/policy.json\n")
  rmSync(scipPath, { force: true }) //  drop the harness's valid empty dump…
  execFileSync("git", ["add", "-A"], { cwd: repo.repoPath, stdio: "ignore" })
  execFileSync("git", ["commit", "-q", "-m", "stop tracking the dump"], { cwd: repo.repoPath, stdio: "ignore" })
  symlinkSync(DEV_ZERO, scipPath) // …and drop a device symlink where the indexer would write one
})

afterAll(() => repo?.cleanup())

describe.skipIf(!HAVE_DEV_ZERO)("S22 — a `.atlas/index.scip` that never EOFs must not hang the product", () => {
  it("NON-VACUITY: the dump really is the device, and really is NOT what git tracks", () => {
    // If the file were an ordinary dump the case below would prove nothing, and if it were TRACKED the
    // case would be measuring the fs.ts walk instead of the dump read.
    const tracked = execFileSync("git", ["ls-files"], { cwd: repo.repoPath, encoding: "utf8" })
    expect(tracked).not.toContain("index.scip")
    expect(existsSync(scipPath)).toBe(true) // existsSync FOLLOWS the link — the device is reachable
  })

  it("RED before the fix: `atlas query` BOOTS and answers instead of hanging on the device", () => {
    const started = Date.now()
    const run = spawnSync(process.execPath, [CLI_BIN, "query", "src"], {
      cwd: repo.repoPath,
      encoding: "utf8",
      timeout: BOOT_BUDGET_MS,
      killSignal: "SIGKILL",
    })
    const elapsed = Date.now() - started

    // THE assertion. Pre-fix this is `signal: 'SIGKILL'`, `status: null`, and EMPTY stdout AND stderr —
    // measured: `elapsed 25131 ms status null signal SIGKILL stdout "" stderr ""`. The product never wrote
    // a byte and never would have.
    expect(run.signal).toBeNull()
    expect(typeof run.status).toBe("number")
    expect(elapsed).toBeLessThan(BOOT_BUDGET_MS)

    // …and it does not merely survive: it DEGRADES, exactly as a missing or corrupt dump already does —
    // a files-only structural index, the door open, the outcome legible.
    expect(run.status).toBe(0)
    expect(run.stdout).toContain("status: ok")
  })

  it("the degrade is the SAME one a missing dump takes — the scope door still resolves", () => {
    // Not just "did not crash": the files-only index is a working index. `src` covers, and the pack it
    // returns is the pack an absent dump returns (both have zero dependency edges).
    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    expect(q.stdout).toContain("stale:")
  })
})
