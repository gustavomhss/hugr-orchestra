// @atlas/cli — test/wp-9.x-compose-b.integration.test.ts  (COMPOSE-B — the composed-runtime smoke)
//
// The end-to-end proof that `composeRuntime(repo) → WiredHandler → command` actually serves — NOT a fake.
// A temp git-free repo (a `.atlas/policy.json` + a minimal source tree, no `.scip` ⇒ composeRuntime's
// empty-SCIP guard) is stood up ONCE; the REAL composed handler drives the same `main(argv, { handler })`
// surface the production `bin.ts` wires. This is the teeth for COMPOSE-B: a mutant that leaves a bin
// throwing / never passes the handler makes `main` fall to the fail-closed "runtime is not composed"
// sentinel — flipping the `NOT-sentinel` goldens RED.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { create } from "@bufbuild/protobuf"
import { serializeSCIP, IndexSchema, MetadataSchema, ToolInfoSchema } from "@c4312/scip"
import { composeRuntime } from "@atlas/adapter-io"
import type { WiredHandler } from "@atlas/adapter-io"
// `InitOut` is the REAL `atlas-init` payload type; it replaces a hand-written `{ territories: { name:
// string }[] }` structural stand-in that had drifted from it (the envelope declares `readonly Territory[]`,
// and `Territory` carries owner/tier/globs besides `name`).
import type { DoctorSource, InitOut, Verdict } from "@atlas/tools"
import { main } from "../src/cli.js"

// OS temp root — portable across dev + CI (never a machine-specific absolute path).
const SCRATCH = tmpdir()

/** The fail-closed sentinel `main` renders when NO handler is injected — the mutant's tell (cli.ts). */
const NOT_COMPOSED = "atlas runtime is not composed yet"

/** A valid minimal admin policy (mirrors defaultPolicy) — proves the loader reads a real file, not a stub. */
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: {} },
})

/** Assert a value is a well-formed frozen `Verdict`: a boolean `ok` + guidance carrying BOTH fields. */
function expectWellFormedVerdict(v: Verdict): void {
  expect(typeof v.ok).toBe("boolean")
  expect(typeof v.guidance.next).toBe("string")
  expect(typeof v.guidance.invariant).toBe("string")
  expect(v.guidance.next.length).toBeGreaterThan(0)
}

let tempRepo: string
let handler: WiredHandler
let doctorSource: DoctorSource

beforeAll(() => {
  tempRepo = mkdtempSync(join(SCRATCH, "compose-b-"))
  mkdirSync(join(tempRepo, ".atlas"), { recursive: true })
  writeFileSync(join(tempRepo, ".atlas", "policy.json"), POLICY)
  // a minimal source tree — walkFileTree has real files to build the index axes over (no `.scip` present).
  mkdirSync(join(tempRepo, "src"), { recursive: true })
  writeFileSync(join(tempRepo, "src", "foo.ts"), "export const foo = (): number => 1;\n")
  // A valid minimal SCIP protobuf (empty document set). composeRuntime's `readScipOrEmpty` guards the axes
  // build, but `assembleHandler` (adapter-io/wire.ts) reads the `.scip` UNCONDITIONALLY — so the empty-SCIP
  // guard does NOT cover the wire path and a real `.atlas/index.scip` file must exist (flagged in the card).
  const scip = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: `file://${tempRepo}`,
      toolInfo: create(ToolInfoSchema, { name: "atlas-compose-b-smoke", version: "0" }),
    }),
    documents: [],
  })
  writeFileSync(join(tempRepo, ".atlas", "index.scip"), serializeSCIP(scip))
  // composeRuntime enumerates the source tree via `git ls-files` (adapter-io/fs.ts) — so the repo MUST be a
  // real git repo with tracked files (the harness's "git-free" note contradicts composeRuntime's actual
  // dependency; flagged in the return card). `git add` (no commit needed) is enough for `ls-files`.
  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: tempRepo, stdio: "ignore" })
  git("init", "-q")
  git("config", "user.email", "test@atlas.local")
  git("config", "user.name", "atlas-test")
  git("add", "-A")
  // THE real composition root — reads the repo at `tempRepo`, builds the governed durable handler AND the
  // real read-only DoctorSource (`atlas doctor`'s port) from the same store + revIndex.
  ;({ handler, doctorSource } = composeRuntime(tempRepo))
})

afterAll(() => rmSync(tempRepo, { recursive: true, force: true }))

// capture stdout so `main`'s rendered bytes are asserted (and to silence console noise).
let writes: string[]
afterEach(() => vi.restoreAllMocks())
function captureStdout(): void {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
}

// ── the composed handler serves a REAL verdict (composeRuntime → handler) ──────────────────────────────

describe("COMPOSE-B — composeRuntime stands up a real WiredHandler", () => {
  it("exposes the frozen handler surface (handle/schema/resolveNode), not a stub", () => {
    expect(typeof handler.handle).toBe("function")
    expect(typeof handler.schema).toBe("function")
    expect(typeof handler.resolveNode).toBe("function")
  })

  it("handle(atlas-init, { path }) RESOLVES ok:true — the real index leg builds real territories", () => {
    // The strongest end-to-end proof: the composed handler is backed by the REAL adapters (index axes built
    // from the git-tracked tree), so a correctly-shaped init RESOLVES to a genuine ok:true projection — NOT
    // a fake, NOT a fail-closed stub. TEETH: a mutant bin/handler that never composes the real handler
    // (returns a stub) cannot produce these real territories.
    // `'.'` — the whole repo. This passed the ABSOLUTE `tempRepo` while `territories()` discarded its
    // argument; the path is read now (adapter-io/src/index-adapter.ts) and the index is keyed by
    // repo-RELATIVE paths, so `.` is how "the whole repo" is spelled. The assertion below is unchanged.
    const v = handler.handle("atlas-init", { path: "." })
    expectWellFormedVerdict(v)
    expect(v.ok).toBe(true)
    if (v.ok) {
      const names = (v.data as InitOut).territories.map((t) => t.name)
      expect(names).toContain("src") // the real source tree became a real territory
    }
  })

  it("handle(atlas-init, { path }) HONOURS the path — a subtree, and a refusal for a path that is not there", () => {
    // The defect this replaces: every path rendered the identical top-level block, including a path that
    // does not exist, which reported a successful move-in of nothing.
    const sub = handler.handle("atlas-init", { path: "src" })
    expect(sub.ok).toBe(true)
    if (sub.ok) {
      const names = (sub.data as InitOut).territories.map((t) => t.name)
      expect(names.every((n) => n.startsWith("src/"))).toBe(true)
      expect(names).not.toContain("src") // `src` is what was ASKED for, not what is IN it
    }

    const miss = handler.handle("atlas-init", { path: "no/such/path" })
    expect(miss.ok).toBe(false)
    expect(miss.rejected ?? "").toContain("no/such/path")
  })

  it("handle(atlas-query, { scope }) RESOLVES ok:true over the real composed handler", () => {
    // TEETH: routes through the real assembled query leg (the built axes), returning a genuine projection.
    const v = handler.handle("atlas-query", { scope: "src" })
    expectWellFormedVerdict(v)
    expect(v.ok).toBe(true)
  })
})

// ── end-to-end over the production `main(argv, { handler })` surface (what bin.ts wires) ────────────────

describe("COMPOSE-B — main drives the composed handler end-to-end (query)", () => {
  it("main([query, scope], { handler }) resolves to a number and NOT the fail-closed sentinel", async () => {
    // TEETH: a mutant `bin.ts` that never passes `{ handler }` makes `main` render the NOT_COMPOSED sentinel
    // (cli.ts fail-closed leg). With the composed handler injected, the render is a REAL handler verdict that
    // is NOT that sentinel. NOTE: over the routed path the verdict is currently a `malformed args` rejection,
    // because cli.ts passes `{ positionals, flags }` while the wired legs read named fields (`.scope`) — the
    // arg-marshalling gap flagged in the return card. It is STILL a real, well-formed verdict from the real
    // composed handler (proving composeRuntime → handler → command end-to-end), never the composition sentinel.
    captureStdout()
    const code = await main(["query", "src"], { handler })
    expect(typeof code).toBe("number")
    const out = writes.join("")
    expect(out).toContain("status:")
    expect(out).toContain("next:")
    expect(out).not.toContain(NOT_COMPOSED)
  })

  it("the sentinel IS rendered when no handler is injected (the mutant tell is real)", async () => {
    // Differential: the SAME argv WITHOUT a handler falls to the fail-closed sentinel — proving the golden
    // above actually depends on the composed handler (a passing test that could never fail is worthless).
    captureStdout()
    const code = await main(["query", "src"], {})
    expect(code).not.toBe(0)
    expect(writes.join("")).toContain(NOT_COMPOSED)
  })
})

// ── the `mine` route drives the frozen genesis controller over cwd, rendered uniformly ──────────────────

describe("COMPOSE-B — mine routes to runMine (uniform render), no throw", () => {
  it("main([mine, …], { handler }) returns a CliVerdict-rendered exit code without throwing", async () => {
    // `mine` drives `runMine(process.cwd())` (mine.ts) — chdir into the temp repo so the candidate-only CAS
    // write lands under `tempRepo/.atlas/cas`, contained. With honest fail-closed default seams (no model,
    // no git, empty skeleton) the pass seeds 0 candidate facts and exits cleanly.
    const prevCwd = process.cwd()
    process.chdir(tempRepo)
    captureStdout()
    try {
      const code = await main(["mine", tempRepo], { handler })
      expect(typeof code).toBe("number")
      expect(writes.join("").length).toBeGreaterThan(0)
    } finally {
      process.chdir(prevCwd)
    }
  })
})

// ── the composed DoctorSource makes `atlas doctor` LIVE (not the fail-closed "no source" path) ──────────

describe("COMPOSE-B — composeRuntime wires the real DoctorSource (doctor is LIVE)", () => {
  it('main([doctor, hotset, 5], { handler, doctorSource }) resolves NOT the fail-closed "no source" path', async () => {
    // The whole point of DOCTORSOURCE: with the real read-only source injected, `atlas doctor hotset`
    // renders a REAL hot-set report over the composed durable projection — never the "no diagnostic source"
    // sentinel. TEETH: the differential below drops `doctorSource` and the sentinel returns (golden RED).
    captureStdout()
    const code = await main(["doctor", "hotset", "5"], { handler, doctorSource })
    expect(code).toBe(0) // read-only ⇒ exit 0
    const out = writes.join("")
    expect(out).toContain("doctor: hotset")
    expect(out).toContain("hotSet: size=")
    expect(out).not.toContain("has no diagnostic source")
  })

  it("the fail-closed sentinel IS rendered when no doctorSource is injected (the mutant tell is real)", async () => {
    // Differential: the SAME argv WITHOUT the source falls to the fail-closed "no diagnostic source" leg —
    // proving the golden above actually depends on the composed DoctorSource, not a vacuous pass.
    captureStdout()
    const code = await main(["doctor", "hotset", "5"], { handler })
    expect(code).not.toBe(0)
    expect(writes.join("")).toContain("has no diagnostic source")
  })
})
