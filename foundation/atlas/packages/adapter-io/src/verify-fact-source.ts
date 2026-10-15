// @atlas/adapter-io — src/verify-fact-source.ts  (the PRODUCTION feed for the sound-genesis PROVEN family)
//
// The three PURE, TOTAL, $0-LLM oracles of `@atlas/genesis` — `verifyDependency` (verify-fact.ts),
// `verifyCount` (verify-count.ts) and `verifyNegation` (verify-negation.ts) — PROVE / REFUTE / ABSTAIN on a
// typed claim over the live `SymbolReverseApi` completeness feed (the #99b N0 view). They are the
// program-checkable half of the sound-genesis gate: soundness comes from a WITNESSED existence, never from an
// absence the index cannot guarantee (see each oracle's `FactVerdict`/`NegationVerdict` header). Until an edge
// makes them running code they are REFERENCE MODELS — a specification with no caller, exactly the
// `relationsOf`-was-dormant lesson. This module is that edge: it is the ONE production caller that turns
// `verify{Dependency,Count,Negation}` from ledgered reference models into a reachable door (`atlas verify-fact`).
//
// ── WHAT THIS MODULE OWNS ────────────────────────────────────────────────────────────────────────────────
// TWO things, mirroring `negation-source.ts`: the feed build (`createVerifyFactLeg`) and the SHARED verdict
// shaping (`verifyFactVerdict`), transport-agnostic by construction so a claim yields a byte-identical `Verdict`
// on any transport wired to drive it. TODAY exactly ONE transport is wired: the `atlas verify-fact` CLI verb
// (compose → bin → cli). No MCP tool is advertised for it yet. The oracles own the decision logic and the scope
// predicate; none of that is restated here.
//
// ── WHY THE FEED IS BUILT ONCE, NOT RE-READ PER CALL (the one difference from the read legs) ──────────────
// `negation-source.ts` re-reads `rehydrateProjection(store)` per call because it reads the MUTABLE knowledge
// projection — a fact filed this session must be visible to the very next call. This leg reads the IMMUTABLE
// CODE INDEX (`ScipOutput` → `SymbolReverseApi`), which is a pure function of the tree at the composed rev and
// does not change within a process. So `createSymbolReverse` + the `pathOfHash` table are built ONCE at
// composition and closed over — a rebuild would be byte-identical work. `pathOfHash` is the exact minimal map
// the oracles' headers name: `nodeHashOfPath(doc.relativePath)` for every document `createSymbolReverse` can
// ever return a hash for, and no others (`symbol-reverse.ts` mints hashes for precisely those documents).

import { verifyCount, verifyDefinition, verifyDependency, verifyNegation, verifyRelation } from "@atlas/genesis"
import type {
  CountClaim,
  DefClaim,
  DepClaim,
  FactVerdict,
  NegationClaim,
  NegationVerdict,
  RelationClaim,
} from "@atlas/genesis"
import { createSymbolReverse, isLocalSymbol, nodeHashOfPath } from "@atlas/index"
import type { ScipOutput, SymbolReverseApi } from "@atlas/index"
import type { Hash } from "@atlas/contracts"
import type { Guidance, Verdict } from "@atlas/tools"

/** The four fact classes the PROVEN family decides. Closed vocabulary — a fifth class is a spec revision. */
export type VerifyKind = "dependency" | "count" | "definition" | "negation"

/** One dispatched verification request: a `kind` paired with its already-built typed claim. Discriminated so
 *  the leg routes to exactly one oracle and the type of `claim` is exact at each arm. */
export type VerifyReq =
  | { readonly kind: "dependency"; readonly claim: DepClaim }
  | { readonly kind: "count"; readonly claim: CountClaim }
  | { readonly kind: "definition"; readonly claim: DefClaim }
  | { readonly kind: "negation"; readonly claim: NegationClaim }
  | { readonly kind: "relation"; readonly claim: RelationClaim }

/** The composition-root leg: a typed request → the oracle's verdict. TOTAL — every oracle is pure + total
 *  (a malformed claim ABSTAINS, never throws), and the built feed adds no failure path of its own. */
export type VerifyFactLeg = (req: VerifyReq) => FactVerdict | NegationVerdict

/** The data payload a `verify-fact` verdict carries — the class asked, the oracle's decision + reason, and the
 *  claim's identifying (target, scope) so the answer is legible without the invocation. `verdict` spans all
 *  oracle outcomes: `refuted` is reachable ONLY for `negation` (the closed-world dual); `dependency`, `count`
 *  and `definition` never refute (a witnessed absence is not sound cross-package — see `FactVerdict`). */
export interface VerifyFactData {
  readonly kind: VerifyKind
  readonly verdict: "proven" | "refuted" | "abstain"
  readonly reason?: string
  readonly oracle: string
  readonly target: string
  readonly scope: string
}

/**
 * Build the composition-root feed over one `ScipOutput` — the SAME projection `build`/`createSymbolReverse`
 * ride in `compose.ts`. `reverse`, the `pathOfHash` table and `isLocalSymbol` are the exact three dependencies
 * every oracle in the family takes; they are assembled ONCE here (see the header on why once, not per call) and
 * closed over. `pathOfHash` is a total lookup — a hash the feed never minted answers `undefined`, which every
 * oracle's scope predicate treats as out-of-scope (fail-closed), so an unknown hash can only UNDER-count /
 * UNDER-witness, never forge a caller. Never throws.
 */
export function createVerifyFactLeg(
  scip: ScipOutput,
  opts?: { readonly indexerName?: string | undefined },
): VerifyFactLeg {
  // #99 F1 — thread the indexer identity into the symbol-reverse feed so the collapsed-local gate
  // (`opaqueRefSources`) is trusted ONLY under the supported indexer. Absent ⇒ heuristic OFF (fail-closed).
  const reverse: SymbolReverseApi = createSymbolReverse(scip, opts)
  // The minimal-but-complete hash→path table the oracles' headers specify: exactly the documents
  // `createSymbolReverse` mints a `nodeHashOfPath(relativePath)` for, keyed by the string form of that hash.
  const pathByHash = new Map<string, string>()
  for (const doc of scip.documents) pathByHash.set(String(nodeHashOfPath(doc.relativePath)), doc.relativePath)
  const pathOfHash = (h: Hash): string | undefined => pathByHash.get(String(h))
  return (req) => {
    switch (req.kind) {
      case "dependency":
        return verifyDependency(req.claim, reverse, pathOfHash, isLocalSymbol)
      case "count":
        return verifyCount(req.claim, reverse, pathOfHash, isLocalSymbol)
      case "definition":
        return verifyDefinition(req.claim, reverse, pathOfHash, isLocalSymbol)
      case "negation":
        return verifyNegation(req.claim, reverse, pathOfHash, isLocalSymbol)
      case "relation":
        // #99 sound relation (ADR-0018) — the directed-edge oracle, dispatched on the SAME feed. Only
        // 'depends-on' can prove (verifyRelation abstains on any other kind); a witnessed cross-unit reference
        // under sourceScope is the proof. Reachable via the `atlas verify-fact` CLI verb once WP-R7 wires it.
        return verifyRelation(req.claim, reverse, pathOfHash, isLocalSymbol)
    }
  }
}

/** The one property a reader should check the bytes against — stated identically on every transport. */
const INVARIANT =
  "VF-1: `atlas verify-fact <kind> <target>` PROVES / REFUTES / ABSTAINS on a typed claim over the live symbol-reverse feed via the sound-genesis oracles (@atlas/genesis) — soundness from a WITNESSED existence, never a cross-package absence; dependency/count never refute, only negation does (#220 closed-world dual); a malformed invocation is a structured error + non-zero exit, never a throw"

/** The one actionable sentence, derived from the oracle's OWN verdict — never a guess about the wiring. */
function nextLine(kind: VerifyKind, target: string, v: FactVerdict | NegationVerdict): string {
  if (v.verdict === "proven") {
    return `PROVEN: the ${kind} claim about '${target}' is witnessed in the live index — a caller/definition exists under the scope, sound in any world (a proof, not a heuristic)`
  }
  if (v.verdict === "refuted") {
    return `REFUTED: '${target}' has a witnessed counterexample under the scope — the negation is false (this verdict is reachable only for the closed-world negation class)`
  }
  return `ABSTAIN (${v.reason ?? "unspecified"}): the oracle declined to decide '${target}' — an honest non-answer, NOT a refutation; widen/close the scope, or the target is local/unresolvable/out-of-scope`
}

const reject = (rejected: string, next: string): Verdict<VerifyFactData> => ({
  ok: false,
  rejected,
  guidance: {
    next,
    invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
  },
})

/** Options a `verify-fact` invocation carries beyond `kind`/`target` — the scope (required), the completeness
 *  world (optional, defaults to the scope), and the count-only `min`/`exact`. All strings as parsed off argv;
 *  coercion + validation happen HERE at the one shared body so any transport wired to it rejects identically. */
export interface VerifyFactOpts {
  readonly scope?: string | undefined
  readonly world?: string | undefined
  readonly min?: string | undefined
  readonly exact?: boolean | undefined
}

/**
 * The SHARED verdict builder — the SCHEMA + VERDICT parity source. Any transport calls this over the SAME
 * `VerifyFactLeg`, so identical arguments yield a byte-identical `Verdict` (`data` + `guidance`). TOTAL: a
 * malformed invocation (unknown kind, empty target/scope, non-positive-integer `min` for a count) fails CLOSED
 * to a structured `ok:false` verdict (exit 1 on the wired CLI transport; the same `ok:false` shape any future
 * transport would surface as its own error), never a throw. An oracle ABSTAIN
 * or REFUTE is `ok:true` carrying the verdict on `data` — the sound gate declining to decide is a valid
 * answer, not a usage error, so it is exit 0 with the honest verdict, exactly as `atlas negations` surfaces an
 * abstention rather than hiding it (#202). `worldScope` defaults to `scope` when `--world` is omitted; for the
 * `negation` class the world/min/exact options are unused (the #220 dual takes a SINGLE scope by construction).
 */
export function verifyFactVerdict(
  leg: VerifyFactLeg,
  kind: string,
  target: string,
  opts: VerifyFactOpts,
): Verdict<VerifyFactData> {
  if (kind !== "dependency" && kind !== "count" && kind !== "definition" && kind !== "negation") {
    return reject(
      `unknown kind '${kind}': verify-fact decides one of dependency | count | definition | negation`,
      "`atlas verify-fact <dependency|count|definition|negation> <target> --scope <s> [--world <w>] [--min <n>] [--exact]`",
    )
  }
  if (typeof target !== "string" || target.length === 0) {
    return reject(
      "missing target: verify-fact requires the global symbol the claim is about",
      "`atlas verify-fact <kind> <target> --scope <s>` — the target is the SCIP global symbol to decide",
    )
  }
  const scope = opts.scope
  if (typeof scope !== "string" || scope.length === 0) {
    return reject(
      "missing --scope: verify-fact requires the scope the claim ranges over",
      "`atlas verify-fact <kind> <target> --scope <s>` — `--scope` is the directory/path prefix the claim is about",
    )
  }
  const world = typeof opts.world === "string" && opts.world.length > 0 ? opts.world : scope

  let req: VerifyReq
  if (kind === "dependency") {
    req = { kind: "dependency", claim: { sourceScope: scope, target, worldScope: world } }
  } else if (kind === "definition") {
    // #196d — a definition is a witnessed existence under a SINGLE scope; world/min/exact are not part of the
    // claim (no closed-world absence to guard, exactly as the negation dual takes a single scope).
    req = { kind: "definition", claim: { sourceScope: scope, target } }
  } else if (kind === "count") {
    if (opts.min === undefined) {
      return reject(
        "missing --min: the count class requires the lower bound N to prove ≥N callers",
        "`atlas verify-fact count <target> --scope <s> --min <n> [--exact]` — `--min` is the integer lower bound",
      )
    }
    // The oracle is the authority on a malformed N (`isPositiveInt` ABSTAINS on ≤0/NaN/Inf/fractional); pass
    // the parsed number through and let it decide, rather than re-implementing that rule at the arg layer.
    req = {
      kind: "count",
      claim: { sourceScope: scope, target, atLeast: Number(opts.min), worldScope: world, exact: opts.exact === true },
    }
  } else {
    // negation — the #220 closed-world dual takes a SINGLE scope; world/min/exact are not part of the claim.
    req = { kind: "negation", claim: { scope, target } }
  }

  const v = leg(req)
  const guidance: Guidance = { next: nextLine(kind, target, v), invariant: INVARIANT }
  return {
    ok: true,
    guidance,
    data: {
      kind,
      verdict: v.verdict,
      ...(v.reason !== undefined ? { reason: v.reason } : {}),
      oracle: v.oracle,
      target,
      scope,
    },
  }
}
