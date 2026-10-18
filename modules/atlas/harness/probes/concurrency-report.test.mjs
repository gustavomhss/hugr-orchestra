// harness/probes/concurrency-report.test.mjs — the CALIBRATION of the concurrency instrument.
//
// An instrument nobody has watched succeed at the thing it measures is worth exactly what the last one was
// worth: a shim whose per-call filenames collided reported "1 call in flight" for a run that was provably
// running eight, and a healthy pool was opened as a defect on the strength of it. Nobody had ever pointed
// that instrument at a known-8 and checked that it said 8.
//
// So this file drives the WHOLE kit — `model-call-shim.mjs` in front of `fake-model.mjs`, as real
// subprocesses, over a real log directory — against two arrangements whose answer is known BEFORE the run,
// and asserts the exact number in both directions:
//
//   • EIGHT concurrent invocations of a 1s model  ⇒  peak concurrency EXACTLY 8
//   • FOUR sequential invocations of the same     ⇒  peak concurrency EXACTLY 1
//
// BOTH DIRECTIONS, OR IT IS NOT CALIBRATED. An instrument that only ever reports a big number passes the
// first case and is useless; one that only reports 1 passes the second and is the bug being fixed. The pair
// is what pins it. The assertions are on the EXACT value, never `toBeGreaterThan` — "at least 2" would have
// been satisfied by an instrument that is wrong by six.
//
// SUBPROCESSES, NOT A SIMULATION. The concurrency being measured is between OS processes and the timestamps
// come from different ones, which is the only part that can be got wrong; a test that constructed the log
// records in memory would calibrate nothing but the arithmetic. Wall-clock here is therefore dominated by
// process startup and by the fake model's own sleep, so the cases carry an explicit timeout for the same
// reason `vitest.workspace.ts` gives the black-box project one — the 10s global cap guards PURE unit tests.
//
// ZERO REAL MODEL CALLS. `fake-model.mjs` is the model throughout.

import { describe, it, expect } from "vitest"
import { spawn } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { UnfitLogError, peakConcurrency, readCallLog, summarize } from "./concurrency-report.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SHIM = join(HERE, "model-call-shim.mjs")
const FAKE = join(HERE, "fake-model.mjs")

/** The model duration every case is predicted against. One second is long enough that eight overlapping
 *  1s calls cannot be mistaken for eight sequential ones (which would take eight). */
const SLEEP_MS = 1000

const CASE_TIMEOUT = 30_000

function scratch() {
  const d = mkdtempSync(join(tmpdir(), "atlas-probe-calib-"))
  return { dir: d, cleanup: () => rmSync(d, { recursive: true, force: true }) }
}

/** Run the shim ONCE over the fake model, resolving with its exit code. The prompt is piped, as the product
 *  pipes it, so the shim's stdin drain is exercised too. */
function runShim(logDir, sleepMs = SLEEP_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SHIM], {
      env: {
        ...process.env,
        ATLAS_PROBE_LOG: logDir,
        ATLAS_PROBE_CMD: process.execPath,
        ATLAS_PROBE_ARGS: JSON.stringify([FAKE]),
        ATLAS_FAKE_MODEL_SLEEP_MS: String(sleepMs),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let out = ""
    child.stdout.on("data", (b) => void (out += b))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, out }))
    child.stdin.end("a synthetic prompt for one site\n")
  })
}

describe("the concurrency instrument, calibrated in both directions", () => {
  it(
    "reports EXACTLY 8 when eight 1s model calls really do overlap",
    async () => {
      const s = scratch()
      try {
        // All eight are launched before any is awaited, so they overlap for ~1s in the middle.
        const results = await Promise.all(Array.from({ length: 8 }, () => runShim(s.dir)))

        // The run itself has to have worked, or the peak below is measuring nothing. Exact values.
        expect(results.map((r) => r.code)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
        expect(results.every((r) => r.out.includes("FAKE MODEL OUTPUT"))).toBe(true)

        const calls = readCallLog(s.dir)
        expect(calls.length).toBe(8)
        // Eight DISTINCT record names — the property the previous shim did not have. Printed as the ids
        // themselves, not merely counted, so a duplicate is visible in the failure rather than inferred.
        expect(new Set(calls.map((c) => c.id)).size).toBe(8)
        expect(
          readdirSync(s.dir)
            .filter((n) => n.endsWith(".jsonl"))
            .sort().length,
        ).toBe(8)
        // Eight separate prompt transcripts too: the old shim's concurrent writers shared one path and
        // overlaid each other's bytes, which corrupted the answers as well as the accounting.
        expect(readdirSync(s.dir).filter((n) => n.endsWith(".prompt")).length).toBe(8)

        const r = summarize(calls)
        expect(r.peakConcurrency).toBe(8) //           THE CALIBRATION
        expect(r.peakIsLowerBound).toBe(false)
        expect(r.completed).toBe(8)
        expect(r.unfinished).toBe(0)
        expect(r.failed).toBe(0)
        // Arithmetic, predicted before the run: eight overlapping 1s calls occupy ~8s of model time inside
        // a wall clock of ~1s. The bound is loose on purpose (host contention moves it) but it is FAR from
        // the serial reading of ~1×, so it cannot be satisfied by a serial run.
        expect(r.effectiveConcurrency).toBeGreaterThan(4)
        expect(r.wallClockMs).toBeLessThan(8 * SLEEP_MS)
      } finally {
        s.cleanup()
      }
    },
    CASE_TIMEOUT,
  )

  it(
    "reports EXACTLY 1 when the same calls are made one after another",
    async () => {
      const s = scratch()
      try {
        // Four rather than eight only to keep the wall clock down; the shape under test is the awaiting.
        const results = []
        for (let k = 0; k < 4; k++) results.push(await runShim(s.dir, 400))

        expect(results.map((r) => r.code)).toEqual([0, 0, 0, 0])

        const calls = readCallLog(s.dir)
        expect(calls.length).toBe(4)
        const r = summarize(calls)
        expect(r.peakConcurrency).toBe(1) //           THE OTHER HALF OF THE CALIBRATION
        expect(r.completed).toBe(4)
        // Serial ⇒ model time and wall clock are the same order. Anything above ~1 here would mean the
        // sweep is counting non-overlapping intervals as overlapping.
        expect(r.effectiveConcurrency).toBeLessThan(1.05)
      } finally {
        s.cleanup()
      }
    },
    CASE_TIMEOUT,
  )
})

describe("the shim runs from wherever it is put", () => {
  it(
    "still records a call from a path with a SPACE, under a SYMLINKED tmpdir",
    async () => {
      // teeth (breaks-on any `is this the entry point?` guard in the shim): `process.argv[1]` and
      // `import.meta.url` are not two spellings of one path — they differ by percent-encoding (the space
      // below) and by symlink resolution (`os.tmpdir()` is `/var/folders/...`, a symlink to
      // `/private/var/folders/...`). MEASURED:
      //     argv[1]         /tmp/x/a dir with spaces/model-call-shim.mjs
      //     import.meta.url file:///private/tmp/x/a%20dir%20with%20spaces/model-call-shim.mjs
      // Under any such guard `main()` never runs, the shim exits 0 having written NOTHING to stdout, and
      // `llm.ts` reads empty stdout as an ABSTENTION (GEN-12) — so a whole run records "the model had
      // nothing to say" at every site, about a model that was never asked. Both halves were reproduced;
      // the fix is that the shim has no guard at all, and this case is what keeps it from growing one.
      const s = scratch()
      try {
        const spaced = join(s.dir, "a dir with spaces")
        mkdirSync(spaced, { recursive: true })
        for (const f of ["model-call-shim.mjs", "fake-model.mjs"]) cpSync(join(HERE, f), join(spaced, f))
        const logDir = join(s.dir, "log")

        const { code, out } = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [join(spaced, "model-call-shim.mjs")], {
            env: {
              ...process.env,
              ATLAS_PROBE_LOG: logDir,
              ATLAS_PROBE_CMD: process.execPath,
              ATLAS_PROBE_ARGS: JSON.stringify([join(spaced, "fake-model.mjs")]),
              ATLAS_FAKE_MODEL_SLEEP_MS: "10",
            },
            stdio: ["pipe", "pipe", "pipe"],
          })
          let o = ""
          child.stdout.on("data", (b) => void (o += b))
          child.on("error", reject)
          child.on("close", (c) => resolve({ code: c, out: o }))
          child.stdin.end("a synthetic prompt\n")
        })

        expect(code).toBe(0)
        expect(out).toContain("FAKE MODEL OUTPUT") // the claim was really forwarded, not an empty abstention
        const calls = readCallLog(logDir) //           and the call was really recorded
        expect(calls.length).toBe(1)
        expect(calls[0].status).toBe(0)
      } finally {
        s.cleanup()
      }
    },
    CASE_TIMEOUT,
  )
})

describe("the instrument refuses input it cannot draw a conclusion from", () => {
  it("REFUSES a log whose timestamps are all whole seconds — the `date +%s%N` signature", () => {
    // teeth (breaks-on "the whole-second clock check is dropped"): without the guard these four records
    // sweep to a perfectly plausible peak of 2, from a clock that could not have resolved the overlap.
    const wholeSeconds = [
      { id: "a", pid: 1, startMs: 1_785_814_160_000, endMs: 1_785_814_182_000, durationMs: 22_000, status: 0 },
      { id: "b", pid: 2, startMs: 1_785_814_160_000, endMs: 1_785_814_182_000, durationMs: 22_000, status: 0 },
    ]
    expect(() => summarize(wholeSeconds)).toThrow(UnfitLogError)
    expect(() => summarize(wholeSeconds)).toThrow(/whole second/)
    // The sweep itself would have been happy — which is exactly why the refusal has to live above it.
    expect(peakConcurrency(wholeSeconds)).toBe(2)
  })

  it("REFUSES a record file holding more than two events — two calls collided on one name", () => {
    const s = scratch()
    try {
      const rec = ["start", "end", "start", "end"].map((ev, k) =>
        JSON.stringify({ ev, id: "collided", pid: 1, at: 1_000_000.5 + k, durationMs: 1 }),
      )
      writeFileSync(join(s.dir, "collided.jsonl"), `${rec.join("\n")}\n`)
      expect(() => readCallLog(s.dir)).toThrow(/collided on one record name/)
    } finally {
      s.cleanup()
    }
  })

  it("REFUSES an empty log directory rather than reporting a peak of 0", () => {
    const s = scratch()
    try {
      mkdirSync(join(s.dir, "empty"), { recursive: true })
      expect(() => readCallLog(join(s.dir, "empty"))).toThrow(/was not measured/)
    } finally {
      s.cleanup()
    }
  })

  it("REFUSES a call whose end precedes its start — the wall clock moved backwards", () => {
    const s = scratch()
    try {
      const lines = [
        JSON.stringify({ ev: "start", id: "x", pid: 1, at: 2_000_000.25 }),
        JSON.stringify({ ev: "end", id: "x", pid: 1, at: 1_999_000.25, durationMs: -1000, status: 0 }),
      ]
      writeFileSync(join(s.dir, "x.jsonl"), `${lines.join("\n")}\n`)
      expect(() => readCallLog(s.dir)).toThrow(/clock moved backwards/)
    } finally {
      s.cleanup()
    }
  })

  it("names an in-flight call and marks the peak a LOWER BOUND rather than dropping it", () => {
    const s = scratch()
    try {
      writeFileSync(join(s.dir, "a.jsonl"), `${JSON.stringify({ ev: "start", id: "a", pid: 1, at: 1_000_000.5 })}\n`)
      writeFileSync(
        join(s.dir, "b.jsonl"),
        `${JSON.stringify({ ev: "start", id: "b", pid: 2, at: 1_000_001.5 })}\n${JSON.stringify({ ev: "end", id: "b", pid: 2, at: 1_000_003.5, durationMs: 2, status: 0 })}\n`,
      )
      const r = summarize(readCallLog(s.dir))
      expect(r.calls).toBe(2)
      expect(r.completed).toBe(1)
      expect(r.unfinished).toBe(1)
      expect(r.unfinishedIds).toEqual(["a"])
      expect(r.peakIsLowerBound).toBe(true)
    } finally {
      s.cleanup()
    }
  })
})
