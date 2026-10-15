#!/usr/bin/env node
// harness/probes/fake-model.mjs — the ZERO-COST stand-in model.
//
// It obeys the `roles.propose` contract exactly (ADR-0011 D1: prompt on stdin, claim on stdout, exit 0),
// takes a configurable amount of wall-clock, and costs nothing. It exists so the concurrency instrument can
// be CALIBRATED and so a benchmark harness can be rehearsed end to end without spending a single real model
// call.
//
// WHY A FAKE IS THE RIGHT MODEL FOR MEASURING CONCURRENCY. The quantity under test is how many calls the
// product has in flight, which is a property of the DISPATCHER, not of the model. A real model makes that
// measurement neither deterministic (latency varies per call, so a peak can be missed) nor free. A fake with
// a fixed duration makes the expected peak an ARITHMETIC prediction — `n` calls of `d` ms dispatched `w`-wide
// must take about `ceil(n/w) * d` — so the instrument can be checked against a number that was known before
// the run rather than explained after it.
//
// USAGE
//   ATLAS_FAKE_MODEL_SLEEP_MS=1000 node harness/probes/fake-model.mjs
//
// KNOBS (all optional)
//   ATLAS_FAKE_MODEL_SLEEP_MS   wall-clock to burn per call, default 1000
//   ATLAS_FAKE_MODEL_CLAIM      the exact text to emit, default `DEFAULT_CLAIM`
//   ATLAS_FAKE_MODEL_ABSTAIN=1  emit nothing (empty stdout ⇒ the product reads an ABSTENTION, GEN-12)
//   ATLAS_FAKE_MODEL_EXIT       exit with this status instead of 0 (⇒ the product raises ModelCommandError)
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { readFileSync, writeSync } from "node:fs"

/** A fixed, obviously-synthetic claim. It is not a real assertion about any repository and must never be
 *  promoted; it is here so the product's admission gate has a non-empty string to reject or admit. */
export const DEFAULT_CLAIM = "FAKE MODEL OUTPUT — this stand-in makes no claim about this repository"

/** Burn wall-clock SYNCHRONOUSLY, without a busy loop. `Atomics.wait` on a private buffer parks the thread,
 *  so the process consumes no CPU while it waits — which matters when eight of these run at once and a
 *  spin loop would turn a concurrency measurement into a measurement of the host's core count. */
export function sleepSync(ms) {
  if (!(ms > 0)) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function main() {
  try {
    readFileSync(0) // drain the piped prompt — a model that never reads stdin puts the caller in an EPIPE race
  } catch {
    /* no stdin attached (a bare hand-run) — nothing to drain */
  }

  const ms = Number(process.env.ATLAS_FAKE_MODEL_SLEEP_MS ?? 1000)
  sleepSync(Number.isFinite(ms) ? ms : 1000)

  if (process.env.ATLAS_FAKE_MODEL_ABSTAIN !== "1") {
    const claim = `${process.env.ATLAS_FAKE_MODEL_CLAIM ?? DEFAULT_CLAIM}\n`
    const buf = Buffer.from(claim, "utf8")
    let off = 0
    while (off < buf.length) off += writeSync(1, buf, off, buf.length - off)
  }

  const exit = Number(process.env.ATLAS_FAKE_MODEL_EXIT ?? 0)
  process.exit(Number.isInteger(exit) ? exit : 0)
}

// No entry-point guard: this file is a COMMAND, nothing imports it, and the guard's failure mode is silence
// — an exit 0 with empty stdout, which the product reads as an abstention. See `model-call-shim.mjs` for the
// measurement (`argv[1]` and `import.meta.url` differ by percent-encoding AND by symlink resolution).
main()
