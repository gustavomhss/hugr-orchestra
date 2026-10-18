// @atlas/persist — test/attach-unaddressable.test.ts
//
// PERSIST-4 is "index-as-attachment": `attach(B)` STORES the body in the CAS and yields the `{hash}` pointer,
// and `get(hash)` resolves that body back. `createAttach` discharged the first half by handing `store.put(body)`
// straight into the pointer, UNCHECKED.
//
// MEASURED (task #136), over BOTH the sealed kernel `createStore()` and a real `createDiskStore`:
//
//   attach(<a body carrying a float>)  → { hash: '' }   ← a POINTER, reported as an attachment
//   get('')                            → undefined
//   files under the CAS root           → 0
//
// The attachment contract is that the pointer is the only thing carried BECAUSE the body is in the CAS. A
// `{hash:''}` is an attachment to nothing: the body was never written and the pointer resolves to `undefined`
// forever. Same class as `adapter-io/src/sidecar-commit.ts`'s stated invariant, and the same disposition —
// refuse by name rather than mint a reference that cannot resolve.

import { describe, expect, it } from "vitest"
import { asHash, createStore, id } from "@atlas/kernel"
import type { CasObject, StoreApi } from "@atlas/kernel"
import { UnaddressableAttachmentError, createAttach } from "../src/attach.js"

/** THE DISCRIMINANT — the reason NAME, everything before the first `:`, compared for EQUALITY. */
const reasonOf = (message: string): string => message.split(":")[0]!

/** The one name every "the CAS could not address these bytes" refusal carries, at every door. */
const UNADDRESSABLE = "unaddressable-cas-object"

/** A body the canonicalizer genuinely refuses (floats forbidden — KERNEL-1). */
const POISONED: CasObject = { kind: "blob", role: "report", payload: "x".repeat(32), confidence: 1.5 }
/** The same body, addressable. */
const CLEAN: CasObject = { kind: "blob", role: "report", payload: "x".repeat(32) }

/** A store whose `put` answers the EMPTY sentinel for EVERYTHING — the shape `createDiskStore` takes when a
 *  value canonicalizes but cannot serialize (a bigint parked in a KERNEL-8 side-index). */
const alwaysEmpty: StoreApi = {
  put: () => asHash(""),
  get: () => undefined,
}

describe("createAttach — a body the CAS cannot address is REFUSED, never pointed at (PERSIST-4)", () => {
  it("PREMISE: the sealed store really does answer the EMPTY sentinel for this body", () => {
    expect(createStore().put(POISONED)).toBe("")
    expect(createStore().put(CLEAN)).toHaveLength(64)
  })

  it("CONTROL: an addressable body still attaches pointer-only, and the pointer resolves", () => {
    const att = createAttach()
    const pointer = att.attach(CLEAN)
    expect(pointer).toEqual({ hash: id(CLEAN) })
    expect(att.get(pointer.hash)).toEqual(CLEAN)
  })

  it('a body carrying a canonical-form violation is REFUSED by name — no `{hash:""}` is returned', () => {
    const att = createAttach()
    let thrown: unknown
    try {
      att.attach(POISONED)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(UnaddressableAttachmentError)
    expect(reasonOf((thrown as Error).message)).toBe(UNADDRESSABLE)
  })

  it("the same refusal when the STORE answers EMPTY (the disk-store serialization leg)", () => {
    expect(() => createAttach(alwaysEmpty).attach(CLEAN)).toThrow(UnaddressableAttachmentError)
  })

  it("`get` stays TOTAL — a miss is still an honest `undefined`, never a throw (the read half is unchanged)", () => {
    const att = createAttach()
    expect(att.get(asHash(""))).toBeUndefined()
    expect(att.get(asHash("0".repeat(64)))).toBeUndefined()
  })

  it("the refusal is a NAMED Error, not an engine fault — `@atlas/tools` files it `refused`, not internal", () => {
    const e = new UnaddressableAttachmentError()
    expect(e).toBeInstanceOf(Error)
    expect(["TypeError", "RangeError", "ReferenceError"]).not.toContain(e.name)
    expect(e.name).toBe("UnaddressableAttachmentError")
  })
})
