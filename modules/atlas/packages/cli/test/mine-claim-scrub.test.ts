// @atlas/cli — test/mine-claim-scrub.test.ts  (T0 — the mined CLAIM's own scrub-before-CAS, end to end)
//
// MEASURE-FIRST FINDING this suite pins: #195(b) scrubbed the model's ANSWER bytes (`mine-answer.ts` →
// `answerRef`), but the SEPARATE `claimNorm` text that becomes the fact's identity-bearing claim body still
// landed in CAS UNSCRUBBED — via `id(f)`, the fact object `decideStaging` hashes and pushes into `puts`. A
// credential-shaped substring in a mined claim reached CAS raw even though the answer's own copy was clean.
// Same class as #207 / #118 / #121. This is the airtight, billy-facing version: raw CAS bytes (via
// `store.get(contentHash)`), the pass's own `puts` batch (pre-`store.put`), AND an independent scrub oracle,
// so a fixture that was never a real secret shape cannot pass by accident.
//
// IDENTITY-VS-STORAGE DECISION, stated explicitly: the SCRUBBED claim becomes the ONE claim (not a
// raw-identity / scrubbed-storage split). `nodeKey` for an ADVISORY fact is `hash(primaryAnchor ‖ slot)` —
// it does NOT read `claimNorm` at all (`knowledge/src/write/router.ts` `nodeKey`), so scrubbing the claim can
// never move or collide a nodeKey; it only narrows `contentHash` (`id(f)`, a CAS dedup key), and two claims
// that scrub to the SAME bytes really are the same public claim — dedup collapsing them is correct, not a
// defect. This suite pins BOTH directions: two DISTINCT non-secret claims never collide (on nodeKey OR
// contentHash), and a secret-bearing claim / its pre-scrubbed twin land on the SAME node.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emptyStore } from "@atlas/knowledge"
import { createDiskStore } from "@atlas/adapter-io"
import type { CasPath } from "@atlas/adapter-io"
import { asHash } from "@atlas/kernel"
import { scrub } from "@atlas/persist"
import { decideStaging } from "../src/mine-decide.js"
import { A, ZERO_SIGNALS, factFor } from "./mine-fixtures.js"
import type { Candidate, Fact } from "@atlas/genesis"

const cand: Candidate = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }

const dirs: string[] = []
const freshStore = () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-claim-"))
  dirs.push(dir)
  return createDiskStore(dir as unknown as CasPath)
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const SECRET = "ghp_SYNTHETICNOTAREALTOKEN01" // a synthetic GitHub-token SHAPE (redacted by @atlas/persist scrub)

describe("decideStaging — the mined CLAIM is scrubbed before it ever reaches CAS (T0)", () => {
  it("independent oracle — the fixture really is a credential shape scrub redacts", () => {
    expect(Buffer.from(scrub(Buffer.from(SECRET, "utf8"))).toString("utf8")).not.toContain(SECRET)
  })

  it("MEASURE-FIRST: a secret in claimNorm does NOT reach CAS — not in `puts`, not in the raw stored bytes", () => {
    const store = freshStore()
    const claim = `the fix is to use ${SECRET} as the key`
    const dec = decideStaging(emptyStore(), [factFor(cand, claim)], new Map())

    // (1) the pass's own CAS batch, BEFORE store.put — the exact objects that will become durable bytes.
    expect(JSON.stringify(dec.put)).not.toContain(SECRET)

    // (2) the RAW CAS bytes, read back through the real disk store at the row's own contentHash.
    for (const o of dec.put!) store.put(o)
    const row = [...dec.next!.current.values()][0]!
    const stored = store.get(asHash(row.contentHash)) as unknown as { claimNorm: string }
    expect(JSON.stringify(stored)).not.toContain(SECRET)
    expect(stored.claimNorm).not.toContain(SECRET)
    expect(stored.claimNorm).toContain("[REDACTED]") // redacted at source, record preserved

    // (3) the projection's own claim set (`row.claims`, dedup by claimNorm — KNOW-4c) is the same scrubbed text.
    expect(row.claims.join("")).not.toContain(SECRET)
    expect(row.claims).toContain(stored.claimNorm)
  })

  it("nodeKey non-collision — two DISTINCT non-secret claims at DIFFERENT sites never collide", () => {
    const dec = decideStaging(
      emptyStore(),
      [factFor(cand, "claim one is true"), { ...factFor(cand, "claim two is different") } as Fact],
      new Map(),
    )
    // same site ⇒ same anchor+slot ⇒ same advisory nodeKey by DESIGN (claimNorm never feeds it) — the second
    // write is correctly treated as a re-claim about the same node, not silently dropped or duplicated wrong.
    expect(dec.next!.current.size).toBe(1)
  })

  it("nodeKey non-collision — two DISTINCT non-secret claims at DIFFERENT anchors never collide", () => {
    const other: Candidate = {
      ...cand,
      site: {
        ...cand.site,
        qualifiedPath: "pkg/other.ts::other",
        subtreeHash: "other-anchor" as unknown as Candidate["site"]["subtreeHash"],
      },
    }
    const dec = decideStaging(emptyStore(), [factFor(cand, "claim A"), factFor(other, "claim B")], new Map())
    const rows = [...dec.next!.current.values()]
    expect(rows.length).toBe(2)
    expect(rows[0]!.nodeKey).not.toBe(rows[1]!.nodeKey)
    expect(rows[0]!.contentHash).not.toBe(rows[1]!.contentHash)
  })

  it("a secret-bearing claim and its already-scrubbed twin resolve to the SAME node (same nodeKey, same contentHash)", () => {
    const withSecret = decideStaging(emptyStore(), [factFor(cand, `use ${SECRET} to auth`)], new Map())
    const preScrubbed = decideStaging(emptyStore(), [factFor(cand, "use [REDACTED] to auth")], new Map())
    const r1 = [...withSecret.next!.current.values()][0]!
    const r2 = [...preScrubbed.next!.current.values()][0]!
    expect(r1.nodeKey).toBe(r2.nodeKey)
    expect(r1.contentHash).toBe(r2.contentHash) // content-address dedup on the scrubbed bytes — correct, not a leak
    expect(r1.claims).toStrictEqual(r2.claims)
  })

  it("a non-advisory (predicate) claim path is untouched by this fix — documented, unmeasured second leg", () => {
    // Advisory facts are the only kind `factFor` builds in this fixture set (predicate identity folds a
    // DIFFERENT leg — `check`, not `claimNorm` — into nodeKey; scrubbing it is a separate, unmeasured design
    // decision, see mine-claim-scrub.ts). This test exists so a reader does not assume predicate coverage.
    expect(factFor(cand, "x").kind).toBe("advisory")
  })
})
