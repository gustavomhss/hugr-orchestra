// @atlas/e2e-blackbox — test/s7-governance.blackbox.test.ts  (S7 — Governance: authz · policy · tier-ratify)
//
// NARRATIVE: WAVE-COV-3 governance, driven ONLY through the real `atlas` CLI subprocess. Three fail-closed
// doors, each proven at the user surface (exit code + rendered verdict), never in-process:
//   • AUTHZ (KNOW-11) — the owner-scoped write gate: an in-scope actor writes; an out-of-scope, an empty, or
//     an absent-scope actor is DENIED (exit 2, `reason: unauthorized`), nothing persisted.
//   • POLICY (loadPolicy) — a malicious `.atlas/policy.json` (`__proto__` pollution payload) fails CLOSED to
//     the denying default: the bin still runs, no crash, no prototype pollution, and the malicious file grants
//     NO access (a write the honest scoped-policy WOULD allow is refused).
//   • TIER-RATIFY (KNOW-8 / KNOW-18, N7) — a T2 advisory grounded fact AUTO-ACCEPTS with NO token (fastpath);
//     a T1 / T0 fact routes to FULL ratification and commits ONLY with a valid token (T0 requires `billy`).
//
// The fact is AUTHORED through the product `atlas draft` door (`draftFact`, support.ts) so its
// grounding re-derives FRESH; every EXECUTION and ASSERTION below is pure black-box (spawned
// bin, stdout/exit). ACTOR + RATIFY token are threaded via env (`ATLAS_ACTOR` / `ATLAS_RATIFY_TOKEN`) exactly
// as `composeRuntime` sources them — NEVER off the fact payload.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import type { Tier } from "@atlas/contracts"
import { ACTOR, BILLY, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"

const SRC = "export const foo = (): number => 1;\n"
const FILES = { "src/foo.ts": SRC }

/** A stranger actor NOT listed in any scope of `scopedPolicy` (which lists only {@link ACTOR}). */
const STRANGER = "mallory@atlas.local"

let priorActor: string | undefined
let priorRatify: string | undefined

/** Force the two env channels `composeRuntime` reads for the NEXT spawned bin. `undefined` deletes the var
 *  (so `ATLAS_ACTOR ?? gitUserEmail` falls through to the fixture's git email = ACTOR; an EXPLICIT '' stays
 *  empty). Set immediately before each `runAtlas`/`emitFact` — the child inherits `process.env`. */
function setEnv(actor: string | undefined, token: string | undefined): void {
  if (actor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = actor
  if (token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = token
}

/** A grounded advisory fact anchored at `src/foo.ts` (re-derives FRESH), at the given tier + claim —
 *  authored through the product `atlas draft` door. */
function fact(repo: FixtureRepo, claim: string, tier: Tier = "T1") {
  return draftFact(repo, "src/foo.ts", "invariant", claim, tier).fact
}

const repos: FixtureRepo[] = []
function repo(policy = scopedPolicy("src")): FixtureRepo {
  const r = makeFixtureRepo({ files: FILES, policy })
  repos.push(r)
  return r
}

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
})

afterAll(() => {
  for (const r of repos) r.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

// ── AUTHZ (KNOW-11) ─────────────────────────────────────────────────────────────────────────────────────

describe("S7a — owner-scoped authz (KNOW-11): allow in-scope, deny everyone else, fail-closed", () => {
  it("ALLOW: an actor listed in the fact scope ⇒ grounded emit ACCEPTED (exit 0, id rendered)", () => {
    const r = repo(scopedPolicy("src")) // scopes.src = [ACTOR]
    setEnv(ACTOR, RATIFIER) // in-scope actor + a ratifier (the T1 fact routes to full-ratify)
    const out = emitFact(r, fact(r, "foo returns the constant 1"))
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toContain("status: ok")
    expect(out.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m) // persisted content-addressed id
  })

  it("DENY (not in scope): a grounded fact by an out-of-scope actor ⇒ exit 2, reason unauthorized, absent", () => {
    const r = repo(scopedPolicy("src")) // scopes.src = [ACTOR] only
    const f = fact(r, "stranger tries to write foo")
    setEnv(STRANGER, RATIFIER) // grounded + ratified — the ONLY thing that can refuse is the authz gate
    const out = emitFact(r, f)
    expect(out.exitCode).toBe(2) // rejected — NOT ok(0), NOT error(1)
    expect(out.stdout).toContain("status: rejected")
    expect(out.stdout).toContain("reason: unauthorized") // KNOW-11 — surfaced verbatim at the door
    expect(out.stdout).not.toContain("id:") // never a silent empty success
    // nothing persisted: the denied node is ABSENT from a subsequent read (fail-closed left NO durable node).
    const q = runAtlas(r.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    expect(invLines(q.stdout)).not.toContain(`  inv T1 ${f.id} [FRESH]: stranger tries to write foo`)
    expect(invLines(q.stdout)).toEqual([])
  })

  it("DENY (empty actor): an EXPLICIT empty ATLAS_ACTOR is in NO scope ⇒ exit 2, unauthorized, absent", () => {
    const r = repo(scopedPolicy("src"))
    const f = fact(r, "empty actor tries to write foo")
    setEnv("", RATIFIER) // empty actor — fail-closed v1: in no scope
    const out = emitFact(r, f)
    expect(out.exitCode).toBe(2)
    expect(out.stdout).toContain("reason: unauthorized")
    expect(out.stdout).not.toContain("id:")
    const q = runAtlas(r.repoPath, ["query", "src"])
    expect(invLines(q.stdout)).toEqual([]) // nothing persisted
  })

  it("DENY (absent scope): a fact whose OWN scope is empty ⇒ refused at gate 0 ⇒ exit 2, malformed scope", () => {
    const r = repo(scopedPolicy("src"))
    // A grounded fact carrying an EMPTY scope. This used to be refused DOWNSTREAM as `unauthorized`, because
    // `actorInScope` fails closed on `scope.length === 0` even for the otherwise-authorized ACTOR (there is no
    // scope to be a member of). It is now refused EARLIER, at gate 0, as `malformed scope` — `scope` is a
    // type-only string with no runtime validator upstream, and an unvalidated scope that survives gate 0 can
    // pass authz by property-key coercion and then brick the node against the relocation gate forever.
    //
    // The assertion moved with the code, deliberately, rather than the code being bent to keep the assertion:
    // the PROPERTY this story protects is unchanged and still checked below in full — refused, exit 2, no id,
    // nothing persisted. Only the STAGE that refuses it (and so the reason it reports) is different, and
    // earlier-and-more-specific is the direction we want. Carving `''` back out of gate 0 to preserve the old
    // string is what caused the `governance-relocation` brick in the first place.
    // The adversarial payload: a product-grounded fact with its scope FORGED empty (the `draft` door always
    // computes a real `scopeOf(anchor)`, never ''), so the governed emit must refuse it. Grounding + identity
    // are product-door-composed; only the scope field — the one thing under test — is forged.
    const noScopeFact = { ...draftFact(r, "src/foo.ts", "invariant", "no-scope fact").fact, scope: "" }
    setEnv(ACTOR, RATIFIER)
    const out = emitFact(r, noScopeFact)
    expect(out.exitCode).toBe(2)
    expect(out.stdout).toContain("reason: malformed scope")
    expect(out.stdout).not.toContain("reason: unauthorized") // refused BEFORE authz, not by it
    expect(out.stdout).not.toContain("id:")
    const q = runAtlas(r.repoPath, ["query", "src"])
    expect(invLines(q.stdout)).toEqual([]) // nothing persisted (was unchecked before)
  })
})

// ── POLICY (loadPolicy fail-closed / no prototype pollution) ────────────────────────────────────────────

describe("S7b — policy prototype-pollution: a malicious .atlas/policy.json is neutralized, grants nothing", () => {
  // A `__proto__` pollution payload lodged in `authz.scopes`, attempting to smuggle the STRANGER a grant. The
  // loader NEUTRALIZES it: `JSON.parse` materializes `__proto__` without walking the prototype chain and
  // `Object.entries` (parseAuthz) does not enumerate it, so the poison key is DROPPED — no pollution, no
  // setter fired (the scopes map is null-prototype either way). The honest sibling `src:[ACTOR]` still loads,
  // so the file is not wholesale-rejected — the poison is surgically ignored, the legit grant survives.
  const MALICIOUS = JSON.stringify({
    nearDup: { claimNormThreshold: 1 },
    t0Heuristic: { keywords: [] },
    authz: { scopes: { __proto__: [STRANGER], src: [ACTOR] } },
  })

  it("the bin still RUNS (no crash / no pollution) under a poisoned policy — a normal read exits 0", () => {
    const r = repo(MALICIOUS)
    setEnv(ACTOR, RATIFIER)
    const q = runAtlas(r.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0) // total loader — the __proto__ payload neither throws nor pollutes
    expect(q.stdout).toContain("status: ok")
  })

  it("the poison grants NOTHING: the STRANGER named in the `__proto__` payload is still DENIED, absent", () => {
    const r = repo(MALICIOUS)
    const f = fact(r, "pollution should not authorize the stranger")
    setEnv(STRANGER, RATIFIER) // the actor the `__proto__` key tried to smuggle in
    const out = emitFact(r, f)
    expect(out.exitCode).toBe(2)
    expect(out.stdout).toContain("reason: unauthorized") // the dropped poison key opened no door
    expect(out.stdout).not.toContain("id:")
    const q = runAtlas(r.repoPath, ["query", "src"])
    expect(invLines(q.stdout)).toEqual([]) // nothing persisted
  })

  it("surgical, not wholesale: the HONEST sibling scope survives — ACTOR (in `src`) is ACCEPTED", () => {
    const r = repo(MALICIOUS)
    setEnv(ACTOR, RATIFIER) // ACTOR is legitimately in `scopes.src` — the loader honors it
    const out = emitFact(r, fact(r, "honest scope still authorizes ACTOR"))
    expect(out.exitCode).toBe(0) // proves the poison was DROPPED, not that the whole file was rejected
    expect(out.stdout).toContain("status: ok")
    expect(out.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m)
  })
})

// ── TIER-RATIFY (KNOW-8 / KNOW-18, N7) ──────────────────────────────────────────────────────────────────

describe("S7c — tier ratification (N7): T2 auto-accepts; T1/T0 need a token (T0 needs billy)", () => {
  it("T2 auto-accept: a T2 advisory grounded fact emits with NO ratify token (fastpath) ⇒ exit 0, id", () => {
    // route(T2 ∧ advisory ∧ grounded ∧ lowRisk ∧ ¬contested) === 'auto-accept' — no human token consulted.
    // (query bounds T2 OUT of reads — TOOLS-6 — so we assert the EMIT verdict, not read-visibility.)
    const r = repo(scopedPolicy("src"))
    setEnv(ACTOR, undefined) // in scope, NO ATLAS_RATIFY_TOKEN — the fastpath must not require one
    const out = emitFact(r, fact(r, "T2 advisory auto-accepts", "T2"))
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toContain("status: ok")
    expect(out.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m)
  })

  it("T1 full-ratify: NO token ⇒ rejected unratified; a valid token ⇒ accepted (exit 0, id)", () => {
    const r = repo(scopedPolicy("src"))
    const f = fact(r, "T1 needs a ratifier", "T1")
    // (a) no token ⇒ full-ratify refuses (N7 — the gate the emit door previously bypassed).
    setEnv(ACTOR, undefined)
    const denied = emitFact(r, f)
    expect(denied.exitCode).toBe(2)
    expect(denied.stdout).toContain("reason: unratified")
    expect(denied.stdout).not.toContain("id:")
    // (b) a valid ratifier (any non-empty token commits a NON-T0 fact) ⇒ accepted.
    setEnv(ACTOR, RATIFIER)
    const ok = emitFact(r, f)
    expect(ok.exitCode).toBe(0)
    expect(ok.stdout).toContain("status: ok")
    expect(ok.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m)
  })

  it("T0 full-ratify: no token AND a non-billy token BOTH rejected; the billy token accepts", () => {
    const r = repo(scopedPolicy("src"))
    const f = fact(r, "T0 requires billy", "T0")
    // (a) no token ⇒ unratified.
    setEnv(ACTOR, undefined)
    const noTok = emitFact(r, f)
    expect(noTok.exitCode).toBe(2)
    expect(noTok.stdout).toContain("reason: unratified")
    // (b) a NON-billy ratifier does NOT bypass the T0 gate — still refused.
    setEnv(ACTOR, RATIFIER) // 'lead' — a valid T1 ratifier, but NOT billy
    const wrongTok = emitFact(r, f)
    expect(wrongTok.exitCode).toBe(2)
    expect(wrongTok.stdout).toContain("reason: unratified")
    expect(wrongTok.stdout).not.toContain("id:")
    // (c) the billy security-ratifier commits the T0 fact.
    setEnv(ACTOR, BILLY)
    const ok = emitFact(r, f)
    expect(ok.exitCode).toBe(0)
    expect(ok.stdout).toContain("status: ok")
    expect(ok.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m)
  })
})
