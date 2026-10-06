// @atlas/adapter-io — test/native-memory.test.ts  (F3 / A1 — the bound Memory composition)
//
// Every case drives `createNativeMemory` over a REAL durable log in a temp directory. The scanner is a real
// executable (a shell script) reached through the binding's explicit path or through PATH, never an object
// injected past the resolution this file exists to test.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNativeMemory, readBoundHeader } from "../src/native-memory.js"
import type { AtlasBinding } from "../src/native-memory.js"
import { createDurableMemory, memoryLogPath } from "../src/memory-store.js"
import { createMemoryRead } from "../src/memory-read.js"
import { createAwarenessStore } from "../src/awareness-store.js"
import { createDurableOrientation } from "../src/orientation-store.js"
import type {
  Awareness,
  MemoryRecord,
  Orientation,
  PrMemoryEntry,
  ProjectMemoryEntry,
  TaskMemoryEntry,
} from "@atlas/memory"

let root: string
let bin: string

const facet = (state: "seeded" | "UN-SEEDED" | "drifted") => ({ content: "c", grounding: [], state })
const AW: Awareness = {
  mission: facet("seeded"),
  constitution: facet("UN-SEEDED"),
  terrain: facet("drifted"),
  ontology: facet("seeded"),
  taste: facet("seeded"),
}
const OR: Orientation = { goal: "g", last: "l", current: "c", state: "s" }

const taskEntry = (taskId: string, tag: string): TaskMemoryEntry => ({
  taskId,
  attempted: [`a-${tag}`],
  failedWith: [`f-${tag}`],
  stoppedAt: `s-${tag}`,
  lesson: `l-${tag}`,
})
const prEntry = (prId: string, tag = "x"): PrMemoryEntry => ({
  prId,
  decisions: [`d-${tag}`],
  reviewOutcomes: [`r-${tag}`],
  knowledgeDelta: [{ id: `k-${tag}` } as never],
  ref: `pr-ref-${tag}`,
})
const rule = (text: string): ProjectMemoryEntry => ({ rule: text, scope: "*", frecency: 1 })

/** A fake scanner executable. `exit` is its whole verdict; stdin is drained so the pipe never breaks. */
function scanner(name: string, exit: number): string {
  const path = join(bin, name)
  writeFileSync(path, `#!/bin/sh\n/bin/cat >/dev/null\nexit ${exit}\n`)
  chmodSync(path, 0o755)
  return path
}

function binding(over: Partial<AtlasBinding> = {}): AtlasBinding {
  return {
    storage: { projectID: "proj", root },
    source: { worktree: root, revision: "deadbeef" },
    memoryOwner: "backend",
    execution: { actor: { memberId: "backend", projectId: "proj", sessionId: "ses_1" }, executionSessionID: "ses_1" },
    scanner: { name: "gitleaks", command: scanner("clean-gitleaks", 0) },
    ...over,
  }
}

const tearLine = () => appendFileSync(memoryLogPath(root), '{"id":"torn","payload":\n')
const physicalLines = () =>
  readFileSync(memoryLogPath(root), "utf8")
    .split("\n")
    .filter((l) => l !== "").length

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-native-"))
  bin = mkdtempSync(join(tmpdir(), "atlas-native-bin-"))
  // PATH is emptied for every case: this machine may carry a real gitleaks, and a test that passes only
  // because of what happens to be installed is measuring the host, not the door.
  vi.stubEnv("PATH", "")
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
})

describe("clauses 1-4 — the owner is forced from the binding", () => {
  it("a write is minted with the binding owner, and an entry carrying `owner` is refused, not re-owned", () => {
    const mem = createNativeMemory(binding())
    const ok = mem.write(taskEntry("T1", "x"))
    expect(ok.ok && ok.record.owner).toBe("backend")

    const forged = mem.write({ ...taskEntry("T1", "y"), owner: "mallory" } as unknown as TaskMemoryEntry)
    expect(forged).toMatchObject({ ok: false, refusal: "undetermined-kind" })
    expect(
      createDurableMemory(root)
        .read()
        .store.map((r) => r.owner),
    ).toEqual(["backend"])
  })

  it("recall ignores a caller-supplied owner and returns only the bound owner's records", () => {
    createDurableMemory(root).append({ owner: "mallory", kind: "task", entry: taskEntry("T1", "m") } as MemoryRecord)
    const mem = createNativeMemory(binding())
    mem.write(taskEntry("T1", "c"))
    const got = mem.recall({ kind: "task", taskId: "T1", owner: "mallory" } as never)
    expect(got.records.map((r) => r.owner)).toEqual(["backend"])
    expect(got.store).toBe("complete")
  })

  it("mutating the caller's binding object after composition moves neither owner nor root", () => {
    const input = binding() as { -readonly [K in keyof AtlasBinding]: AtlasBinding[K] }
    const mem = createNativeMemory(input)
    input.memoryOwner = "mallory"
    ;(input.storage as { root: string }).root = "/elsewhere"
    const v = mem.write(taskEntry("T1", "x"))
    expect(v.ok && v.record.owner).toBe("backend")
    expect(Object.isFrozen(mem.binding.storage)).toBe(true)
    expect(createDurableMemory(root).read().store).toHaveLength(1)
  })

  it("refuses an empty owner and a relative root at composition", () => {
    expect(() => createNativeMemory(binding({ memoryOwner: "" }))).toThrow(/memoryOwner must be a non-empty/)
    expect(() => createNativeMemory(binding({ storage: { projectID: "p", root: "rel/dir" } }))).toThrow(
      /storage.root must be an absolute path/,
    )
  })

  it("recall refuses kinds outside task/pr at runtime", () => {
    const mem = createNativeMemory(binding())
    expect(() => mem.recall({ kind: "logbook", prId: "P1" } as never)).toThrow(/recall accepts only/)
  })
})

describe("clauses 5, 23 — every admitted write returns its RecordRef", () => {
  it("the ref is the key the durable log holds the record under", () => {
    const v = createNativeMemory(binding()).write(taskEntry("T1", "x"))
    if (!v.ok) throw new Error(v.reason)
    const ev = createDurableMemory(root)
      .read()
      .log.get(v.ref.eventId as never)
    expect(ev?.contentHash).toBe(v.ref.contentHash)
    expect(ev?.payload).toEqual(v.record)
  })

  it("an identical resubmission returns the SAME ref, folds to one record, and still appends a line", () => {
    const mem = createNativeMemory(binding())
    const a = mem.write(taskEntry("T1", "x"))
    const b = mem.write(taskEntry("T1", "x"))
    expect(a.ok && b.ok && a.ref).toEqual(b.ok && b.ref)
    expect(createDurableMemory(root).read().store).toHaveLength(1)
    expect(physicalLines()).toBe(2)
  })
})

describe("clause 15 — exact fold resolution", () => {
  it("resolves the REFERENCED checkpoint when an older one for the same unit exists (spawnFold picks the older)", () => {
    const mem = createNativeMemory(binding())
    mem.write(taskEntry("T1", "old"))
    const newer = mem.write(taskEntry("T1", "new"))
    if (!newer.ok) throw new Error(newer.reason)

    const v = mem.resolveFold({ kind: "task", id: "T1" }, newer.ref)
    expect(v).toMatchObject({ ok: true, ref: newer.ref, fold: { stoppedAt: "s-new", lesson: "l-new" } })

    // The control: the existing first-match door answers the OLDEST checkpoint for the same unit.
    const first = createMemoryRead({ store: createDurableMemory(root), actor: "backend" }).spawnFold({
      kind: "task",
      id: "T1",
    })
    expect(first).toMatchObject({ ok: true, fold: { stoppedAt: "s-old" } })
  })

  it("refuses a foreign owner, a unit mismatch and an unknown ref by name", () => {
    const mem = createNativeMemory(binding())
    const foreign = createNativeMemory(binding({ memoryOwner: "lucy" })).write(taskEntry("T1", "l"))
    const other = mem.write(taskEntry("T2", "c"))
    if (!foreign.ok || !other.ok) throw new Error("setup")
    const unit = { kind: "task" as const, id: "T1" }
    expect(mem.resolveFold(unit, foreign.ref)).toMatchObject({ ok: false, refusal: "foreign-owner" })
    expect(mem.resolveFold(unit, other.ref)).toMatchObject({ ok: false, refusal: "unit-mismatch" })
    expect(mem.resolveFold({ kind: "pr", id: "T2" }, other.ref)).toMatchObject({ ok: false, refusal: "unit-mismatch" })
    expect(mem.resolveFold(unit, { eventId: "nope", contentHash: "nope" })).toMatchObject({
      ok: false,
      refusal: "record-not-found",
    })
    expect(mem.resolveFold(unit, { ...other.ref, contentHash: "forged" })).toMatchObject({
      ok: false,
      refusal: "record-not-found",
    })
  })

  it("without a receipt: one own record resolves, none is no-own-fold, several is ambiguous", () => {
    const mem = createNativeMemory(binding())
    const unit = { kind: "task" as const, id: "T1" }
    expect(mem.resolveFold(unit)).toMatchObject({ ok: false, refusal: "no-own-fold" })
    mem.write(taskEntry("T1", "one"))
    expect(mem.resolveFold(unit)).toMatchObject({ ok: true, fold: { stoppedAt: "s-one" } })
    mem.write(taskEntry("T1", "two"))
    expect(mem.resolveFold(unit)).toMatchObject({ ok: false, refusal: "ambiguous" })
  })

  it("a pr ref resolves to exactly { decisions, reviewOutcomes, knowledgeDelta } of the referenced record", () => {
    const mem = createNativeMemory(binding())
    mem.write(prEntry("P1", "old"))
    const w = mem.write(prEntry("P1", "new"))
    if (!w.ok) throw new Error(w.reason)
    const v = mem.resolveFold({ kind: "pr", id: "P1" }, w.ref)
    expect(v).toMatchObject({ ok: true, unit: { kind: "pr", id: "P1" }, ref: w.ref, record: w.record })
    expect(v.ok && v.fold).toEqual({
      decisions: ["d-new"],
      reviewOutcomes: ["r-new"],
      knowledgeDelta: [{ id: "k-new" }],
    })
  })

  it("a pr unit without a receipt: one own record resolves, two are ambiguous", () => {
    const mem = createNativeMemory(binding())
    const unit = { kind: "pr" as const, id: "P1" }
    mem.write(prEntry("P1", "one"))
    expect(mem.resolveFold(unit)).toMatchObject({ ok: true, fold: { decisions: ["d-one"] } })
    mem.write(prEntry("P1", "two"))
    expect(mem.resolveFold(unit)).toMatchObject({ ok: false, refusal: "ambiguous" })
  })

  it("refuses store-partial when the ref is absent from a torn log, store-unavailable when unreadable", () => {
    const mem = createNativeMemory(binding())
    const w = mem.write(taskEntry("T1", "x"))
    if (!w.ok) throw new Error(w.reason)
    tearLine()
    // A ref that IS present still resolves: its line self-verified, so the torn line cannot be it.
    expect(mem.resolveFold({ kind: "task", id: "T1" }, w.ref)).toMatchObject({ ok: true })
    expect(mem.resolveFold({ kind: "task", id: "T1" }, { eventId: "x", contentHash: "x" })).toMatchObject({
      refusal: "store-partial",
    })
    expect(mem.resolveFold({ kind: "task", id: "T1" })).toMatchObject({ refusal: "store-partial" })

    rmSync(memoryLogPath(root))
    mkdirSync(memoryLogPath(root))
    expect(mem.resolveFold({ kind: "task", id: "T1" }, w.ref)).toMatchObject({ refusal: "store-unavailable" })
  })
})

describe("clauses 7, 8, 13 — store state is derived, never an empty-looking default", () => {
  it("complete: header present, awareness facet states passed through, rules bounded in whitespace words", () => {
    const mem = createNativeMemory(binding())
    mem.write(rule("never commit secrets"))
    const h = mem.header(AW, OR)
    expect(h.state.rules).toBe("complete")
    expect(h.state.awareness).toEqual({
      mission: "seeded",
      constitution: "UN-SEEDED",
      terrain: "drifted",
      ontology: "seeded",
      taste: "seeded",
    })
    expect(h.header?.rules.map((r) => r.rule)).toEqual(["never commit secrets"])
    expect(h.bound).toEqual({ rulesWords: 3, method: "whitespace-words" })
  })

  it("partial: a torn line makes the header and recall PARTIAL while still serving what verified", () => {
    const mem = createNativeMemory(binding())
    mem.write(rule("always run the gate"))
    mem.write(taskEntry("T1", "x"))
    tearLine()
    const h = mem.header(AW, OR)
    expect(h.state.rules).toBe("partial")
    expect(h.header?.rules).toHaveLength(1)
    const r = mem.recall({ kind: "task", taskId: "T1" })
    expect(r).toMatchObject({ store: "partial" })
    expect(r.records).toHaveLength(1)
    expect(r.refs).toHaveLength(1)
  })

  it("unavailable: an unreadable log yields no header and an unavailable recall, never complete-empty", () => {
    mkdirSync(memoryLogPath(root), { recursive: true })
    const mem = createNativeMemory(binding())
    const h = mem.header(AW, OR)
    expect(h.state.rules).toBe("unavailable")
    expect(h.header).toBeUndefined()
    expect(mem.recall({ kind: "pr", prId: "P1" })).toEqual({ records: [], refs: [], store: "unavailable" })
  })

  it('a missing log is a complete, empty store — the only empty that means "nothing recorded"', () => {
    expect(createNativeMemory(binding()).recall({ kind: "task", taskId: "T1" })).toEqual({
      records: [],
      refs: [],
      store: "complete",
    })
  })
})

describe("clause 23 — write refusals pass through verbatim", () => {
  it("store-partial refuses a project write over a torn log; a task write is not judged against the set", () => {
    const mem = createNativeMemory(binding())
    mem.write(taskEntry("T0", "x"))
    tearLine()
    expect(mem.write(rule("never guess"))).toMatchObject({ ok: false, refusal: "store-partial" })
    expect(mem.write(taskEntry("T1", "y"))).toMatchObject({ ok: true })
  })

  it("store-unavailable refuses a project write when the log cannot be read", () => {
    mkdirSync(memoryLogPath(root), { recursive: true })
    expect(createNativeMemory(binding()).write(rule("never guess"))).toMatchObject({
      ok: false,
      refusal: "store-unavailable",
    })
  })

  it("over-cap keeps its tokens/cap receipt", () => {
    const v = createNativeMemory(binding()).write(rule(Array(501).fill("w").join(" ")))
    expect(v).toMatchObject({ ok: false, refusal: "over-cap", tokens: 501, cap: 500 })
  })
})

describe("clause 31 — scanner resolution: explicit path, then PATH, else scanner-unavailable", () => {
  it("no explicit path and an empty PATH refuses scanner-unavailable and writes nothing", () => {
    const v = createNativeMemory(binding({ scanner: undefined } as never)).write(taskEntry("T1", "x"))
    expect(v).toMatchObject({ ok: false, refusal: "scanner-unavailable" })
    expect(createDurableMemory(root).read().store).toHaveLength(0)
  })

  it("an explicit path that does not exist falls through to PATH, and refuses when PATH has none", () => {
    const v = createNativeMemory(binding({ scanner: { name: "gitleaks", command: join(bin, "absent") } })).write(
      taskEntry("T1", "x"),
    )
    expect(v).toMatchObject({ ok: false, refusal: "scanner-unavailable" })
  })

  it("the explicit path wins over a gitleaks on PATH", () => {
    const onPath = mkdtempSync(join(tmpdir(), "atlas-native-path-"))
    writeFileSync(join(onPath, "gitleaks"), "#!/bin/sh\n/bin/cat >/dev/null\nexit 1\n")
    chmodSync(join(onPath, "gitleaks"), 0o755)
    vi.stubEnv("PATH", onPath)
    expect(createNativeMemory(binding()).write(taskEntry("T1", "x"))).toMatchObject({ ok: true })
    expect(createNativeMemory(binding({ scanner: undefined } as never)).write(taskEntry("T2", "x"))).toMatchObject({
      ok: false,
      refusal: "scanner-blocked",
      scanner: "gitleaks",
    })
    rmSync(onPath, { recursive: true, force: true })
  })

  it("a hit is scanner-blocked", () => {
    const hit = createNativeMemory(binding({ scanner: { name: "gitleaks", command: scanner("hit", 1) } })).write(
      taskEntry("T1", "x"),
    )
    expect(hit).toMatchObject({ ok: false, refusal: "scanner-blocked", scanner: "gitleaks" })
  })

  it("a could-not-run exit is scanner-unavailable, never scanner-blocked (clause 23a)", () => {
    const broken = createNativeMemory(binding({ scanner: { name: "gitleaks", command: scanner("broken", 66) } })).write(
      taskEntry("T1", "x"),
    )
    expect(broken).toMatchObject({ ok: false, refusal: "scanner-unavailable", scanner: "gitleaks" })
    expect(createDurableMemory(root).read().store).toHaveLength(0)
  })
})

describe("clause 25 — reconcile answers an unknown outcome from the store", () => {
  it("present with the write's ref after admission; absent on a complete store before it", () => {
    const mem = createNativeMemory(binding())
    expect(mem.reconcile(taskEntry("T1", "x"))).toEqual({ present: false, store: "complete" })
    const w = mem.write(taskEntry("T1", "x"))
    expect(mem.reconcile(taskEntry("T1", "x"))).toEqual({ present: true, ref: w.ok && w.ref })
  })

  it("is owner-scoped: another owner's identical entry is not this owner's admission", () => {
    createNativeMemory(binding({ memoryOwner: "lucy" })).write(taskEntry("T1", "x"))
    expect(createNativeMemory(binding()).reconcile(taskEntry("T1", "x"))).toEqual({ present: false, store: "complete" })
  })

  it("an absent entry on a partial store says PARTIAL, so a caller does not retry blind", () => {
    const mem = createNativeMemory(binding())
    mem.write(taskEntry("T0", "x"))
    tearLine()
    expect(mem.reconcile(taskEntry("T1", "x"))).toEqual({ present: false, store: "partial" })
  })
})

describe("legacyOwners — a renamed member reads its earlier records, and writes only as itself", () => {
  it("recall and resolveFold read a legacy-owned record as the binding owner's; writes keep memoryOwner", () => {
    createDurableMemory(root).append({ owner: "former", kind: "task", entry: taskEntry("T1", "old") })
    createDurableMemory(root).append({ owner: "other", kind: "task", entry: taskEntry("T1", "foreign") })
    const mem = createNativeMemory(binding({ legacyOwners: ["former"] }))

    const got = mem.recall({ kind: "task", taskId: "T1" })
    expect(got.records.map((r) => r.owner)).toEqual(["former"])
    const v = mem.resolveFold({ kind: "task", id: "T1" }, got.refs[0])
    expect(v.ok && v.record.owner).toBe("former")
    expect(createNativeMemory(binding()).recall({ kind: "task", taskId: "T1" }).records).toEqual([])

    const written = mem.write(taskEntry("T2", "new"))
    expect(written.ok && written.record.owner).toBe("backend")
  })

  it("the header ranks a legacy-owned rule as the owner's own, and never another owner's rule", () => {
    createDurableMemory(root).append({ owner: "former", kind: "project", entry: rule("keep handlers thin") })
    createDurableMemory(root).append({ owner: "other", kind: "project", entry: rule("foreign rule") })
    createDurableMemory(root).append({ owner: "backend", kind: "project", entry: rule("keep handlers thin") })
    createDurableMemory(root).append({ owner: "backend", kind: "project", entry: rule("wrap errors") })

    const h = createNativeMemory(binding({ legacyOwners: ["former"] })).header(AW, OR)
    expect(h.header?.rules.map((r) => r.rule).sort()).toEqual(["keep handlers thin", "wrap errors"])
    createDurableMemory(root).append({ owner: "former", kind: "project", entry: rule("legacy only") })
    expect(
      createNativeMemory(binding({ legacyOwners: ["former"] }))
        .header(AW, OR)
        .header?.rules.map((r) => r.rule),
    ).toContain("legacy only")
    expect(
      createNativeMemory(binding())
        .header(AW, OR)
        .header?.rules.map((r) => r.rule),
    ).not.toContain("legacy only")
  })

  it("refuses a binding whose legacy owners are empty or repeat memoryOwner", () => {
    expect(() => createNativeMemory(binding({ legacyOwners: [""] }))).toThrow(/legacyOwners/)
    expect(() => createNativeMemory(binding({ legacyOwners: ["backend"] }))).toThrow(/legacyOwners/)
  })
})

describe("readBoundHeader — the installed header read composes the root's own slabs under a header-only binding", () => {
  const headerBinding = (over: { legacyOwners?: readonly string[] } = {}) => ({
    storage: { projectID: "proj", root },
    memoryOwner: "backend",
    ...over,
  })

  it("serves the owner's rules with the root's Awareness and Orientation, and no execution provenance", () => {
    createDurableMemory(root).append({ owner: "backend", kind: "project", entry: rule("own rule") })
    createDurableMemory(root).append({ owner: "lucy", kind: "project", entry: rule("lucy rule") })
    const h = readBoundHeader(headerBinding())
    expect(h.state.rules).toBe("complete")
    expect(h.header?.rules.map((r) => r.rule)).toEqual(["own rule"])
    expect(h.header?.awareness).toEqual(createAwarenessStore(root).read())
    expect(h.header?.orientation).toEqual(createDurableOrientation(root).orientation())
    expect(h.state.awareness.mission).toBe("UN-SEEDED")
  })

  it("reads legacy-owned rules, and an unreadable log is unavailable with no header", () => {
    createDurableMemory(root).append({ owner: "former", kind: "project", entry: rule("old rule") })
    expect(readBoundHeader(headerBinding({ legacyOwners: ["former"] })).header?.rules.map((r) => r.rule)).toEqual([
      "old rule",
    ])
    rmSync(memoryLogPath(root))
    mkdirSync(memoryLogPath(root))
    const h = readBoundHeader(headerBinding())
    expect(h.state.rules).toBe("unavailable")
    expect(h.header).toBeUndefined()
  })

  it("refuses a relative root or an empty owner before reading anything", () => {
    expect(() => readBoundHeader({ storage: { projectID: "proj", root: "rel" }, memoryOwner: "backend" })).toThrow(
      /absolute/,
    )
    expect(() => readBoundHeader({ storage: { projectID: "proj", root }, memoryOwner: "" })).toThrow(/memoryOwner/)
  })
})
