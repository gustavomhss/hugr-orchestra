// @atlas/e2e-blackbox — test/s2-guardrails.blackbox.test.ts  (S2 — Fail-closed governance)
//
// NARRATIVE: a user tries two writes that MUST be refused — (a) an UNGROUNDED fact (its citation does not
// re-derive), and (b) a genuinely-grounded fact into a scope the actor is NOT authorized for (KNOW-11). Both
// go through the real `atlas emit` subprocess; both must fail CLOSED (exit 2, nothing persisted).
//
// SOTA invariants pinned: GROUNDED-OR-REJECTED (GROUND-2/6 — an ungrounded write is refused, nothing lands),
// OWNER-SCOPED AUTHZ fail-closed (KNOW-11 — an out-of-scope actor is denied), and GOVERNANCE-IS-LEGIBLE
// (the rejection is a well-formed verdict carrying `next`+`invariant`, never a crash or an empty success).

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas, DEFAULT_POLICY } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { ungroundedFact } from "./adversarial-fixtures.js"
import { ACTOR, emitFact, invLines, scopedPolicy } from "./support.js"
import { draftFact } from "./support.js"

const SRC = "export const foo = (): number => 1;\n"

let groundRepo: FixtureRepo // scoped policy authorizes the actor → isolates the GROUND failure
let authzRepo: FixtureRepo //  default (empty-scope) policy → isolates the AUTHZ failure
let priorActor: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  process.env.ATLAS_ACTOR = ACTOR
  groundRepo = makeFixtureRepo({ files: { "src/foo.ts": SRC }, policy: scopedPolicy("src") })
  authzRepo = makeFixtureRepo({ files: { "src/foo.ts": SRC }, policy: DEFAULT_POLICY }) // empty scopes ⇒ deny
})

afterAll(() => {
  groundRepo?.cleanup()
  authzRepo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
})

describe("S2a — an UNGROUNDED emit is rejected fail-closed, nothing persisted", () => {
  it("emit of a fact whose citation does not re-derive ⇒ exit 2, status rejected", () => {
    const r = emitFact(groundRepo, ungroundedFact("foo returns 2 (ungrounded)"))
    expect(r.exitCode).toBe(2) // rejected exit code — NOT ok(0), NOT error(1)
    expect(r.stdout).toContain("status: rejected")
    // the rejection is a well-formed verdict: BOTH guidance fields present (governance is legible).
    expect(r.stdout).toMatch(/^next: .+$/m)
    expect(r.stdout).toMatch(/^invariant: .+$/m)
    // the guidance NAMES the ground failure (a re-derivation failure at source), not a generic error.
    expect(r.stdout).toContain("did not re-derive")
    expect(r.stdout).toContain("TOOLS-1/7") // the single-write-door invariant
    // F5 (FLIPPED): the CLI now RENDERS the rejection REASON — the governed refusal is legible at the user
    // door, not just the follow-up guidance (was invisible before remediation — the finding this documented).
    expect(r.stdout).toMatch(/^reason: .+$/m)
    expect(r.stdout).toContain("reason: ungrounded") // the fail-closed reason surfaces verbatim
    // NOT an empty success: no `id:` was rendered (nothing was persisted to CAS).
    expect(r.stdout).not.toContain("id:")
  })

  it("SOTA grounded-or-rejected: a subsequent `query` shows the fact is ABSENT (nothing persisted)", () => {
    const r = runAtlas(groundRepo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(invLines(r.stdout)).toEqual([]) // the rejected write left NO durable node
  })
})

describe("S2b — an UNAUTHORIZED (out-of-scope) emit is rejected fail-closed, nothing persisted", () => {
  it("a GROUNDED fact whose actor is not in the fact scope ⇒ exit 2, status rejected (KNOW-11)", () => {
    // The fact IS grounded (re-derives), so the ONLY reason it can be refused is the authz gate.
    const fact = draftFact(authzRepo, "src/foo.ts", "invariant", "authz-probe").fact
    const r = emitFact(authzRepo, fact)
    expect(r.exitCode).toBe(2) // fail-closed: empty policy scopes authorize NO write
    expect(r.stdout).toContain("status: rejected")
    expect(r.stdout).toMatch(/^next: .+$/m)
    expect(r.stdout).toMatch(/^invariant: .+$/m)
    // F5 (FLIPPED): the KNOW-11 authz refusal reason is rendered too — every fail-closed door is legible.
    expect(r.stdout).toMatch(/^reason: .+$/m)
    expect(r.stdout).toContain("reason: unauthorized")
    expect(r.stdout).not.toContain("id:") // never a silent empty success
  })

  it("SOTA authz fail-closed: the unauthorized fact is ABSENT from a subsequent `query`", () => {
    const r = runAtlas(authzRepo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(invLines(r.stdout)).toEqual([]) // denied ⇒ nothing durable
  })
})
