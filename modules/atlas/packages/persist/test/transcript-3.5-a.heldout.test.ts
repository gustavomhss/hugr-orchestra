// @atlas/persist — test/transcript-3.5-a.heldout.test.ts  (WP-3.5-a.PERSIST · HELD-OUT GATE)
//
// COLD-REVIEW held-out gate. Transcribes the `-2` goldens (NOT seen by the builder) against the EXISTING
// src. The `-2` credential is a DIFFERENT secret (ghp_9Q8W7E6R5T4Y) in DIFFERENT contexts — a PASS proves
// scrub matches by SHAPE and generalizes; a FAIL proves the scrub overfit the visible `-1` fixture literal.
// Source: docs/requirements/goldens-pst.md SCN-PERSIST-10a-2 / 10-b-2 / 10-c-2 / 10-d-2 / 10a-a-2 / 10a-b-2 / 10a-e-2.

import { describe, it, expect } from "vitest"
import type { TranscriptRef } from "../src/types.js"
import { createTranscriptStore, mitigate, reverse, toGitPointer } from "../src/transcript-store.js"
import { scrub, admitToBuffer } from "../src/scrub.js"

const enc = new TextEncoder()
const dec = new TextDecoder()
function occurrences(bytes: Uint8Array, needle: string): number {
  return dec.decode(bytes).split(needle).length - 1
}

const SECRET2 = "ghp_9Q8W7E6R5T4Y"
const SECRET1 = "ghp_A1B2C3D4E5F6"

describe("PERSIST-10 held-out — a second transcript round-trips", () => {
  it("SCN-PERSIST-10a-2: fetch(put(T2)) is byte-identical (no lossy compression)", () => {
    const store = createTranscriptStore()
    const T2 = new Uint8Array([
      ...enc.encode("another agent total context\ntool: grep(y)\nbytes 0..255\n"),
      0x00,
      0xff,
      0x7f,
    ])
    const got = store.fetch(toGitPointer(store.put(T2)))
    expect(Array.from(got)).toEqual(Array.from(T2))
    expect(got.length).toBe(T2.length)
  })

  it("SCN-PERSIST-10-b-2: T2 body is fetch-on-demand; git holds only {sha, store}", () => {
    const store = createTranscriptStore()
    const T2 = enc.encode("SECOND-BODY-MARKER a distinct large body — ".repeat(48))
    const ptr: TranscriptRef = toGitPointer(store.put(T2))
    expect(Object.keys(ptr).sort()).toEqual(["sha", "store"])
    expect(ptr.store).toBe("cas")
    expect(JSON.stringify(ptr)).not.toContain("SECOND-BODY-MARKER")
    expect(store.fetch(ptr)).toEqual(T2)
  })

  it("SCN-PERSIST-10-c-2: git carries only T2 content-hash pointer, not body", () => {
    const store = createTranscriptStore()
    const T2 = enc.encode("secretless second payload MARKER-QRS end")
    const h = store.put(T2)
    const ptr = toGitPointer(h)
    expect(ptr.sha).toBe(h)
    expect(JSON.stringify(ptr)).not.toContain("MARKER-QRS")
    expect(store.fetch(ptr)).toEqual(T2)
  })

  it("SCN-PERSIST-10-d-2: a second size mitigation is lossless and reversible", () => {
    const T2 = enc.encode("second body with trailing whitespace to mitigate   \t \n")
    const back = reverse(mitigate(T2))
    expect(Array.from(back)).toEqual(Array.from(T2))
    expect(back.length).toBe(T2.length)
  })
})

describe("PERSIST-10a held-out — a DIFFERENT credential is caught by SHAPE", () => {
  it("SCN-PERSIST-10a-a-2: second seeded credential never reaches the CAS object", () => {
    const store = createTranscriptStore()
    const seeded = enc.encode(`Authorization: token ${SECRET2}`)
    const stored = store.fetch(toGitPointer(store.put(scrub(seeded))))
    expect(occurrences(stored, SECRET2)).toBe(0)
    expect(dec.decode(stored)).not.toContain(SECRET2)
    expect(dec.decode(stored)).not.toContain("ghp_")
  })

  it("SCN-PERSIST-10a-b-2: buffer never admits the second raw credential (redact-at-source)", () => {
    let buffer: Uint8Array = new Uint8Array(0)
    buffer = admitToBuffer(buffer, enc.encode(`about to write ${SECRET2} into transcript`))
    expect(occurrences(buffer, SECRET2)).toBe(0)
    expect(dec.decode(buffer)).not.toContain(SECRET2)
    expect(dec.decode(buffer)).toContain("about to write")
    expect(dec.decode(buffer)).toContain("into transcript")
  })

  it("SCN-PERSIST-10a-e-2: non-secret bytes adjacent to the second secret are preserved", () => {
    const buf = enc.encode(`... Authorization: Bearer ${SECRET2} issued at 09:14 UTC ...`)
    const text = dec.decode(scrub(buf))
    expect(text).not.toContain(SECRET2)
    expect(text).toContain("Authorization: Bearer ")
    expect(text).toContain("issued at 09:14 UTC")
    expect(text).toBe("... Authorization: Bearer [REDACTED] issued at 09:14 UTC ...")
  })

  it("shape-family control: an UNSEEN gho_ family token is caught, and fixture-1 too", () => {
    const other = "gho_ZzYyXxWw112233"
    expect(dec.decode(scrub(enc.encode(`x ${other} y`)))).toBe("x [REDACTED] y")
    expect(dec.decode(scrub(enc.encode(`x ${SECRET1} y`)))).toBe("x [REDACTED] y")
  })
})
