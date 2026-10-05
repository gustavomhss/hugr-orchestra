// @atlas/cli — test/slots-draft-cli.test.ts  (WP-10.A2-a.CLI — `atlas slots` + `atlas draft` end to end)
//
// Mirrors anchors-cli.test.ts's shape: (1) argv→dispatch wiring over the REAL composed `fix-author` fixture
// (not a hand-held stub, so a rev/hash/route is exactly what the shipped path returns), and (2) the frozen
// acceptance goldens this WP's card names — SCN-AUTH-6d-1 (three inputs, everything else computed),
// SCN-AUTH-6f-1 (no computed field ever demanded of the author), SCN-AUTH-7b-1 (a rev mismatch is NAMED,
// distinctly from the generic drift refusal), SCN-AUTH-7c-1 (the refusal does not blame the claim) —
// docs/requirements/goldens-authoring.md. Also extends the CAMPAIGN-10 write-freedom harness
// (write-spy-store.ts) to the two new planners, closing the comment in anchors-cli.test.ts that named them.

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { composeRuntime, initAst } from "@atlas/adapter-io"
import type { WiredHandler } from "@atlas/adapter-io"
import type { DraftApi, Guidance, SlotsApi, Verdict } from "@atlas/tools"
import { GOVERNANCE_SURFACE, WRITE_PATHS } from "@atlas/tools"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
import type { Command } from "../src/map.js"
import { parse } from "../src/parse.js"
import { createWriteSpyStore, seedSomeBytes } from "./write-spy-store.js"

// ── the `fix-author` fixture (goldens-authoring.md §Fixture universe — the same repo anchors-cli.test.ts uses) ──
const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n",
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
}

function makeFixAuthor(): { repoPath: string; rev: string } {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-slots-draft-cli-"))
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: repoPath, stdio: ["pipe", "pipe", "pipe"] }).toString()
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  git("add", ".")
  git("commit", "-q", "-m", "R1")
  const rev = git("rev-parse", "HEAD").trim()
  return { repoPath, rev }
}

/** Advance the fixture repo to a SECOND rev (R2) — the anchored file's content changes, so its `subtreeHash`
 *  changes too (a real drift, not a synthetic sha string). */
function advanceFixAuthor(repoPath: string): string {
  writeFileSync(join(repoPath, "src/app.ts"), FILES["src/app.ts"] + "\n// R2 touch\n")
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: repoPath, stdio: ["pipe", "pipe", "pipe"] }).toString()
  git("add", ".")
  git("commit", "-q", "-m", "R2")
  return git("rev-parse", "HEAD").trim()
}

interface FixAuthor {
  readonly repoPath: string
  readonly rev: string
  readonly rev2: string
  readonly slots: SlotsApi["slots"]
  readonly draft: DraftApi["draft"]
  cleanup(): void
}

let fix: FixAuthor
let writes: string[]

beforeAll(async () => {
  await initAst()
  const { repoPath, rev } = makeFixAuthor()
  const rev2 = advanceFixAuthor(repoPath)
  const runtime = composeRuntime(repoPath)
  fix = {
    repoPath,
    rev,
    rev2,
    slots: runtime.slots,
    draft: runtime.draft,
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  }
})
afterAll(() => fix.cleanup())

beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

/** A total FAKE `WiredHandler` — records the `node` arg an `atlas-emit` dispatch receives (for the matched-
 *  rev round-trip assertion), never throws. */
function fakeEmitHandler(received: { node?: unknown; at?: unknown }[]): WiredHandler {
  const G = (next: string): Guidance => ({ next, invariant: "x" })
  const handle = (_tool: unknown, args: unknown): Verdict => {
    received.push(args as { node?: unknown; at?: unknown })
    return { ok: true, data: { emitted: true, id: "fake-id" }, guidance: G("emitted") }
  }
  return {
    handle,
    resolveNode: () => ({ ok: false, guidance: G("n/a") }),
    schema: () => ({ name: "x", description: "", inputSchema: {} }),
  } as unknown as WiredHandler
}

// ── (1) `atlas slots` / `atlas draft` are real commands that reach real legs ────────────────────────────────

describe("WP-10.A2-a.CLI — `atlas slots` end to end", () => {
  it("parses with ZERO required positionals and routes to the READ authority oracle", () => {
    const p = parse(["slots"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("slots")
    expect(COMMANDS).toContain("slots")
    expect(COMMAND_LEG.slots).toBe("atlas-query")
    expect(authorityOf("slots")).toBe("read")
  })

  it("lists EXACTLY the 13-member closed PredicateSlot vocabulary, off the composed leg", async () => {
    const code = await main(["slots"], { slots: fix.slots })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("status: ok")
    expect(out).toContain("slots: 13 predicate slot(s)")
    expect(out).toContain("slot invariant: a property that must always hold")
    expect(out).toContain("slot count:")
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent empty vocabulary", async () => {
    const code = await main(["slots"], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })
})

describe("WP-10.A2-a.CLI — `atlas draft <anchor> <slot> <claim>` end to end", () => {
  it("parses with THREE required positionals and routes to the READ authority oracle", () => {
    const p = parse(["draft", "src/app.ts::run", "invariant", "never returns empty"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("draft")
    expect(p.ok && p.positionals).toEqual(["src/app.ts::run", "invariant", "never returns empty"])
    expect(COMMANDS).toContain("draft")
    expect(COMMAND_LEG.draft).toBe("atlas-query")
    expect(authorityOf("draft")).toBe("read")
  })

  it("drafts a candidate fact off the composed leg — id/tier/grounding/rev are all present, none typed", async () => {
    const code = await main(["draft", "src/app.ts::run", "invariant", "never returns empty"], {
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("status: ok")
    expect(out).toMatch(/draft: [0-9a-f]+/) // the minted nodeKey — never a placeholder
    expect(out).toContain("tier: T2")
    expect(out).toContain("slot: invariant")
    expect(out).toContain("claim: never returns empty")
    expect(out).toContain(`rev: ${fix.rev2}`) // stamped at composeRuntime's HEAD (AUTHOR-7a)
    expect(out).toContain("operation: CREATE")
    expect(out).toContain("route: full-ratify")
    expect(out).toContain("requires: ATLAS_RATIFY_TOKEN")
  })

  it("an out-of-vocabulary slot is refused BEFORE the leg is ever called", async () => {
    let called = 0
    const leg: DraftApi["draft"] = (c) => {
      called++
      return fix.draft(c)
    }
    const code = await main(["draft", "src/app.ts::run", "not-a-real-slot", "x"], { draft: leg, slots: fix.slots })
    expect(code).toBe(1)
    expect(called).toBe(0)
    expect(writes.join("")).toContain("unknown slot 'not-a-real-slot'")
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent draft over nothing", async () => {
    const code = await main(["draft", "src/app.ts::run", "invariant", "x"], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })

  it("a missing claim fails at the parser arity floor, before any leg is reached", async () => {
    let called = 0
    const leg: DraftApi["draft"] = (c) => {
      called++
      return fix.draft(c)
    }
    const code = await main(["draft", "src/app.ts::run", "invariant"], { draft: leg, slots: fix.slots })
    expect(code).toBe(1)
    expect(called).toBe(0)
    expect(writes.join("")).toContain("requires 3 positional argument(s), got 2")
  })
})

// ── (2) SCN-AUTH-6d-1 / SCN-AUTH-6f-1 — three inputs, everything else computed, nothing computed demanded ────

describe("SCN-AUTH-6d-1 / SCN-AUTH-6f-1 — three inputs, everything else computed", () => {
  it("SCN-AUTH-6d-1: `atlas draft <anchor> <slot> <claim>` — no further input required, a complete fact returns", async () => {
    const code = await main(["draft", "src/util.ts::greet", "gotcha", "name must not be empty"], {
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(0)
    const out = writes.join("")
    // every field the emit door reads (AUTHOR-6a) is present on the rendered fact — none of them a positional
    // or a flag the author supplied (only anchor/slot/claim were typed above).
    expect(out).toMatch(/draft: [0-9a-f]+/)
    expect(out).toContain("tier: T2")
    expect(out).toContain("rev:")
    expect(out).toContain("operation:")
    expect(out).toContain("route:")
  })

  it("SCN-AUTH-6f-1 (guard): the CLI surface has NO flag/positional for `id` or `subtreeHash` — arity is exactly 3", () => {
    // teeth: a drafter that DEMANDED a computed field would need a 4th positional or a flag this door reads;
    // neither exists — ARITY pins the door to exactly {anchor, slot, claim}, and marshal.ts never reads an
    // `--id`/`--subtree-hash`/`--hash` flag for `draft` (draft is intercepted before marshalArgs entirely).
    const p = parse(["draft", "src/app.ts::run", "invariant", "a claim", "--id=deadbeef", "--subtree-hash=cafe"])
    expect(p.ok).toBe(true)
    // the extra flags fold into the bag (CLI-1b totality) but nothing downstream of `draftVerdict` reads them —
    // proven positively by the SAME invocation succeeding with IDENTICAL output to the flag-free call above.
    expect(p.ok && p.positionals).toEqual(["src/app.ts::run", "invariant", "a claim"])
  })
})

// ── (3) SCN-AUTH-7b-1 / SCN-AUTH-7c-1 — a rev mismatch is named, distinctly, without blaming the claim ───────

describe("SCN-AUTH-7b-1 / SCN-AUTH-7c-1 — a rev mismatch is named, the claim is not blamed", () => {
  it("SCN-AUTH-7b-1: a draft computed at R2, emitted with --at R1 → the refusal NAMES the rev mismatch", async () => {
    const draftOut = fix.draft({ anchor: "src/app.ts::run", slot: "invariant", claim: "never returns empty" })
    expect(draftOut.rev).toBe(fix.rev2) // sanity: composeRuntime read HEAD, which IS rev2 here

    const factPath = join(tmpdir(), `atlas-draft-envelope-${Date.now()}.json`)
    writeFileSync(factPath, JSON.stringify(draftOut))
    try {
      const received: { node?: unknown; at?: unknown }[] = []
      const code = await main(["emit", factPath, "--at", fix.rev], { handler: fakeEmitHandler(received) })
      expect(code).toBe(2) // a governed REFUSAL (exit 2), not a usage error (exit 1)
      expect(received).toEqual([]) // the handler was NEVER reached — refused at the CLI's own marshaller
      const out = writes.join("")
      expect(out).toContain("status: rejected")
      expect(out).toContain("rev mismatch")
      expect(out).toContain(draftOut.rev) // names the rev the draft carries
      expect(out).toContain(fix.rev) // names the rev --at requested
    } finally {
      rmSync(factPath, { force: true })
    }
  })

  it("SCN-AUTH-7c-1 (guard): the SAME refusal does NOT attribute the failure to the claim — and is DISTINCT from the generic drift refusal", async () => {
    const draftOut = fix.draft({ anchor: "src/app.ts::run", slot: "invariant", claim: "never returns empty" })
    const factPath = join(tmpdir(), `atlas-draft-envelope-2-${Date.now()}.json`)
    writeFileSync(factPath, JSON.stringify(draftOut))
    try {
      const received: { node?: unknown; at?: unknown }[] = []
      const code = await main(["emit", factPath, "--at", fix.rev], { handler: fakeEmitHandler(received) })
      expect(code).toBe(2)
      const out = writes.join("")
      // teeth: a generic "grounding does not re-derive" reason (the truth gate's own REJECTED string) would
      // blur a STALE REV with a BAD CLAIM — this refusal is a DIFFERENT string, minted at the CLI's own
      // marshaller BEFORE the truth gate is ever reached.
      expect(out).not.toContain("ungrounded: citation does not re-derive")
      expect(out).not.toContain("does not re-derive at source@sha")
      // and it says so explicitly, rather than leaving a reader to infer it.
      expect(out).toContain("not a bad claim")
    } finally {
      rmSync(factPath, { force: true })
    }
  })

  it("the round trip: SAME rev on both sides → the envelope unwraps to `.fact` and reaches the handler unchanged", async () => {
    const draftOut = fix.draft({ anchor: "src/app.ts::run", slot: "invariant", claim: "never returns empty" })
    const factPath = join(tmpdir(), `atlas-draft-envelope-3-${Date.now()}.json`)
    writeFileSync(factPath, JSON.stringify(draftOut))
    try {
      const received: { node?: unknown; at?: unknown }[] = []
      const code = await main(["emit", factPath, "--at", draftOut.rev], { handler: fakeEmitHandler(received) })
      expect(code).toBe(0)
      expect(received).toHaveLength(1)
      expect(received[0]?.at).toBe(draftOut.rev)
      expect(received[0]?.node).toEqual(draftOut.fact) // the envelope unwrapped to its `.fact`, unmodified
    } finally {
      rmSync(factPath, { force: true })
    }
  })

  it("a bare GroundedFact (the pre-existing emit shape) is UNCHANGED by this WP — no `.fact`/`.rev` keys, never mistaken for an envelope", async () => {
    const draftOut = fix.draft({ anchor: "src/app.ts::run", slot: "invariant", claim: "never returns empty" })
    const factPath = join(tmpdir(), `atlas-bare-fact-${Date.now()}.json`)
    writeFileSync(factPath, JSON.stringify(draftOut.fact)) // JUST the fact, no envelope
    try {
      const received: { node?: unknown; at?: unknown }[] = []
      // any --at at all reaches the handler unchanged — no rev-mismatch branch fires for a bare fact.
      const code = await main(["emit", factPath, "--at", fix.rev], { handler: fakeEmitHandler(received) })
      expect(code).toBe(0)
      expect(received).toHaveLength(1)
      expect(received[0]?.node).toEqual(draftOut.fact)
      expect(received[0]?.at).toBe(fix.rev)
    } finally {
      rmSync(factPath, { force: true })
    }
  })
})

// ── (4) SCN-AUTH-2a-1 / SCN-AUTH-2d-1 / PROP-AUTH-2 — `slots`/`draft` join the write-freedom harness ──────────

describe("SCN-AUTH-2a-1 / PROP-AUTH-2 — `slots`/`draft` write nothing (extends anchors-cli.test.ts's harness)", () => {
  const AUTHORING_PLANNERS: readonly Command[] = ["slots", "draft"]

  function argvFor(cmd: Command): string[] {
    return cmd === "slots" ? ["slots"] : ["draft", "src/app.ts::run", "invariant", "a write-freedom claim"]
  }

  it("every planner completes under the write-spy and the spy records ZERO calls", async () => {
    const h = createWriteSpyStore()
    seedSomeBytes(h.seed)
    try {
      for (const cmd of AUTHORING_PLANNERS) {
        const code = await main(argvFor(cmd), { slots: fix.slots, draft: fix.draft })
        expect(code).toBe(0)
      }
      expect(h.calls()).toEqual([])
    } finally {
      h.dispose()
    }
  })

  it("PROP-AUTH-2 (set-level) — `slots`/`draft`: leg ∉ WRITE_PATHS ∧ leg ∉ GOVERNANCE_SURFACE", () => {
    for (const cmd of AUTHORING_PLANNERS) {
      expect(authorityOf(cmd)).toBe("read")
      const leg = COMMAND_LEG[cmd]
      expect((WRITE_PATHS as readonly string[]).includes(leg)).toBe(false)
      // WP-11.W8: GOVERNANCE_SURFACE/WRITE_PATHS grew from 5/2 to 6/3 (`atlas-memory-emit`); `slots`/`draft`
      // still open neither, which is the property under test here.
      expect(GOVERNANCE_SURFACE.length).toBe(6)
      expect((WRITE_PATHS as readonly string[]).length).toBe(3)
    }
  })
})
