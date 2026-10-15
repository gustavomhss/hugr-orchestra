#!/usr/bin/env node
// harness/probes/concurrency-report.mjs — read a `model-call-shim.mjs` log and report what the run's model
// calls ACTUALLY did: how many there were, how many were in flight at the busiest instant, how long each
// took, and how long the whole thing lasted.
//
// ── RECONSTRUCTED, NEVER SAMPLED ─────────────────────────────────────────────────────────────────────────
// Peak concurrency is computed by SWEEPING the recorded intervals: sort every start and every end, walk them
// in time order, +1 on a start and -1 on an end, and take the running maximum. The answer is therefore exact
// with respect to the log, and does not depend on when anyone happened to look.
//
// The measurement this replaces did depend on that. It polled `count(*.in) - count(*.rc)` every two seconds
// against a shim whose per-call filenames collided (see `model-call-shim.mjs` for the `date +%s%N` story), so
// it reported a peak of 1 for a run that was demonstrably running eight calls at once. Sampling a derived
// counter has two independent ways to be wrong — the counter can be wrong, and the sample can miss the peak.
// Sweeping recorded intervals has neither.
//
// TIE-BREAK, AND IT IS THE CONSERVATIVE ONE. At an identical timestamp, ENDS are processed before STARTS, so
// two intervals that merely touch are not counted as overlapping. This instrument therefore never OVERSTATES
// concurrency, which is the direction that matters: an instrument built to defend a claim of parallelism must
// not be the thing that manufactures it.
//
// ── IT REFUSES RATHER THAN GUESSES ───────────────────────────────────────────────────────────────────────
// Four conditions make a log unfit to draw a conclusion from, and each one exits non-zero with the reason,
// because the failure mode being designed against is an instrument that reports a plausible number from
// unusable input:
//
//   1. NO RECORDS. An empty or absent directory is not "peak 0" — it is a run that was never measured.
//   2. A COLLIDING RECORD. A record file holds exactly two NDJSON lines, one `start` and one `end`. A file
//      holding more means two calls wrote to one name, which is precisely the defect this whole kit exists
//      to make impossible; it is reported as a collision rather than parsed around.
//   3. A WHOLE-SECOND CLOCK. If every timestamp in the log is an exact multiple of 1000 ms, the shim's clock
//      had one-second resolution, sub-second overlap is unresolvable, and any peak read off it is an
//      artefact. This is the exact signature `date +%s%N` leaves on a BSD `date`, and it is checked for by
//      name so that particular lie cannot be told twice.
//   4. AN OUT-OF-ORDER INTERVAL. A call whose end precedes its start means the wall clock moved backwards
//      (NTP) during the run, and the sweep's ordering assumption no longer holds.
//
// UNFINISHED CALLS ARE NAMED, NOT DROPPED. A record with a `start` and no `end` is a call that was in flight
// when the run died. It is excluded from the sweep (its end is unknown) and REPORTED, with the peak
// explicitly labelled a LOWER BOUND — silently discarding in-flight calls is how a measurement understates
// exactly the quantity it was built to find.
//
// ── USAGE ────────────────────────────────────────────────────────────────────────────────────────────────
//   node harness/probes/concurrency-report.mjs <log-dir> [--json]
//
// Harness invariant (harness/README.md): no `@atlas/*` import. It reads a directory of JSON lines from the
// outside and links no product code.

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

/**
 * Is THIS module the process entry point?
 *
 * Unlike its two siblings this file IS imported — by `concurrency-report.test.mjs` — so it needs the guard,
 * and the guard has to be the correct one. `` `file://${process.argv[1]}` `` is NOT it: `argv[1]` is the path
 * as typed while `import.meta.url` is percent-encoded AND symlink-resolved, and they diverge on any path
 * holding a space and on any path under `/tmp` or `/var/folders` (both symlinks on macOS, and the second is
 * where `os.tmpdir()` points). MEASURED:
 *
 *   argv[1]        /tmp/sp194/a dir with spaces/probe.mjs
 *   import.meta.url file:///private/tmp/sp194/a%20dir%20with%20spaces/probe.mjs
 *
 * `realpathSync` closes the symlink half and `pathToFileURL` closes the encoding half. Total: an `argv[1]`
 * that no longer exists answers "not the entry point", which is the safe direction for an imported module.
 */
function isEntryPoint(url) {
  if (process.argv[1] === undefined) return false
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === url
  } catch {
    return false
  }
}

/** Why a log cannot be read as a measurement. Thrown, never returned as a number — see the file banner. */
export class UnfitLogError extends Error {
  constructor(message) {
    super(message)
    this.name = "UnfitLogError"
  }
}

/** One call as the shim recorded it. `endMs`/`durationMs`/`status` are absent on a call still in flight. */
/** @typedef {{ id: string, pid: number, startMs: number, endMs?: number, durationMs?: number, status?: number }} CallRecord */

/**
 * Parse every `<id>.jsonl` in `dir` into call records.
 *
 * TOTAL over junk it did not write: files that are not `*.jsonl`, and the `.prompt`/`.out`/`.err` transcript
 * siblings, are ignored. Anything that IS a `*.jsonl` and does not parse is a defect in the instrument and
 * is raised, not skipped — a silently skipped record is a silently lowered peak.
 */
export function readCallLog(dir) {
  let names
  try {
    names = readdirSync(dir)
  } catch (e) {
    throw new UnfitLogError(`cannot read the log directory ${dir}: ${e?.message ?? e}`)
  }
  const calls = []
  const seen = new Map()
  for (const name of names.filter((n) => n.endsWith(".jsonl")).sort()) {
    const path = join(dir, name)
    if (!statSync(path).isFile()) continue
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
    if (lines.length > 2) {
      throw new UnfitLogError(
        `${name} holds ${lines.length} event lines but a call writes exactly 2 — two calls collided on one ` +
          `record name, so this log cannot be read as a measurement`,
      )
    }
    let events
    try {
      events = lines.map((l) => JSON.parse(l))
    } catch (e) {
      throw new UnfitLogError(`${name} is not valid NDJSON: ${e?.message ?? e}`)
    }
    const start = events.find((e) => e.ev === "start")
    const end = events.find((e) => e.ev === "end")
    if (start === undefined) throw new UnfitLogError(`${name} has no \`start\` event`)
    if (seen.has(start.id))
      throw new UnfitLogError(`call id ${start.id} appears in both ${seen.get(start.id)} and ${name}`)
    seen.set(start.id, name)
    if (end !== undefined && end.at < start.at) {
      throw new UnfitLogError(
        `${name} ends (${end.at}) before it starts (${start.at}) — the wall clock moved backwards during the ` +
          `run, so intervals from different processes are not comparable`,
      )
    }
    calls.push({
      id: start.id,
      pid: start.pid,
      startMs: start.at,
      ...(end === undefined
        ? {}
        : { endMs: end.at, durationMs: end.durationMs ?? end.at - start.at, status: end.status }),
    })
  }
  if (calls.length === 0) throw new UnfitLogError(`${dir} holds no call records — this run was not measured`)
  return calls
}

/**
 * Guard 3 from the banner: the shim's clock must have resolved better than one second.
 *
 * A log of N timestamps that are ALL exact multiples of 1000 ms is the `date +%s%N`-on-BSD signature. One
 * legitimate reading landing on a whole millisecond boundary is unremarkable; every one of them doing so is
 * not. Checked only once there are at least two timestamps, because a single one proves nothing either way.
 */
export function assertSubSecondClock(calls) {
  const stamps = calls.flatMap((c) => (c.endMs === undefined ? [c.startMs] : [c.startMs, c.endMs]))
  if (stamps.length < 2) return
  if (stamps.every((t) => Number.isInteger(t) && t % 1000 === 0)) {
    throw new UnfitLogError(
      `every one of the ${stamps.length} timestamps in this log is an exact whole second, so the shim's clock ` +
        `had one-second resolution and sub-second overlap is unresolvable — this is the signature ` +
        `\`date +%s%N\` leaves on a BSD \`date\`, which emits a literal "N" rather than nanoseconds`,
    )
  }
}

/**
 * Peak simultaneous calls, by sweeping the completed intervals.
 *
 * Ends sort before starts at an equal timestamp (`kind` 0 before 1), so intervals that merely touch do not
 * count as overlapping — see the banner on why this instrument errs downward.
 */
export function peakConcurrency(calls) {
  const events = []
  for (const c of calls) {
    if (c.endMs === undefined) continue // in flight at the end of the run — reported separately, see `summarize`
    events.push({ at: c.startMs, kind: 1 })
    events.push({ at: c.endMs, kind: 0 })
  }
  events.sort((a, b) => a.at - b.at || a.kind - b.kind)
  let running = 0
  let peak = 0
  for (const e of events) {
    running += e.kind === 1 ? 1 : -1
    if (running > peak) peak = running
  }
  return peak
}

const median = (xs) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** The whole measurement, as data. `peakIsLowerBound` is true exactly when calls were still in flight. */
export function summarize(calls) {
  assertSubSecondClock(calls)
  const done = calls.filter((c) => c.endMs !== undefined)
  const unfinished = calls.filter((c) => c.endMs === undefined)
  const durations = done.map((c) => c.durationMs)
  const starts = calls.map((c) => c.startMs)
  const ends = done.map((c) => c.endMs)
  const wallClockMs = ends.length === 0 ? 0 : Math.max(...ends) - Math.min(...starts)
  const busyMs = durations.reduce((a, b) => a + b, 0)
  return {
    calls: calls.length,
    completed: done.length,
    unfinished: unfinished.length,
    unfinishedIds: unfinished.map((c) => c.id),
    failed: done.filter((c) => c.status !== 0).length,
    peakConcurrency: peakConcurrency(calls),
    peakIsLowerBound: unfinished.length > 0,
    // Total model time divided by wall clock: the AVERAGE width actually achieved, which is the number a
    // speed claim rests on. Peak alone can be reached once and never again.
    effectiveConcurrency: wallClockMs === 0 ? 0 : busyMs / wallClockMs,
    minDurationMs: durations.length === 0 ? 0 : Math.min(...durations),
    medianDurationMs: median(durations),
    maxDurationMs: durations.length === 0 ? 0 : Math.max(...durations),
    busyMs,
    wallClockMs,
  }
}

const ms = (n) => `${(n / 1000).toFixed(3)}s`

export function render(s) {
  const lines = [
    `calls                 ${s.calls}`,
    `completed             ${s.completed}`,
    `unfinished            ${s.unfinished}${s.unfinished > 0 ? ` (${s.unfinishedIds.join(", ")})` : ""}`,
    `non-zero exits        ${s.failed}`,
    `PEAK CONCURRENCY      ${s.peakConcurrency}${s.peakIsLowerBound ? "   ← LOWER BOUND: calls were still in flight" : ""}`,
    `effective concurrency ${s.effectiveConcurrency.toFixed(2)}×`,
    `duration  min/med/max ${ms(s.minDurationMs)} / ${ms(s.medianDurationMs)} / ${ms(s.maxDurationMs)}`,
    `model time (sum)      ${ms(s.busyMs)}`,
    `wall clock            ${ms(s.wallClockMs)}`,
  ]
  return lines.join("\n")
}

function cli(argv) {
  const dir = argv.find((a) => !a.startsWith("--"))
  if (dir === undefined) {
    process.stderr.write("usage: node harness/probes/concurrency-report.mjs <log-dir> [--json]\n")
    return 2
  }
  try {
    const s = summarize(readCallLog(dir))
    process.stdout.write(argv.includes("--json") ? `${JSON.stringify(s, null, 2)}\n` : `${render(s)}\n`)
    return 0
  } catch (e) {
    if (e instanceof UnfitLogError) {
      process.stderr.write(`concurrency-report: REFUSED — ${e.message}\n`)
      return 1
    }
    throw e
  }
}

if (isEntryPoint(import.meta.url)) process.exit(cli(process.argv.slice(2)))
