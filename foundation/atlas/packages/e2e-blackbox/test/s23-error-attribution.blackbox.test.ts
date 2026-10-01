// @atlas/e2e-blackbox — test/s23-error-attribution.blackbox.test.ts  (S23 — whose fault was it?)
//
// The product blamed the caller for its own faults, and the two halves of that were reachable on DIFFERENT
// transports, so both real doors are driven here — the `atlas` CLI binary as a subprocess and the real
// `atlas-mcp` stdio server.
//
//   MCP  — the read-provenance refusal (`untrusted-store`) arrived over MCP labelled
//          `malformed args — fail-closed: …`. `adapter-io/src/read-provenance.ts` recorded this as a residual
//          it could not fix from its own package and noted the CLI refuses earlier with clean prose, which
//          is exactly why this leg is MCP-only and why it is measured here rather than at a unit.
//   CLI  — the same condition on `emit` / `link` exited 1 (a usage error) rather than 2 (a governance
//          rejection). Nothing pinned it: `s20` asserts `not.toBe(0)`, which 1 and 2 both satisfy.
//
// Assertions are on the DISCRIMINANT (the reason NAME, everything before the first `:`) compared for
// EQUALITY — refusal texts in this repo quote each other by name, so a substring match on `untrusted-store`
// is satisfied by any paragraph that merely mentions it.
//
// TRAVEL-BY-REPROOF (owner-authorized 2026-08-18): a committed `projection.json` ALONE is `tracked-provable`
// — served (narrowed), not refused. The READ-refusal cells below now drive a committed `staging.json`
// instead (the population that still refuses in kind, unchanged). The WRITE-refusal cell is UNCHANGED: a
// write still refuses for EITHER tracked population, so it keeps the original committed-projection fixture.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const SRC = "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n"

/** THE DISCRIMINANT — the reason NAME. */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** The refusal's name, as `read-provenance.ts` mints it. */
const UNTRUSTED = "untrusted-store"

/** The body an `isError` MCP result carries (`{fault, rejected, guidance}`). */
interface ErrorBody {
  fault?: string
  rejected?: string
  guidance?: { next?: string; invariant?: string }
}
const bodyOf = (r: { content: Array<{ text?: string }> }): ErrorBody =>
  JSON.parse(r.content[0]?.text ?? "{}") as ErrorBody

/** The `reason: …` line of a CLI outcome, without its label. */
function reasonLine(stdout: string): string {
  const line = stdout.split("\n").find((l) => l.startsWith("reason: "))
  return line === undefined ? "" : line.slice("reason: ".length)
}

let repo: FixtureRepo | undefined
afterEach(() => {
  repo?.cleanup()
  repo = undefined
})

/** A repo whose durable store was landed by `git add -f` — the accident an absent ignore rule gives for free
 *  (the same recipe S20 uses; obviously-synthetic fixture, nothing outside its own temp dir). Committing
 *  ONLY `projection.json` is `tracked-provable` (TRAVEL-BY-REPROOF): WRITES still refuse over it, unchanged. */
function committedStoreRepo(): FixtureRepo {
  const r = makeFixtureRepo({ files: { "src/greet.ts": SRC } })
  writeFileSync(join(r.repoPath, ".atlas", "projection.json"), '{"current":[],"cas":[]}')
  execFileSync("git", ["add", "-f", ".atlas/projection.json"], { cwd: r.repoPath, stdio: "ignore" })
  execFileSync("git", ["commit", "-q", "-m", "ship the store"], { cwd: r.repoPath, stdio: "ignore" })
  return r
}

/** The population that STILL refuses READS in kind (TRAVEL-BY-REPROOF): `.atlas/staging` tracked. */
function committedStagingRepo(): FixtureRepo {
  const r = makeFixtureRepo({ files: { "src/greet.ts": SRC } })
  writeFileSync(join(r.repoPath, ".atlas", "staging.json"), '{"current":[],"cas":[]}')
  execFileSync("git", ["add", "-f", ".atlas/staging.json"], { cwd: r.repoPath, stdio: "ignore" })
  execFileSync("git", ["commit", "-q", "-m", "ship staging (should never happen)"], {
    cwd: r.repoPath,
    stdio: "ignore",
  })
  return r
}

describe("S23 — the refusal is ATTRIBUTED, on every door it can reach", () => {
  it("MCP: a read over a COMMITTED STAGING store is a NAMED governance refusal, not the caller's bad input", async () => {
    repo = committedStagingRepo()
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(res.isError).toBe(true)
      const body = bodyOf(res as { content: Array<{ text?: string }> })
      // The reason NAME is the refusal's own, and the argument the caller sent was never at fault.
      expect(reasonOf(body.rejected)).toBe(UNTRUSTED)
      // The class, as a machine value an agent branches on rather than a paragraph it parses.
      expect(body.fault).toBe("refused")
      // The remediation still reaches the agent — attribution was added, information was not removed.
      expect(String(body.rejected)).toContain("git rm -r --cached")
    } finally {
      await session.close()
    }
    // 60s, not the project's 30s default, and MEASURED rather than guessed: this cell builds a git fixture,
    // commits it, then boots the real `atlas-mcp` stdio server and composes the whole runtime inside the
    // request. It took 18s on a quiet box and 30.5s with three other seats building concurrently — i.e. the
    // default budget is one contended CPU away from a red that says nothing about the product. The wall-clock
    // here is process startup, exactly as `vitest.workspace.ts` says of this whole project.
  }, 60000)

  it("CLI: the WRITE doors over a committed store exit 2 — the code every other write refusal uses", () => {
    // TRAVEL-BY-REPROOF: `cli.ts`'s BLANKET pre-dispatch `readRefusal` check (line ~184) used to cover EVERY
    // command, including a malformed `{}` write payload, before it ever reached `governedEmit`'s own gate 0
    // (tier). For `tracked-provable` (a committed `projection` alone) that blanket short-circuit is GONE —
    // `readRefusal` is absent, so a malformed payload now surfaces gate 0's OWN diagnosis (`malformed tier`)
    // first, and only a WELL-FORMED, GROUNDED write would reach the deeper `commitProjection` refusal
    // (`store-provenance.test.ts`'s "a write over a committed store REFUSES" pins that mechanism directly,
    // unaffected by this file). `tracked-staging` still refuses EVERY command unconditionally at the CLI's
    // one blanket check (unchanged), so THIS cell drives that population to keep testing a bare `{}` payload.
    repo = committedStagingRepo()
    writeFileSync(join(repo.repoPath, "fact.json"), "{}")
    const emit = runAtlas(repo.repoPath, ["emit", "fact.json", `--at=${repo.sha()}`])
    expect(emit.exitCode).toBe(2)
    expect(reasonOf(reasonLine(emit.stdout))).toBe(UNTRUSTED)

    const link = runAtlas(repo.repoPath, ["link", "k:one", "k:two"])
    expect(link.exitCode).toBe(2)
    expect(reasonOf(reasonLine(link.stdout))).toBe(UNTRUSTED)
  })

  it("CLI: the READ doors refuse with the SAME code — the class is the outcome, not read-vs-write", () => {
    repo = committedStagingRepo()
    for (const argv of [
      ["query", "src"],
      ["node", "0".repeat(64)],
      ["doctor", "hotset", "5"],
    ]) {
      const run = runAtlas(repo.repoPath, argv)
      expect(run.exitCode, argv.join(" ")).toBe(2)
      expect(run.stdout, argv.join(" ")).toContain("status: rejected")
    }
  })

  it("CONTROL: the same repo WITHOUT the store committed answers 0 — the exit code discriminates", () => {
    repo = makeFixtureRepo({ files: { "src/greet.ts": SRC } })
    const run = runAtlas(repo.repoPath, ["query", "src"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).not.toContain(UNTRUSTED)
  })

  it("CONTROL 2 (TRAVEL-BY-REPROOF): a committed `projection` ALONE exits 0 on `query` — narrowed, not attributed as a refusal at all", () => {
    repo = committedStoreRepo()
    const run = runAtlas(repo.repoPath, ["query", "src"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).not.toContain(UNTRUSTED)
  })
})
