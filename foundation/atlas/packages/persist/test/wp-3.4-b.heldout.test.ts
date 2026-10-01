// @atlas/persist — test/wp-3.4-b.heldout.test.ts
//
// COLD-REVIEW HELD-OUT GATE (author was BLINDED to these). The `-2` (held_out:true) goldens for
// WP-3.4-b.PERSIST: SCN-PERSIST-8a-2 / 8b-2 / 8c-2 (host adapter, a SECOND host shape) and
// 13a-2 / 13b-2 / 13c-2 / 13d-2 (placement — independent data + independent rewrite op: squash,
// cherry-pick). Run against the EXISTING src facets, unmodified. Independent concrete data, SAME
// behaviour/branch as the visible siblings — not clones.

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { Dossier, PrAttach } from "../src/types.js"
import { makeHostAdapter, directForgeCalls, pushCarriesNotes, ADAPTER_VIA } from "../src/host-adapter.js"
import type { Forge, ForgeCall } from "../src/host-adapter.js"
import { makePlacement, place, commit, rewrite, noteOrphaned, readAfterBareClone } from "../src/placement.js"

// A SECOND host shape (a different forge impl — e.g. its review-thread endpoint). Same port contract.
function makeGitlabishForge(): Forge {
  const commits = new Map<string, { trailer: string; note: string }>()
  const prs = new Map<string, string>()
  const refspecs: string[] = []
  const log: ForgeCall[] = []
  const forge: Forge = {
    writeCommit(sha, trailer, note, via) {
      log.push({ op: "mr-writeCommit", via })
      commits.set(sha, { trailer, note })
    },
    readTrailer(sha, via) {
      log.push({ op: "mr-readTrailer", via })
      return commits.get(sha)?.trailer ?? null
    },
    readNote(sha, via) {
      log.push({ op: "mr-readNote", via })
      return commits.get(sha)?.note ?? null
    },
    writePR(prId, body, via) {
      log.push({ op: "mr-writeMR", via })
      prs.set(prId, body)
    },
    readPRBody(prId, via) {
      log.push({ op: "mr-readMRBody", via })
      return prs.get(prId) ?? null
    },
    configurePush(refspec, via) {
      log.push({ op: "mr-configurePush", via })
      refspecs.push(refspec)
    },
    pushRefspecs() {
      return [...refspecs]
    },
    hostSidePRCount() {
      return prs.size
    },
    bareClone() {
      const clone = makeGitlabishForge()
      for (const [sha, c] of commits) clone.writeCommit(sha, c.trailer, c.note, ADAPTER_VIA)
      return clone
    },
    calls() {
      return [...log]
    },
  }
  return forge
}

// Independent dossier/attachment (different concrete values than the visible fixture).
const bDossier: Dossier = {
  trailer: {
    WP: "WP-9",
    Model: "sonnet",
    Gates: "lint,typecheck,vitest",
    Verdict: "FAIL",
    TranscriptSha: asHash("transcript-sha-9"),
  },
  metering: {
    model: "sonnet",
    tokensIn: 10,
    tokensOut: 20,
    tokensCache: 30,
    toolUses: 40,
    wallTime: 50,
    retries: 2,
    reworks: 1,
    gates: ["g-lint", "g-tc"],
    verdict: "FAIL",
    transcriptSha: asHash("transcript-sha-9"),
  },
  knowledgeDelta: { added: [{ fact: "f2", provenance: "p2" }], edited: [], superseded: [], decayed: [] },
}
const bPrAttach: PrAttach = {
  prId: "mr42",
  prMemory: { thread: ["a", "b"] },
  logbookEntry: { step: 7, ok: false },
  knowledgeDelta: { added: [{ fact: "k", provenance: "q" }] },
}

describe("PERSIST-8 held-out — a SECOND host is reached only through its adapter", () => {
  it("SCN-PERSIST-8a-2: second host forge reached only through the adapter; 0 direct forge calls", () => {
    const forge = makeGitlabishForge()
    const adapter = makeHostAdapter(forge)
    adapter.attachToCommit("shaB", bDossier)
    expect(adapter.readCommit("shaB")).toEqual(bDossier)
    adapter.attachToPR("mr42", bPrAttach)
    expect(adapter.readPR("mr42")).toEqual(bPrAttach)
    expect(directForgeCalls(forge)).toEqual([])
    forge.readPRBody("mr42", "rogue-caller") // a caller reaches the second host's forge directly
    expect(directForgeCalls(forge).length).toBeGreaterThan(0)
    expect(adapter.readCommit("nope")).toBeNull()
    expect(adapter.readPR("nope")).toBeNull()
  })

  it("SCN-PERSIST-8b-2: the second host adapter push carries refs/notes/*", () => {
    const forge = makeGitlabishForge()
    const adapter = makeHostAdapter(forge)
    expect(pushCarriesNotes(forge)).toBe(false)
    adapter.configurePushRefspec()
    expect(pushCarriesNotes(forge)).toBe(true)
    expect(forge.pushRefspecs().some((r) => r.includes("refs/notes/"))).toBe(true)
  })

  it("SCN-PERSIST-8c-2: a bare clone of the second host fetches zero host-side PR data", () => {
    const forge = makeGitlabishForge()
    const adapter = makeHostAdapter(forge)
    adapter.attachToCommit("shaB", bDossier)
    adapter.attachToPR("mr42", bPrAttach)
    expect(forge.hostSidePRCount()).toBe(1)
    const cloned = forge.bareClone()
    expect(cloned.hostSidePRCount()).toBe(0)
    const clonedAdapter = makeHostAdapter(cloned)
    expect(clonedAdapter.readCommit("shaB")).toEqual(bDossier)
    expect(clonedAdapter.readPR("mr42")).toBeNull()
  })
})

describe("PERSIST-13 held-out — independent data + independent rewrite ops", () => {
  const d2 = asHash("datum-D2-verdict")

  it("SCN-PERSIST-13a-2: a second clone-required datum reads from the trailer after a bare clone", () => {
    const model = makePlacement(new Set([d2]))
    expect(model.home(d2)).toBe("trailer")
    expect(place(true)).toBe("trailer")
    const c = commit("SHAa", { D2: "verdict=PASS" })
    expect(readAfterBareClone(c, "D2", false)).toEqual({ from: "trailer", value: "verdict=PASS" })
    const noteOnly = commit("SHAa", {}, { D2: "verdict=PASS" })
    expect(readAfterBareClone(noteOnly, "D2", false)).toBeNull()
  })

  it("SCN-PERSIST-13b-2: the trailer travels onto a SQUASH-rewritten SHA", () => {
    const c = commit("SHA3", { D2: "verdict=PASS" }, { N2: "n" })
    const c4 = rewrite(c, "SHA4") // squash mints a fresh SHA
    expect(c4.sha).toBe("SHA4")
    expect(readAfterBareClone(c4, "D2", false)).toEqual({ from: "trailer", value: "verdict=PASS" })
  })

  it("SCN-PERSIST-13c-2: a second note-carried datum is absent until the refspec is configured", () => {
    const c = commit("SHAc", {}, { N2: "note-2" })
    expect(readAfterBareClone(c, "N2", false)).toBeNull()
    expect(readAfterBareClone(c, "N2", true)).toEqual({ from: "note", value: "note-2" })
  })

  it("SCN-PERSIST-13d-2: a CHERRY-PICK rewrite orphans the note (it keys on the old SHA)", () => {
    const c = commit("SHA3", { D2: "v" }, { N2: "note-2" })
    expect(noteOrphaned(c)).toBe(false)
    const c4 = rewrite(c, "SHA4") // cherry-pick mints a fresh SHA
    expect(noteOrphaned(c4)).toBe(true)
    expect(readAfterBareClone(c4, "N2", true)).toBeNull()
  })
})
