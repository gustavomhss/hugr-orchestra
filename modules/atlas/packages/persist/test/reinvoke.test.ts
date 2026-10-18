// @atlas/persist — test/reinvoke.test.ts
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the re-invoke surface (PERSIST-7 / 10b): idempotent
// redispatch (same brief → same seat), zero non-git state, no deterministic-resume API, faithful replay of
// the recorded I/O, and the `Checkpoint` substrate distinct from the raw transcript. The facet is imported
// DIRECTLY from ../src/reinvoke.js (the barrel is wired by the lead at SEAL). Seat identity is content-keyed
// over the SEALED @atlas/kernel `id` seam (never a hand-rolled digest), so every assertion is RELATIONAL /
// idempotence-based — never a specific hex digest. Held-out `-2` fixtures are NOT transcribed (GATE runs
// those). A deep git-clone is modelled as a JSON round-trip (an independent copy, no shared refs).

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { Checkpoint, TranscriptRef } from "../src/types.js"
import type { ReinvokeApi } from "../src/reinvoke.js"
import { redispatch, replay } from "../src/reinvoke.js"
import * as reinvoke from "../src/reinvoke.js"
import * as persist from "../src/index.js"

/** A bare clone to another machine = an independent deep copy of the git-tracked record (no shared refs). */
const cloned = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe("PERSIST-7 — ephemeral agent re-invokable off a Checkpoint (visible goldens)", () => {
  it("SCN-PERSIST-7a-1: a WP re-spawns identically on another clone (same brief → same seat + faithful replay)", () => {
    const record = { seatBrief: "WP-7 · build the widget", wp: "WP-7" }
    const cp: Checkpoint = {
      seatBrief: "WP-7 · build the widget",
      llmOutputs: ["plan", "edit a.ts", "done"],
      toolIO: ["read a.ts", "write a.ts"],
    }

    // machine-1 records the WP; machine-2 is a bare clone re-invoked off the SAME git-tracked record.
    const seatM1 = redispatch(record)
    const seatM2 = redispatch(cloned(record))
    // the same brief maps to the SAME seat across the two clones (idempotent redispatch, not fresh judgment).
    expect(seatM2).toEqual(seatM1)

    // the WP is reproduced by faithful replay off the recorded checkpoint (a re-feed, not a re-judgment).
    const view = replay(cloned(cp))
    expect(view.llmOutputs).toEqual(cp.llmOutputs)
    expect(view.toolIO).toEqual(cp.toolIO)

    // teeth (breaks-on "`redispatch` is non-idempotent — the same brief maps to a different seat on
    // machine-2"): a genuinely different brief maps to a different seat, so equality above is content-borne.
    expect(redispatch({ seatBrief: "WP-8 · a different brief" })).not.toEqual(seatM1)
  })

  it("SCN-PERSIST-7b-1: re-invocation reads zero non-git state", () => {
    const record = { seatBrief: "clean-clone brief" }
    const cp: Checkpoint = { seatBrief: "clean-clone brief", llmOutputs: ["o1"], toolIO: ["io1"] }

    // baseline result from a normal environment.
    const baseSeat = redispatch(record)
    const baseView = replay(cp)

    // make every class of NON-GIT state UNAVAILABLE: a clock, entropy, and the host environment/scratch/DB.
    const realNow = Date.now
    const realRandom = Math.random
    const realEnv = process.env
    try {
      Date.now = () => {
        throw new Error("non-git state (clock) unavailable on a clean clone")
      }
      Math.random = () => {
        throw new Error("non-git state (entropy) unavailable on a clean clone")
      }
      // a host env/cache/DB that throws on ANY read models the absent local scratch state.
      ;(process as unknown as { env: unknown }).env = new Proxy(
        {},
        {
          get() {
            throw new Error("non-git env/cache/DB unavailable on a clean clone")
          },
        },
      )

      // re-invocation still SUCCEEDS from the git-tracked source alone — 0 non-git state is read.
      const seat = redispatch(record)
      const view = replay(cp)
      expect(seat).toEqual(baseSeat)
      expect(view).toEqual(baseView)
    } finally {
      Date.now = realNow
      Math.random = realRandom
      ;(process as unknown as { env: unknown }).env = realEnv
    }
    // teeth (breaks-on "`redispatch` reads a local non-git cache — re-invocation fails on a clean clone
    // where that state is absent"): a mutant that consulted the clock/entropy/env would have THROWN inside
    // the block; the byte-identical result witnesses that no such non-git state was read.
  })
})

describe("PERSIST-10b — replay-not-resume, idempotent redispatch, Checkpoint substrate (visible goldens)", () => {
  it("package barrel routes replay to Checkpoint replay, not event-log replay", () => {
    const cp: Checkpoint = { seatBrief: "barrel seat", llmOutputs: ["recorded"], toolIO: ["tool result"] }

    expect(persist.replay(cp)).toEqual(replay(cp))
    expect(persist.replayEvents).toBeTypeOf("function")
  })

  it("SCN-PERSIST-10b-a-1: no deterministic-resume API exists on the surface", () => {
    const RESUME = /resume|continuefrom|resumeat|continue_from|resume_at/i
    const surface = Object.keys(reinvoke)
    // the re-invoke surface offers ZERO member named/typed as a deterministic resume-from-where-it-stopped.
    expect(surface.filter((k) => RESUME.test(k))).toEqual([])
    // the offered surface is exactly redispatch + replay (idempotent redispatch + faithful replay).
    expect(surface).toContain("redispatch")
    expect(surface).toContain("replay")
    // teeth (breaks-on "a `resume(agent)` API claims to continue from exactly where the agent stopped"):
    expect((reinvoke as Record<string, unknown>).resume).toBeUndefined()
    expect((reinvoke as Record<string, unknown>).continueFrom).toBeUndefined()
  })

  it("SCN-PERSIST-10b-b-1: the same brief maps to the same seat twice (idempotent redispatch, A-18)", () => {
    const B = { seatBrief: "brief B" }
    const first = redispatch(B)
    const second = redispatch(B)
    // both invocations map to the SAME seat (idempotent redispatch).
    expect(second).toEqual(first)
    // teeth (breaks-on "`redispatch(B)` yields a different seat on the second call"): a different brief maps
    // to a different seat, so the equality above is content-addressed, not a coincidental fresh id.
    expect(redispatch({ seatBrief: "brief B-prime" })).not.toEqual(first)
  })

  it("SCN-PERSIST-10b-c-1: replay re-feeds the recorded I/O, not the live model", () => {
    const cp: Checkpoint = {
      seatBrief: "seat brief",
      llmOutputs: ["assistant: step 1", "assistant: step 2"],
      toolIO: ["tool:read→ok", "tool:write→ok"],
    }

    const view = replay(cp)
    // the recorded LLM outputs + tool I/O are re-fed FAITHFULLY — the replay reproduces the record.
    expect(view.llmOutputs).toEqual(cp.llmOutputs)
    expect(view.toolIO).toEqual(cp.toolIO)
    // the view is sourced from the recording, never a live re-invocation.
    expect(view.source).toBe("recording")
    // teeth (breaks-on "`replay` re-invokes the live LLM instead of re-feeding the recorded outputs — the
    // replay diverges from the recorded transcript"): a live model would emit fresh, divergent output; the
    // deep-equality above pins the replay to the exact recorded I/O.
    expect(view.llmOutputs).not.toContain("LIVE — freshly re-invoked output")
  })

  it("SCN-PERSIST-10b-d-1: the substrate is a Checkpoint distinct from the raw transcript", () => {
    const cp: Checkpoint = { seatBrief: "b", llmOutputs: ["o1"], toolIO: ["io1"] }

    // the re-invoke substrate is the STRUCTURED Checkpoint (seatBrief + llmOutputs[] + toolIO[])...
    expect(Object.keys(cp).sort()).toEqual(["llmOutputs", "seatBrief", "toolIO"])
    expect(Array.isArray(cp.llmOutputs)).toBe(true)
    expect(Array.isArray(cp.toolIO)).toBe(true)

    // ...DISTINCT from the raw transcript large object (a `TranscriptRef` pointer {sha, store}).
    const rawTranscript: TranscriptRef = { sha: asHash("raw-transcript-sha"), store: "cas" }
    expect(cp).not.toHaveProperty("sha")
    expect(cp).not.toHaveProperty("store")
    expect(cp).not.toEqual(rawTranscript)

    // replay consumes the Checkpoint substrate inline — never the raw transcript pointer.
    const view = replay(cp)
    expect(view.seatBrief).toBe(cp.seatBrief)
    // teeth (breaks-on "re-invoke reads the full raw transcript as its substrate — the `Checkpoint` is not
    // distinct"): the substrate carries the re-invoke I/O inline, not a transcript-hash pointer.
    expect(view.llmOutputs).toEqual(cp.llmOutputs)
  })
})

// differential-vs-oracle (compile-time, documentary): the impl conforms to the frozen `ReinvokeApi`.
const _conforms: ReinvokeApi = { redispatch, replay }
void _conforms
