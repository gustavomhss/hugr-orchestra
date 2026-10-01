// harness/probes/adjudicate/subject-score.mjs — the A1 SUBJECT-TEST scorer.
//
// The methodology collapse (docs/design/95-benchmark-methodology.md): the LLM is the SUBJECT under
// measurement, the fixture labels are ground truth we planted by construction, and NO LLM judge sits in the
// correctness loop. This file does the deterministic half: given the sub-agents' verdicts (one per fixture)
// and the labeled fixtures, it scores false-admit / catch / false-alarm with a Wilson 95% interval and writes
// the derived report. It makes NO model call and imports no `@atlas/*` (harness invariant).
//
// The model-in-loop is a SUB-AGENT (Agent tool), never a `claude -p` subprocess — so the verdicts arrive here
// as a committed JSON file (a1-subject-verdicts.json), not by this script shelling a judge. That keeps the
// scoring reproducible while honoring the sub-agent law. Reproducibility is by RECORD (HELM/lm-eval): the
// verdicts file logs the model + run date, this dir pins the frozen prompt digest, and the raw per-fixture
// verdicts are committed — that IS the reproducible instrument; temperature is a recorded knob, not a gate.
//
//   node harness/probes/adjudicate/subject-score.mjs                 # score the committed verdicts, print
//   node harness/probes/adjudicate/subject-score.mjs --write         # also (re)write the .md/.json report
//   node harness/probes/adjudicate/subject-score.mjs --verdicts x.json

import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { FIXTURES } from "./fixtures.mjs"
import { detectionRates, CATEGORIES } from "./fleiss.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

/** Wilson score 95% interval for k successes in n trials. */
export function wilson(k, n, z = 1.96) {
  if (n === 0) return [null, null]
  const p = k / n
  const z2 = z * z
  const d = 1 + z2 / n
  const c = (p + z2 / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d
  return [Math.max(0, c - h), Math.min(1, c + h)]
}

/**
 * Score a verdict map against the labeled fixtures. Pure: no I/O, no model.
 * @param {Record<string,'GROUNDED_TRUE'|'HALLUCINATED'|'ABSTAIN'>} verdicts  fixture id -> verdict token
 * @returns the derived scores + per-item detail.
 */
export function scoreSubject(verdicts) {
  const missing = FIXTURES.filter((fx) => !verdicts[fx.id]).map((fx) => fx.id)
  if (missing.length) throw new Error(`subject-score: no verdict for ${missing.join(", ")}`)
  const labels = FIXTURES.map((fx) => fx.label)
  const counts = FIXTURES.map((fx) => {
    const row = [0, 0, 0]
    const j = CATEGORIES.indexOf(verdicts[fx.id])
    if (j < 0) throw new Error(`subject-score: bad verdict token for ${fx.id}: ${verdicts[fx.id]}`)
    row[j] = 1
    return row
  })
  const det = detectionRates(counts, labels)
  const falses = FIXTURES.filter((fx) => fx.label === "false")
  const admitted = falses.filter((fx) => verdicts[fx.id] === "GROUNDED_TRUE")
  const fa = wilson(admitted.length, falses.length)
  return {
    n: { total: FIXTURES.length, true: FIXTURES.length - falses.length, false: falses.length },
    false_admit: { leaked: admitted.length, total: falses.length, rate: admitted.length / falses.length, wilson95: fa },
    catch: { caught: det.catch.caught, total: det.catch.total, rate: det.catch.rate },
    false_alarm: { alarmed: det.falseAlarm.alarmed, total: det.falseAlarm.total, rate: det.falseAlarm.rate },
    leaks: admitted.map((a) => ({ id: a.id, falseKind: a.falseKind, anchor: a.anchor })),
    verdicts: FIXTURES.map((fx) => ({
      id: fx.id,
      label: fx.label,
      falseKind: fx.falseKind ?? null,
      verdict: verdicts[fx.id],
    })),
  }
}

function fixturesDigest() {
  return createHash("sha256")
    .update(readFileSync(join(HERE, "fixtures.mjs")))
    .digest("hex")
    .slice(0, 16)
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  const vIdx = args.indexOf("--verdicts")
  const vPath = vIdx >= 0 ? args[vIdx + 1] : join(HERE, "a1-subject-verdicts.json")
  const input = JSON.parse(readFileSync(vPath, "utf8"))
  const verdicts = input.verdicts ?? input
  const scores = scoreSubject(verdicts)
  const digest = fixturesDigest()
  const digestMatch = input.fixtures_sha256_16 ? input.fixtures_sha256_16 === digest : null

  const fa = scores.false_admit
  process.stdout.write(
    `A1 subject-test (planted ground truth, no LLM judge in correctness loop)\n` +
      `  n=${scores.n.total} (${scores.n.true} true, ${scores.n.false} false)  fixtures.sha256[:16]=${digest}` +
      `${digestMatch === false ? " [!! verdicts pinned a DIFFERENT digest]" : ""}\n` +
      `  false-admit : ${fa.leaked}/${fa.total} = ${fa.rate.toFixed(3)}  Wilson95%=[${fa.wilson95[0].toFixed(3)}, ${fa.wilson95[1].toFixed(3)}]\n` +
      `  catch       : ${scores.catch.caught}/${scores.catch.total} = ${scores.catch.rate}\n` +
      `  false-alarm : ${scores.false_alarm.alarmed}/${scores.false_alarm.total} = ${scores.false_alarm.rate}\n` +
      `  leaks       : ${scores.leaks.map((l) => `${l.id}(${l.falseKind})`).join(", ") || "none"}\n`,
  )

  if (args.includes("--write")) {
    const report = {
      kind: "a1-subject-test",
      method_doc: "docs/design/95-benchmark-methodology.md",
      instrument: {
        fixtures_file: "harness/probes/adjudicate/fixtures.mjs",
        fixtures_sha256_16: digest,
        subject:
          input.subject ?? "fresh sonnet sub-agent per fixture (Agent tool), frozen renderPrompt verbatim, 1 pass",
        judge_in_correctness_loop: false,
      },
      ...scores,
      run: { model: input.subject ?? null, date: input.run_date ?? null, prompt_digest: digest },
      limits: [
        "n=20 small; Wilson95% wide",
        "reproducible by record (model + date + prompt digest + committed verdicts), not by forced T=0",
        "precision only, not recall",
        "synthetic-clean fixtures by design",
      ],
      supersedes: "live 29/30=96.7% demoted to non-citable smoke (LLM self-verification)",
    }
    writeFileSync(join(HERE, "calibration-report.a1-subject.json"), JSON.stringify(report, null, 2) + "\n")
    process.stdout.write("wrote calibration-report.a1-subject.json\n")
  }
}
