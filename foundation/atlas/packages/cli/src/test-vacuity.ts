// @atlas/cli — src/test-vacuity.ts  (#95 · ADR-0015 D5 — the `atlas test-vacuity` PRODUCER door)
//
// The CLI leg of the reachable single-anchor test-vacuity producer. It owns exactly two things: driving the
// composition root's `testVacuity` leg once over the repo's HEAD test units, and projecting the resulting
// `TestVacuityRun`s to a `CliVerdict`. Every parse, every seal, every governed write belongs to `adapter-io`
// (`test-vacuity-source.ts` — the producer runs `scanTestVacuity` over each unit, seals every proven fact
// through genesis's authority, and routes it THROUGH the governed emit door — KNOW-11 authz + ARCH-9 anchor +
// the HEAD truth gate). Read that header for the shipped-path narrative.
//
// THE EXIT CODE IS THE WHOLE CONTRACT A SCRIPT HAS WITH THIS COMMAND, so it is derived, never chosen:
//   0  ≥1 proven test-vacuity fact was admitted from a HEAD test unit and the GOVERNED door committed it durably.
//   2  0 vacuous tests were found (nothing to admit, abstain-by-design) OR the GOVERNED emit door REFUSED every
//      proven fact (KNOW-11 authz / ARCH-9 anchor / unratified). Nothing fabricated; on a refusal nothing written.
//
// THE 0-FALSE-PROVEN RAIL. A test whose assertions are on the SUCCESS path is NEVER proven — `scanTestVacuity`
// abstains, the PROVEN-only family has no advisory form, so it yields no run and is never named here. Recall is
// the producer's prompt; PRECISION is the governed seal. Only the durably-committed proven facts are counted.

import type { TestVacuityRun } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"

/** The invariant line every produce outcome carries. */
const INVARIANT =
  "#95 D5: a test-vacuity is a single-anchor PROVEN AST-shape fact — named test T in unit U holds one shape of the closed, additive-only `TestVacuityShape` vocabulary (reference/atlas-knowledge.md): `assertion-only-in-catch` (every assertion-shaped call inside a catch clause, no assertion-count guard), `no-assertion-in-test` (no check at all in a body that discards work and neither throws, fails, returns a value nor catches), or `assertion-never-invoked` (a matcher rooted at the bare global `expect(` is referenced but never called, so the assertion never runs). Each is re-derivable at HEAD by `scanTestVacuity`, sealed `proven` ONLY when the injected oracle re-proves it, admitted THROUGH the governed emit door (KNOW-11 authz + ARCH-9 anchor); the PROVEN-only family has no advisory form, so an abstaining oracle yields NO fact (0-false-proven)"

/** Project one finished produce-and-persist pass to the CLI's process outcome. PURE — a function of the
 *  `TestVacuityRun[]` alone, so the same outcome renders byte-identically. The `admitted N` count is the number
 *  of proven facts the GOVERNED door committed durably (admitted ∧ persisted) — never the number proposed. */
export function testVacuityVerdict(runs: readonly TestVacuityRun[]): CliVerdict {
  const committed = runs.filter((r) => r.admitted && r.persisted === true)
  const refused = runs.filter((r) => r.admitted && r.persisted !== true)
  if (committed.length === 0) {
    // ABSTAIN-BY-DESIGN (no vacuous test in any unit) OR every well-formed fact was REFUSED by the governed door.
    return {
      exitCode: 2,
      stdout:
        "status: rejected\n" +
        `next: admitted 0 proven test-vacuity facts — ${
          refused.length === 0
            ? "no test in the scanned HEAD units holds a proven vacuity shape (nothing to admit, abstain-by-design)"
            : `the GOVERNED emit door REFUSED every proven fact: ${refused[0]?.reason ?? "unknown"} — nothing was written. Check that ATLAS_ACTOR is a member of the unit's scope (KNOW-11 authz) and holds a ratify token`
        }\n` +
        `invariant: ${INVARIANT}\n`,
    }
  }
  const lines = committed
    .map(
      (r) => `test-vacuity: ${r.testName ?? "?"} @ ${r.unitKey} (${r.shape ?? "shape?"}, seal: proven) — ${r.id ?? ""}`,
    )
    .join("\n")
  return {
    exitCode: 0,
    stdout:
      "status: ok\n" +
      `next: admitted ${committed.length} proven test-vacuity fact(s) durably through the governed door — read one back with \`atlas node <id>\`\n` +
      `invariant: ${INVARIANT}\n` +
      `${lines}\n`,
  }
}

/**
 * Drive ONE produce-and-persist pass and project it. `testVacuity` is the composition root's leg
 * (`ComposedRuntime.testVacuity`), injected rather than constructed here for the same reason `transition`/
 * `promote`/`deriveRelations` are: the CLI must not stand up a second runtime, or the store it persists into
 * stops being the store `atlas test-vacuities`/`atlas node` reads back.
 */
export function runTestVacuityCli(testVacuity: () => readonly TestVacuityRun[]): CliVerdict {
  return testVacuityVerdict(testVacuity())
}
