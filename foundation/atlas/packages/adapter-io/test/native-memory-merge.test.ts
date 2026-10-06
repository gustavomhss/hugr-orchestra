// @atlas/adapter-io — test/native-memory-merge.test.ts  (F3 clause 30 / owner ruling F3-D5 — merge safety)
//
// Memory is versioned in Git with the code, so two branches that each append Memory must merge without a
// conflict and without losing or corrupting a record. This drives REAL `git merge` in a throwaway
// repository whose `.gitattributes` is copied from the Atlas root (`foundation/atlas/.gitattributes` while
// vendored) — so deleting the `merge=union` lines there turns this suite red, which is the point: the
// attribute is the mechanism, not this test. Orchestra's ROOT `.gitattributes` carries the same two lines for
// its own `.atlas/`; this suite does not read that file (Atlas's tests stay inside the Atlas root).
//
// The control case runs the same scenario with no `.gitattributes` and asserts the merge CONFLICTS. Without
// it, a green here could mean the scenario never produced a concurrent append at all.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createNativeMemory } from "../src/native-memory.js"
import { createDurableMemory, memoryLogPath } from "../src/memory-store.js"
import type { Awareness, MemoryEntry, Orientation } from "@atlas/memory"

const REPO_ATTRIBUTES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".gitattributes")

let repo: string

const facet = { content: "c", grounding: [], state: "seeded" as const }
const AW: Awareness = { mission: facet, constitution: facet, terrain: facet, ontology: facet, taste: facet }
const OR: Orientation = { goal: "g", last: "l", current: "c", state: "s" }
const task = (taskId: string): MemoryEntry => ({
  taskId,
  attempted: ["a"],
  failedWith: [],
  stoppedAt: "s",
  lesson: "l",
})
const rule = (text: string): MemoryEntry => ({ rule: text, scope: "*", frecency: 1 })

// Hermetic git: no system/global config (hooks, signing, templates), fixed identity.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
}
const git = (...args: string[]): string => execFileSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" })

// Setup appends straight through the durable store — the merge is a property of the LOG, and routing setup
// through the write door would add two scanner subprocesses per record to a suite already bound by git's.
function write(kind: "task" | "project", entry: MemoryEntry): void {
  createDurableMemory(repo).append({ owner: "backend", kind, entry })
}

/** The bound header over the merged log — the ranking a seat would actually be injected. */
function rulesHeader() {
  return createNativeMemory({
    storage: { projectID: "p", root: repo },
    source: { worktree: repo, revision: "HEAD" },
    memoryOwner: "backend",
    execution: { actor: { memberId: "backend", projectId: "p", sessionId: "s" }, executionSessionID: "s" },
  }).header(AW, OR)
}

function commitMemory(message: string): void {
  git("add", "-f", ".atlas/memory.jsonl")
  git("commit", "-q", "-m", message)
}

const eventIds = () => [...createDurableMemory(repo).read().log.keys()].sort()

/** Base commit, then `main` and `feature` each append a shared identical record and one rule of their own. */
function diverge(withAttributes: boolean): { main: string[]; feature: string[] } {
  git("init", "-q", "-b", "main")
  if (withAttributes) {
    copyFileSync(REPO_ATTRIBUTES, join(repo, ".gitattributes"))
    git("add", ".gitattributes")
  }
  write("task", task("T0"))
  commitMemory("base")

  git("checkout", "-q", "-b", "feature")
  write("task", task("SHARED"))
  write("project", rule("feature rule"))
  commitMemory("feature memory")
  const feature = eventIds()

  git("checkout", "-q", "main")
  write("task", task("SHARED"))
  write("project", rule("main rule"))
  commitMemory("main memory")
  return { main: eventIds(), feature }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-merge-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

// Every case spawns 10-15 real `git` processes. The 10s global cap is sized for pure unit suites
// (vitest.config.ts); under host load this suite measured several seconds per case, so it carries its own
// budget, the same reasoning `vitest.workspace.ts` gives the subprocess-bound black-box project.
describe("F3-D5 — parallel branches merge their Memory by union", { timeout: 60_000 }, () => {
  it("the repository binds both Atlas logs to merge=union", () => {
    const text = readFileSync(REPO_ATTRIBUTES, "utf8")
    expect(text).toMatch(/^\.atlas\/memory\.jsonl merge=union$/m)
    expect(text).toMatch(/^\.atlas\/orientation\.jsonl merge=union$/m)
  })

  it("merging feature into main: zero conflicts, zero rejected lines, fold = union by content id", () => {
    const { main, feature } = diverge(true)
    const merge = spawnSync("git", ["merge", "--no-edit", "-q", "feature"], {
      cwd: repo,
      env: GIT_ENV,
      encoding: "utf8",
    })
    expect(merge.status, merge.stdout + merge.stderr).toBe(0)
    expect(git("diff", "--name-only", "--diff-filter=U")).toBe("")
    expect(readFileSync(memoryLogPath(repo), "utf8")).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m)

    const read = createDurableMemory(repo).read()
    expect(read.rejected).toBe(0)
    expect(eventIds()).toEqual([...new Set([...main, ...feature])].sort())
    expect(read.store).toHaveLength(4) // T0, SHARED (once), main rule, feature rule
  })

  it("union order decides rule rank: the side merged IN is written last and reads as younger", () => {
    diverge(true)
    git("merge", "--no-edit", "-q", "feature")
    const intoMain = rulesHeader()
    expect(intoMain.header?.rules.map((r) => r.rule)).toEqual(["feature rule", "main rule"])

    // The other direction, from the same pre-merge tips: main merged INTO feature ranks main's rule first.
    git("reset", "-q", "--hard", "HEAD~1")
    git("checkout", "-q", "feature")
    git("merge", "--no-edit", "-q", "main")
    const intoFeature = rulesHeader()
    expect(intoFeature.header?.rules.map((r) => r.rule)).toEqual(["main rule", "feature rule"])
  })

  it("control: the same scenario WITHOUT the attribute conflicts — so the green above is the attribute", () => {
    diverge(false)
    const merge = spawnSync("git", ["merge", "--no-edit", "-q", "feature"], {
      cwd: repo,
      env: GIT_ENV,
      encoding: "utf8",
    })
    expect(merge.status).not.toBe(0)
    expect(git("diff", "--name-only", "--diff-filter=U").trim()).toBe(".atlas/memory.jsonl")
  })
})
