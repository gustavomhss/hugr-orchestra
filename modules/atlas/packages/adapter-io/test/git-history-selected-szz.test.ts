import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGit } from "../src/run-git.js"
import { createHistorySource } from "../src/git-history.js"

// Count real commands, never fabricate their output. The signal oracle remains literal real-git facts.
vi.mock("../src/run-git.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/run-git.js")>()
  return { ...actual, runGit: vi.fn(actual.runGit) }
})

const site = (qualifiedPath: string) => ({ kind: "file" as const, qualifiedPath, subtreeHash: "" as never })

describe("SZZ computes only the requested path, under the unchanged global bounds", () => {
  const directories: string[] = []
  afterEach(() => {
    directories.forEach((directory) => rmSync(directory, { recursive: true, force: true }))
    directories.length = 0
    vi.clearAllMocks()
  })
  function repository() {
    const directory = mkdtempSync(join(tmpdir(), "atlas-selected-szz-"))
    directories.push(directory)
    runGit(directory, ["init", "-q"])
    runGit(directory, ["config", "user.name", "atlas-fixture"])
    runGit(directory, ["config", "user.email", "fixture@atlas.test"])
    runGit(directory, ["config", "commit.gpgsign", "false"])
    return directory
  }
  function commit(directory: string, subject: string, files: Record<string, string>) {
    Object.entries(files).forEach(([file, text]) => writeFileSync(join(directory, file), text))
    runGit(directory, ["add", "--", ...Object.keys(files)])
    runGit(directory, ["commit", "-q", "-m", subject])
  }
  const szzBlames = () => vi.mocked(runGit).mock.calls
    .filter((call) => call[1][0] === "blame" && call[1].includes("-w"))
    .map((call) => call[1][call[1].length - 1])

  it("blames only the selected path and memoizes it without starving another selected path", () => {
    const directory = repository()
    commit(directory, "feat: two bugs", { "a.ts": "bad a\n", "b.ts": "bad b\n" })
    commit(directory, "fix: a", { "a.ts": "good a\n" })
    commit(directory, "fix: b", { "b.ts": "good b\n" })
    const rev = runGit(directory, ["rev-parse", "HEAD"]).trim()
    const history = createHistorySource(directory, rev)
    vi.clearAllMocks()
    expect(history.signals(site("a.ts")).szzBugCommits).toBe(1)
    expect(szzBlames()).toEqual(["a.ts"])
    const afterFirst = vi.mocked(runGit).mock.calls.length
    expect(history.signals(site("a.ts")).szzBugCommits).toBe(1)
    expect(vi.mocked(runGit).mock.calls).toHaveLength(afterFirst)
    expect(history.signals(site("b.ts")).szzBugCommits).toBe(1)
    expect(szzBlames()).toEqual(["a.ts", "b.ts"])
  })

  it("applies the newest-200-fix cap globally BEFORE selecting a requested path", () => {
    const directory = repository()
    commit(directory, "feat: two bugs", { "a.ts": "bad a\n", "b.ts": "0\n" })
    commit(directory, "fix: old a", { "a.ts": "good a\n" })
    for (let i = 1; i <= 200; i++) commit(directory, `fix: b ${i}`, { "b.ts": `${i}\n` })
    const rev = runGit(directory, ["rev-parse", "HEAD"]).trim()
    const history = createHistorySource(directory, rev)
    vi.clearAllMocks()
    expect(history.signals(site("a.ts")).szzBugCommits).toBe(0)
    expect(szzBlames()).toEqual([])
    // Positive control: at the SHA just before the 200 unrelated fixes, a's fix is inside the bound.
    expect(createHistorySource(directory, `${rev}~200`).signals(site("a.ts")).szzBugCommits).toBe(1)
    expect(szzBlames()).toEqual(["a.ts"])
  }, 30000)
})
