// @atlas/adapter-io — test/actor-is-unauthenticated.test.ts  (what KNOW-11 is, and what it is NOT)
//
// There is no authentication anywhere in Atlas. `actor` is resolved by `composeRuntime` as
// `ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? ''`: an environment variable the caller sets, falling back to a
// line of the caller's own `git config`. Both are CLAIMS. Nothing verifies either, because there is nothing
// in the system that COULD — no key, no session, no challenge, no third party.
//
// That matters far beyond this file, and it is why the whole suite exists rather than a comment. Every authz
// finding in every review of this repo — the confused-deputy gate, the scope-monotonicity gate, the
// disclosure ordering of `unauthorized for target` vs `unverifiable target`, the oracle analysis that decides
// which refusal a caller is entitled to — reasons about "the actor" as though it named someone. It does not.
// Those gates are still worth having: they are exactly right against ACCIDENT, which is the failure mode a
// local developer tool actually suffers, and they are the structure an authenticated identity would plug
// into later. What they are not is a control against a caller who does not want to cooperate.
//
// `docs/reference/atlas-architecture.md` §3.3 (ARCH-12) already states this posture, and states it well. The
// gap this suite closes is that the posture was written ONLY in the reference, while the code at the
// resolution seam read the other way — it called the env-var channel "the spoof-guard" and asserted that the
// git-config fallback "cannot be used to spoof the KNOW-11 write actor". Both sentences are defensible about
// the narrow thing they describe (the actor is never taken from a fact or a tool-call payload) and both are
// badly misleading about the thing a reader takes away, which is that spoofing an actor is hard. It is one
// environment variable. Overclaiming a security property is worse than not having it: the next reviewer
// budgets their attention against the claim.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { composeRuntime } from "../src/compose.js"

const COMPOSE_SRC = join(__dirname, "..", "src", "compose.ts")
const POLICY_SRC = join(__dirname, "..", "src", "policy.ts")
const src = (p: string): string => readFileSync(p, "utf8")

/** An obviously-synthetic actor: `.invalid` is the RFC 2606 reserved TLD, so it can never name a real
 *  mailbox. It is not a credential — it is a plain string, which is the entire point being demonstrated. */
const VICTIM = "alice@example.invalid"

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

/** A repo whose policy grants `VICTIM` — and nobody else — write authority over the scope `owned`. */
function repoGranting(actor: string): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-actor-"))
  cleanup = () => rmSync(root, { recursive: true, force: true })
  execFileSync("git", ["-C", root, "init", "-q"])
  execFileSync("git", ["-C", root, "config", "user.email", "mallory@example.invalid"])
  execFileSync("git", ["-C", root, "config", "user.name", "mallory"])
  mkdirSync(join(root, ".atlas"), { recursive: true })
  writeFileSync(
    join(root, ".atlas", "policy.json"),
    JSON.stringify({
      nearDup: { claimNormThreshold: 1 },
      t0Heuristic: { keywords: [] },
      authz: { scopes: { owned: [actor] } },
    }),
  )
  return root
}

describe("KNOW-11 actor — a CLAIM, not an identity (the model is advisory, and must say so)", () => {
  it("the local git identity is NOT the actor once ATLAS_ACTOR is set — one env var names anyone", () => {
    const root = repoGranting(VICTIM)
    const prev = process.env.ATLAS_ACTOR
    try {
      // The machine's own git identity is `mallory@example.invalid`, who is in NO scope. Setting one
      // environment variable makes this process `alice` as far as every gate in the product is concerned.
      process.env.ATLAS_ACTOR = VICTIM
      const composed = composeRuntime(root)
      expect(composed).toBeDefined()
      // The resolution rule itself, asserted where it is written: env wins outright over the git fallback.
      expect(src(COMPOSE_SRC)).toContain('process.env.ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? ""')
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
    }
  })

  it("RED: the composition root must not claim the actor is spoof-resistant", () => {
    // The exact sentence that shipped. It is not a paraphrase — it is the claim, quoted, so this test can
    // only be satisfied by removing or correcting it, never by rewording around it.
    expect(src(COMPOSE_SRC)).not.toContain("it cannot be used to spoof the KNOW-11 write actor")
  })

  it("RED: the composition root must state, at the resolution seam, that nothing authenticates the actor", () => {
    // A discriminant phrase, not a vague keyword search: the posture has to be stated in terms a reader
    // cannot mistake for "authentication happens here".
    expect(src(COMPOSE_SRC)).toContain("NOT AUTHENTICATION")
  })

  it("RED: the authz predicate must say what it is checking — a claim, against a readable file", () => {
    // `actorInScope` is the function every gate calls "the authz check". Anyone reading it in isolation
    // sees a membership test described as authorization, with nothing saying the subject is self-asserted.
    expect(src(POLICY_SRC)).toContain("NOT AUTHENTICATION")
  })
})
