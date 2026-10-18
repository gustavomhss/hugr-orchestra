// @atlas/e2e-blackbox — test/s6-edge.blackbox.test.ts  (S6 — EDGE / TOTALITY of the coverage matrix WAVE-COV-4)
//
// NARRATIVE: the product is driven through its two REAL doors (the `atlas` CLI subprocess + the `atlas-mcp`
// stdio server) at the CORNERS of its input space — corrupt sidecars, a non-git tree, a missing policy, a
// fresh repo, a re-init, an unknown scope, an unknown MCP tool, malformed args. Every cell asserts TOTALITY:
// a graceful, structured, small-exit outcome, NEVER a crash / stack trace / silent success. The two
// boot-crasher findings the enumeration surfaced (N3 corrupt `projection.json`, N4 corrupt `index.scip`) are
// now FIXED on master — cells 1 & 2 pin the graceful degradation (files-only, empty projection). Driven ONLY
// through the built bins (subprocess / stdio) — highest user/agent fidelity.
//
// N8 was a THIRD boot-crasher this story surfaced (now FIXED on master): a NON-GIT repo (or a tracked-but-
// deleted file) crashed both bins because `walkFileTree` (adapter-io/src/fs.ts) ran `git ls-files -z` via an
// UNGUARDED `execFileSync` inside `composeRuntime` — git exit 128 threw uncaught out of the bin. WP-N8 made
// `walkFileTree` fail closed to an empty FileTree; cell 3 now pins the graceful degradation (structured
// verdict over the empty index, no stack trace) — the honest red→green close of a finding this story found.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { AtlasRun, FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import { ACTOR, emitFact, invLines, scopedPolicy } from "./support.js"

const SRC = "export const foo = 1;\n"

// ── totality oracles ──────────────────────────────────────────────────────────────────────────────────────
/** A raw Node crash signature on a captured stderr: an uncaught `Error:` banner or a `  at …:line:col` stack
 *  frame. "Graceful" means the bin returned a STRUCTURED verdict, so stderr carries NEITHER. */
function hasCrashTrace(stderr: string): boolean {
  return /\bError:/.test(stderr) || /\n\s+at\s.+:\d+:\d+/.test(stderr) || /Node\.js v\d/.test(stderr)
}

/** Assert a run degraded GRACEFULLY: a valid small exit code (0/1/2 — the ratified ok/error/rejected ring) and
 *  NO crash trace on stderr. Fails loudly if the product threw / crashed (the whole point of a black-box edge
 *  story — never assert-around a crash). */
function expectGraceful(r: AtlasRun): void {
  expect([0, 1, 2]).toContain(r.exitCode)
  expect(hasCrashTrace(r.stderr)).toBe(false)
}

// ── shared fixtures ───────────────────────────────────────────────────────────────────────────────────────
let repo: FixtureRepo // a healthy git fixture reused by the read/idempotency/args/mcp cells
const scratch: Array<{ cleanup: () => void }> = [] // per-cell fixtures torn down in afterAll
let priorActor: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  process.env.ATLAS_ACTOR = ACTOR // a KNOW-11 actor — so cell 4's deny is authz (empty scopes), not an absent actor
  repo = makeFixtureRepo({ files: { "src/foo.ts": SRC }, policy: scopedPolicy("src") })
})

afterAll(() => {
  repo?.cleanup()
  for (const s of scratch) s.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
})

describe("S6 — edge / totality (WAVE-COV-4): every corner degrades, never crashes", () => {
  // 1 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("N3 (FIXED): a corrupt `.atlas/projection.json` degrades to the empty projection — no boot crash", () => {
    const f = makeFixtureRepo({ files: { "src/a.ts": SRC }, policy: scopedPolicy("src") })
    scratch.push(f)
    writeFileSync(join(f.repoPath, ".atlas", "projection.json"), "\x00\x01\x02 not json at all }{")
    const r = runAtlas(f.repoPath, ["query", "src"])
    expectGraceful(r)
    expect(r.exitCode).toBe(0) // reads stay universal; a corrupt sidecar reads as "none persisted" (store.ts total-undefined)
    expect(r.stdout).toContain("status: ok")
    expect(invLines(r.stdout)).toEqual([]) // empty projection ⇒ no facts, but a valid pack (`stale: false`)
    expect(r.stdout).toContain("  stale: false")
  })

  // 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("N4 (FIXED): a corrupt `.atlas/index.scip` degrades to files-only — no boot crash", () => {
    const f = makeFixtureRepo({ files: { "src/a.ts": SRC }, policy: scopedPolicy("src") })
    scratch.push(f)
    // garbage bytes that make `deserializeSCIP` throw — the wire path (`readScipOrEmpty`) must absorb it.
    writeFileSync(
      join(f.repoPath, ".atlas", "index.scip"),
      Buffer.from([0xff, 0x00, 0xde, 0xad, 0xbe, 0xef, 0x99, 0x12, 0x34]),
    )
    const r = runAtlas(f.repoPath, ["query", "src"])
    expectGraceful(r)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("status: ok") // structural (files-only) view still serves — symbol granularity lost, not the bin
  })

  // 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("N8 (FIXED): a NON-GIT repo degrades to an empty index — a structured verdict, NO boot crash", () => {
    // A raw temp dir that was NEVER `git init`'d (makeFixtureRepo git-inits, so we build one inline). `.atlas`
    // + a source file present, but no `.git`. `composeRuntime`→`walkFileTree` runs `git ls-files -z`, which
    // exits 128 ("not a git repository"). PRE-N8 the throw was uncaught and crashed the bin; POST-N8
    // `walkFileTree` fails closed to an EMPTY FileTree, so the bin REACHES the render path and returns a
    // structured verdict (no covering territory over the empty index) — total, never a raw stack trace.
    const raw = mkdtempSync(join(tmpdir(), "atlas-nongit-"))
    scratch.push({ cleanup: () => rmSync(raw, { recursive: true, force: true }) })
    mkdirSync(join(raw, ".atlas"), { recursive: true })
    writeFileSync(join(raw, ".atlas", "policy.json"), scopedPolicy("src"))
    mkdirSync(join(raw, "src"), { recursive: true })
    writeFileSync(join(raw, "src", "a.ts"), SRC)

    const r = runAtlas(raw, ["query", "src"])
    // The graceful signature: a clean small exit, a rendered `status:` (reached the render path — did NOT die
    // at compose/boot), and NO raw crash trace on stderr. Teeth: reverting the N8 guard flips L106/L107.
    expect([0, 1, 2]).toContain(r.exitCode) // a valid CLI exit code, not a signal-kill / uncaught crash
    expect(hasCrashTrace(r.stderr)).toBe(false) // the fix: no stack trace escapes — it fails closed to empty
    expect(r.stdout).toContain("status:") // it reached the render path over the empty index (no boot crash)
  })

  // 4 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("missing `.atlas/policy.json` (git-rm) runs on the DENYING default: query ok, a grounded write DENIED — no crash", () => {
    const f = makeFixtureRepo({ files: { "src/foo.ts": SRC }, policy: scopedPolicy("src") })
    scratch.push(f)
    // author a fact that WOULD be accepted under the scoped policy (grounded ∧ fresh), THEN remove the policy
    // (stage the deletion so it is not a tracked-but-missing file — that is the separate N8-family crash noted
    // in the header). Now the loader resolves `defaultPolicy()` (empty scopes ⇒ every write denied).
    const fact = draftFact(f, "src/foo.ts", "invariant", "foo is 1").fact
    execFileSync("git", ["rm", "-q", ".atlas/policy.json"], { cwd: f.repoPath })
    execFileSync("git", ["commit", "-q", "-m", "drop policy"], { cwd: f.repoPath })

    const q = runAtlas(f.repoPath, ["query", "src"]) // reads stay universal (KNOW-11b) — no policy needed to read
    expectGraceful(q)
    expect(q.exitCode).toBe(0)
    expect(q.stdout).toContain("status: ok")

    const e = emitFact(f, fact) // the denying default fails the write CLOSED — never a crash, never a silent accept
    expectGraceful(e)
    expect(e.exitCode).toBe(2) // rejected (a governed refusal)
    expect(e.stdout).toContain("status: rejected")
    expect(e.stdout).toContain("KNOW-11") // unauthorized: actor not in fact scope — the fail-closed default
  })

  // 5 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("a fresh repo (an existing scope with NO facts emitted) queries `status: ok` with an EMPTY pack — no crash", () => {
    const f = makeFixtureRepo({ files: { "src/a.ts": SRC }, policy: scopedPolicy("src") })
    scratch.push(f)
    const r = runAtlas(f.repoPath, ["query", "src"]) // `src` covers, but nothing was emitted
    expectGraceful(r)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("status: ok")
    expect(invLines(r.stdout)).toEqual([]) // NO inv lines — an empty-but-valid pack
    expect(r.stdout).toContain("  stale: false")
  })

  // 6 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("re-init idempotency: `atlas init .` twice both exit 0 and render BYTE-IDENTICAL (deterministic)", () => {
    const a = runAtlas(repo.repoPath, ["init", "."])
    const b = runAtlas(repo.repoPath, ["init", "."])
    expectGraceful(a)
    expectGraceful(b)
    expect(a.exitCode).toBe(0)
    expect(b.exitCode).toBe(0)
    expect(a.stdout).toContain("status: ok")
    expect(b.stdout).toBe(a.stdout) // pure structural move-in — no clock/nonce ⇒ the same bytes twice
    expect(a.stdout).toContain("  territory: src") // non-vacuous: the source tree really is a territory
  })

  // 7 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("unknown scope: `query no-such-scope` is TOTAL — a structured error (exit 1), never a throw", () => {
    const r = runAtlas(repo.repoPath, ["query", "no-such-scope"])
    expectGraceful(r)
    // OBSERVED behavior (reported, not assumed): NOT ok-with-empty — the cover step fails closed to a `error`
    // verdict (exit 1, status `error`), carrying the reason. `ok:false` with no emitted/exitCode ⇒ `error`, not
    // `rejected` (the map.ts deriveStatus classification). Total + no crash either way.
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("status: error")
    expect(r.stdout).toContain("no covering territory for scope no-such-scope")
  })

  // 8 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it(
    "unknown MCP tool: `callTool(atlas-bogus)` fails CLOSED (isError) with guidance — no hang, no crash",
    { timeout: 20000 },
    async () => {
      const session = await mcpSession(repo.repoPath)
      try {
        const res = await session.client.callTool({ name: "atlas-bogus", arguments: {} })
        // The SDK does NOT reject an unknown tool client-side here; the SERVER handler answers with a fail-closed
        // error result (isError:true) carrying the rejection + guidance — the governed refusal survives stdio.
        expect((res as { isError?: boolean }).isError).toBe(true)
        const body = JSON.parse((res as { content: Array<{ text?: string }> }).content[0]?.text ?? "{}") as {
          rejected?: string
          guidance?: { next?: string; invariant?: string }
        }
        expect(String(body.rejected)).toContain("not wired")
        expect(body.guidance?.next).toBeTruthy()
        expect(body.guidance?.invariant).toContain("TOOLS-1") // the surface is exactly five tools
      } finally {
        await session.close()
      }
    },
  )

  // 9 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  it("malformed args are TOTAL: `emit` (no fact file) and `[]` (empty) → exit 1 + structured guidance, no stack", () => {
    const missing = runAtlas(repo.repoPath, ["emit"]) // arity fails at the parser (before any handler)
    expectGraceful(missing)
    expect(missing.exitCode).toBe(1)
    expect(missing.stdout).toContain("status: error")
    expect(missing.stdout).toContain("command 'emit' requires 1 positional argument(s)")
    expect(missing.stdout).toContain("CLI-1b") // the totality invariant is legible in the guidance

    const empty = runAtlas(repo.repoPath, []) // no command at all
    expectGraceful(empty)
    expect(empty.exitCode).toBe(1)
    expect(empty.stdout).toContain("status: error")
    expect(empty.stdout).toContain("no command")
  })
})
