// @atlas/persist — test/wp-3.4-b.hostadapter-placement.test.ts
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for WP-3.4-b.PERSIST: the forge-agnostic host adapter
// (PERSIST-8, oracle `HostAdapterApi`) and the trailer-vs-note placement model (PERSIST-13, oracle
// `PlacementApi`). Facets are imported DIRECTLY from `../src/*.js` (the barrel is wired by the lead at
// SEAL). Identity uses the SEALED @atlas/kernel `asHash` brand — never a hand-rolled digest. Held-out `-2`
// fixtures are NOT transcribed here (the GATE runs those).

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { Dossier, PrAttach } from "../src/types.js"
import { makeHostAdapter, directForgeCalls, pushCarriesNotes, ADAPTER_VIA } from "../src/host-adapter.js"
import type { Forge, ForgeCall } from "../src/host-adapter.js"
import { makePlacement, place, commit, rewrite, noteOrphaned, readAfterBareClone } from "../src/placement.js"

// A fake forge = one host impl. git-side ops persist commit trailer+note (a clone copies them); host-side
// ops persist the PR projection (a bare clone does NOT fetch it). Every op records its `via` tag.
function makeFakeForge(): Forge {
  const commits = new Map<string, { trailer: string; note: string }>()
  const prs = new Map<string, string>()
  const refspecs: string[] = []
  const log: ForgeCall[] = []
  const forge: Forge = {
    writeCommit(sha, trailer, note, via) {
      log.push({ op: "writeCommit", via })
      commits.set(sha, { trailer, note })
    },
    readTrailer(sha, via) {
      log.push({ op: "readTrailer", via })
      return commits.get(sha)?.trailer ?? null
    },
    readNote(sha, via) {
      log.push({ op: "readNote", via })
      return commits.get(sha)?.note ?? null
    },
    writePR(prId, body, via) {
      log.push({ op: "writePR", via })
      prs.set(prId, body)
    },
    readPRBody(prId, via) {
      log.push({ op: "readPRBody", via })
      return prs.get(prId) ?? null
    },
    configurePush(refspec, via) {
      log.push({ op: "configurePush", via })
      refspecs.push(refspec)
    },
    pushRefspecs() {
      return [...refspecs]
    },
    hostSidePRCount() {
      return prs.size
    },
    bareClone() {
      // a bare git clone copies git-side commit objects, but NOT the host-side PR surface or refspecs.
      const clone = makeFakeForge()
      for (const [sha, c] of commits) clone.writeCommit(sha, c.trailer, c.note, ADAPTER_VIA)
      return clone
    },
    calls() {
      return [...log]
    },
  }
  return forge
}

const aDossier: Dossier = {
  trailer: {
    WP: "WP-3.4-b.PERSIST",
    Model: "opus",
    Gates: "typecheck,vitest",
    Verdict: "PASS",
    TranscriptSha: asHash("transcript-sha-1"),
  },
  metering: {
    model: "opus",
    tokensIn: 1,
    tokensOut: 2,
    tokensCache: 3,
    toolUses: 4,
    wallTime: 5,
    retries: 0,
    reworks: 0,
    gates: ["g1"],
    verdict: "PASS",
    transcriptSha: asHash("transcript-sha-1"),
  },
  knowledgeDelta: { added: [{ fact: "f", provenance: "p" }], edited: [], superseded: [], decayed: [] },
}
const aPrAttach: PrAttach = {
  prId: "pr1",
  prMemory: { note: "m" },
  logbookEntry: { e: 1 },
  knowledgeDelta: { added: [] },
}

describe("PERSIST-8 — forge-agnostic host adapter (visible goldens)", () => {
  it("SCN-PERSIST-8a-1: the forge is reached only through the adapter; readPR reconstructs the projection; 0 direct forge calls", () => {
    const forge = makeFakeForge()
    const adapter = makeHostAdapter(forge)
    adapter.attachToCommit("sha1", aDossier)
    expect(adapter.readCommit("sha1")).toEqual(aDossier) // round-trips through the single adapter impl
    adapter.attachToPR("pr1", aPrAttach)
    expect(adapter.readPR("pr1")).toEqual(aPrAttach) // readPR reconstructs the projection
    expect(directForgeCalls(forge)).toEqual([]) // every forge interaction went through the adapter
    // teeth (breaks-on "a caller reaches the forge API directly, bypassing the adapter"):
    forge.readPRBody("pr1", "rogue-caller")
    expect(directForgeCalls(forge).length).toBeGreaterThan(0)
    // readCommit/readPR are TOTAL: a missing note/attachment ⇒ null, never a throw.
    expect(adapter.readCommit("absent")).toBeNull()
    expect(adapter.readPR("absent")).toBeNull()
  })

  it("SCN-PERSIST-8b-1: the adapter push refspec carries refs/notes/*", () => {
    const forge = makeFakeForge()
    const adapter = makeHostAdapter(forge)
    expect(pushCarriesNotes(forge)).toBe(false) // before configuration git pushes no notes
    adapter.configurePushRefspec()
    expect(pushCarriesNotes(forge)).toBe(true) // teeth: omitting refs/notes/* ⇒ notes never leave the repo
    expect(forge.pushRefspecs().some((r) => r.includes("refs/notes/"))).toBe(true)
  })

  it("SCN-PERSIST-8c-1: a bare clone fetches zero host-side PR data; the projection reconstructs from git source", () => {
    const forge = makeFakeForge()
    const adapter = makeHostAdapter(forge)
    adapter.attachToCommit("sha1", aDossier) // git-side canonical
    adapter.attachToPR("pr1", aPrAttach) // host-side projection
    expect(forge.hostSidePRCount()).toBe(1)
    const cloned = forge.bareClone()
    expect(cloned.hostSidePRCount()).toBe(0) // teeth: a bare clone stores 0 host-side PR data
    const clonedAdapter = makeHostAdapter(cloned)
    expect(clonedAdapter.readCommit("sha1")).toEqual(aDossier) // canonical dossier reconstructs from git source
    expect(clonedAdapter.readPR("pr1")).toBeNull() // the PR was a projection, never canonical
  })
})

describe("PERSIST-13 — trailers canonical, notes a mutable overlay (visible goldens)", () => {
  const dHash = asHash("datum-D")

  it("SCN-PERSIST-13a-1: a clone-required datum reads from the trailer after a bare clone", () => {
    const model = makePlacement(new Set([dHash]))
    expect(model.home(dHash)).toBe("trailer") // clone-required ⇒ trailer
    expect(place(true)).toBe("trailer")
    const trailer = { D: "value-of-D" }
    const c = commit("SHA1", trailer)
    trailer.D = "mutated-after-commit"
    expect(readAfterBareClone(c, "D", false)).toEqual({ from: "trailer", value: "value-of-D" })
    // teeth (breaks-on "D is stored only in a git note — a bare clone with no refspec has no D"):
    const noteOnly = commit("SHA1", {}, { D: "value-of-D" })
    expect(readAfterBareClone(noteOnly, "D", false)).toBeNull()
  })

  it("SCN-PERSIST-13b-1: the trailer travels onto the rewritten SHA", () => {
    const c = commit("SHA1", { D: "value-of-D" }, { N: "note-val" })
    const c2 = rewrite(c, "SHA2")
    expect(c2.sha).toBe("SHA2")
    // teeth (breaks-on "the rewrite drops the trailer"): D survives on the new SHA.
    expect(readAfterBareClone(c2, "D", false)).toEqual({ from: "trailer", value: "value-of-D" })
  })

  it("SCN-PERSIST-13c-1: note-carried data is absent until the refspec is configured", () => {
    const c = commit("SHA1", {}, { N: "note-val" })
    // teeth (breaks-on "note-carried data marked clone-present without a configured refspec"):
    expect(readAfterBareClone(c, "N", false)).toBeNull()
    expect(readAfterBareClone(c, "N", true)).toEqual({ from: "note", value: "note-val" })
  })

  it("SCN-PERSIST-13d-1: a rewrite orphans the note (it keys on the old SHA)", () => {
    const c = commit("SHA1", { D: "v" }, { N: "note-val" })
    expect(noteOrphaned(c)).toBe(false)
    const c2 = rewrite(c, "SHA2")
    // teeth (breaks-on "the model carries the note onto SHA2"): the note keyed on SHA1 is orphaned.
    expect(noteOrphaned(c2)).toBe(true)
    expect(readAfterBareClone(c2, "N", /* even with refspec */ true)).toBeNull()
  })
})
