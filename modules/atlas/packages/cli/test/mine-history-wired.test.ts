// @atlas/cli — test/mine-history-wired.test.ts  (#243 WIRE-MINE-HISTORY)
//
// TEETH for the exact defect the WP names: `packages/cli/src/cli.ts`'s `command === 'mine'` branch is the
// ONLY production caller of `runMineArms`, and it used to call `runMineArms(process.cwd())` with NO deps —
// so `mine.ts`'s `history: deps?.history ?? defaultHistory()` always took the honest-empty fallback and
// every mined git signal was dead on the shipped path. This spies on the REAL `@atlas/adapter-io`
// `createHistorySource` (keeping every other export real via `importOriginal`) and asserts `main(['mine',
// repo], …)` — the exact surface `bin.ts` drives — constructs it over the repo the command ran in.
//
// TEETH: reverting the injection in `cli.ts` back to `runMineArms(process.cwd())` makes this test RED —
// `createHistorySource` is never called by the mine command at all (verified by hand before landing; see
// the WP return card).

import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync, realpathSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"

const historySpy = vi.fn()

vi.mock("@atlas/adapter-io", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@atlas/adapter-io")>()
  return {
    ...actual,
    createHistorySource: (repoPath: string, rev: string) => {
      historySpy(repoPath, rev)
      return actual.createHistorySource(repoPath, rev)
    },
  }
})

// Imported AFTER the mock is registered (vi.mock is hoisted by vitest regardless of import order, but this
// keeps the file readable top-to-bottom).
const { main } = await import("../src/cli.js")
const { initAst } = await import("@atlas/adapter-io")

// `bin.ts` awaits this once, at the entrypoint, before composing anything (the COLD-GRAMMAR guard this WP
// added would otherwise fire here — see `mine-cold-grammar.test.ts` for that guard's own teeth).
await initAst()

let tempRepo: string
let prevCwd: string

beforeAll(() => {
  tempRepo = mkdtempSync(join(tmpdir(), "mine-history-wired-"))
  mkdirSync(join(tempRepo, "src"), { recursive: true })
  writeFileSync(join(tempRepo, "src", "a.ts"), "export function foo(): number { return 1; }\n")
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: tempRepo, stdio: "ignore" })
  git("init", "-q")
  git("config", "user.email", "test@atlas.local")
  git("config", "user.name", "atlas-test")
  git("add", "-A")
  git("commit", "-qm", "init")
  // A few more commits so the repo is not degenerate (not that this test depends on the frontier — only on
  // the SEAM being called).
  for (let i = 0; i < 2; i += 1) {
    appendFileSync(join(tempRepo, "src", "a.ts"), `// touch ${i}\n`)
    git("commit", "-qam", `touch ${i}`)
  }
})

afterAll(() => rmSync(tempRepo, { recursive: true, force: true }))
afterEach(() => {
  historySpy.mockClear()
  vi.restoreAllMocks()
})

describe("#243 — `atlas mine` wires the real history source on the production path", () => {
  it('main(["mine"]) constructs createHistorySource over the repo it ran in (rev "HEAD")', async () => {
    prevCwd = process.cwd()
    process.chdir(tempRepo)
    try {
      // No model configured ⇒ every arm abstains — irrelevant here; the assertion is on the SEAM, not the
      // facts. Silence stdout (the CliVerdict prose is not this test's concern).
      vi.spyOn(process.stdout, "write").mockImplementation(() => true)
      await main(["mine", "."], {})
    } finally {
      process.chdir(prevCwd)
    }
    expect(historySpy).toHaveBeenCalled()
    const [repoArg, revArg] = historySpy.mock.calls[0]!
    // `process.cwd()` resolves symlinks on macOS (`/var/folders` → `/private/var/folders`) — realpath both
    // sides so this asserts the SAME repo, not a byte-identical string.
    expect(realpathSync(repoArg as string)).toBe(realpathSync(tempRepo))
    expect(revArg).toBe("HEAD")
  })
})
