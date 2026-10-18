// @atlas/cli — test/mine-predicate-check-scrub.test.ts  (T0 · WP-219 — the mined predicate CHECK is scrubbed before CAS)
//
// MEASURE-FIRST FINDING this suite pins (the second T0 leg the provenance wave left open, mine-claim-scrub.ts's
// own "ADVISORY ONLY, ON PURPOSE" caveat): #207 scrubbed the ADVISORY `claimNorm` before `id(f)`, but a
// PREDICATE fact's identity-bearing claim body is `normalizeCheck(f.check)` (mine-decide.ts `claimNormOf`), and
// `f.check` folds into CAS TWO ways:
//   (1) `id(f)` hashes the WHOLE fact — including `f.check` — into CAS (the `puts` batch → `store.get`).
//   (2) `f.check` folds into the predicate `nodeKey` preimage `{a, c: normalizeCheck(check), s}` (router.ts,
//       KNOW-15c "a distinct check ⇒ a distinct node").
// So a credential shape embedded in a synthesized predicate `check` reached CAS raw AND polluted node identity —
// the SAME class as #207 / #118 / #121, latent only because mine-gate.ts hardcodes kind:'advisory' today (#96
// is about to make it emit predicates). This drives a predicate Fact directly through `decideStaging` to prove
// the leg.
//
// IDENTITY-VS-STORAGE DECISION, stated explicitly and DIFFERENT from the advisory leg: `check` DOES feed
// `nodeKey`, so scrubbing it CANNOT be a CAS-only redaction — a scrub-for-storage / raw-for-identity split would
// re-open the leak on the identity leg AND relocate two scrub-equal predicates to different addresses. The fix
// scrubs `f.check` ONCE, before `f` is built, so the SAME scrubbed bytes feed `id(f)` AND the `nodeKey`
// preimage. This suite pins BOTH directions: a secret never reaches CAS raw and never appears in the nodeKey
// preimage; two DISTINCT non-secret checks still get DISTINCT nodeKeys (no over-collapse); a secret-bearing
// check and its pre-scrubbed twin resolve to the SAME node.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emptyStore, nodeKey } from "@atlas/knowledge"
import type { Candidate as KnowledgeCandidate } from "@atlas/knowledge"
import { createDiskStore } from "@atlas/adapter-io"
import type { CasPath } from "@atlas/adapter-io"
import { asHash, asNodeKey } from "@atlas/kernel"
import { scrub } from "@atlas/persist"
import { decideStaging } from "../src/mine-decide.js"
import { A, B, ZERO_SIGNALS } from "./mine-fixtures.js"
import type { Candidate, Fact } from "@atlas/genesis"

const cand: Candidate = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }
const candB: Candidate = { site: B, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }

const dirs: string[] = []
const freshStore = () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-pred-"))
  dirs.push(dir)
  return createDiskStore(dir as unknown as CasPath)
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const SECRET = "ghp_SYNTHETICNOTAREALTOKEN01" // a synthetic GitHub-token SHAPE (redacted by @atlas/persist scrub)

/** A PREDICATE fact whose synthesized `check.expr` carries the given body — the shape #96 will make the mine
 *  driver emit. Built directly (the driver hardcodes advisory today) to exercise the `decideStaging` predicate
 *  leg the fix protects. */
const predicateFactFor = (c: Candidate, expr: string): Fact =>
  ({
    kind: "predicate",
    id: asNodeKey(`nk-${c.site.qualifiedPath}`),
    tier: "T2",
    check: { kind: "assertion", expr },
    grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
    status: "NA",
    freshness: "FRESH",
    claims: [],
    authoring: "PREDICATED",
    predicateSlot: "invariant",
  }) as unknown as Fact

/** Recompute the router `nodeKey` PREIMAGE `c: normalizeCheck(check)` the way the shipped path does — the
 *  identity leg the scrub must also dominate. `nodeKey` folds `normalizeCheck(check)` into the hashed preimage,
 *  so if the raw secret survives into `check`, it survives into the preimage; we assert on the node's own row. */
const rowNodeKey = (f: Fact): string => {
  const view = { ...(f as unknown as KnowledgeCandidate), slot: "invariant" } as unknown as KnowledgeCandidate
  return nodeKey(view) as unknown as string
}

describe("decideStaging — the mined PREDICATE check is scrubbed before it ever reaches CAS or node identity (T0, WP-219)", () => {
  it("independent oracle — the fixture really is a credential shape scrub redacts", () => {
    expect(Buffer.from(scrub(Buffer.from(SECRET, "utf8"))).toString("utf8")).not.toContain(SECRET)
  })

  it("MEASURE-FIRST: a secret in a predicate check does NOT reach CAS — not in `puts`, not in the raw stored bytes", () => {
    const store = freshStore()
    const expr = `assert token == "${SECRET}"`
    const dec = decideStaging(emptyStore(), [predicateFactFor(cand, expr)], new Map())

    // (1) the pass's own CAS batch, BEFORE store.put — the exact objects that will become durable bytes.
    expect(JSON.stringify(dec.put)).not.toContain(SECRET)

    // (2) the RAW CAS bytes, read back through the real disk store at the row's own contentHash.
    for (const o of dec.put!) store.put(o)
    const row = [...dec.next!.current.values()][0]!
    const stored = store.get(asHash(row.contentHash)) as unknown as { check: { expr: string } }
    expect(JSON.stringify(stored)).not.toContain(SECRET)
    expect(stored.check.expr).not.toContain(SECRET)
    expect(stored.check.expr).toContain("[REDACTED]") // redacted at source, record preserved
  })

  it("the OTHER `Check` arm — `index-query` — is scrubbed too (both union arms carry free model text, billy #2)", () => {
    const store = freshStore()
    const queryFact = {
      ...(predicateFactFor(cand, "unused") as unknown as { check: unknown }),
      check: { kind: "index-query", query: `find calls where arg == "${SECRET}"` },
    } as unknown as Fact
    const dec = decideStaging(emptyStore(), [queryFact], new Map())
    expect(JSON.stringify(dec.put)).not.toContain(SECRET) // the `query` arm never reaches the CAS batch raw
    for (const o of dec.put!) store.put(o)
    const row = [...dec.next!.current.values()][0]!
    const stored = store.get(asHash(row.contentHash)) as unknown as { check: { query: string } }
    expect(stored.check.query).not.toContain(SECRET)
    expect(stored.check.query).toContain("[REDACTED]")
  })

  it("MEASURE-FIRST: a secret in a predicate check does NOT appear in the nodeKey PREIMAGE (identity leg)", () => {
    const expr = `assert token == "${SECRET}"`
    const dec = decideStaging(emptyStore(), [predicateFactFor(cand, expr)], new Map())
    const row = [...dec.next!.current.values()][0]!
    // the projection's stored claim body (normalizeCheck of the scrubbed check) never carries the raw secret…
    expect(row.claims.join("")).not.toContain(SECRET)
    // …AND the router-recomputed nodeKey preimage over a SCRUBBED-twin check is byte-identical to the row's key,
    // proving the SAME scrubbed check fed both `id(f)` and the nodeKey (no CAS/identity split).
    const scrubbedTwin = predicateFactFor(cand, `assert token == "[REDACTED]"`)
    expect(rowNodeKey(scrubbedTwin)).toBe(row.nodeKey)
  })

  it("no over-collapse — two DISTINCT non-secret checks at the SAME site get DISTINCT nodeKeys", () => {
    const dec = decideStaging(
      emptyStore(),
      [predicateFactFor(cand, "assert x > 0"), predicateFactFor(cand, "assert x < 100")],
      new Map(),
    )
    const rows = [...dec.next!.current.values()]
    expect(rows.length).toBe(2) // distinct check ⇒ distinct node (KNOW-15c), scrub must not fold them together
    expect(rows[0]!.nodeKey).not.toBe(rows[1]!.nodeKey)
    expect(rows[0]!.contentHash).not.toBe(rows[1]!.contentHash)
  })

  it("no over-collapse — two DISTINCT non-secret checks at DIFFERENT sites never collide", () => {
    const dec = decideStaging(
      emptyStore(),
      [predicateFactFor(cand, "assert a"), predicateFactFor(candB, "assert b")],
      new Map(),
    )
    const rows = [...dec.next!.current.values()]
    expect(rows.length).toBe(2)
    expect(rows[0]!.nodeKey).not.toBe(rows[1]!.nodeKey)
  })

  it("a secret-bearing check and its pre-scrubbed twin resolve to the SAME node (same nodeKey, same contentHash)", () => {
    const withSecret = decideStaging(emptyStore(), [predicateFactFor(cand, `assert k == "${SECRET}"`)], new Map())
    const preScrubbed = decideStaging(emptyStore(), [predicateFactFor(cand, 'assert k == "[REDACTED]"')], new Map())
    const r1 = [...withSecret.next!.current.values()][0]!
    const r2 = [...preScrubbed.next!.current.values()][0]!
    expect(r1.nodeKey).toBe(r2.nodeKey)
    expect(r1.contentHash).toBe(r2.contentHash) // content-address dedup on the scrubbed bytes — correct, not a leak
  })
})
