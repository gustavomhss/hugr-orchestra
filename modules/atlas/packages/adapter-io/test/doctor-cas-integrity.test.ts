// @atlas/adapter-io — test/doctor-cas-integrity.test.ts  (ADR-0022 — the CAS integrity leg)
//
// A content-addressed object's filename IS the hash of its bytes, so every fault this leg reports can be
// PLANTED exactly, on a real directory, and observed through the real reader. There is no fixture-vs-reality
// gap to argue about here — which is the whole reason this check is worth shipping.
//
// The discipline every case follows: plant ONE fault, assert the leg names THAT bucket, and assert the other
// buckets stay empty. A detector that reported every object as corrupt would satisfy a suite that only ever
// checked "corrupt is non-empty", and would then be useless on the first real store it ran against.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore } from "../src/store.js"
import { createDoctorSource } from "../src/doctor-source.js"
import type { RevIndex } from "../src/rev-index.js"

let dir: string
let cas: string

/** The leg under test needs no index: `casAudit` reads bytes and the projection, nothing else. The other
 *  legs are not exercised here, so a RevIndex that answers nothing is honest rather than a stub-in-disguise. */
const noIndex = { at: () => undefined } as unknown as RevIndex

const audit = () => createDoctorSource(createDiskStore(cas), noIndex, () => true, cas).casAudit()

/** Store an object through the REAL put, so its address is minted by the same seam the audit re-derives. */
const put = (obj: Record<string, unknown>): string => createDiskStore(cas).put(obj as never)

/** Publish a projection referencing exactly `hashes` — the referenced set the audit reconciles against. */
const project = (hashes: readonly string[]): void => {
  createDiskStore(cas).persistProjection({ current: new Map(), cas: new Set(hashes) })
}

const pathOf = (h: string): string => join(cas, h.slice(0, 2), h)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-casaudit-"))
  cas = join(dir, ".atlas", "cas")
  mkdirSync(cas, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("the healthy case, which every fault case is measured against", () => {
  it("CONTROL: two stored, two referenced — sound, and nothing in any fault bucket", () => {
    const a = put({ v: "alpha" })
    const b = put({ v: "beta" })
    project([a, b])
    const r = audit()
    expect(r).toMatchObject({ objects: 2, referenced: 2, orphan: 0, sound: true })
    expect([...r.corrupt, ...r.unreadable, ...r.missing]).toEqual([])
  })
})

describe("corrupt — the bytes no longer hash to the address they are filed under", () => {
  it("NAMES the tampered object, and only it", () => {
    const good = put({ v: "alpha" })
    const bad = put({ v: "beta" })
    project([good, bad])
    // A payload edit that keeps the file valid JSON: the address is now a lie, and nothing else is wrong.
    writeFileSync(pathOf(bad), JSON.stringify({ v: "tampered" }), "utf8")

    const r = audit()
    expect(r.corrupt).toEqual([bad])
    expect(r.unreadable).toEqual([])
    expect(r.missing).toEqual([])
    expect(r.sound).toBe(false)
    expect(r.objects).toBe(2) // still present — corrupt is not missing
  })

  it("a WHITESPACE-only rewrite of the same object is NOT corrupt (the address is over the VALUE)", () => {
    // The check must not degrade into a byte-comparison of the file. `id()` canonicalizes first, so
    // re-serialising the same value differently is not tampering — and a detector that called it tampering
    // would cry wolf on every legitimate re-write and be switched off.
    const h = put({ v: "alpha" })
    project([h])
    writeFileSync(pathOf(h), JSON.stringify(JSON.parse(readFileSync(pathOf(h), "utf8")), null, 2), "utf8")
    expect(audit()).toMatchObject({ corrupt: [], sound: true })
  })
})

describe("unreadable — the bytes are not an object at all", () => {
  it("is reported SEPARATELY from corrupt: a truncated write and a tampered payload are different incidents", () => {
    const good = put({ v: "alpha" })
    const torn = put({ v: "beta" })
    project([good, torn])
    writeFileSync(pathOf(torn), '{"v":"bet', "utf8") // an interrupted write

    const r = audit()
    expect(r.unreadable).toEqual([torn])
    expect(r.corrupt).toEqual([])
    expect(r.sound).toBe(false)
  })
})

describe("missing — a reference with nothing behind it", () => {
  it("NAMES the dangling hash", () => {
    const present = put({ v: "alpha" })
    const gone = put({ v: "beta" })
    project([present, gone])
    rmSync(pathOf(gone))

    const r = audit()
    expect(r.missing).toEqual([gone])
    expect(r.objects).toBe(1)
    expect(r.referenced).toBe(2)
    expect(r.sound).toBe(false)
  })
})

describe("orphan — present, unreferenced, and NOT a fault", () => {
  it("is counted and does NOT make the store unsound", () => {
    // The CAS is append-only and content-keyed, so a superseded object outliving its sidecar is ordinary.
    // If `orphan` fed `sound`, every real store would read unsound and the flag would mean nothing.
    const kept = put({ v: "alpha" })
    put({ v: "superseded" })
    project([kept])

    const r = audit()
    expect(r).toMatchObject({ objects: 2, referenced: 1, orphan: 1, sound: true })
  })
})

describe("totality — this is the leg you run WHEN things are broken", () => {
  it("an ABSENT cas root is an honest zero receipt, not a throw", () => {
    rmSync(cas, { recursive: true, force: true })
    expect(existsSync(cas)).toBe(false)
    expect(() => audit()).not.toThrow()
    expect(audit()).toMatchObject({ objects: 0, referenced: 0, sound: true })
  })

  it("NO casPath at all (an embedder that did not supply one) is an honest zero, not a crash", () => {
    const r = createDoctorSource(createDiskStore(cas), noIndex, () => true).casAudit()
    expect(r).toMatchObject({ objects: 0, referenced: 0, orphan: 0, sound: true })
  })

  it("an absent root with LIVE references still reports the references as missing, not as health", () => {
    // The anti-vacuity case. An empty walk plus a non-empty referenced set must NOT read as `sound` — that
    // would be the instrument reporting a clean bill of health for a store it could not open.
    const h = put({ v: "alpha" })
    project([h])
    rmSync(join(cas, h.slice(0, 2)), { recursive: true, force: true })
    const r = audit()
    expect(r.missing).toEqual([h])
    expect(r.sound).toBe(false)
  })
})

describe("provenance comes FIRST — the totality is about the filesystem, not about trust", () => {
  it("a REFUSED store makes the leg throw, rather than reporting the walk it could still do", () => {
    // The first cut skipped this guard, arguing an audit of the STORAGE must not fail where the fault is.
    // The refutation: this leg reads `loadProjection()` for `referenced`, so on a refused store it would
    // report the objects it walked against `referenced: 0` — rendering as a large orphan count and
    // `sound=true`, a clean bill of health for state the read doors declined to serve. The CLI converts the
    // throw into the same structured non-zero outcome every other doctor refusal renders
    // (`packages/cli/test/doctor-provenance-total.test.ts`).
    const a = put({ v: "alpha" })
    project([a])
    const refusing = createDoctorSource(createDiskStore(cas), noIndex, () => false, cas)
    expect(() => refusing.casAudit()).toThrow(/untrusted-store/)
  })

  it("and the CONTROL: the same store, trusted, audits clean", () => {
    const a = put({ v: "alpha" })
    project([a])
    expect(audit()).toMatchObject({ objects: 1, referenced: 1, sound: true })
  })
})
