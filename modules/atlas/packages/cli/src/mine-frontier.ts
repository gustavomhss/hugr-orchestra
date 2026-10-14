// @atlas/cli — src/mine-frontier.ts  (#182: which frontier a `mine` pass is cut with, and where its
// ordering priors come from)
//
// Split out of `mine.ts` at the 400-LOC ceiling — that file sat at EXACTLY 400 — and cohesive on its own:
// everything here answers one question, "which candidate pool does this pass rank?". `mine.ts` keeps the
// run composition; this file keeps the arm resolution.

import type { FrontierOptions, SkeletonSource, UnitPriorSource } from "@atlas/genesis"
import type { ProductionSkeletonSource } from "@atlas/adapter-io"

/**
 * THE A/B ARM SELECTOR (#182 S4) — read from the THREADED `env` every other operator input on this path is
 * read from (`deps.env ?? process.env`), never from a global.
 *
 *   unset / anything else    ⇒ arm FILE: the frontier shipped on master, byte-for-byte on the seed list.
 *   `ATLAS_FRONTIER=symbol`  ⇒ arm SYMBOL: file sites PLUS the `symbol`/`block` units inside each file.
 *
 * WHY AN ENV VAR AND NOT A `--flag`. The two arms must run from ONE binary — that is the whole point of an
 * A/B, and two builds cannot be compared without also having to argue they were built the same. A CLI flag
 * would additionally be a permanent public surface (`command-doc-guard` requires a shipped option to be
 * documented) for a switch whose reason to exist is a single experiment that may end in "revert the
 * frontier". An env var is the channel `ATLAS_ACTOR` / `ATLAS_RATIFY_TOKEN` already use, costs no surface,
 * and is deliberately NOT a policy input: it selects a candidate pool, and every downstream gate — truth,
 * authz, ratification, staging — is untouched by it.
 *
 * WHY THE DEFAULT IS THE OLD ARM. The hypothesis is unestablished and the card's falsifiers may sink it, so
 * the wider frontier must not be what every unrelated caller silently gets while it is being tested. Only
 * the exact literal `symbol` widens it: a typo therefore takes the SHIPPED arm rather than an unnamed third
 * behaviour, and which arm a run really took is recoverable from the `kind`s of its own staged sites rather
 * than from a variable nobody recorded. Flipping the default later is a one-token edit HERE and nowhere
 * else — every layer under this one already takes the arm as data.
 */
export const FRONTIER_ENV = "ATLAS_FRONTIER"
export const ARM_SYMBOL = "symbol"

/**
 * The #182 unit-prior seam of a skeleton source, or `undefined` when this pass's source has none.
 *
 * DUCK-TYPED ON PURPOSE, and the alternative is worse: `MineDeps.skeleton` is the FROZEN genesis
 * `SkeletonSource` port, so widening it to demand a prior would break every injected test double and every
 * other consumer of that port for a field only the mine frontier reads. `createSkeletonSource` returns a
 * SUPERSET (`ProductionSkeletonSource`) and this reads it when it is there. An injected double has none,
 * so its frontier orders units by address alone — degraded, and degraded visibly rather than by a silent
 * zero that reads like a measurement.
 */
export function unitPriorOf(skeleton: SkeletonSource): UnitPriorSource | undefined {
  const maybe = (skeleton as Partial<ProductionSkeletonSource>).unitPrior
  return typeof maybe === "function" ? maybe : undefined
}

/**
 * Resolve the frontier options for one pass from the environment plus THIS pass's own skeleton source.
 *
 * The prior is taken from the very object that produced the axes, which is the entire reason it is
 * resolved here rather than built fresh: the seam that ENUMERATES the units (the spatial `::` nodes) and
 * the seam that ORDERS them (`exported`/`bytes`) then come from ONE fold and cannot describe two different
 * trees. Building a second prior source would re-walk and re-parse the repository to recover facts the
 * first parse already had.
 */
export function resolveFrontier(env: NodeJS.ProcessEnv, skeleton: SkeletonSource): FrontierOptions {
  const prior = unitPriorOf(skeleton)
  return {
    subFile: env[FRONTIER_ENV] === ARM_SYMBOL,
    ...(prior !== undefined ? { prior } : {}),
  }
}
