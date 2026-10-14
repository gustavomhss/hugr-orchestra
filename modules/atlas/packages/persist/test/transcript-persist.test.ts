// @atlas/persist — test/transcript-persist.test.ts  (WP-3.5-a.PERSIST)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the content-addressed large-object transcript
// store (PERSIST-10) and the redact-at-source scrub oracle (PERSIST-10a). Facets are imported DIRECTLY
// from ../src/*.js (the barrel is wired by the lead at SEAL). Content-addressing goes through the SEALED
// @atlas/kernel `id` seam — never a hand-rolled digest. Golden ids are SYMBOLIC, so assertions are
// RELATIONAL / round-trip, never a specific hex digest. Held-out `-2` fixtures are NOT transcribed (the
// execution GATE runs those). The ≥2-engine scanner architecture (10a-c / 10a-d) is billy/FR-12 — not here.

import { describe, it, expect } from "vitest"
import type { ScrubApi } from "../src/scrub.js"
import type { Transcript, TranscriptStoreApi } from "../src/transcript-store.js"
import type { TranscriptRef } from "../src/types.js"
import { createTranscriptStore, mitigate, reverse, toGitPointer } from "../src/transcript-store.js"
import { scrub, admitToBuffer } from "../src/scrub.js"

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Count raw-secret occurrences in a stored/buffered byte body (fixtures are ASCII text). */
function occurrences(bytes: Uint8Array, needle: string): number {
  return dec.decode(bytes).split(needle).length - 1
}

describe("PERSIST-10 — lossless content-addressed large-object transcript (visible goldens)", () => {
  it("SCN-PERSIST-10a-1: the transcript round-trips byte-for-byte", () => {
    const store = createTranscriptStore()
    // the raw, unadulterated total context of the agent
    const T = enc.encode("seat brief\nLLM: reasoned\ntool: read(x)\nresult: 0..255 bytes retained in full\n")

    const h = store.put(T)
    const got = store.fetch(toGitPointer(h))

    // fetch(put(T)) ≡ T byte-identical — never truncated, never lossily compressed.
    expect(got).toEqual(T)
    expect(Array.from(got)).toEqual(Array.from(T))
    // teeth (breaks-on "`put` truncates `T` to an N-KB cap — `fetch` returns a prefix ≠ `T`"):
    expect(got.length).toBe(T.length)
  })

  it("SCN-PERSIST-10-b-1: the body is a fetch-on-demand large object; git holds only {sha, store}", () => {
    const store = createTranscriptStore()
    const T = enc.encode("a large transcript body — ".repeat(64))

    const h = store.put(T)
    const gitPtr: TranscriptRef = toGitPointer(h)

    // git holds ONLY the pointer {sha, store} — not the body.
    expect(Object.keys(gitPtr).sort()).toEqual(["sha", "store"])
    expect(gitPtr.store).toBe("cas")
    // the full, lossless body resolves from the content-addressed store on demand.
    expect(store.fetch(gitPtr)).toEqual(T)
    // teeth (breaks-on "the transcript body is inlined into a git object — no fetch-on-demand pointer"):
    expect(JSON.stringify(gitPtr)).not.toContain("a large transcript body")
  })

  it("SCN-PERSIST-10-c-1: git carries only the content-hash pointer, not the body", () => {
    const store = createTranscriptStore()
    const T = enc.encode("secretless transcript body payload MARKER-XYZ end")

    const h = store.put(T)
    const gitPtr = toGitPointer(h)

    // the git object carries the content hash, not the body.
    expect(gitPtr.sha).toBe(h)
    // teeth (breaks-on "git stores the raw body alongside the pointer — the body lives in git"):
    expect(JSON.stringify(gitPtr)).not.toContain("MARKER-XYZ")
    // yet the body still resolves out-of-band from the large-object store.
    expect(store.fetch(gitPtr)).toEqual(T)
  })

  it("CAS fetch rejects a pointer addressed to another large-object backend", () => {
    const store = createTranscriptStore()
    const h = store.put(enc.encode("backend identity is part of pointer"))

    expect(() => store.fetch({ sha: h, store: "lfs" })).toThrow(/unsupported store lfs/)
    expect(() => store.fetch({ sha: h, store: "partial-clone" })).toThrow(/unsupported store partial-clone/)
  })

  it("SCN-PERSIST-10-d-1: any size mitigation is lossless and reversible", () => {
    const T = enc.encode("a transcript a future size-mitigation transform may touch — 0..255 lossless\n")

    const m = mitigate(T)
    const back = reverse(m)

    // reverse(mitigate(T)) ≡ T byte-identical — the mitigation is lossless and reversible.
    expect(back).toEqual(T)
    expect(Array.from(back)).toEqual(Array.from(T))
    // teeth (breaks-on "the mitigation lossily compresses `T` — reverse(mitigate(T)) ≠ T; bytes lost"):
    expect(back.length).toBe(T.length)
  })
})

describe("PERSIST-10a — no raw credential in the immutable object (visible goldens)", () => {
  const SECRET = "ghp_A1B2C3D4E5F6"

  it("SCN-PERSIST-10a-a-1: a seeded credential never reaches the content-addressed object", () => {
    const store = createTranscriptStore()
    const seeded = enc.encode(`call log: agent used token ${SECRET} at line 7`)

    // scrub runs BEFORE store — store(scrub(seeded)).
    const h = store.put(scrub(seeded))
    const stored = store.fetch(toGitPointer(h))

    // the stored immutable object contains 0 occurrences of the raw credential.
    expect(occurrences(stored, SECRET)).toBe(0)
    // teeth (breaks-on "`scrub` misses the credential's shape — it reaches the immutable object"):
    expect(dec.decode(stored)).not.toContain(SECRET)
  })

  it("SCN-PERSIST-10a-b-1: the transcript buffer never admits the raw credential (redact-at-source)", () => {
    // the framework is about to write the raw credential into the transcript buffer.
    let buffer: Uint8Array = new Uint8Array(0)
    buffer = admitToBuffer(buffer, enc.encode(`about to write ${SECRET} into transcript`))

    // the buffer never admits the raw credential — redacted BEFORE entering, not after persistence.
    expect(occurrences(buffer, SECRET)).toBe(0)
    // teeth (breaks-on "redaction runs only after the buffer is persisted — the raw cred entered first"):
    expect(dec.decode(buffer)).not.toContain(SECRET)
    // the write itself is admitted (redaction, not a dropped write): the non-secret framing survives.
    expect(dec.decode(buffer)).toContain("about to write")
    expect(dec.decode(buffer)).toContain("into transcript")
  })

  it("SCN-PERSIST-10a-e-1: non-secret bytes adjacent to a secret are preserved (0 over-redaction)", () => {
    const buf = enc.encode(`... token=${SECRET} in call log line 42 ...`)

    const text = dec.decode(scrub(buf))

    // every non-secret byte is preserved — only the secret is redacted.
    expect(text).not.toContain(SECRET)
    expect(text).toContain("token=")
    // teeth (breaks-on "`scrub` over-redacts — the adjacent non-secret `line 42` is dropped"):
    expect(text).toContain("in call log line 42")
    // 0 over-redaction: only the secret substring is replaced, everything else byte-identical.
    expect(text).toBe("... token=[REDACTED] in call log line 42 ...")
  })
})

// differential-vs-oracle (compile-time, documentary): the impls conform to the frozen ref surfaces.
const _storeApi: TranscriptStoreApi = createTranscriptStore()
void _storeApi
const _scrubApi: ScrubApi = { scrub }
void _scrubApi
const _t: (b: Uint8Array) => Transcript = (b) =>
  createTranscriptStore().fetch(toGitPointer(createTranscriptStore().put(b)))
void _t
