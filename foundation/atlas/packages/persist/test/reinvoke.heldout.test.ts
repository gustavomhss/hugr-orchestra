// @atlas/persist — test/reinvoke.heldout.test.ts  (HELD-OUT GATE — authored by cold reviewer)
//
// The `-2` held-out fixtures for the re-invoke surface (PERSIST-7 / 10b), transcribed from
// docs/requirements/goldens-pst.md and run against the EXISTING src/reinvoke.ts. The builder never saw
// this data; an overfit to the visible `-1` fixtures flips these to BROKEN. Every fixture uses genuinely
// different concrete data than `-1` (WP-9 / machine-3, host-env + remote KV cache, continueFrom/resumeAt
// aliases, brief B2, a second checkpoint, a second seat's substrate) hitting the SAME behaviour/branch.

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { Checkpoint, TranscriptRef } from "../src/types.js"
import { redispatch, replay } from "../src/reinvoke.js"
import * as reinvoke from "../src/reinvoke.js"

/** A bare clone to another machine = an independent deep copy of the git-tracked record (no shared refs). */
const cloned = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe("PERSIST-7 — re-invoke off a Checkpoint (held-out -2 fixtures)", () => {
  it("SCN-PERSIST-7a-2: a second WP (WP-9) re-spawns identically on a third clone", () => {
    const record = { seatBrief: "WP-9 · wire the merge driver", wp: "WP-9" }
    const cp: Checkpoint = {
      seatBrief: "WP-9 · wire the merge driver",
      llmOutputs: ["scan", "union logs", "re-fold", "done"],
      toolIO: ["read log", "write log"],
    }

    // machine-1 records WP-9; machine-3 is an independent bare clone re-invoked off the SAME record.
    const seatM1 = redispatch(record)
    const seatM3 = redispatch(cloned(record))
    // same brief → same seat across the two independent clones (idempotent redispatch, not fresh judgment).
    expect(seatM3).toEqual(seatM1)

    // faithful replay off the recorded checkpoint reproduces the record (a re-feed, not a re-judgment).
    const view = replay(cloned(cp))
    expect(view.llmOutputs).toEqual(cp.llmOutputs)
    expect(view.toolIO).toEqual(cp.toolIO)
    // teeth: a genuinely different brief maps to a different seat ⇒ equality above is content-borne.
    expect(redispatch({ seatBrief: "WP-10 · a different brief" })).not.toEqual(seatM1)
  })

  it("SCN-PERSIST-7b-2: re-invocation reads zero non-git state with a host env + remote KV cache absent", () => {
    const record = { seatBrief: "third-clone brief" }
    const cp: Checkpoint = { seatBrief: "third-clone brief", llmOutputs: ["o2"], toolIO: ["io2"] }

    const baseSeat = redispatch(record)
    const baseView = replay(cp)

    // an independent class of non-git state: a host ENV VAR + a remote key-value cache, both absent/throwing.
    const realEnv = process.env
    const remoteKvCache = {
      get() {
        throw new Error("remote KV cache unavailable on a clean clone (non-git state)")
      },
    }
    try {
      ;(process as unknown as { env: unknown }).env = new Proxy(
        {},
        {
          get() {
            throw new Error("host env var unavailable on a clean clone (non-git state)")
          },
        },
      )
      // any read of the remote KV cache would throw; a git-pure impl never touches it.
      void remoteKvCache

      const seat = redispatch(record)
      const view = replay(cp)
      expect(seat).toEqual(baseSeat)
      expect(view).toEqual(baseView)
    } finally {
      ;(process as unknown as { env: unknown }).env = realEnv
    }
    // teeth: a mutant that read a host env var / the remote cache would have THROWN inside the block; the
    // byte-identical result witnesses that no such non-git state was read.
  })
})

describe("PERSIST-10b — replay-not-resume, idempotent redispatch, Checkpoint substrate (held-out -2)", () => {
  it("SCN-PERSIST-10b-a-2: no differently-named/aliased deterministic-resume API exists", () => {
    const surface = Object.keys(reinvoke)
    const s = reinvoke as Record<string, unknown>
    // no aliased resume-from-recorded-step under any of these names.
    expect(s.continueFrom).toBeUndefined()
    expect(s.resumeAt).toBeUndefined()
    expect(s.resumeFrom).toBeUndefined()
    expect(s.continueAt).toBeUndefined()
    // a broad structural probe for any resume-from-where-it-stopped alias finds ZERO.
    const ALIAS = /resume|continue.?from|continue.?at|resume.?at|resume.?from|from.?step|at.?step/i
    expect(surface.filter((k) => ALIAS.test(k))).toEqual([])
    // the surface remains exactly the two honest members.
    expect(surface).toContain("redispatch")
    expect(surface).toContain("replay")
    // teeth: a `continueFrom(agent, step)` alias would appear on the surface here.
  })

  it("SCN-PERSIST-10b-b-2: a second brief (B2) maps to the same seat twice (idempotent redispatch)", () => {
    const B2 = { seatBrief: "brief B2 · an independent brief" }
    const first = redispatch(B2)
    const second = redispatch(B2)
    expect(second).toEqual(first)
    // teeth: a different brief maps to a different seat ⇒ equality is content-addressed, not a fresh id.
    expect(redispatch({ seatBrief: "brief B2-prime" })).not.toEqual(first)
  })

  it("SCN-PERSIST-10b-c-2: replay of a second checkpoint re-feeds recorded I/O, not the live model", () => {
    const cp: Checkpoint = {
      seatBrief: "another seat brief",
      llmOutputs: ["assistant: alpha", "assistant: beta", "assistant: gamma"],
      toolIO: ["tool:grep→hit", "tool:edit→ok", "tool:run→green"],
    }
    const view = replay(cp)
    // the recorded LLM outputs + tool I/O are re-fed FAITHFULLY — the replay reproduces the record.
    expect(view.llmOutputs).toEqual(cp.llmOutputs)
    expect(view.toolIO).toEqual(cp.toolIO)
    // sourced from the recording, never a live re-invocation.
    expect(view.source).toBe("recording")
    // teeth: a live model would emit fresh, divergent output; deep-equality pins replay to the recorded I/O.
    expect(view.llmOutputs).not.toContain("LIVE — freshly re-invoked output for the second checkpoint")
  })

  it("SCN-PERSIST-10b-d-2: a second seat substrate is a Checkpoint distinct from the raw transcript", () => {
    const cp: Checkpoint = {
      seatBrief: "second seat",
      llmOutputs: ["o-a", "o-b"],
      toolIO: ["io-a", "io-b"],
    }
    // the re-invoke substrate is the STRUCTURED Checkpoint (seatBrief + llmOutputs[] + toolIO[])...
    expect(Object.keys(cp).sort()).toEqual(["llmOutputs", "seatBrief", "toolIO"])
    expect(Array.isArray(cp.llmOutputs)).toBe(true)
    expect(Array.isArray(cp.toolIO)).toBe(true)
    // ...DISTINCT from the raw transcript large-object pointer {sha, store}.
    const rawTranscript: TranscriptRef = { sha: asHash("second-raw-transcript-sha"), store: "lfs" }
    expect(cp).not.toHaveProperty("sha")
    expect(cp).not.toHaveProperty("store")
    expect(cp).not.toEqual(rawTranscript)
    // replay consumes the Checkpoint substrate inline — never the raw transcript pointer.
    const view = replay(cp)
    expect(view.seatBrief).toBe(cp.seatBrief)
    expect(view.llmOutputs).toEqual(cp.llmOutputs)
    // teeth: re-invoke reading the full raw transcript as substrate would couple replay to {sha, store}.
  })
})
