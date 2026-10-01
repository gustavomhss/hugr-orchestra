#!/usr/bin/env node
// harness/probes/adjudicate/run-calibration.mjs — the RE-RUNNABLE calibration command. It runs the panel
// over the labeled fixtures and writes a DERIVED report (κ, catch-rate, false-alarm) — never a quoted
// number. Re-running it reproduces the file; the committed report carries the exact command that made it.
//
// TWO MODES, and the report says loudly which one produced it:
//   --fake[=oracle|noisy]   a ZERO-COST pipeline smoke. Proves the wiring + math end to end with no model
//                           call. Its κ/catch/false-alarm are NOT a measurement of any real judge.
//   (default, live)         calls the real judge command (judge.mjs → `claude --model $JUDGE_MODEL`). This
//                           is the metered run that produces the real calibration number.
//
// USAGE
//   node run-calibration.mjs --fake=noisy                       # committed smoke (deterministic)
//   node run-calibration.mjs --fake=oracle
//   JUDGE_MODEL=claude-sonnet-4-6 node run-calibration.mjs      # live (metered) — default judge
//   node run-calibration.mjs --judge-cmd gpt-judge --passes 5   # different-family judge, 5 passes
//
// FLAGS
//   --fake[=oracle|noisy]   use the fake judge (default oracle if bare)
//   --judge-cmd <cmd>       judge executable (default: node, running judge.mjs)
//   --judge-args <json>     JSON array of judge args
//   --passes <n>            judge passes per fixture (default 5)
//   --out-dir <dir>         where to write the report (default: this file's dir)
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { writeFileSync } from "node:fs"
import { FIXTURES, renderPrompt } from "./fixtures.mjs"
import { runPanel } from "./adjudicate.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const a = { fake: null, judgeCmd: null, judgeArgs: [], passes: 5, outDir: HERE }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === "--fake") a.fake = "oracle"
    else if (t.startsWith("--fake=")) a.fake = t.slice("--fake=".length) || "oracle"
    else if (t === "--judge-cmd") a.judgeCmd = argv[++i]
    else if (t === "--judge-args") a.judgeArgs = JSON.parse(argv[++i])
    else if (t === "--passes") a.passes = Number(argv[++i])
    else if (t === "--out-dir") a.outDir = argv[++i]
    else throw new Error(`unknown flag: ${t}`)
  }
  return a
}

const KAPPA_BANDS = [
  [0.81, "almost perfect (Landis & Koch)"],
  [0.61, "substantial"],
  [0.41, "moderate"],
  [0.21, "fair"],
  [0.0, "slight"],
  [-Infinity, "poor (worse than chance)"],
]
const band = (k) =>
  Number.isNaN(k) ? "undefined (degenerate: all ratings one category)" : KAPPA_BANDS.find(([lo]) => k >= lo)[1]

function falseKindBreakdown(transcript, detection) {
  const byKind = new Map()
  transcript.forEach((t, i) => {
    if (t.label !== "false") return
    const kind = t.falseKind || "unspecified"
    const rec = byKind.get(kind) || { total: 0, caught: 0 }
    rec.total += 1
    if (detection.perItem[i].decision === "HALLUCINATED") rec.caught += 1
    byKind.set(kind, rec)
  })
  return [...byKind.entries()].sort()
}

function renderMarkdown(r, args, model) {
  const live = !args.fake
  const k = r.fleiss.kappa
  const cat = r.detection.catch
  const fa = r.detection.falseAlarm
  const judgeDesc = args.fake
    ? `fake-judge.mjs (mode=${args.fake})`
    : `${args.judgeCmd ?? "node judge.mjs"} (model=${model})`
  const cmd = args.fake
    ? `node harness/probes/adjudicate/run-calibration.mjs --fake=${args.fake} --passes ${args.passes}`
    : `JUDGE_MODEL=${model} node harness/probes/adjudicate/run-calibration.mjs --passes ${args.passes}`

  const lines = []
  lines.push("# Adjudication calibration report")
  lines.push("")
  lines.push(
    live
      ? "> **LIVE JUDGE RUN** — real metered model calls."
      : "> **PIPELINE SMOKE (FAKE JUDGE)** — no model call. These numbers prove the driver + κ/catch/false-alarm MATH end to end; they are NOT a calibration of any real judge. Live-judge calibration is **PENDING a metered run**.",
  )
  lines.push("")
  lines.push("This report is DERIVED, not quoted. Reproduce it with:")
  lines.push("")
  lines.push("```")
  lines.push(cmd)
  lines.push("```")
  lines.push("")
  lines.push("## Instrument")
  lines.push(`- judge: \`${judgeDesc}\``)
  lines.push(`- passes per fixture: **${r.passes}**  (raters per item for Fleiss κ)`)
  lines.push(
    `- fixtures: **${r.labels.length}**  (${r.labels.filter((l) => l === "true").length} known-true, ${r.labels.filter((l) => l === "false").length} planted-false)`,
  )
  lines.push(
    "- decision rule: per-item **majority** vote across passes; a tie ⇒ ABSTAIN (neither caught nor false-alarmed).",
  )
  lines.push("")
  lines.push("## Headline")
  lines.push("")
  lines.push("| metric | value | reading |")
  lines.push("| --- | --- | --- |")
  lines.push(`| Fleiss κ (inter-judge agreement) | ${Number.isNaN(k) ? "NaN" : k.toFixed(4)} | ${band(k)} |`)
  lines.push(
    `| catch-rate (planted-false caught) | ${cat.caught}/${cat.total}${cat.rate === null ? "" : ` = ${(cat.rate * 100).toFixed(1)}%`} | higher is better |`,
  )
  lines.push(
    `| false-alarm (known-true flagged false) | ${fa.alarmed}/${fa.total}${fa.rate === null ? "" : ` = ${(fa.rate * 100).toFixed(1)}%`} | lower is better |`,
  )
  lines.push(`| P̄ (observed agreement) | ${r.fleiss.pBar.toFixed(4)} | |`)
  lines.push(`| P_e (chance agreement) | ${r.fleiss.pE.toFixed(4)} | |`)
  lines.push("")
  lines.push("## Catch by planted-false kind")
  lines.push("")
  lines.push("| falseKind | caught / total |")
  lines.push("| --- | --- |")
  for (const [kind, rec] of falseKindBreakdown(r.transcript, r.detection)) {
    lines.push(`| ${kind} | ${rec.caught}/${rec.total} |`)
  }
  lines.push("")
  lines.push("## Per-fixture")
  lines.push("")
  lines.push("| id | label | kind | verdicts (per pass) | majority | correct |")
  lines.push("| --- | --- | --- | --- | --- | --- |")
  r.transcript.forEach((t, i) => {
    const dec = r.detection.perItem[i]
    lines.push(
      `| ${t.id} | ${t.label} | ${t.falseKind ?? "—"} | ${t.verdicts.join(", ")} | ${dec.decision} | ${dec.correct ? "yes" : "NO"} |`,
    )
  })
  lines.push("")
  return lines.join("\n")
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const model = process.env.JUDGE_MODEL || "claude-sonnet-4-6"

  let judge
  let promptFn = renderPrompt
  if (args.fake) {
    judge = { cmd: "node", args: [join(HERE, "fake-judge.mjs")] }
    process.env.FAKE_JUDGE_MODE = args.fake
    // The fake keys off the fixture id — inject it as a line the model-facing prompt never carries. A real
    // judge never sees this branch.
    promptFn = (fx) => `FIXTURE_ID: ${fx.id}\n${renderPrompt(fx)}`
  } else if (args.judgeCmd) {
    judge = { cmd: args.judgeCmd, args: args.judgeArgs }
  } else {
    judge = { cmd: "node", args: [join(HERE, "judge.mjs"), ...args.judgeArgs] }
  }

  const r = runPanel(FIXTURES, promptFn, judge, { passes: args.passes })

  const json = {
    generatedBy: "harness/probes/adjudicate/run-calibration.mjs",
    mode: args.fake ? `fake:${args.fake}` : "live",
    judgeModel: args.fake ? null : model,
    passes: r.passes,
    kappa: r.fleiss.kappa,
    pBar: r.fleiss.pBar,
    pE: r.fleiss.pE,
    degenerate: r.fleiss.degenerate,
    catch: r.detection.catch,
    falseAlarm: r.detection.falseAlarm,
    perItem: r.transcript.map((t, i) => ({
      id: t.id,
      label: t.label,
      falseKind: t.falseKind ?? null,
      verdicts: t.verdicts,
      majority: r.detection.perItem[i].decision,
      correct: r.detection.perItem[i].correct,
    })),
  }

  const suffix = args.fake ? `.smoke-${args.fake}` : ".live"
  writeFileSync(join(args.outDir, `calibration-report${suffix}.json`), JSON.stringify(json, null, 2) + "\n")
  writeFileSync(join(args.outDir, `calibration-report${suffix}.md`), renderMarkdown(r, args, model))

  process.stderr.write(
    `calibration: mode=${json.mode} κ=${Number.isNaN(r.fleiss.kappa) ? "NaN" : r.fleiss.kappa.toFixed(4)} ` +
      `catch=${r.detection.catch.caught}/${r.detection.catch.total} ` +
      `false-alarm=${r.detection.falseAlarm.alarmed}/${r.detection.falseAlarm.total}\n`,
  )
}

main()
