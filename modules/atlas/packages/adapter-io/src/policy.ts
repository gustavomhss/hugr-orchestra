// @atlas/adapter-io — src/policy.ts  (WP-POLICY: the versioned governance policy + its fail-closed loader)
//
// THE governance tunables, externalized as DATA. The engine's governance seams (the T0 heuristic keyword
// set, the KNOW-11 owner-scoped write gate) are RULES admins own — so they live in a declarative
// `<repoPath>/.atlas/policy.json` an admin edits, while the runtime reads them here as plain config.
//
// THE WP NAME AND THIS HEADER BOTH USED TO SAY THE FILE WAS LOCKED. It is NOT, and the distinction that
// matters is that the lock is UNAVAILABLE rather than merely un-configured: the CODEOWNERS line names a
// team that exists in no org (GitHub rejects it outright as an unknown owner), and branch protection 403s
// on this repo's plan — "Upgrade to GitHub Pro or make this repository public", for rules and rulesets
// alike. Anyone with write access can edit the authorization policy directly.
//
// So the ONLY control actually holding is the one implemented BELOW, which is why it is written the way it
// is. This module is the FAIL-CLOSED loader: it never throws and never silently permits a write.
//
// FAIL-CLOSED is the whole point. A missing OR malformed policy resolves to `defaultPolicy()` — the
// CONSERVATIVE default: an EMPTY T0 keyword set and EMPTY authz scopes. Empty scopes ⇒ no actor is in ANY
// scope ⇒ NO write is authorized until an admin declares scopes (reads stay universal per KNOW-11b). An
// absent/broken policy can therefore never open a write path — the default denies. `actorInScope` IS the
// KNOW-11a gate (#186 deleted the second, NOMINAL implementation that used to live in @atlas/knowledge
// `authz.ts` and that nothing called — this comment said `actorInScope` "mirrors" it): fail-closed on an
// absent/empty scope or an unlisted actor.
//
// AND THE POLICY IS NOT AN AUTHENTICATED INPUT EITHER. `authz.scopes` names WHO may write WHAT, but the
// "who" is a self-asserted string (`actorInScope` below says why), and this file is world-readable and
// world-writable to anyone who can run the tool. Both halves are advisory. That is a legitimate posture for
// a local developer tool and it is stated here so no reader has to infer it from the absence of a check.
//
// One-way DAG leaf (adapter ring): the core never imports this.
//
// [#242 — `nearDup.claimNormThreshold` DELETED, not wired] this policy used to also carry a `nearDup`
// leg — parsed and validated here, projected by a `nearDupConfig()` helper, into the frozen `NearDupConfig`
// (@atlas/knowledge). MEASURED: `nearDupConfig()` had ZERO callers anywhere in this repo, and the
// `@atlas/knowledge` router it fed never read the value even when a caller passed one explicitly (see that
// package's `router.ts`/`upsert.ts` for the #242 removal on that side). An admin could set the knob, watch
// it validate, and it guarded nothing — the same class of defect as #152/#186/#178. Deleted end-to-end
// rather than wired: post-#197 the sound arm's `claimNorm` is harness-generated and deterministic, so a
// text-similarity τ over it would compare generated sentences to generated sentences, a different and
// probably useless question from the one this knob was invented to answer. `.atlas/policy.json` files that
// still carry a `nearDup` key are UNCHANGED by this — an extra, unvalidated JSON key is simply ignored, the
// same fail-open-on-extra-data posture every other unrecognised key in this file already had.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { underScope } from "./anchor-scope.js"

// ── the policy shape ─────────────────────────────────────────────────────────────────────────────────

/** The T0-candidate heuristic tunable — the keyword set that flags a fact as a T0 (human-ratification)
 *  candidate, feeding the T0 heuristic seam. Empty ⇒ the heuristic proposes nothing on its own. */
export interface T0HeuristicPolicy {
  readonly keywords: readonly string[]
}

/** The authorization config — the actor↔scope membership map ("who may write to which scope"), feeding the
 *  KNOW-11 gate {@link actorInScope}. `scopes[scope]` is the list of actor ids authorized to write that
 *  scope. An UNLISTED scope (or an absent actor) is fail-closed: no write. */
export interface AuthzPolicy {
  readonly scopes: Record<string, readonly string[]>
  /**
   * [ARCH-9 · ADR-0010 open item 3] The scope↔ANCHOR binding: which governance scope OWNS which anchor
   * prefix. `anchors['src/payments'] = 'payments'` means every fact whose computed `primaryAnchor` lies
   * under `src/payments` must declare scope `payments` — and therefore must be written by an actor the
   * policy lists under `payments`, not by whoever happens to own some other scope.
   *
   * WHY IT EXISTS. `scope` is a gate-selecting field with exactly the shape ARCH-9 forbids: the authz gate
   * is `actorInScope(policy, actor, node.scope)` on an AUTHOR-SUPPLIED string, while the read projection
   * scopes on the DERIVED `primaryAnchor` (`projection-query-index.ts` — `underScope(node.primaryAnchor,
   * queryScope)`) and never looks at the row's scope at all. Nothing bound the two. So an actor authorized
   * only in `public` could write a fact ANCHORED in `src/payments`, declare `scope:'public'`, clear authz,
   * and have it SERVED to `atlas query src/payments`. The incumbent gates do not cover it: they only stop a
   * node MOVING once it exists, and this is a CREATE.
   *
   * THIS IS THE MECHANISM, NOT THE DECISION. ADR-0010 states the binding "needs a scope↔anchor mapping in
   * `adapter-io/policy.ts` AND a decision about which scope owns which anchor prefix". The second half is an
   * admin/owner judgement about a particular repository and is NOT invented here. Measured, and it is why a
   * hard-coded rule was not shipped: the two vocabularies are not the same today — every fixture in this
   * product declares governance scopes like `core` over anchors like `src/a.ts`, so requiring
   * `underScope(anchor, scope)` unconditionally would refuse writes the product itself makes.
   *
   * ABSENT / EMPTY ⇒ NO BINDING, which is honest rather than convenient: the hole is NARROWED (an admin can
   * now close it, per prefix, and the door enforces it), not CLOSED (an admin who declares nothing still has
   * the unbound behaviour). Optional for the same reason `derivedTier` is optional on `RatifyContext`: a
   * required field would force every existing policy to invent a value, and an invented derivation is the
   * one thing ARCH-9 names as NOT satisfying the clause.
   */
  readonly anchors?: Record<string, string>
}

/** The admin-owned, versioned governance policy. Carries only DATA the governance seams consume — no code,
 *  no judgement. Sourced from `<repoPath>/.atlas/policy.json`; resolves to {@link defaultPolicy} when absent
 *  or malformed (fail-closed). */
export interface AtlasPolicy {
  readonly t0Heuristic: T0HeuristicPolicy
  readonly authz: AuthzPolicy
}

// ── the conservative fail-closed default ───────────────────────────────────────────────────────────────

/**
 * The CONSERVATIVE fail-closed default (KNOW-11a / KNOW-15h floor). An absent or broken policy resolves
 * here and must NEVER silently permit a write:
 *   • `t0Heuristic.keywords: []` — the heuristic flags nothing on its own until an admin declares the set.
 *   • `authz.scopes: {}` — NO actor is in ANY scope ⇒ NO write is authorized. Reads stay universal
 *     (KNOW-11b), but a write requires an admin to have declared the scope membership first.
 * A fresh object is returned each call (no shared mutable default can be aliased/mutated). The scopes map
 * is a null-prototype object ({@link emptyScopes}) — no inherited `Object.prototype` keys, no `__proto__`
 * setter — so a prototype-named scope (`'constructor'`, `'__proto__'`, …) lands nowhere and reads back as
 * absent, keeping {@link actorInScope} total + fail-closed.
 */
export function defaultPolicy(): AtlasPolicy {
  return {
    t0Heuristic: { keywords: [] },
    authz: { scopes: emptyScopes() },
  }
}

/** A null-prototype scopes map: no inherited `Object.prototype` members, no `__proto__` accessor. Untrusted
 *  JSON keys (`'constructor'`, `'__proto__'`, `'toString'`, …) land as plain own data props or nowhere —
 *  never resolving to an inherited function and never polluting the prototype. */
function emptyScopes(): Record<string, readonly string[]> {
  return Object.create(null) as Record<string, readonly string[]>
}

// ── the fail-closed loader ───────────────────────────────────────────────────────────────────────────

/**
 * Load `<repoPath>/.atlas/policy.json` into an {@link AtlasPolicy}. TOTAL + FAIL-CLOSED: any failure —
 * the file missing, unreadable, non-JSON, or structurally invalid — resolves to {@link defaultPolicy}
 * WITHOUT throwing. The conservative default denies writes (empty scopes), so a broken policy can never
 * open a write path. Every field is validated + narrowed before it is trusted; a partial/typo'd policy
 * degrades to the default for the offending leg by falling through validation (whole-policy fallback).
 */
export function loadPolicy(repoPath: string): AtlasPolicy {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(join(repoPath, ".atlas", "policy.json"), "utf8"))
  } catch {
    return defaultPolicy() // missing / unreadable / non-JSON — fail closed to the denying default
  }
  return parsePolicy(raw)
}

/** Narrow arbitrary parsed JSON to a valid {@link AtlasPolicy}, or fall back to {@link defaultPolicy}.
 *  Total — returns a policy for ANY input, never throws. */
function parsePolicy(raw: unknown): AtlasPolicy {
  if (!isRecord(raw)) return defaultPolicy()
  const t0Heuristic = parseT0(raw.t0Heuristic)
  const authz = parseAuthz(raw.authz)
  if (t0Heuristic === undefined || authz === undefined) return defaultPolicy()
  return { t0Heuristic, authz }
}

/** Validate `t0Heuristic` — requires a `keywords` array of strings. Fail-closed ⇒ `undefined`. */
function parseT0(v: unknown): T0HeuristicPolicy | undefined {
  if (!isRecord(v)) return undefined
  const kw = v.keywords
  if (!Array.isArray(kw) || !kw.every((k): k is string => typeof k === "string")) return undefined
  return { keywords: [...kw] }
}

/** Validate `authz` — requires a `scopes` object mapping scope → string[] of actors, and accepts an OPTIONAL
 *  `anchors` map of anchor-prefix → owning scope. Fail-closed ⇒ `undefined`. A malformed scope map denies
 *  (no write authorized); a malformed `anchors` map denies the WHOLE policy rather than degrading to "no
 *  binding", because a typo'd binding that silently disappears is a control that was never there. */
function parseAuthz(v: unknown): AuthzPolicy | undefined {
  if (!isRecord(v)) return undefined
  const s = v.scopes
  if (!isRecord(s)) return undefined
  const scopes = emptyScopes() // null-proto: untrusted keys land as own props, never invoke the __proto__ setter
  for (const [scope, actors] of Object.entries(s)) {
    if (!Array.isArray(actors) || !actors.every((a): a is string => typeof a === "string")) return undefined
    scopes[scope] = [...actors]
  }
  if (v.anchors === undefined) return { scopes } // ABSENT ⇒ no binding declared (the pre-ADR-0010 shape)
  if (!isRecord(v.anchors)) return undefined
  const anchors = Object.create(null) as Record<string, string> // null-proto, same reason as `emptyScopes`
  for (const [prefix, owner] of Object.entries(v.anchors)) {
    // A prefix owned by a NON-string, an EMPTY owner, or the reserved `__proto__` name binds nothing and is
    // refused rather than skipped: the whole point of the map is that a declared prefix is enforced.
    if (typeof owner !== "string" || owner.length === 0) return undefined
    if (prefix.length === 0 || prefix === "__proto__" || owner === "__proto__") return undefined
    anchors[prefix] = owner
  }
  return { scopes, anchors }
}

/** A plain (non-null, non-array) object guard. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

// ── pure helpers the wiring consumes ──────────────────────────────────────────────────────────────────

/**
 * Is `actor` authorized to write `scope`?
 *
 * NOT AUTHENTICATION. Read the signature literally: this takes `actor` as a STRING and asks whether that
 * string is listed under `scope`. It does not, and cannot, ask whether the caller IS that actor — nothing in
 * Atlas establishes that. The string arrives from `ATLAS_ACTOR` or the caller's own `git config user.email`
 * (see `compose.ts`), both self-asserted, and the policy it is checked against is a file readable and
 * writable by anyone who can invoke the CLI. This is an ANTI-ACCIDENT GUARDRAIL — it stops the wrong seat
 * writing the wrong scope by mistake — and it is not an adversarial control (ARCH-12). Every caller of this
 * function inherits that ceiling, however carefully the gate around it is built.
 *
 * THE KNOW-11a gate (#186) — FAIL-CLOSED. It used to be described as MIRRORING a knowledge-side
 * `inScope(actor, scope)`; that function decided `actor === scope`, had zero production callers, and is
 * deleted. The shape half of the pair still lives there and still runs on every write (`isScope`):
 * `false` when `scope` is absent/empty, when the scope is not declared in the policy, or when `actor` is not
 * a listed member. `true` only when the policy declares the scope AND lists the actor. Pure + total, no IO —
 * an absent/broken policy (⇒ empty scopes via {@link defaultPolicy}) therefore authorizes NO write.
 *
 * The membership lookup is guarded by an OWN-property check ({@link Object.prototype.hasOwnProperty}) BEFORE
 * `.includes`: a scope named after an INHERITED `Object.prototype` member (`'constructor'`, `'toString'`,
 * `'hasOwnProperty'`, `'valueOf'`, …) resolves to the prototype function on a plain map and would throw on
 * `.includes` — here it is not an OWN key of the (null-proto) map, so it fails closed `false` instead of
 * throwing. `'__proto__'` is the one reserved name JSON.parse materializes as an OWN key, so it is rejected
 * by name up front: a governance scope is an identifier like `'core/knowledge'`, never `'__proto__'`.
 * Total — never throws — and never permits an unlisted actor.
 */
/**
 * WHICH scope OWNS `primaryAnchor`, per the admin-declared anchor binding — or `undefined` when no declared
 * prefix covers it (⇒ this gate stands aside, the documented default).
 *
 * LONGEST DECLARED PREFIX WINS, counted in PATH SEGMENTS, so an admin can write the ordinary nested shape
 * (`{"src": "core", "src/payments": "payments"}`) and have the specific rule beat the general one regardless
 * of key order in the JSON file. Ties cannot occur: two declared prefixes with the same segment count that
 * both cover one anchor would have to be equal strings, and a JSON object has one value per key.
 *
 * Coverage is `underScope` — THE predicate the read projection scopes on (`anchor-scope.ts`), not a second
 * `startsWith`. That identity is the point of the binding: the write is judged by the same notion of "under"
 * that decides which query will later serve it.
 *
 * Pure + total: no IO, no throw, and an undeclared/empty map answers `undefined` for every anchor.
 */
export function anchorOwner(policy: AtlasPolicy, primaryAnchor: string | undefined): string | undefined {
  const anchors = policy.authz.anchors
  if (anchors === undefined || primaryAnchor === undefined) return undefined
  let best: string | undefined
  let bestDepth = -1
  for (const [prefix, owner] of Object.entries(anchors)) {
    if (!underScope(primaryAnchor, prefix)) continue
    const depth = prefix.split("/").length
    if (depth > bestDepth) {
      bestDepth = depth
      best = owner
    }
  }
  return best
}

/**
 * Does the write's DECLARED scope agree with the scope the policy says OWNS its computed anchor?
 *
 * `true` (permitted) when no declared prefix covers the anchor — the unbound default. `false` ONLY when the
 * admin has bound this anchor's prefix to a scope and the write declares a different one. Note what is NOT
 * asked: whether the actor is in either scope. That is `actorInScope`'s job and it still runs; this gate
 * answers the question authz structurally cannot, because authz is handed the very string under dispute.
 */
export function scopeOwnsAnchor(policy: AtlasPolicy, scope: string, primaryAnchor: string | undefined): boolean {
  const owner = anchorOwner(policy, primaryAnchor)
  return owner === undefined || owner === scope
}

export function actorInScope(policy: AtlasPolicy, actor: string, scope: string | undefined): boolean {
  if (scope === undefined || scope.length === 0) return false // no ownership anchor ⇒ fail closed
  if (scope === "__proto__") return false // reserved name (an own key after JSON.parse) ⇒ never anchors a scope
  const scopes = policy.authz.scopes
  if (!Object.prototype.hasOwnProperty.call(scopes, scope)) return false // undeclared / inherited-proto name ⇒ fail closed (total, never throws)
  const members = scopes[scope] // own key ⇒ defined; the `!== undefined` is only the noUncheckedIndexedAccess narrowing (it does NOT swallow the inherited-fn throw — that is what the hasOwnProperty guard prevents)
  return members !== undefined && members.includes(actor)
}
