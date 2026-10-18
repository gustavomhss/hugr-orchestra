#!/usr/bin/env node
// harness/probes/cost-sum.mjs — the A3 COST reducer: reads a metering sidecar (the JSONL that
// `metered-claude.mjs` appends one line per call to) and prints the run's total dollar and token spend.
//
// WHY: the #95 benchmark's A3 axis reports what a mine run COST. `metered-claude.mjs` records each call
// (llm.ts is deliberately price-blind, #210 — see that file's header); this rolls the sidecar up into the
// single number the axis needs, plus the token breakdown that explains it (cache reads are the cheap part).
//
// USAGE: node harness/probes/cost-sum.mjs <sidecar.jsonl>
//
// Harness invariant (harness/README.md): no `@atlas/*` import, node built-ins only.

import { readFileSync } from "node:fs"

const path = process.argv[2]
if (!path) {
  process.stderr.write("usage: node cost-sum.mjs <sidecar.jsonl>\n")
  process.exit(2)
}

const lines = readFileSync(path, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")

let calls = 0
let abstained = 0
let errors = 0
let cost = 0
let inTok = 0
let outTok = 0
let cacheRead = 0
let cacheCreate = 0
// SILENT-$0 DEFECT (bench axis A3, defect (b)). A priced call whose `total_cost_usd` is null/absent booked $0
// and vanished into the sum, making a blind run look impeccably cheap. We now COUNT it and FAIL LOUD instead
// of coercing to 0. An is_error call legitimately never priced, so it is EXCLUDED from this count (and from
// the mean denominator below) — the flag fires only on a call that SHOULD carry a price and does not.
let nullCostCalls = 0
const nullCostSites = []

/** A usable price: a finite number. null / absent / NaN / a non-number string all fail this and are NOT summed
 *  as 0 (that coercion is exactly the silent-loss bug this reducer now refuses). */
function pricedNumber(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

for (const line of lines) {
  let rec
  try {
    rec = JSON.parse(line)
  } catch {
    process.stderr.write(`cost-sum: skipping unparseable line: ${line.slice(0, 80)}\n`)
    continue
  }
  calls += 1
  if (rec.abstained === true) abstained += 1
  const isError = rec.is_error === true
  if (isError) errors += 1

  const price = pricedNumber(rec.total_cost_usd)
  if (price === null) {
    // A non-error call with no price is the silent-$0 defect; an error call never priced and is expected.
    if (!isError) {
      nullCostCalls += 1
      nullCostSites.push(rec.site ?? rec.prompt_sha256 ?? "<no-site-key>")
    }
  } else {
    cost += price
  }

  inTok += Number(rec.input_tokens) || 0
  outTok += Number(rec.output_tokens) || 0
  cacheRead += Number(rec.cache_read_input_tokens) || 0
  cacheCreate += Number(rec.cache_creation_input_tokens) || 0
}

// Mean over PRICED calls, not all calls: an error call never spent, so folding it into the denominator would
// dilute the per-priced-call cost the A3 axis reports. Priced = non-error calls that carried a real price.
const pricedCalls = calls - errors - nullCostCalls
const meanCost = pricedCalls > 0 ? cost / pricedCalls : 0

process.stdout.write(
  [
    `sidecar:            ${path}`,
    `calls:              ${calls}`,
    `abstained:          ${abstained}`,
    `errors:             ${errors}`,
    `null_cost_calls:    ${nullCostCalls}`,
    `priced_calls:       ${pricedCalls}`,
    `total_cost_usd:     ${cost.toFixed(6)}`,
    `input_tokens:       ${inTok}`,
    `output_tokens:      ${outTok}`,
    `cache_read_tokens:  ${cacheRead}`,
    `cache_create_tokens:${cacheCreate}`,
    `mean_cost_per_priced_call: ${meanCost.toFixed(6)}`,
    "",
  ].join("\n"),
)

// FAIL LOUD. A run with even one un-priced non-error call cannot honestly report a total cost — the number
// would be a floor of unknown distance from the truth. Emit a prominent banner and exit non-zero so a CI/bench
// step cannot mistake the blind run for a cheap one.
if (nullCostCalls > 0) {
  const shown = nullCostSites.slice(0, 10).join(", ") + (nullCostSites.length > 10 ? ", …" : "")
  process.stderr.write(
    `\n!! cost-sum: ${nullCostCalls} non-error call(s) recorded NO total_cost_usd — the total $${cost.toFixed(6)} ` +
      `is a BLIND FLOOR, not the run's real cost.\n` +
      `!! affected site(s): ${shown}\n` +
      `!! refusing to report a silently-cheap number. Fix metering (claude CLI must emit total_cost_usd) and re-run.\n`,
  )
  process.exit(1)
}
