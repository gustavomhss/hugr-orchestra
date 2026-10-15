// @atlas/adapter-io — test/memory-emit.test.ts  (CAMPAIGN-11 W4 — the governed memory write door)
//
// Owns A5, A6, A7, A10, A21, A21b, A29 and the append-only half of A30.
//
// Every test drives the door over a REAL durable store on a real temp directory, and the ones that assert a
// refusal also assert that NOTHING reached disk. A door that refuses in its return value while writing the
// line anyway would pass a verdict-only suite, and that is precisely the gap between "the gate ran" and
// "the gate held".

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDurableMemory, memoryLogPath } from "../src/memory-store.js"
import { createMemoryEmit } from "../src/memory-emit.js"
import type { MemoryEmitDeps } from "../src/memory-emit.js"
import { MEMBER_TOK_CAP } from "@atlas/memory"
import type { MemoryEntry, NamedScanner } from "@atlas/memory"
import { NO_SCANNER_NAME } from "../src/scanner.js"

let repo: string

const clean: NamedScanner = { name: "gitleaks", scan: () => false }
const hits: NamedScanner = { name: "trufflehog", scan: () => true }

const door = (over: Partial<MemoryEmitDeps> = {}) =>
  createMemoryEmit({ store: createDurableMemory(repo), actor: "lucy", scanner: clean, ...over })

const project = (rule: string, frecency = 1): MemoryEntry => ({ rule, scope: "s", frecency }) as MemoryEntry

/** A rule of exactly `n` tokens under the pinned WORD tokenizer (`@atlas/memory` `tok`). */
const words = (n: number): string => Array.from({ length: Math.max(0, Math.round(n)) }, () => "w").join(" ")

const logbook = (prId: string): MemoryEntry =>
  ({
    prId,
    at: "1",
    territories: ["t"],
    shipped: "s",
    decisions: "d",
    tradeoffs: "tr",
    risks: "r",
    openThreads: "o",
    links: [],
  }) as MemoryEntry

/** Lines actually on disk. The refusal tests assert this, not just the verdict. */
const lines = (): string[] =>
  existsSync(memoryLogPath(repo))
    ? readFileSync(memoryLogPath(repo), "utf8")
        .trim()
        .split("\n")
        .filter((l) => l.length > 0)
    : []

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-memdoor-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("the admitted path", () => {
  it("writes one record, owned by the actor, with a DERIVED kind", () => {
    const v = door().emit(project("r1"))
    expect(v).toEqual({ ok: true, record: { owner: "lucy", kind: "project", entry: project("r1") } })
    expect(lines()).toHaveLength(1)
    expect(createDurableMemory(repo).read().store).toHaveLength(1)
  })
})

describe("A5 / A6 — MEM-5, the template gate", () => {
  it("refuses a missing required field, and writes NOTHING", () => {
    const v = door().emit({ rule: "r", scope: "s" } as unknown as MemoryEntry)
    expect(v.ok).toBe(false)
    // No template matches an entry missing a required key, so the kind cannot be derived at all — the
    // refusal is named at the gate that actually declined, never relabelled to look tidier.
    expect((v as { refusal: string }).refusal).toBe("undetermined-kind")
    expect(lines()).toHaveLength(0)
  })

  it("refuses prose OUTSIDE the fixed template keys, and writes NOTHING", () => {
    const v = door().emit({ ...(project("r") as object), freeProse: "anything" } as unknown as MemoryEntry)
    expect(v.ok).toBe(false)
    expect(lines()).toHaveLength(0)
  })
})

describe("A7 / A21 / A21b — MEM-2, the partition, both directions", () => {
  it("refuses a KNOWLEDGE-shaped entry claimed as memory (MEM-2b)", () => {
    const v = door().emit({ kind: "advisory", claim: "x" } as unknown as MemoryEntry)
    expect(v.ok).toBe(false)
    expect(lines()).toHaveLength(0)
  })

  it("a memory write carries no authority to write knowledge — the door has no knowledge path at all", () => {
    // Structural, not behavioural: the door's only persistence call is the memory log's append. This asserts
    // the surface rather than a runtime observation, because "it did not happen this time" is not a law.
    expect(Object.keys(createMemoryEmit({ store: createDurableMemory(repo), actor: "lucy", scanner: clean }))).toEqual([
      "emit",
    ])
  })

  it("refuses an UNOWNED write — the root can resolve `actor` to an empty string", () => {
    const v = door({ actor: "" }).emit(project("r"))
    expect(v.ok).toBe(false)
    expect((v as { refusal: string }).refusal).toBe("unowned")
    expect(lines()).toHaveLength(0)
  })
})

describe("A10 — MEM-3, the cap gate carries a receipt", () => {
  it("refuses an over-cap write with tokens AND cap, never a silent truncation", () => {
    // The pinned tokenizer counts WORDS (`rules.ts::tok`), not characters — a 5000-char single token is
    // ONE token and would not bind. Caught by this test failing against a char-shaped fixture.
    const v = door().emit(project(words(MEMBER_TOK_CAP + 1)))
    expect(v.ok).toBe(false)
    const r = v as { refusal: string; tokens: number; cap: number }
    expect(r.refusal).toBe("over-cap")
    expect(r.tokens).toBeGreaterThan(r.cap)
    expect(lines()).toHaveLength(0)
  })

  it("counts the OWNER’S EXISTING set, not the candidate alone", () => {
    const d = door()
    // Each of these is comfortably under the cap alone; together they cross it.
    let refused = 0
    // Each is a fifth of the cap: fine alone, over the line once the member already holds several.
    for (let i = 0; i < 12; i++) if (!d.emit(project(`${i} ${words(MEMBER_TOK_CAP / 5)}`)).ok) refused++
    // teeth (breaks-on "the cap is computed over the candidate alone, so it never binds").
    expect(refused).toBeGreaterThan(0)
  })

  it("does NOT count another member's records against this member's cap", () => {
    const big = project(words(MEMBER_TOK_CAP - 1))
    expect(door({ actor: "billy" }).emit(big).ok).toBe(true)
    expect(door({ actor: "lucy" }).emit(big).ok).toBe(true) // lucy's own set is still empty
  })
})

describe("A29 / A30 — MEM-8, the logbook is a ledger", () => {
  it("refuses a SECOND entry for the same PR, and the first is untouched on disk", () => {
    const d = door({ actor: "orch" })
    expect(d.emit(logbook("PR-1")).ok).toBe(true)
    const before = readFileSync(memoryLogPath(repo), "utf8")

    const second = d.emit(logbook("PR-1"))
    expect(second.ok).toBe(false)
    expect((second as { refusal: string }).refusal).toBe("logbook-duplicate")
    // A30's structural half: the extant bytes are IDENTICAL, not merely "still there".
    expect(readFileSync(memoryLogPath(repo), "utf8")).toBe(before)
  })

  it("the one-per-PR guard survives a RESTART — the incumbent is read from disk", () => {
    expect(door({ actor: "orch" }).emit(logbook("PR-2")).ok).toBe(true)
    // A brand-new door over a brand-new store instance: the only channel is the file.
    const fresh = createMemoryEmit({ store: createDurableMemory(repo), actor: "orch", scanner: clean })
    expect(fresh.emit(logbook("PR-2")).ok).toBe(false)
  })

  it("refuses a NON-orchestrator logbook append", () => {
    const v = door({ actor: "lucy" }).emit(logbook("PR-3"))
    expect(v.ok).toBe(false)
    expect((v as { refusal: string }).refusal).toBe("logbook-unauthorized")
    expect(lines()).toHaveLength(0)
  })

  it("a different PR is admitted — the guard is per-PR, not a global one-logbook rule", () => {
    const d = door({ actor: "orch" })
    expect(d.emit(logbook("PR-4")).ok).toBe(true)
    expect(d.emit(logbook("PR-5")).ok).toBe(true)
  })
})

describe("A8 / A9 — MEM-9, the pre-write scanner", () => {
  it("BLOCKS a hit fail-closed, names the scanner, and writes NOTHING", () => {
    const v = door({ scanner: hits }).emit(project("r"))
    expect(v.ok).toBe(false)
    const r = v as { refusal: string; scanner: string }
    expect(r.refusal).toBe("scanner-blocked")
    expect(r.scanner).toBe("trufflehog")
    expect(lines()).toHaveLength(0)
  })

  it('refuses when NO scanner is configured — "not checked" is not "no secret"', () => {
    const v = createMemoryEmit({ store: createDurableMemory(repo), actor: "lucy" }).emit(project("r"))
    expect(v.ok).toBe(false)
    expect((v as { refusal: string }).refusal).toBe("scanner-unavailable")
    expect(lines()).toHaveLength(0)
  })

  it("refuses an UNNAMED scanner — the stage must be attributable", () => {
    const v = door({ scanner: { name: "", scan: () => false } }).emit(project("r"))
    expect((v as { refusal: string }).refusal).toBe("scanner-unavailable")
    expect(lines()).toHaveLength(0)
  })

  it("W5's no-binary adapter is an ABSENCE, not a HIT — the refusal must not misname its own reason", () => {
    // The cross-WP defect: W5's adapter blocks by answering `true`, which this door would otherwise read
    // as "a secret was detected". A user would go hunting a secret that is not there instead of installing
    // a scanner. teeth (breaks-on "a missing binary is reported as a detected secret").
    const noBinary: NamedScanner = { name: NO_SCANNER_NAME, scan: () => true }
    const v = door({ scanner: noBinary }).emit(project("r"))
    expect((v as { refusal: string }).refusal).toBe("scanner-unavailable")
    expect((v as { refusal: string }).refusal).not.toBe("scanner-blocked")
    expect(lines()).toHaveLength(0)
  })

  it("a scanner that THREW is unavailable, never a pass", () => {
    const boom: NamedScanner = {
      name: "gitleaks",
      scan: () => {
        throw new Error("spawn ENOENT")
      },
    }
    const v = door({ scanner: boom }).emit(project("r"))
    expect((v as { refusal: string }).refusal).toBe("scanner-unavailable")
    expect((v as { reason: string }).reason).toContain("spawn ENOENT")
    expect(lines()).toHaveLength(0)
  })

  it("the scanner sees the MINTED RECORD, not the raw entry — owner and kind are scannable", () => {
    let seen: unknown
    door({
      scanner: {
        name: "gitleaks",
        scan: (r) => {
          seen = r
          return false
        },
      },
    }).emit(project("r"))
    expect(seen).toEqual({ owner: "lucy", kind: "project", entry: project("r") })
  })
})
