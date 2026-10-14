#!/usr/bin/env node
// harness/probes/adjudicate/judge.mjs — the DEFAULT judge command: reads an adjudication prompt on stdin,
// asks a model, writes the verdict text on stdout. It is one interchangeable judge, not THE judge.
//
// The model is a PARAMETER, not a constant:
//   JUDGE_MODEL   the model id passed to the CLI, default `claude-sonnet-4-6` (same family as the miner —
//                 so this default measures INTRA-family agreement; a model-INDEPENDENT number needs a
//                 different-family judge, which is a different command entirely, not an edit here).
//   JUDGE_BIN     the CLI to invoke, default `claude`. A different vendor's CLI drops in by name.
//   JUDGE_ARGS    a JSON array of extra args, default `[]`.
//
// Because the driver (adjudicate.mjs) talks to the judge purely as "prompt on stdin → text on stdout", ANY
// command with that shape is a valid judge. This file exists only so there is a sensible default; pointing
// the driver at a GPT/Gemini/local-model wrapper is the intended way to get a cross-family panel.
//
// STDOUT: the model's raw answer text, verbatim. The driver's parseVerdict pulls the token off the last
// line. On any error (missing CLI, non-zero exit, timeout) we write nothing and exit non-zero — the driver
// scores a non-zero judge as ABSTAIN and surfaces the status, so a broken judge is visible, not silent.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { execFileSync } from "node:child_process"
import { readFileSync, writeSync } from "node:fs"

const MODEL = process.env.JUDGE_MODEL || "claude-sonnet-4-6"
const BIN = process.env.JUDGE_BIN || "claude"
const TIMEOUT_MS = Number(process.env.JUDGE_TIMEOUT_MS || 180_000)

let extraArgs = []
try {
  extraArgs = process.env.JUDGE_ARGS ? JSON.parse(process.env.JUDGE_ARGS) : []
} catch {
  writeSync(2, "judge: JUDGE_ARGS must be a JSON array of strings\n")
  process.exit(2)
}

const prompt = readFileSync(0)

let out
try {
  out = execFileSync(BIN, ["-p", "--model", MODEL, "--output-format", "text", ...extraArgs], {
    input: prompt,
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "inherit"],
  })
} catch (err) {
  writeSync(2, `judge: model call failed: ${String(err?.message ?? err)}\n`)
  process.exit(1)
}

writeSync(1, out)
process.exit(0)
