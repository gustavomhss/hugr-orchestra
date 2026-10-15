// @atlas/cli — test/memory-emit-cli.test.ts  (WP-11.W8 — `atlas memory-emit <entryJsonPath>`)
//
// The CLI door of the governed MEMORY write door: does `atlas memory-emit` marshal a JSON file to `{entry}`
// and reach the ONE wired handler's `atlas-memory-emit` leg (like `atlas emit` reaches `atlas-emit`), and
// does a real admit/refusal render through the SAME exit-code contract (`deriveStatus`) every other write
// door uses? A REAL composed door (`createDurableMemory`/`createMemoryEmit` over a tmpdir) backs the
// assertions — not a hand-rolled fake — so this is the SAME discipline `relations-cli.test.ts` uses for a
// governed door.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NamedScanner } from "@atlas/memory"
import { assembleHandler, createDurableMemory, createMemoryEmit } from "@atlas/adapter-io"
import type { WireConfig, WireSeams, WiredHandler } from "@atlas/adapter-io"
import type { TruthGate, T0Heuristic } from "@atlas/tools"
import type { ReconcileApi, GroundedFact } from "@atlas/knowledge"
import { main } from "../src/cli.js"
import { marshalArgs } from "../src/marshal.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"

const seams: WireSeams = {
  heuristic: { isCandidate: () => false } as T0Heuristic,
  gate: { gateHolds: () => "NA" } as TruthGate,
  classifier: { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) } as ReconcileApi,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}
const cleanScanner: NamedScanner = { name: "test-scanner", scan: () => false }

function composedHandler(root: string, scanner: NamedScanner = cleanScanner): WiredHandler {
  const store = createDurableMemory(root)
  const memoryEmit = createMemoryEmit({ store, actor: "dev@example.com", scanner })
  const cfg: WireConfig = {
    repoPath: root,
    casPath: join(root, ".atlas-cas"),
    scipPath: join(root, "nonexistent.scip"),
    seams,
    memoryEmit,
  }
  return assembleHandler(cfg)
}

let root: string
let writes: string[]
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-memory-emit-cli-"))
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe("WP-11.W8 — `memory-emit` is a real command bound to the atlas-memory-emit Tool", () => {
  it("is in COMMANDS, maps to atlas-memory-emit, and carries WRITE authority (derived from WRITE_PATHS)", () => {
    expect(COMMANDS).toContain("memory-emit")
    expect(COMMAND_LEG["memory-emit"]).toBe("atlas-memory-emit")
    expect(authorityOf("memory-emit")).toBe("write")
  })
})

describe("WP-11.W8 — marshalArgs reads the entry file into { entry }", () => {
  it("parses a real JSON file into the named arg shape the leg reads", () => {
    const entryPath = join(root, "entry.json")
    writeFileSync(entryPath, JSON.stringify({ rule: "r", scope: "s", frecency: 1 }))
    const m = marshalArgs("memory-emit", [entryPath], {})
    expect(m.ok).toBe(true)
    if (m.ok) expect(m.args).toEqual({ entry: { rule: "r", scope: "s", frecency: 1 } })
  })

  it("a missing file fails CLOSED with a structured error (never a throw)", () => {
    const m = marshalArgs("memory-emit", [join(root, "missing.json")], {})
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.error).toContain("cannot read entry file")
  })
})

describe("WP-11.W8 — `atlas memory-emit` end to end, over a REAL composed door", () => {
  it("admits a clean project entry: exit 0, and the data: block names owner + kind", async () => {
    const entryPath = join(root, "entry.json")
    writeFileSync(entryPath, JSON.stringify({ rule: "prefer named exports", scope: "src", frecency: 1 }))
    const handler = composedHandler(root)
    const code = await main(["memory-emit", entryPath], { handler })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("status: ok")
    expect(out).toContain("data:\n  owner: dev@example.com\n  kind: project\n")
  })

  it("a scanner refusal renders exit 2 (a governance rejection), never exit 1", async () => {
    const entryPath = join(root, "entry.json")
    writeFileSync(entryPath, JSON.stringify({ rule: "x", scope: "src", frecency: 1 }))
    const blockingScanner: NamedScanner = { name: "blocking-scanner", scan: () => true }
    const handler = composedHandler(root, blockingScanner)
    const code = await main(["memory-emit", entryPath], { handler })
    expect(code).toBe(2)
    const out = writes.join("")
    expect(out).toContain("status: rejected")
    expect(out).toContain(
      "reason: scanner-blocked: memory write blocked (fail-closed) by named scanner 'blocking-scanner'",
    )
  })

  it("a missing entry file renders exit 1 (a usage error), never exit 2", async () => {
    const handler = composedHandler(root)
    const code = await main(["memory-emit", join(root, "missing.json")], { handler })
    expect(code).toBe(1)
    expect(writes.join("")).toContain("status: error")
  })

  it("an uncomposed runtime (no handler injected) fails closed exit 1, never a throw", async () => {
    const entryPath = join(root, "entry.json")
    writeFileSync(entryPath, JSON.stringify({ rule: "x", scope: "src", frecency: 1 }))
    const code = await main(["memory-emit", entryPath], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })
})
