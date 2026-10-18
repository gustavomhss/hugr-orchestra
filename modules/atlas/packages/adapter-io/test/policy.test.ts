// @atlas/adapter-io — test/policy.test.ts  (WP-POLICY: the versioned governance policy + fail-closed loader)
//
// Teeth on the two invariants that make the policy SAFE to externalize:
//   1. FAIL-CLOSED LOAD — a missing OR malformed policy resolves to `defaultPolicy()` WITHOUT throwing,
//      and the default DENIES writes (empty scopes). A mutant that throws on malformed, or that returns a
//      permissive default (non-empty scopes), flips a golden RED.
//   2. FAIL-CLOSED AUTHZ — `actorInScope` IS the KNOW-11a gate (#186 deleted the second, NOMINAL
//      `inScope` in @atlas/knowledge, which nothing called; this line said it MIRRORED it): true only for a
//      listed actor in a declared scope; false for unlisted / absent / empty / undeclared scope. A mutant
//      that allows an absent scope flips RED.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadPolicy, defaultPolicy, actorInScope, type AtlasPolicy } from "../src/policy.js"

// A throwaway repo dir with an optional `.atlas/policy.json` body (raw string ⇒ can be malformed).
let repoPath: string | undefined
function makeRepo(policyBody?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-policy-"))
  if (policyBody !== undefined) {
    mkdirSync(join(dir, ".atlas"), { recursive: true })
    writeFileSync(join(dir, ".atlas", "policy.json"), policyBody, "utf8")
  }
  repoPath = dir
  return dir
}
afterEach(() => {
  if (repoPath) rmSync(repoPath, { recursive: true, force: true })
  repoPath = undefined
})

describe("loadPolicy — fail-closed load of .atlas/policy.json", () => {
  it("POLICY-load-1 — a valid policy loads with exact fields (happy)", () => {
    const body = JSON.stringify({
      t0Heuristic: { keywords: ["invariant", "security"] },
      authz: { scopes: { "core/knowledge": ["seat:lucy", "seat:billy"] } },
    })
    const p = loadPolicy(makeRepo(body))
    expect(p.t0Heuristic).toStrictEqual({ keywords: ["invariant", "security"] })
    // scopes is a null-proto map (proto-pollution-safe) ⇒ compare by content, not by prototype
    expect(p.authz.scopes).toEqual({ "core/knowledge": ["seat:lucy", "seat:billy"] })
    expect(Object.getPrototypeOf(p.authz.scopes)).toBeNull()
  })

  // #242 — a `nearDup` key in a committed `.atlas/policy.json` is now an UNVALIDATED, IGNORED extra field
  // (the knob it fed was deleted end-to-end, never read by the router). TEETH: a policy carrying it still
  // loads normally — an old committed policy is never suddenly treated as malformed by this deletion.
  it("POLICY-load-1b — a policy carrying a leftover `nearDup` key still loads fine (#242: ignored, not rejected)", () => {
    const body = JSON.stringify({
      nearDup: { claimNormThreshold: 0.9 },
      t0Heuristic: { keywords: ["invariant"] },
      authz: { scopes: { core: ["seat:lucy"] } },
    })
    const p = loadPolicy(makeRepo(body))
    expect(p.t0Heuristic).toStrictEqual({ keywords: ["invariant"] })
    expect(p.authz.scopes).toEqual({ core: ["seat:lucy"] })
    expect("nearDup" in p).toBe(false) // never carried forward onto the parsed AtlasPolicy
  })

  it("POLICY-load-2 — a MISSING policy file → defaultPolicy(), no throw (fail-closed)", () => {
    const dir = makeRepo() // no .atlas/policy.json written
    expect(() => loadPolicy(dir)).not.toThrow()
    expect(loadPolicy(dir)).toStrictEqual(defaultPolicy())
  })

  it("POLICY-load-3 — MALFORMED JSON → defaultPolicy(), no throw (TEETH: mutant that throws flips RED)", () => {
    const dir = makeRepo("{ this is not json ]]]")
    expect(() => loadPolicy(dir)).not.toThrow()
    expect(loadPolicy(dir)).toStrictEqual(defaultPolicy())
  })

  it("POLICY-load-4 — structurally-invalid policy → defaultPolicy() (wrong types fail closed)", () => {
    const dir = makeRepo(JSON.stringify({ t0Heuristic: {}, authz: {} }))
    expect(loadPolicy(dir)).toStrictEqual(defaultPolicy())
  })

  it("POLICY-load-5 — the default is CONSERVATIVE: empty scopes ⇒ NO write authorized (TEETH: permissive default flips RED)", () => {
    const def = defaultPolicy()
    expect(Object.keys(def.authz.scopes)).toStrictEqual([]) // no actor in any scope
    expect(Object.getPrototypeOf(def.authz.scopes)).toBeNull() // null-proto ⇒ proto-pollution-safe
    expect(def.t0Heuristic.keywords).toStrictEqual([])
    // no actor can write ANY scope under the default
    expect(actorInScope(def, "seat:anyone", "any/scope")).toBe(false)
  })
})

describe("actorInScope — fail-closed authz, THE KNOW-11a gate (#186: no longer a mirror of a dead one)", () => {
  const policy: AtlasPolicy = {
    t0Heuristic: { keywords: [] },
    authz: { scopes: { "core/knowledge": ["seat:lucy"] } },
  }

  it("POLICY-authz-1 — a listed actor in a declared scope → true (happy)", () => {
    expect(actorInScope(policy, "seat:lucy", "core/knowledge")).toBe(true)
  })

  it("POLICY-authz-2 — an UNLISTED actor in a declared scope → false (fail-closed)", () => {
    expect(actorInScope(policy, "seat:mallory", "core/knowledge")).toBe(false)
  })

  it("POLICY-authz-3 — an UNDECLARED scope → false (fail-closed)", () => {
    expect(actorInScope(policy, "seat:lucy", "core/other")).toBe(false)
  })

  it("POLICY-authz-4 — an ABSENT scope → false (TEETH: mutant allowing absent-scope flips RED)", () => {
    expect(actorInScope(policy, "seat:lucy", undefined)).toBe(false)
  })

  it("POLICY-authz-5 — an EMPTY scope → false (fail-closed)", () => {
    expect(actorInScope(policy, "seat:lucy", "")).toBe(false)
  })

  // TEETH (totality): a scope named after an Object.prototype member must NOT resolve to the inherited
  // function and throw on `.includes` — it must fail-closed false. Drop the hasOwnProperty guard in
  // actorInScope → `scopes['constructor']` reaches the inherited function (plain map) or `undefined`
  // (null-proto map) → `.includes` throws → this golden flips RED.
  const PROTO_NAMES = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf"]
  it("POLICY-authz-6 — a prototype-named scope → false, NEVER throws (TEETH: drop the hasOwnProperty guard → throws/RED)", () => {
    // a policy carrying a PLAIN {} scopes map — the original defect surface (inherited prototype functions
    // are reachable via bracket access). Without the own-property guard, `.includes` on the inherited fn throws.
    const plainMapPolicy: AtlasPolicy = {
      t0Heuristic: { keywords: [] },
      authz: { scopes: {} }, // plain {} — Object.prototype members are inherited
    }
    for (const evil of PROTO_NAMES) {
      // null-proto default map
      expect(() => actorInScope(defaultPolicy(), "seat:x", evil)).not.toThrow()
      expect(actorInScope(defaultPolicy(), "seat:x", evil)).toBe(false)
      // declared policy (own key 'core/knowledge' only) — inherited names must not leak
      expect(() => actorInScope(policy, "seat:lucy", evil)).not.toThrow()
      expect(actorInScope(policy, "seat:lucy", evil)).toBe(false)
      // plain {} map — the throwing surface the hasOwnProperty guard closes
      expect(() => actorInScope(plainMapPolicy, "seat:x", evil)).not.toThrow()
      expect(actorInScope(plainMapPolicy, "seat:x", evil)).toBe(false)
    }
  })
})

describe("proto-pollution — untrusted JSON keys cannot poison the prototype", () => {
  it("POLICY-proto-1 — a __proto__-keyed scopes JSON loads WITHOUT polluting the scopes prototype, scope fail-closed (TEETH: plain {} map → prototype polluted/RED)", () => {
    const dir = makeRepo(JSON.stringify({ authz: { scopes: { __proto__: ["seat:x"] } } }))
    const loaded = loadPolicy(dir)
    // With a plain {} map, `scopes['__proto__'] = [...]` fires the __proto__ SETTER → the scopes object's
    // prototype is silently rebound to ['seat:x']. With the null-proto map (the fix) there is no setter, so
    // the prototype stays null. TEETH: revert parseAuthz/defaultPolicy to a plain {} map → this is non-null → RED.
    expect(Object.getPrototypeOf(loaded.authz.scopes)).toBeNull()
    // and the '__proto__'-named scope must never authorize a write (fail-closed), even for the declared actor
    expect(actorInScope(loaded, "seat:x", "__proto__")).toBe(false)
    // round-trips as an ordinary iterable map (null-proto ⇒ Object.keys / `in` still work)
    expect(() => Object.keys(loaded.authz.scopes)).not.toThrow()
  })
})
