// @atlas/e2e-blackbox — test/s24-uncanonicalizable-row.blackbox.test.ts  (S24 — a fact the store cannot address)
//
// NARRATIVE: a user authors a perfectly grounded fact and, by accident or on purpose, puts a value in it
// that Atlas's own canonical form FORBIDS. What does the shipped product do?
//
// WHY THIS STORY EXISTS. `@atlas/tools` `guard.ts` pins that law rigorously for a REFERENCE MODEL with zero
// production callers. The durable write door the CLI actually uses is `adapter-io/src/store.ts`, and the
// unit suites `adapter-io/test/store-fail-closed-{cas,door}.test.ts` now measure it over all eight shapes.
// This story closes the last gap in that chain: it drives the REAL `atlas` binary and the REAL `atlas-mcp`
// stdio server as a user does, so the answer is pinned where the operator actually reads it — an exit code
// and a `reason:` line — and not only at an in-process seam.
//
// ONLY TWO OF THE EIGHT SHAPES CAN REACH THIS DOOR, and saying which is the point of measuring rather than
// asserting. Both wires are `JSON.parse`, so `bigint`, `symbol`, `function` and a cyclic reference cannot be
// expressed at all, and `NaN`/`Infinity` are not JSON either. What survives a JSON round-trip is a FLOAT and
// an NFC KEY COLLISION. The other six are reachable only from an in-process embedder — which
// `governed-emit.ts` gate 0 names as in the threat model — and are covered by the unit suites.
//
// THE NFC CASE IS BYTE-SENSITIVE AND WENT VACUOUS ONCE DURING THIS SEAT: a probe with the two RAW literals
// had its decomposed one silently recomposed in transit (`od -c` showed identical bytes on both lines), and
// the case then reported `emitted: true` as a PASS, because with one key there is no collision. The literals
// here are ASCII `\u` ESCAPES so no normalizer has anything to rewrite, and the premise is EXECUTED below.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import { ACTOR, RATIFIER, scopedPolicy } from "./support.js"

const SRC = "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n"

/** U+00E9 precomposed / U+0065 U+0301 decomposed — ASCII-escaped, so a source normalizer cannot collapse
 *  them and silently turn every assertion below into a tautology. */
const NFC_KEY = "caf\u00e9"
const NFD_KEY = "cafe\u0301"

/** THE DISCRIMINANT — the reason NAME, everything before the first `:`, compared for EQUALITY. Never a
 *  substring: refusal prose in this repo quotes other refusal constants BY NAME, so `toContain` is satisfied
 *  by any paragraph that merely mentions the reason it is supposed to be pinning. */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** The name the canonicalizer gives every one of its refusals (`kernel/canonical.ts`). */
const CANONICAL_VIOLATION = "canonical-form violation"

/** The `reason: …` line of a CLI outcome, without its label. */
function reasonLine(stdout: string): string {
  const line = stdout.split("\n").find((l) => l.startsWith("reason: "))
  return line === undefined ? "" : line.slice("reason: ".length)
}

/** The body an `isError` MCP result carries. */
const textOf = (r: { content: Array<{ text?: string }> }): { rejected?: string } =>
  JSON.parse(r.content[0]?.text ?? "{}") as { rejected?: string }

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env["ATLAS_ACTOR"]
  priorRatify = process.env["ATLAS_RATIFY_TOKEN"]
  process.env["ATLAS_ACTOR"] = ACTOR
  process.env["ATLAS_RATIFY_TOKEN"] = RATIFIER
  repo = makeFixtureRepo({ files: { "src/greet.ts": SRC }, policy: scopedPolicy("src") })
})

afterAll(() => {
  process.env["ATLAS_ACTOR"] = priorActor
  process.env["ATLAS_RATIFY_TOKEN"] = priorRatify
  repo.cleanup()
})

/** The published sidecar generations — the only evidence that a write went durable. */
function generations(): string[] {
  const dir = join(repo.repoPath, ".atlas")
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^projection\.\d+\.json$/.test(f))
        .sort()
    : []
}

/** A grounded fact whose citation re-derives FRESH, plus whatever extra properties the case injects. */
function factWith(extra: Record<string, unknown>): Record<string, unknown> {
  const base = draftFact(repo, "src/greet.ts", "invariant", "greet returns a greeting").fact as unknown as Record<
    string,
    unknown
  >
  return { ...base, ...extra }
}

/** Write the fact to a file and drive the REAL `atlas emit` subprocess over it. */
function emitRaw(name: string, fact: Record<string, unknown>): ReturnType<typeof runAtlas> {
  const path = join(repo.repoPath, `s24-${name}.json`)
  writeFileSync(path, JSON.stringify(fact))
  return runAtlas(repo.repoPath, ["emit", path, `--at=${repo.sha()}`])
}

describe("S24 — a fact carrying a value Atlas cannot canonicalize", () => {
  it("PREMISE: the two NFC literals really are a collision pair, and both survive a JSON round-trip", () => {
    expect(NFC_KEY).not.toBe(NFD_KEY)
    expect(NFC_KEY.normalize("NFC")).toBe(NFD_KEY.normalize("NFC"))
    // the wire is `JSON.parse`, so the premise that matters is that BOTH keys cross it as distinct keys —
    // if the serializer or the parser folded them, the CLI would never see a collision to refuse.
    const roundTripped = JSON.parse(JSON.stringify({ [NFC_KEY]: 1, [NFD_KEY]: 2 })) as Record<string, unknown>
    expect(Object.keys(roundTripped)).toHaveLength(2)
  })

  it("CONTROL: the same fact WITHOUT the violation is ACCEPTED and goes durable — the refusals discriminate", () => {
    const run = emitRaw("control", factWith({}))
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    expect(generations()).toStrictEqual(["projection.1.json"])
  })

  it("a FLOAT is refused with the canonicalizer's own named reason, and nothing new goes durable", () => {
    const before = generations()
    const run = emitRaw("float", factWith({ confidence: 0.5 }))
    // GOLDEN MOVED DELIBERATELY (task #136): this pinned `not.toBe(0)`, which was satisfied by the exit 1 the
    // product actually shipped. MEASURED before the fix: exit 1 / `status: error`, while an UNGROUNDED fact
    // exits 2 / `status: rejected` and `@atlas/tools` `faultOf` calls BOTH of them `refused`. The reason it
    // was 1 is mechanical: `id(node)` sat unguarded inside the commit's decide callback, so the violation
    // escaped as a THROW, and `deriveStatus` classifies by the RECORD a governed door carries back — a throw
    // carries none. ADR-0003 states the governed-door invariant as a refusal being FAIL-CLOSED-VISIBLE on
    // both transports, "CLI exit 2 / MCP `isError`"; MCP already answered `isError` (pinned below), so only
    // the exit code dissented, telling an agent to go and fix an invocation that was fine. The door now
    // RECORDS the decision it had already made (`governed-emit.ts` gate 0.5), and the exit code follows the
    // record exactly as it did before — `deriveStatus` is untouched, so SCN-CLI-3b-1 does not move.
    expect(run.exitCode).toBe(2)
    expect(run.stdout).toContain("status: rejected")
    // Q2 — LEGIBLE: a named discriminant on the operator's `reason:` line, not a stack trace and not silence.
    expect(reasonOf(reasonLine(run.stdout))).toBe(CANONICAL_VIOLATION)
    expect(run.stderr).toBe("") // an uncaught throw would land here — it does not
    // Q1/Q3 — REFUSED, with nothing admitted: no new generation, and the control's row still readable.
    expect(generations()).toStrictEqual(before)
  })

  it("an NFC KEY COLLISION is refused the same way — the one non-numeric shape that crosses a JSON wire", () => {
    const before = generations()
    const run = emitRaw("nfc", factWith({ [NFC_KEY]: 1, [NFD_KEY]: 2 }))
    expect(run.exitCode).toBe(2) // moved with the float case above — same argument, same commit
    expect(run.stdout).toContain("status: rejected")
    expect(reasonOf(reasonLine(run.stdout))).toBe(CANONICAL_VIOLATION)
    expect(run.stderr).toBe("")
    expect(generations()).toStrictEqual(before)
  })

  it("the store still SERVES after both refusals — a refused write left nothing half-applied", () => {
    const run = runAtlas(repo.repoPath, ["query", "src"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("greet returns a greeting")
  })

  it("the SAME refusal, with the SAME discriminant, arrives over real MCP stdio", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const res = (await session.client.callTool({
        name: "atlas-emit",
        arguments: { node: factWith({ confidence: 0.5 }), at: repo.sha() },
      })) as { isError?: boolean; content: Array<{ text?: string }> }
      // TRANSPORT PARITY on the refusal, not merely on the happy path: an agent must not be able to read
      // this as a success, and must get the same NAME the CLI operator got.
      expect(res.isError).toBe(true)
      expect(reasonOf(textOf(res).rejected)).toBe(CANONICAL_VIOLATION)
    } finally {
      await session.close()
    }
    expect(generations()).toStrictEqual(["projection.1.json"])
  }, 60000)
})
