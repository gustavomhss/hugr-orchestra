// @atlas/adapter-io — test/memory-store.test.ts  (CAMPAIGN-11 W2 — the durable Memory store)
//
// The acceptance items this file owns: A1 (survives a restart), A2 (round-trips), A3 (travels), A4 (two
// writers do not lose each other's records).
//
// A4 is driven with REAL SUBPROCESSES, not a loop in this process. The defect this store is designed
// against was found in the knowledge sidecar by running actual `atlas emit` processes — a same-process loop
// would have shown nothing, because the race is between two `write(2)` calls and a single-threaded loop
// never issues two. A test that cannot observe the failure it claims to exclude is a decoration.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync, mkdirSync } from "node:fs"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { createDurableMemory } from "../src/memory-store.js"
import { legacyLogPath, memberMemoryPath } from "../src/layout.js"
import { lineMerge } from "@atlas/kernel"
import type { MemoryRecord } from "@atlas/memory"

let repo: string

const rule = (owner: string, r: string): MemoryRecord => ({
  owner,
  kind: "project",
  entry: { rule: r, scope: "s", frecency: 1 },
})
// Every `project` rule of one seat lands in one file.
const rulesLog = (root: string, owner: string) => memberMemoryPath(root, rule(owner, ""))

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-memstore-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("A1 — a written record survives the process that wrote it", () => {
  it("reads back what a DIFFERENT store instance appended", () => {
    createDurableMemory(repo).append(rule("lucy", "r1"))
    // A fresh instance: no shared in-memory state, the only channel is the file on disk.
    const read = createDurableMemory(repo).read()
    expect(read.store).toEqual([rule("lucy", "r1")])
    expect(read.rejected).toBe(0)
  })

  it("an ABSENT log is an empty store, not an error (total read)", () => {
    const read = createDurableMemory(repo).read()
    expect(read.store).toEqual([])
    expect(read.rejected).toBe(0)
  })

  it("preserves append order across a restart", () => {
    const m = createDurableMemory(repo)
    for (const r of ["a", "b", "c"]) m.append(rule("lucy", r))
    const back = createDurableMemory(repo).read().store
    expect(back.map((x) => (x.entry as { rule: string }).rule)).toEqual(["a", "b", "c"])
  })
})

describe("A2 — the store round-trips through the durable form", () => {
  it("read(write(s)) === s for a mixed-owner, mixed-kind store", () => {
    const records: MemoryRecord[] = [
      rule("lucy", "r1"),
      rule("billy", "r2"),
      {
        owner: "orch",
        kind: "task",
        entry: { taskId: "t", attempted: ["a"], failedWith: ["f"], stoppedAt: "x", lesson: "l" },
      },
    ]
    const m = createDurableMemory(repo)
    for (const r of records) m.append(r)
    // Each seat has its own files, folded in sorted path order, so order holds within a file, not across seats.
    const store = createDurableMemory(repo).read().store
    expect(store).toHaveLength(records.length)
    expect(store).toEqual(expect.arrayContaining(records))
  })

  it("puts each record in its seat's file for its kind and subject", () => {
    const task: MemoryRecord = {
      owner: "backend",
      kind: "task",
      entry: { taskId: "a/../b", attempted: [], failedWith: [], stoppedAt: "x", lesson: "l" },
    }
    const m = createDurableMemory(repo)
    m.append(rule("backend", "r"))
    m.append(task)
    expect(rulesLog(repo, "backend")).toBe(join(repo, ".atlas", "members", "backend", "memory", "project.jsonl"))
    expect(memberMemoryPath(repo, task)).toBe(join(repo, ".atlas", "members", "backend", "memory", "task", "a%2F%2E%2E%2Fb.jsonl"))
    expect(readFileSync(memberMemoryPath(repo, task), "utf8").trim().split("\n")).toHaveLength(1)
  })

  it("is IDEMPOTENT by content id — the same record appended twice folds to one", () => {
    const m = createDurableMemory(repo)
    m.append(rule("lucy", "r1"))
    m.append(rule("lucy", "r1"))
    expect(readFileSync(rulesLog(repo, "lucy"), "utf8").trim().split("\n")).toHaveLength(2) // two LINES…
    expect(createDurableMemory(repo).read().store).toHaveLength(1) // …one RECORD
  })
})

describe("A3 — the log travels: a git line-merge cannot lose or splice a record", () => {
  it("the union of two divergent branch logs folds to every record, none spliced", () => {
    const a = mkdtempSync(join(tmpdir(), "atlas-branch-a-"))
    const b = mkdtempSync(join(tmpdir(), "atlas-branch-b-"))
    try {
      const base = rule("lucy", "shared")
      for (const r of [a, b]) createDurableMemory(r).append(base)
      createDurableMemory(a).append(rule("lucy", "only-a"))
      createDurableMemory(b).append(rule("lucy", "only-b"))

      // Exactly what a plain git text merge yields (driver bypassed): whole lines, unioned. Written to the legacy
      // single file, which a read still folds first.
      const merged = lineMerge(readFileSync(rulesLog(a, "lucy"), "utf8"), readFileSync(rulesLog(b, "lucy"), "utf8"))
      const out = legacyLogPath(repo, "memory")
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, `${merged.map((e) => JSON.stringify(e)).join("\n")}\n`)

      const rules = createDurableMemory(repo)
        .read()
        .store.map((r) => (r.entry as { rule: string }).rule)
      expect(new Set(rules)).toEqual(new Set(["shared", "only-a", "only-b"])) // nothing lost
      expect(rules).toHaveLength(3) // the shared record deduped, not duplicated
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })
})

describe("A4 — concurrent writers do not lose each other (REAL subprocesses)", () => {
  it("8 processes × 5 appends = 40 durable records, 0 lost", async () => {
    const script = join(repo, "writer.mjs")
    const mod = new URL("../dist/src/memory-store.js", import.meta.url).pathname
    writeFileSync(
      script,
      `import { createDurableMemory } from ${JSON.stringify(mod)};\n` +
        `const [repo, who] = process.argv.slice(2);\n` +
        `const m = createDurableMemory(repo);\n` +
        `for (let i = 0; i < 5; i++) m.append({ owner: who, kind: 'project', entry: { rule: who + ':' + i, scope: 's', frecency: 1 } });\n`,
    )
    // CONCURRENTLY. An `execFileSync` loop runs them one after another and observes NOTHING: a mutation
    // probe that replaced the append with a read-modify-write PASSED that version of this test, which is
    // the decoration this file's own header warns about. All eight are launched before any is awaited.
    await Promise.all(
      Array.from(
        { length: 8 },
        (_, i) =>
          new Promise<void>((resolve, reject) => {
            execFile(process.execPath, [script, repo, `seat${i}`], (err) => (err ? reject(err) : resolve()))
          }),
      ),
    )

    const read = createDurableMemory(repo).read()
    // The number is the whole point: the sidecar's measured defect was "40 candidates reported committed,
    // 5 durable", every writer exiting 0. This asserts the count, not the absence of an exception.
    expect(read.store).toHaveLength(40)
    expect(read.rejected).toBe(0)
    expect(new Set(read.store.map((r) => r.owner)).size).toBe(8)
  }, 60_000)
})

describe("a torn or hand-edited line is COUNTED, never silently served", () => {
  it("counts a line that does not parse", () => {
    createDurableMemory(repo).append(rule("lucy", "good"))
    appendFileSync(rulesLog(repo, "lucy"), '{"id":"truncated…\n')
    const read = createDurableMemory(repo).read()
    expect(read.store).toHaveLength(1)
    expect(read.rejected).toBe(1)
  })

  it("counts a line whose stored id is NOT its content hash (edited in place)", () => {
    const m = createDurableMemory(repo)
    m.append(rule("lucy", "good"))
    const [line] = readFileSync(rulesLog(repo, "lucy"), "utf8").trim().split("\n")
    const tampered = JSON.parse(line as string) as { payload: { entry: { rule: string } } }
    tampered.payload.entry.rule = "silently-rewritten"
    appendFileSync(rulesLog(repo, "lucy"), `${JSON.stringify(tampered)}\n`)

    const read = createDurableMemory(repo).read()
    // teeth (breaks-on "an edited record is folded in as if the door had written it").
    expect(read.rejected).toBe(1)
    expect(read.store.map((r) => (r.entry as { rule: string }).rule)).toEqual(["good"])
  })

  it("an unreadable log is NOT reported as an empty store", () => {
    mkdirSync(legacyLogPath(repo, "memory"), { recursive: true }) // a directory where the file should be
    const read = createDurableMemory(repo).read()
    expect(read.store).toEqual([])
    expect(read.rejected).toBe(1) // the distinction the knowledge sidecar lost
  })
})
