// @atlas/cli — test/mine-target-dispatch.test.ts  (genesis-hardening A2 — `atlas mine <path>` mines <path>)
//
// The positional used to be required and IGNORED: `dispatchMine` mined `process.cwd()`, so `atlas mine
// /some/other/repo` mined the shell's directory and exited 0. These cases drive the REAL `main(['mine', …])`
// from a cwd that is NOT the target and spy on the real `createHistorySource` (every other adapter export
// stays real) to see which repo the run was composed over. The refusals are checked on disk too: a target
// that cannot be mined must leave no `.atlas/` behind, neither in the target nor in the cwd.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
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

const { main } = await import("../src/cli.js")
const { initAst } = await import("@atlas/adapter-io")

// `bin.ts` awaits this once before composing anything (see mine-history-wired.test.ts).
await initAst()

const scratch: string[] = []
afterAll(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  scratch.push(dir)
  return dir
}

/** A committed git repo with one source file and NO `.atlas/` at all. */
function makeRepo(): string {
  const repo = tempDir("atlas-mine-target-repo-")
  mkdirSync(join(repo, "src"), { recursive: true })
  writeFileSync(join(repo, "src", "a.ts"), "export function foo(): number { return 1; }\n")
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: repo, stdio: "ignore" })
  git("init", "-q")
  git("config", "user.email", "test@atlas.local")
  git("config", "user.name", "atlas-test")
  git("add", "-A")
  git("commit", "-qm", "init")
  return repo
}

let writes: string[]
let prevCwd: string
beforeEach(() => {
  writes = []
  prevCwd = process.cwd()
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => {
  process.chdir(prevCwd)
  historySpy.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const out = (): string => writes.join("")
const minedRepo = (): string => realpathSync(historySpy.mock.calls[0]![0] as string)

describe("genesis-hardening A2 — `atlas mine` mines the path it is given", () => {
  it("run from a DIFFERENT cwd, `mine <repo>` mines <repo>, not the cwd", async () => {
    vi.stubEnv("ATLAS_MINE_SLOT", "advisory")
    const repo = makeRepo()
    const elsewhere = tempDir("atlas-mine-target-cwd-")
    process.chdir(elsewhere)

    const code = await main(["mine", repo], {})

    expect(code).toBe(0)
    expect(out()).not.toContain("status: rejected")
    expect(historySpy).toHaveBeenCalledOnce()
    expect(minedRepo()).toBe(realpathSync(repo))
    expect(historySpy.mock.calls[0]![1]).toBe("HEAD")
    expect(existsSync(join(elsewhere, ".atlas"))).toBe(false) // the cwd was not mined into
  })

  it("with NO path, `mine` mines the cwd", async () => {
    vi.stubEnv("ATLAS_MINE_SLOT", "advisory")
    const repo = makeRepo()
    process.chdir(repo)

    const code = await main(["mine"], {})

    expect(code).toBe(0)
    expect(minedRepo()).toBe(realpathSync(repo))
  })

  it("a path that does not exist ⇒ exit 2 naming the cause, nothing composed or staged", async () => {
    vi.stubEnv("ATLAS_MINE_SLOT", "advisory")
    const elsewhere = tempDir("atlas-mine-target-cwd-")
    const missing = join(elsewhere, "no-such-repo")
    process.chdir(elsewhere)

    const code = await main(["mine", missing], {})

    expect(code).toBe(2)
    expect(out()).toContain("status: rejected")
    expect(out()).toContain(`'atlas mine' target '${missing}' does not exist`)
    expect(historySpy).not.toHaveBeenCalled()
    expect(existsSync(missing)).toBe(false)
    expect(existsSync(join(elsewhere, ".atlas"))).toBe(false)
  })

  it("a directory that is not a git repository ⇒ exit 2 naming the cause, nothing staged", async () => {
    vi.stubEnv("ATLAS_MINE_SLOT", "advisory")
    const plain = tempDir("atlas-mine-target-plain-")
    writeFileSync(join(plain, "a.ts"), "export const x = 1\n")

    const code = await main(["mine", plain], {})

    expect(code).toBe(2)
    expect(out()).toContain("status: rejected")
    expect(out()).toContain("is not a git repository")
    expect(historySpy).not.toHaveBeenCalled()
    expect(existsSync(join(plain, ".atlas"))).toBe(false)
  })

  it.each(["dependency", "count", "definition"])(
    "an isolated %s arm over a repo with no `.atlas/index.scip` ⇒ exit 2 naming the index, nothing staged",
    async (slot) => {
      vi.stubEnv("ATLAS_MINE_SLOT", slot)
      const repo = makeRepo()

      const code = await main(["mine", repo], {})

      expect(code).toBe(2)
      expect(out()).toContain("status: rejected")
      expect(out()).toContain("has no '.atlas/index.scip'")
      expect(out()).toContain(slot)
      expect(historySpy).not.toHaveBeenCalled()
      expect(existsSync(join(repo, ".atlas"))).toBe(false)
    },
  )

  it("the DEFAULT arms (which include dependency + count) over a repo with no index ⇒ exit 2, nothing staged", async () => {
    vi.stubEnv("ATLAS_MINE_SLOT", "")
    const repo = makeRepo()

    const code = await main(["mine", repo], {})

    expect(code).toBe(2)
    expect(out()).toContain("has no '.atlas/index.scip'")
    expect(existsSync(join(repo, ".atlas"))).toBe(false)
  })
})
