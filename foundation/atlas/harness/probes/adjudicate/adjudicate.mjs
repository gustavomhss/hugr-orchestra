// harness/probes/adjudicate/adjudicate.mjs — the DRIVER: run a judge command N passes over the labeled
// fixtures, parse each verdict, and hand the per-item verdict matrix to fleiss.mjs for scoring.
//
// The judge is a COMMAND (prompt on stdin, verdict text on stdout), exactly the shape of Atlas's own model
// seam (ADR-0011 D1). That is the whole point of the parametrization: the judge MODEL is not hardcoded — it
// is whatever command you point the driver at. The default (judge.mjs) wraps `claude --model $JUDGE_MODEL`,
// but a different-FAMILY judge (a GPT wrapper, a local model, a second human panel piped through a shim) is
// a drop-in with no change here. Same-family judge = same-family blind spot; the swap is how a
// model-INDEPENDENT reliability number gets taken later.
//
// This file makes NO model call itself and imports no model. It only orchestrates a command and does math.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { spawnSync } from "node:child_process"
import { countsFromVerdicts, fleissKappa, detectionRates, CATEGORIES } from "./fleiss.mjs"

/**
 * Parse a judge's raw stdout into one verdict category.
 *
 * Contract: the judge is told to put exactly one token on the LAST non-empty line. We honour that first
 * (scan bottom-up for a line that IS a token), then fall back to a whole-text unique-token scan. If the text
 * contains more than one DISTINCT verdict token and the last line is not itself a bare token, that is an
 * ambiguous answer and we return ABSTAIN rather than guess — an ambiguous judge has not decided, and
 * silently picking one reading is how a panel's numbers get quietly inflated.
 *
 * @param {string} raw
 * @returns {'GROUNDED_TRUE'|'HALLUCINATED'|'ABSTAIN'}
 */
export function parseVerdict(raw) {
  const text = String(raw ?? "")
  const tokens = new Set(CATEGORIES)
  const norm = (s) =>
    s
      .trim()
      .replace(/^[\s`'"*.#>-]+|[\s`'"*.#>:]+$/g, "")
      .toUpperCase()
      .replace(/[\s-]+/g, "_")

  // 1) bottom-up: the last line that IS exactly a token wins (the instructed contract).
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = norm(lines[i])
    if (tokens.has(t)) return /** @type {any} */ (t)
  }

  // 2) fallback: a UNIQUE token appearing anywhere. Multiple distinct tokens ⇒ ambiguous ⇒ ABSTAIN.
  const found = new Set()
  for (const cat of tokens) {
    if (new RegExp(`\\b${cat}\\b`, "i").test(text)) found.add(cat)
  }
  if (found.size === 1) return /** @type {any} */ ([...found][0])
  return "ABSTAIN"
}

/**
 * Run one judge call. Returns the parsed verdict plus the raw bytes for the transcript.
 * @param {{cmd:string, args:string[]}} judge
 * @param {string} prompt
 * @param {number} timeoutMs
 * @param {Record<string,string>} [extraEnv]  merged over process.env for this call (e.g. ATLAS_JUDGE_PASS).
 * @returns {{verdict:string, status:number|null, raw:string, err:string}}
 */
export function callJudge(judge, prompt, timeoutMs = 180_000, extraEnv = {}) {
  const r = spawnSync(judge.cmd, judge.args, {
    input: prompt,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  })
  const raw = r.stdout ?? ""
  const err = r.stderr ?? ""
  // A spawn failure (missing command) or non-zero exit means the judge did not answer — that is an ABSTAIN
  // for scoring purposes, but we surface status/err so a broken judge is visible, not silently absorbed.
  const status = r.status
  const verdict = status === 0 ? parseVerdict(raw) : "ABSTAIN"
  return { verdict, status: status ?? null, raw, err: String(r.error?.message ?? err ?? "") }
}

/**
 * Run the full panel: for each fixture, call the judge `passes` times; collect verdicts; score.
 * @param {import('./fixtures.mjs').Fixture[]} fixtures
 * @param {(fx: import('./fixtures.mjs').Fixture) => string} renderPrompt
 * @param {{cmd:string, args:string[]}} judge
 * @param {{passes?:number, timeoutMs?:number, onCall?:Function}} [opts]
 * @returns {{
 *   passes:number,
 *   perItemVerdicts:string[][],
 *   counts:number[][],
 *   labels:Array<'true'|'false'>,
 *   fleiss: ReturnType<typeof fleissKappa>,
 *   detection: ReturnType<typeof detectionRates>,
 *   transcript: Array<{id:string, label:string, falseKind?:string, verdicts:string[], statuses:Array<number|null>}>
 * }}
 */
export function runPanel(fixtures, renderPrompt, judge, opts = {}) {
  const passes = opts.passes ?? 3
  const timeoutMs = opts.timeoutMs ?? 180_000
  if (!(passes >= 2)) throw new Error("runPanel: passes must be ≥2 (κ needs ≥2 raters per item)")

  const perItemVerdicts = []
  const labels = []
  const transcript = []

  for (const fx of fixtures) {
    const prompt = renderPrompt(fx)
    const verdicts = []
    const statuses = []
    for (let p = 0; p < passes; p++) {
      // ATLAS_JUDGE_PASS lets a judge vary its answer per pass (a real judge may seed sampling on it; the
      // fake judge uses it to make passes disagree so κ<1 paths are exercised). A judge that ignores it is
      // unaffected.
      const res = callJudge(judge, prompt, timeoutMs, { ATLAS_JUDGE_PASS: String(p) })
      verdicts.push(res.verdict)
      statuses.push(res.status)
      opts.onCall?.({ id: fx.id, pass: p, ...res })
    }
    perItemVerdicts.push(verdicts)
    labels.push(fx.label)
    transcript.push({ id: fx.id, label: fx.label, falseKind: fx.falseKind, verdicts, statuses })
  }

  const counts = countsFromVerdicts(perItemVerdicts)
  const fleiss = fleissKappa(counts)
  const detection = detectionRates(counts, labels)
  return { passes, perItemVerdicts, counts, labels, fleiss, detection, transcript }
}
