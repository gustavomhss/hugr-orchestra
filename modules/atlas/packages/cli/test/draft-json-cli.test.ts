// @atlas/cli — test/draft-json-cli.test.ts  (WP-10.A2-a.CLI-JSON — `atlas draft ... --json` closes the CLI-side
// draft→emit round trip)
//
// `atlas draft <anchor> <slot> <claim>` used to render ONLY a human-text SUBSET of the `DraftOut` envelope
// (render.ts's draft branch), with no way to CAPTURE the whole thing for `atlas emit <file> --at <rev>` (whose
// `marshalEmit` already accepts an envelope — recognised structurally by BOTH `.fact` and `.rev`, marshal.ts).
// `--json` prints the RAW `DraftOut`, `JSON.stringify`'d whole, so the round trip closes over the CLI transport
// the same way it already does for a hand-authored envelope (slots-draft-cli.test.ts's SCN-AUTH-7b/7c suite).
//
// Mirrors slots-draft-cli.test.ts's fixture shape: the REAL composed `fix-author` fixture (a real draft leg, a
// real rev, a real subtreeHash), never a hand-held stub — so a false pass from an over-simplified fake cannot
// hide a real divergence.

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { composeRuntime, initAst } from "@atlas/adapter-io"
import type { WiredHandler } from "@atlas/adapter-io"
import type { DraftApi, DraftOut, Guidance, SlotsApi, Verdict } from "@atlas/tools"
import { main } from "../src/cli.js"
import { marshalArgs } from "../src/marshal.js"

const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n",
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
}

function makeFixAuthor(): { repoPath: string; rev: string } {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-draft-json-cli-"))
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

interface FixAuthor {
  readonly repoPath: string
  readonly rev: string
  readonly slots: SlotsApi["slots"]
  readonly draft: DraftApi["draft"]
  cleanup(): void
}

let fix: FixAuthor
let writes: string[]

beforeAll(async () => {
  await initAst()
  const { repoPath, rev } = makeFixAuthor()
  const runtime = composeRuntime(repoPath)
  fix = {
    repoPath,
    rev,
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

/** A total FAKE `WiredHandler` — records the `node`/`at` an `atlas-emit` dispatch receives, never throws. */
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

describe("WP-10.A2-a.CLI-JSON — `atlas draft ... --json` prints the WHOLE DraftOut envelope", () => {
  it("prints valid JSON carrying `.fact` + `.rev`, byte-identical to the leg's own DraftOut", async () => {
    const code = await main(["draft", "src/app.ts::run", "invariant", "never returns empty", "--json"], {
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(0)
    const out = writes.join("")
    // never the human render — this is a NEW branch, not a variant of it.
    expect(out).not.toContain("status: ok")
    expect(out).not.toContain("draft:")
    const parsed = JSON.parse(out) as DraftOut
    expect(typeof parsed.fact).toBe("object")
    expect(typeof parsed.rev).toBe("string")
    expect(parsed.rev).toBe(fix.rev)
    expect(parsed.operation).toBe("CREATE")
    // exactly the SAME envelope the leg itself would have computed for the identical candidate — no
    // hand-picked-field drift between the JSON branch and the raw leg output.
    const expected = fix.draft({ anchor: "src/app.ts::run", slot: "invariant", claim: "never returns empty" })
    expect(parsed).toEqual(expected)
  })

  it("the default (no --json) human render stays byte-unchanged", async () => {
    const code = await main(["draft", "src/app.ts::run", "invariant", "never returns empty"], {
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("status: ok")
    expect(out).toMatch(/draft: [0-9a-f]+/)
    expect(out).toContain("operation: CREATE")
    // never a bare JSON object on this path.
    expect(() => JSON.parse(out)).toThrow()
  })

  it("a FAILED draft ignores --json and renders the SAME human error as without the flag", async () => {
    const code = await main(["draft", "src/app.ts::run", "not-a-real-slot", "x", "--json"], {
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(1)
    const out = writes.join("")
    expect(out).toContain("unknown slot 'not-a-real-slot'")
    expect(() => JSON.parse(out)).toThrow()
  })

  it("THE ROUND TRIP — draft --json | emit --at <matching rev> is ACCEPTED (exit 0, envelope unwrapped to .fact)", async () => {
    const code = await main(["draft", "src/app.ts::run", "invariant", "never returns empty", "--json"], {
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(0)
    const envelopeJson = writes.join("")
    const envelope = JSON.parse(envelopeJson) as DraftOut

    const factPath = join(tmpdir(), `atlas-draft-json-round-trip-${Date.now()}.json`)
    writeFileSync(factPath, envelopeJson)
    try {
      // (a) at the CLI marshaller level — the exact seam `emit` reads.
      const marshalled = marshalArgs("emit", [factPath], { at: envelope.rev })
      expect(marshalled.ok).toBe(true)
      expect(marshalled.ok && (marshalled.args as { node: unknown }).node).toEqual(envelope.fact)

      // (b) end to end through `main` with a real (faked) emit handler — the whole CLI door, not just the marshaller.
      const received: { node?: unknown; at?: unknown }[] = []
      const emitCode = await main(["emit", factPath, "--at", envelope.rev], { handler: fakeEmitHandler(received) })
      expect(emitCode).toBe(0)
      expect(received).toHaveLength(1)
      expect(received[0]?.node).toEqual(envelope.fact)
      expect(received[0]?.at).toBe(envelope.rev)
    } finally {
      rmSync(factPath, { force: true })
    }
  })

  it("THE ROUND TRIP — draft --json | emit --at <mismatched rev> is REJECTED (exit 2, the rev mismatch is NAMED)", async () => {
    const code = await main(["draft", "src/app.ts::run", "invariant", "never returns empty", "--json"], {
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(0)
    const envelopeJson = writes.join("")
    const envelope = JSON.parse(envelopeJson) as DraftOut
    const wrongRev = "0".repeat(40)
    expect(wrongRev).not.toBe(envelope.rev)

    const factPath = join(tmpdir(), `atlas-draft-json-mismatch-${Date.now()}.json`)
    writeFileSync(factPath, envelopeJson)
    try {
      const marshalled = marshalArgs("emit", [factPath], { at: wrongRev })
      expect(marshalled.ok).toBe(false)
      expect(!marshalled.ok && marshalled.refusal).toBe(true)
      expect(!marshalled.ok && marshalled.error).toContain("rev mismatch")

      const received: { node?: unknown; at?: unknown }[] = []
      const emitCode = await main(["emit", factPath, "--at", wrongRev], { handler: fakeEmitHandler(received) })
      expect(emitCode).toBe(2)
      expect(received).toEqual([]) // never reached the handler
      const out = writes.join("")
      expect(out).toContain("status: rejected")
      expect(out).toContain("rev mismatch")
    } finally {
      rmSync(factPath, { force: true })
    }
  })
})
