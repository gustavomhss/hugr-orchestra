// @atlas/adapter-io — test/orientation-store.test.ts  (CAMPAIGN-11 W3 — the durable Orientation log)
//
// Owns A14 (the slab folds a DURABLE log and is byte-identical across two callers) and the substrate half
// of A15. The byte-identity item is the one that matters: MEM-6's whole reason for making Orientation
// derived-and-shared is that two members must see the same slab, so the test drives TWO independent store
// instances over the same tracked file and compares — not one instance called twice, which would compare a
// value with itself.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, appendFileSync, readFileSync } from "node:fs"
import { execFile } from "node:child_process"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDurableOrientation, orientationLogPath } from "../src/orientation-store.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-orient-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("A14 — the slab folds a DURABLE log", () => {
  it("an absent log is an empty slab, not an error", () => {
    const o = createDurableOrientation(repo).orientation()
    expect(o).toEqual({ goal: "", last: "", current: "", state: "" })
  })

  it("survives the process that wrote it — a fresh instance folds the same slab", () => {
    const a = createDurableOrientation(repo)
    a.append("milestone", "W2 landed")
    a.append("state", "green")
    const back = createDurableOrientation(repo).orientation()
    expect(back.current).toBe("W2 landed")
    expect(back.state).toBe("green")
  })

  it("is BYTE-IDENTICAL across two independent readers (MEM-6)", () => {
    const w = createDurableOrientation(repo)
    w.append("milestone", "one")
    w.append("state", "s")
    // Two separate instances, as two members in two clones of the same tracked file would be.
    const first = createDurableOrientation(repo).orientation()
    const second = createDurableOrientation(repo).orientation()
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it("carries `goal` from the opaque DEFINE artifact, and empty when there is none", () => {
    const o = createDurableOrientation(repo)
    expect(o.orientation({ goal: "ship the memory ring" }).goal).toBe("ship the memory ring")
    // teeth (breaks-on "an absent DEFINE is fabricated into a plausible goal").
    expect(o.orientation().goal).toBe("")
    expect(o.orientation({ notAGoal: "x" }).goal).toBe("")
  })
})

describe("the log is a SEPARATE file from the per-seat memory log", () => {
  it("does not write into memory.jsonl", () => {
    createDurableOrientation(repo).append("state", "x")
    expect(orientationLogPath(repo)).toContain("orientation.jsonl")
    expect(readFileSync(orientationLogPath(repo), "utf8")).toContain('"state"')
  })
})

describe("the same torn-line defence as the memory log (it is one primitive)", () => {
  it("counts an unparseable line instead of serving a truncated fold", () => {
    createDurableOrientation(repo).append("milestone", "good")
    appendFileSync(orientationLogPath(repo), '{"id":"truncated…\n')
    const read = createDurableOrientation(repo).read()
    expect(read.rejected).toBe(1)
    expect(createDurableOrientation(repo).orientation().current).toBe("good")
  })

  // The BOUND of the payload-keyed check, asserted so nobody reads the suite as claiming more than it
  // proves: an edit to the event ENVELOPE that leaves the payload intact is NOT caught here, because
  // `orientEvent` keys on the payload hash. `durable-log.ts`'s `LineKeyed` doc carries the reasoning.
  it("does NOT catch an envelope-only edit — the stated bound of a payload-keyed log", () => {
    createDurableOrientation(repo).append("milestone", "good")
    const [line] = readFileSync(orientationLogPath(repo), "utf8").trim().split("\n")
    const tampered = JSON.parse(line as string) as { fresh: boolean }
    tampered.fresh = false
    appendFileSync(orientationLogPath(repo), `${JSON.stringify(tampered)}\n`)
    // Accepted, and deduped by id — the honest consequence, not a hidden one.
    expect(createDurableOrientation(repo).read().rejected).toBe(0)
  })

  it("counts a line edited in place — its id is no longer its content hash", () => {
    createDurableOrientation(repo).append("milestone", "good")
    const [line] = readFileSync(orientationLogPath(repo), "utf8").trim().split("\n")
    const tampered = JSON.parse(line as string) as { payload: { label: string } }
    tampered.payload.label = "silently-rewritten"
    appendFileSync(orientationLogPath(repo), `${JSON.stringify(tampered)}\n`)
    const read = createDurableOrientation(repo).read()
    expect(read.rejected).toBe(1)
    expect(createDurableOrientation(repo).orientation().current).toBe("good")
  })
})

describe("concurrent appends do not lose events (REAL, CONCURRENT subprocesses)", () => {
  it("8 processes × 5 appends = 40 durable events, 0 lost", async () => {
    const script = join(repo, "writer.mjs")
    const mod = new URL("../dist/src/orientation-store.js", import.meta.url).pathname
    writeFileSync(
      script,
      `import { createDurableOrientation } from ${JSON.stringify(mod)};\n` +
        `const [repo, who] = process.argv.slice(2);\n` +
        `const o = createDurableOrientation(repo);\n` +
        `for (let i = 0; i < 5; i++) o.append('milestone', who + ':' + i);\n`,
    )
    await Promise.all(
      Array.from(
        { length: 8 },
        (_, i) =>
          new Promise<void>((resolve, reject) => {
            execFile(process.execPath, [script, repo, `seat${i}`], (err) => (err ? reject(err) : resolve()))
          }),
      ),
    )
    const read = createDurableOrientation(repo).read()
    expect(read.log.size).toBe(40)
    expect(read.rejected).toBe(0)
  }, 60_000)
})
