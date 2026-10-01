// @atlas/cli — test/wp-9.x-argmarshal.test.ts  (ARG-MARSHALLING #3)
//
// TEETH for the per-command marshaller: the CLI parses into a uniform {command, positionals, flags} bag, but
// every wired leg reads a NAMED shape (init→{path}, query→{scope}, emit→{node,at}, reconcile→{mergeBase,
// options}). These goldens prove `main(argv, {handler})` hands each leg the EXACT named object it destructures
// (so the routed command RESOLVES ok:true, not the "malformed args" fail-close), and that the write door
// (emit) reads a templated GroundedFact from a JSON file at positionals[0] with `at` from `--at`. Totality:
// a missing --at / unreadable file / malformed JSON fails CLOSED to a structured error + non-zero exit.
//
// The `WiredHandler` is a CAPTURING fake — it records the exact `(tool, args)` it received so the marshalled
// shape is asserted by value (the mutant tells below). No real composition here (COMPOSE-B owns that).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Guidance, Tool, Verdict } from "@atlas/tools"
import type { WiredHandler } from "@atlas/adapter-io"
import { main } from "../src/cli.js"
import { marshalArgs } from "../src/marshal.js"

const G = (next: string): Guidance => ({ next, invariant: "ARG-MARSHALLING" })

/** A capturing `WiredHandler` — records the exact `(tool, args)` the marshaller produced, returns canned ok. */
interface Sink {
  tool?: Tool
  args?: unknown
}
function capturingHandler(sink: Sink): WiredHandler {
  const handle = (tool: Tool, args: unknown): Verdict => {
    sink.tool = tool
    sink.args = args
    return { ok: true, data: {}, guidance: G("captured") }
  }
  return {
    handle,
    resolveNode: () => ({ ok: false, guidance: G("n/a") }),
    schema: () => ({ name: "x", description: "", inputSchema: {} }),
  } as unknown as WiredHandler
}

// OS temp root — portable on CI (NEVER a machine-specific scratchpad path).
const SCRATCH = tmpdir()

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

// ── the routed marshalling: each command's leg receives its EXACT named shape ─────────────────────────────

describe("ARG-MARSHALLING — main(argv,{handler}) hands each leg its named arg shape", () => {
  it("query <scope> → the query leg gets { scope, by } and RESOLVES ok:true (not malformed args)", async () => {
    // SMOKE: main(['query','src'],{handler}) → query leg gets {scope:'src', by:'scope'} → ok:true. `by`
    // defaults to 'scope' (N2 three-mode retrieval) — the scope path is behavior-identical (proven black-box).
    // TEETH (mutant: query→{path}) — asserting the args by value flips RED if the field is renamed.
    const sink: Sink = {}
    const code = await main(["query", "src"], { handler: capturingHandler(sink) })
    expect(sink.tool).toBe("atlas-query")
    expect(sink.args).toEqual({ scope: "src", by: "scope" })
    expect(code).toBe(0)
    expect(writes.join("")).toContain("status: ok")
  })

  it("init <path> → the init leg gets { path }", async () => {
    // parse enforces arity 1 for init, so a path is always present via the normal flow.
    const sink: Sink = {}
    const code = await main(["init", "/some/repo"], { handler: capturingHandler(sink) })
    expect(sink.tool).toBe("atlas-init")
    expect(sink.args).toEqual({ path: "/some/repo" })
    expect(code).toBe(0)
  })

  it("reconcile <mergeBase> → the reconcile leg gets { mergeBase, options:{acceptReground} }", async () => {
    const sink: Sink = {}
    await main(["reconcile", "abc123"], { handler: capturingHandler(sink) })
    expect(sink.tool).toBe("atlas-reconcile")
    expect(sink.args).toEqual({ mergeBase: "abc123", options: { acceptReground: false } })
  })

  it("reconcile --accept-reground flips options.acceptReground true", async () => {
    const sink: Sink = {}
    await main(["reconcile", "abc123", "--accept-reground"], { handler: capturingHandler(sink) })
    expect(sink.args).toEqual({ mergeBase: "abc123", options: { acceptReground: true } })
  })
})

// ── the write door: emit reads a templated GroundedFact from a JSON file + --at ────────────────────────────

describe("ARG-MARSHALLING — emit <factJsonPath> --at <sha> → { node, at }", () => {
  it("reads the JSON fact file at positionals[0] as `node`, `at` from --at → the emit leg gets {node,at}", async () => {
    // TEETH (mutant: drop the emit file-read) — if the marshaller passed the PATH string as `node` (or skipped
    // JSON.parse) this deep-equal on the parsed object flips RED.
    const fact = { kind: "advisory", id: "n1", claimNorm: "x", freshness: "FRESH" }
    const dir = mkdtempSync(join(SCRATCH, "argmarshal-emit-"))
    const factPath = join(dir, "fact.json")
    writeFileSync(factPath, JSON.stringify(fact))
    const sink: Sink = {}
    const code = await main(["emit", factPath, "--at=deadbeef"], { handler: capturingHandler(sink) })
    expect(sink.tool).toBe("atlas-emit")
    expect(sink.args).toEqual({ node: fact, at: "deadbeef" })
    expect(code).toBe(0)
  })
})

// ── totality: a missing --at / unreadable file / malformed JSON fails CLOSED (structured, non-zero) ────────

describe("ARG-MARSHALLING — emit totality (never a throw)", () => {
  it("missing --at → structured error + guidance + non-zero exit, the leg is NEVER called", async () => {
    const dir = mkdtempSync(join(SCRATCH, "argmarshal-noat-"))
    const factPath = join(dir, "fact.json")
    writeFileSync(factPath, JSON.stringify({ kind: "advisory" }))
    const sink: Sink = {}
    const code = await main(["emit", factPath], { handler: capturingHandler(sink) })
    expect(code).not.toBe(0)
    expect(sink.tool).toBeUndefined() // fail-closed BEFORE the write door
    const out = writes.join("")
    expect(out).toMatch(/next:/)
    expect(out).toMatch(/--at/)
  })

  it("unreadable fact file → structured error + non-zero exit, the leg is NEVER called", async () => {
    const missing = join(SCRATCH, "argmarshal-does-not-exist-9x", "nope.json")
    const sink: Sink = {}
    const code = await main(["emit", missing, "--at=deadbeef"], { handler: capturingHandler(sink) })
    expect(code).not.toBe(0)
    expect(sink.tool).toBeUndefined()
    expect(writes.join("")).toMatch(/cannot read fact file/)
  })

  it("malformed fact JSON → structured error, not a throw", async () => {
    const dir = mkdtempSync(join(SCRATCH, "argmarshal-badjson-"))
    const factPath = join(dir, "fact.json")
    writeFileSync(factPath, "{ not valid json")
    const sink: Sink = {}
    const code = await main(["emit", factPath, "--at=deadbeef"], { handler: capturingHandler(sink) })
    expect(code).not.toBe(0)
    expect(sink.tool).toBeUndefined()
    expect(writes.join("")).toMatch(/not valid JSON/)
  })
})

// ── the pure marshaller directly (the init `?? '.'` default + the mutant tells) ────────────────────────────

describe("ARG-MARSHALLING — marshalArgs (pure) shapes + defaults", () => {
  it('init with NO positional defaults path to "." (the documented [path] default, unreachable via parse)', () => {
    expect(marshalArgs("init", [], {})).toEqual({ ok: true, args: { path: "." } })
  })

  it("query maps to {scope, by} — NOT {path} (mutant tell); `by` defaults to scope", () => {
    const r = marshalArgs("query", ["src"], {})
    expect(r).toEqual({ ok: true, args: { scope: "src", by: "scope" } })
    // teeth: a mutant emitting {path:'src'} would not carry a `scope` field.
    if (r.ok) expect((r.args as Record<string, unknown>).path).toBeUndefined()
  })

  it("query --by validates fail-closed: a known mode passes, an unknown mode is a structured error", () => {
    // the three CLOSED modes marshal through (INDEX-6); the `by` rides onto the leg's named arg shape.
    expect(marshalArgs("query", ["src"], { by: "dependency" })).toEqual({
      ok: true,
      args: { scope: "src", by: "dependency" },
    })
    expect(marshalArgs("query", ["tag"], { by: "trigger" })).toEqual({
      ok: true,
      args: { scope: "tag", by: "trigger" },
    })
    // a bogus mode fails CLOSED (mirrors the emit missing-`--at` guard) — never routed blind.
    expect(marshalArgs("query", ["src"], { by: "bogus" })).toEqual({
      ok: false,
      error: "query --by must be one of scope|dependency|trigger",
    })
  })

  it("emit success carries the PARSED node object, never the path string (mutant tell)", () => {
    const dir = mkdtempSync(join(SCRATCH, "argmarshal-pure-"))
    const factPath = join(dir, "fact.json")
    writeFileSync(factPath, JSON.stringify({ kind: "advisory", id: "n1" }))
    const r = marshalArgs("emit", [factPath], { at: "deadbeef" })
    expect(r).toEqual({ ok: true, args: { node: { kind: "advisory", id: "n1" }, at: "deadbeef" } })
    // teeth: dropping the file-read would leave `node` === factPath (a string), not the parsed object.
    if (r.ok) expect(typeof (r.args as { node: unknown }).node).toBe("object")
  })
})
