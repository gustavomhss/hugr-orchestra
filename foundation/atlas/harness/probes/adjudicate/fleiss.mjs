// harness/probes/adjudicate/fleiss.mjs — the PURE, model-free math of the adjudication panel.
//
// This module contains no I/O, no model call, and no fixture. It is the arithmetic that turns a set of
// per-item, per-pass verdicts into three numbers a calibration run reports:
//
//   • Fleiss' κ    — how much the N judge passes AGREE beyond chance (an inter-judge reliability number).
//   • catch-rate   — of the planted-FALSE fixtures, the fraction the panel majority correctly called false.
//   • false-alarm  — of the known-TRUE fixtures, the fraction the panel majority wrongly called false.
//
// It is separated from the driver so the math can be proven correct on SYNTHETIC verdict matrices (see
// adjudicate.test.mjs) without ever making a model call — the classic Fleiss (1971) worked example pins κ,
// hand-built 2-category matrices pin catch and false-alarm. A number the harness reports about a real judge
// is only as trustworthy as the arithmetic under it, and this file is where that arithmetic is checkable.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

/** The three verdict categories a judge may return. ABSTAIN is a first-class category, not a dropped item:
 *  keeping it as a column means every item is rated by exactly `passes` raters, which is what Fleiss'
 *  fixed-n formula requires. Order is load-bearing only in that indices are stable within a run. */
export const CATEGORIES = /** @type {const} */ (["GROUNDED_TRUE", "HALLUCINATED", "ABSTAIN"])
export const CAT_INDEX = Object.freeze({ GROUNDED_TRUE: 0, HALLUCINATED: 1, ABSTAIN: 2 })

/**
 * Build the Fleiss counts matrix from a list of per-item verdict arrays.
 * @param {string[][]} perItemVerdicts  perItemVerdicts[i] = the category label each pass gave item i.
 * @param {readonly string[]} categories the category vocabulary (defaults to CATEGORIES).
 * @returns {number[][]} counts[i][j] = how many passes put item i in category j. Every row sums to `passes`.
 * @throws if an item's verdict count differs from another's (Fleiss requires a fixed number of raters), or
 *         if a verdict names a category outside the vocabulary.
 */
export function countsFromVerdicts(perItemVerdicts, categories = CATEGORIES) {
  if (!Array.isArray(perItemVerdicts) || perItemVerdicts.length === 0) {
    throw new Error("countsFromVerdicts: need at least one item")
  }
  const index = new Map(categories.map((c, j) => [c, j]))
  let n = null
  return perItemVerdicts.map((row, i) => {
    if (!Array.isArray(row) || row.length === 0) throw new Error(`item ${i}: no verdicts`)
    if (n === null) n = row.length
    else if (row.length !== n) {
      throw new Error(`item ${i}: ${row.length} verdicts but item 0 had ${n} — Fleiss requires a fixed rater count`)
    }
    const counts = new Array(categories.length).fill(0)
    for (const v of row) {
      const j = index.get(v)
      if (j === undefined) throw new Error(`item ${i}: verdict "${v}" is not one of ${categories.join(", ")}`)
      counts[j] += 1
    }
    return counts
  })
}

/**
 * Fleiss' κ for a counts matrix.
 * @param {number[][]} counts counts[i][j], every row summing to the same n (raters per item).
 * @returns {{ kappa: number, pBar: number, pE: number, n: number, N: number,
 *            degenerate: boolean }} `degenerate` is true when P_e === 1 (every rating in one category), where
 *            κ is 0/0 and undefined; we report κ=1 by convention iff observed agreement is also perfect, else
 *            κ=NaN, and flag it so a caller never quotes a κ off a single-category run.
 *
 * Formulas (Fleiss 1971):
 *   P_i = (Σ_j n_ij² − n) / (n(n−1))                        per-item observed agreement
 *   P̄   = (1/N) Σ_i P_i                                     mean observed agreement
 *   p_j = (1/(N·n)) Σ_i n_ij                                category prevalence
 *   P_e = Σ_j p_j²                                          chance agreement
 *   κ   = (P̄ − P_e) / (1 − P_e)
 */
export function fleissKappa(counts) {
  const N = counts.length
  if (N === 0) throw new Error("fleissKappa: empty matrix")
  const k = counts[0].length
  const n = counts[0].reduce((a, b) => a + b, 0)
  if (n < 2) throw new Error(`fleissKappa: need ≥2 raters per item, got ${n}`)

  for (const row of counts) {
    if (row.length !== k) throw new Error("fleissKappa: ragged matrix (unequal category count)")
    if (row.reduce((a, b) => a + b, 0) !== n) throw new Error("fleissKappa: rows do not all sum to the same n")
  }

  // per-item agreement, averaged
  let pSum = 0
  for (const row of counts) {
    const sq = row.reduce((a, c) => a + c * c, 0)
    pSum += (sq - n) / (n * (n - 1))
  }
  const pBar = pSum / N

  // category prevalence and chance agreement
  const colTotals = new Array(k).fill(0)
  for (const row of counts) for (let j = 0; j < k; j++) colTotals[j] += row[j]
  const pj = colTotals.map((c) => c / (N * n))
  const pE = pj.reduce((a, p) => a + p * p, 0)

  const degenerate = 1 - pE === 0
  let kappa
  if (degenerate) kappa = pBar === 1 ? 1 : NaN
  else kappa = (pBar - pE) / (1 - pE)

  return { kappa, pBar, pE, n, N, degenerate }
}

/**
 * The panel's single decision for one item: the category with the most votes. A tie is UNDECIDED and maps to
 * ABSTAIN — a split panel has caught nothing and false-alarmed on nothing, which is the honest reading.
 * @param {number[]} row counts for one item.
 * @param {readonly string[]} categories
 * @returns {string} the winning category label, or 'ABSTAIN' on a tie.
 */
export function majority(row, categories = CATEGORIES) {
  let best = -1
  let bestJ = -1
  let tie = false
  for (let j = 0; j < row.length; j++) {
    if (row[j] > best) {
      best = row[j]
      bestJ = j
      tie = false
    } else if (row[j] === best) {
      tie = true
    }
  }
  if (tie) return "ABSTAIN"
  return categories[bestJ]
}

/**
 * Catch-rate and false-alarm-rate for a panel, given per-item counts and the ground-truth labels.
 * @param {number[][]} counts per-item category counts (rows aligned with `labels`).
 * @param {Array<'true'|'false'>} labels ground-truth: 'true' = grounded+true fixture, 'false' = planted-false.
 * @param {readonly string[]} categories
 * @returns {{ catch: {caught:number,total:number,rate:number|null},
 *            falseAlarm: {alarmed:number,total:number,rate:number|null},
 *            perItem: Array<{label:string,decision:string,correct:boolean}> }}
 *
 * A false fixture is CAUGHT iff the majority decision is HALLUCINATED. A true fixture is a FALSE ALARM iff the
 * majority decision is HALLUCINATED. An ABSTAIN majority is neither — it counts against the denominator but
 * not the numerator, so catch-rate is deliberately conservative (an undecided panel did not catch the false).
 */
export function detectionRates(counts, labels, categories = CATEGORIES) {
  if (counts.length !== labels.length) throw new Error("detectionRates: counts/labels length mismatch")
  let caught = 0
  let falseTotal = 0
  let alarmed = 0
  let trueTotal = 0
  const perItem = counts.map((row, i) => {
    const decision = majority(row, categories)
    const label = labels[i]
    if (label === "false") {
      falseTotal += 1
      if (decision === "HALLUCINATED") caught += 1
    } else if (label === "true") {
      trueTotal += 1
      if (decision === "HALLUCINATED") alarmed += 1
    } else {
      throw new Error(`detectionRates: item ${i} label must be 'true' or 'false', got ${label}`)
    }
    const correct =
      (label === "false" && decision === "HALLUCINATED") || (label === "true" && decision === "GROUNDED_TRUE")
    return { label, decision, correct }
  })
  return {
    catch: { caught, total: falseTotal, rate: falseTotal === 0 ? null : caught / falseTotal },
    falseAlarm: { alarmed, total: trueTotal, rate: trueTotal === 0 ? null : alarmed / trueTotal },
    perItem,
  }
}
