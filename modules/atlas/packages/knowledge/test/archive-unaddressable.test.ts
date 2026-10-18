// @atlas/knowledge — test/archive-unaddressable.test.ts
//
// KNOW-12 says "nothing dies": a predicate SUPERSEDE mints the superseder and RETAINS the prior in CAS, and
// `resolve(oldId)` MUST re-spawn it post-supersede. `bindArchive` discharged that by handing `store.put(old)`
// straight into the returned `supersededBy` pointer, UNCHECKED.
//
// MEASURED (task #136), over BOTH the sealed kernel `createStore()` and a real `createDiskStore`:
//
//   supersede(<a prior carrying a float>, next)
//     → { node: <next>, supersededBy: '' }        ← reported SUCCESS, with a 0-length pointer
//   archive.resolve('')                            → undefined
//   files under the CAS root                       → 0
//
// So the API answered "the prior is retained, here is the link" for a prior that was never written and can
// never be read back. That is a dangling reference minted by the very facet whose contract is that nothing is
// ever lost — and it is the class `adapter-io/src/sidecar-commit.ts` names as an invariant ("the sidecar can
// NEVER reference a contentHash whose bytes are absent"). The fix is that door's disposition, not a silent
// `if (h)`: `index/src/cas.ts` can only DECLINE TO REGISTER because its `put` must stay total and its answer
// is discarded, whereas here the unresolvable handle IS the return value, so swallowing it changes nothing.

import { describe, expect, it } from "vitest"
import { asHash, createStore } from "@atlas/kernel"
import type { CasObject, StoreApi } from "@atlas/kernel"
import { UnaddressablePriorError, bindArchive } from "../src/write/archive.js"
import type { PredicateNode } from "../src/types.js"

/** THE DISCRIMINANT — the reason NAME, everything before the first `:`, compared for EQUALITY (never a
 *  substring: refusal prose in this repo quotes other refusal constants by name). */
const reasonOf = (message: string): string => message.split(":")[0]!

/** The one name every "the CAS could not address these bytes" refusal carries, at every door. */
const UNADDRESSABLE = "unaddressable-cas-object"

/** A well-formed predicate node; `extra` is the violation a case rides in on. */
function predicate(extra: Record<string, unknown> = {}): PredicateNode {
  return {
    kind: "predicate",
    id: "nk-prd",
    tier: "T2",
    check: { kind: "assertion", expr: "x holds" },
    grounding: { entries: [] },
    status: "unknown",
    freshness: "FRESH",
    claims: [],
    authoring: "PREDICATED",
    ...extra,
  } as unknown as PredicateNode
}

/** A store whose `put` answers the EMPTY sentinel for EVERYTHING — the shape `createDiskStore` takes when a
 *  value canonicalizes but cannot serialize (a bigint parked in a KERNEL-8 side-index). */
const alwaysEmpty: StoreApi = {
  put: () => asHash(""),
  get: () => undefined,
}

describe("bindArchive — a prior the CAS cannot address is REFUSED, never linked (KNOW-12)", () => {
  it("PREMISE: the sealed store really does answer the EMPTY sentinel for this prior", () => {
    // Without this the assertions below are tautologies over a value that was never unaddressable.
    expect(createStore().put(predicate({ confidence: 1.5 }) as unknown as CasObject)).toBe("")
    expect(createStore().put(predicate() as unknown as CasObject)).toHaveLength(64)
  })

  it("CONTROL: an addressable prior still supersedes, and `resolve` re-spawns it (0 deletes)", () => {
    const archive = bindArchive(createStore())
    const prior = predicate()
    const { node, supersededBy } = archive.supersede(prior, predicate({ id: "nk-prd-2" }))
    expect(supersededBy).toHaveLength(64)
    expect(archive.resolve(supersededBy)).toEqual(prior)
    expect(node.id).toBe("nk-prd-2")
  })

  it("a prior carrying a canonical-form violation is REFUSED by name — no dangling pointer is returned", () => {
    const archive = bindArchive(createStore())
    let thrown: unknown
    try {
      archive.supersede(predicate({ confidence: 1.5 }), predicate({ id: "nk-prd-2" }))
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(UnaddressablePriorError)
    expect(reasonOf((thrown as Error).message)).toBe(UNADDRESSABLE)
  })

  it("the same refusal when the STORE answers EMPTY (the disk-store serialization leg)", () => {
    const archive = bindArchive(alwaysEmpty)
    expect(() => archive.supersede(predicate(), predicate({ id: "nk-prd-2" }))).toThrow(UnaddressablePriorError)
  })

  it("the refusal is a NAMED Error, not an engine fault — `@atlas/tools` files it `refused`, not internal", () => {
    // `fault.ts` classifies a `TypeError`/`RangeError` as `internal-fault` ("a defect in Atlas, not in your
    // arguments"). The bytes here are entirely the caller's, so the refusal must not wear that name.
    const e = new UnaddressablePriorError()
    expect(e).toBeInstanceOf(Error)
    expect(["TypeError", "RangeError", "ReferenceError"]).not.toContain(e.name)
    expect(e.name).toBe("UnaddressablePriorError")
  })
})
