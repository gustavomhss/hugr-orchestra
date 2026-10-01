#!/usr/bin/env node
// harness/probes/adjudicate/fake-judge.mjs — a ZERO-COST stand-in judge, for exercising the driver end to
// end without spending a real model call. It is NOT a calibration of any real model — the number it produces
// is a PIPELINE SMOKE, and the calibration report labels it as such.
//
// It reads the adjudication prompt on stdin, extracts the fixture id (FACT ids like T01/F07 are embedded via
// the ANCHOR+CODE, so we key off an explicit marker the smoke runner injects) and answers deterministically:
//
//   FAKE_JUDGE_MODE=oracle  (default) — answer the KNOWN-CORRECT verdict (GROUNDED_TRUE for T*, HALLUCINATED
//                                       for F*). This drives κ=1, catch=all, false-alarm=0 — a smoke that
//                                       proves the wiring end to end, nothing about a real judge.
//   FAKE_JUDGE_MODE=noisy   — flip a deterministic subset (keyed on the fixture id + the ATLAS_JUDGE_PASS
//                             the driver injects) to a wrong/ABSTAIN verdict, so passes DISAGREE and the
//                             driver's κ<1 and imperfect catch/false-alarm paths are exercised too.
//
// The fixture id is read from an injected line `FIXTURE_ID: <id>` that the smoke runner prepends to the
// prompt (see run-calibration.mjs). A real judge never sees that line — it is stripped from the model-facing
// prompt. This keeps the fake honest about its determinism: it is answering from the LABEL, openly.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { readFileSync, writeSync } from "node:fs"

const MODE = process.env.FAKE_JUDGE_MODE || "oracle"
const raw = readFileSync(0, "utf8")

const m = raw.match(/FIXTURE_ID:\s*([A-Za-z0-9_]+)/)
const id = m ? m[1] : ""
const isTrue = id.startsWith("T")

let verdict = isTrue ? "GROUNDED_TRUE" : "HALLUCINATED"

if (MODE === "noisy") {
  // Deterministic perturbation keyed on the numeric part of the id + a per-process pass nonce, so different
  // passes disagree (κ<1) but the run is reproducible given ATLAS_JUDGE_PASS.
  const num = Number((id.match(/\d+/) || ["0"])[0])
  const pass = Number(process.env.ATLAS_JUDGE_PASS || "0")
  const flip = (num + pass) % 4 === 0 // flip a quarter of calls
  if (flip) verdict = verdict === "GROUNDED_TRUE" ? "HALLUCINATED" : "GROUNDED_TRUE"
  if ((num + pass) % 7 === 0) verdict = "ABSTAIN"
}

writeSync(1, `Reasoning omitted (fake judge, mode=${MODE}).\n${verdict}\n`)
process.exit(0)
