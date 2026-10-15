#!/usr/bin/env node
// harness/probes/model-call-shim.mjs — the RECORDING model shim: an instrument for measuring how many
// model calls Atlas really has in flight at once.
//
// It stands where `roles.propose.cmd` stands (ADR-0011 D1: prompt on stdin, claim on stdout, non-zero exit
// is a failure). It runs the REAL command underneath, unchanged, and writes one self-contained record per
// call. Nothing about the product's behaviour changes — it is a passthrough that keeps a ledger.
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────────
// The previous shim named its per-call log files `call-$(date +%s%N)`. BSD `date` — the `date` on macOS —
// does not implement `%N`; it emits the literal character `N`. So the "nanosecond" id was an epoch SECOND,
// every call that began within the same second wrote to the SAME four filenames, and the eight members of a
// `POOL_WIDTH`-wide batch collapsed into one. Two lies came out of that one bug:
//
//   1. "calls in flight" was computed as `count(*.in) - count(*.rc)`, which under that collision can
//      essentially never exceed 1. A 200-call run that took 581s — 25 batches of 8, arithmetically
//      impossible to reach serially at ~22s per call — was read off the instrument as SERIAL, and a
//      healthy pool was opened as a defect.
//   2. Worse, and silently: eight concurrent `cmd > "$N.out"` redirections to ONE path each opened it with
//      O_TRUNC and wrote from offset 0, so the file was a byte-level OVERLAY of up to eight different
//      answers, and `cat "$N.out"` handed that splice back to Atlas as the claim for the site. Verified in
//      the archived log: a record whose text ends mid-sentence and is followed by the tail of a longer,
//      unrelated answer showing through past it. The transcript was not merely mislabelled; the ANSWERS
//      were corrupted, and so was every fact admitted from them.
//
// So the two properties below are not conveniences. They are the whole reason this file exists.
//
// ── PROPERTY 1: THE CALL ID CANNOT COLLIDE, AND NOT BECAUSE OF A CLOCK ───────────────────────────────────
// The id is a `randomUUID()` and the record file is created with `openSync(path, 'wx')` — O_CREAT|O_EXCL.
// Uniqueness is therefore enforced BY THE KERNEL at create time: two processes cannot both succeed on one
// name, whatever the clock's resolution, whatever the concurrency, and whatever pid reuse does. Every other
// candidate fails on something:
//   • a timestamp (any resolution) collides whenever two calls land inside one tick — the original bug;
//   • `$$` alone collides on pid reuse across a long run;
//   • `mktemp` is fine (it is O_EXCL underneath) but is a subprocess spawn per call and its guarantee is
//     harder to read off the source than the flag that provides it.
// A collision is additionally DETECTABLE after the fact rather than merely believed to be absent: a record
// file holds exactly two NDJSON lines, and `concurrency-report.mjs` refuses a file that holds more.
//
// ── PROPERTY 2: THE TIMESTAMPS HAVE SUB-SECOND RESOLUTION, AND SAY SO ────────────────────────────────────
// `performance.timeOrigin + performance.now()` is a wall-clock reading in FLOAT milliseconds. Wall clock is
// required rather than `hrtime`: the intervals being swept come from DIFFERENT PROCESSES, and a per-process
// monotonic origin cannot be compared across them. Sub-millisecond resolution is what lets peak concurrency
// be RECONSTRUCTED by sweeping intervals offline instead of SAMPLED — sampling is what made the earlier
// measurement depend on when you happened to look. `concurrency-report.mjs` re-checks the resolution it
// actually received and refuses a log whose timestamps are all whole seconds, which is the signature the
// `%N` bug left behind.
//
// ── PROPERTY 3: THE TRANSCRIPT IS PER CALL ───────────────────────────────────────────────────────────────
// `<id>.prompt`, `<id>.out` and `<id>.err` are named by the same uncollidable id, so no two concurrent calls
// can write to one path. This is the half of the old shim that was corrupting data rather than just
// mismeasuring it.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────────────────────────
// It does not retry, does not time out (`budget.timeoutMs` is enforced by the product, one layer up, and a
// second timeout here would silently take that decision away from it), does not rewrite the prompt, and does
// not interpret the answer. `stdout` is forwarded byte for byte and the inner command's exit STATUS is this
// process's exit status — so "non-zero exit ⇒ ModelCommandError" and "empty stdout ⇒ abstention" both still
// mean exactly what `packages/adapter-io/src/llm.ts` says they mean. An instrument that changed either of
// those would be measuring a different product.
//
// ── USAGE ────────────────────────────────────────────────────────────────────────────────────────────────
//   ATLAS_PROBE_LOG=/abs/log/dir \
//   ATLAS_PROBE_CMD=claude \
//   ATLAS_PROBE_ARGS='["-p"]' \
//     node harness/probes/model-call-shim.mjs
//
// wired into an operator model config (`$ATLAS_MODEL_CONFIG`) as:
//   { "roles": { "propose": { "cmd": "node", "args": ["<repo>/harness/probes/model-call-shim.mjs"] } } }
//
// The `node` + `args` form is the recommended one: it does not depend on the executable bit surviving a
// checkout. The file also carries a shebang and mode 755, so naming it directly as `cmd` works too.
//
// Harness invariant (harness/README.md): no `@atlas/*` import. This module links no product code — it only
// stands in front of a command the product runs.

import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs"
import { join } from "node:path"

/** The exit status this shim uses for its OWN misconfiguration, chosen not to collide with a plausible
 *  model exit. It is loud on purpose: a shim that cannot record must not quietly proxy, or the run's
 *  measurement silently becomes a guess. */
const SHIM_CONFIG_EXIT = 70

/** A wall-clock reading in float milliseconds since the epoch, sub-millisecond resolution. WALL clock, not
 *  `hrtime`: the intervals are compared ACROSS processes and a per-process monotonic origin cannot be. */
export const nowMs = () => performance.timeOrigin + performance.now()

/** Read the whole prompt from stdin before anything else runs. The product pipes it (`llm.ts` `input:`) and
 *  a shim that spawned the inner command first would leave the parent's write racing a child that is not
 *  reading yet — the EPIPE window `salvageEarlyExit` exists to paper over. Draining first closes it. */
function readStdin() {
  try {
    return readFileSync(0)
  } catch {
    return Buffer.alloc(0) // no stdin attached (a bare hand-run) — an empty prompt, never a crash
  }
}

function fail(message) {
  process.stderr.write(`model-call-shim: ${message}\n`)
  process.exit(SHIM_CONFIG_EXIT)
}

/**
 * Create THIS call's record file and return its handle + id.
 *
 * The `wx` flag is the entire uniqueness guarantee (O_CREAT|O_EXCL): the kernel refuses the create if the
 * name exists, so the loop below can only ever hand back a name no other process holds. `randomUUID` makes
 * the retry unreachable in practice; the retry is there so the guarantee does not rest on that.
 */
function openRecord(logDir) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = randomUUID()
    try {
      return { id, fd: openSync(join(logDir, `${id}.jsonl`), "wx"), path: join(logDir, `${id}.jsonl`) }
    } catch (e) {
      if (e?.code !== "EEXIST") throw e
    }
  }
  return null
}

export function main() {
  const logDir = process.env.ATLAS_PROBE_LOG
  const cmd = process.env.ATLAS_PROBE_CMD
  if (logDir === undefined || logDir === "") fail("$ATLAS_PROBE_LOG must name the directory to record into")
  if (cmd === undefined || cmd === "") fail("$ATLAS_PROBE_CMD must name the model command to run underneath")

  let args
  try {
    args = process.env.ATLAS_PROBE_ARGS === undefined ? [] : JSON.parse(process.env.ATLAS_PROBE_ARGS)
  } catch {
    fail("$ATLAS_PROBE_ARGS must be a JSON array of strings")
  }
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) {
    fail("$ATLAS_PROBE_ARGS must be a JSON array of strings")
  }

  mkdirSync(logDir, { recursive: true })
  const rec = openRecord(logDir)
  if (rec === null) fail("could not create a unique record file — the log directory is not writable")

  const prompt = readStdin()
  writeFileSync(join(logDir, `${rec.id}.prompt`), prompt)

  // The START line is written and FLUSHED before the inner command is spawned, so a run that is killed
  // mid-flight still leaves evidence that this call had begun. `concurrency-report.mjs` names such records
  // as unfinished rather than dropping them — a dropped in-flight call is exactly how a measurement
  // understates its own peak.
  const startedAt = nowMs()
  writeSync(
    rec.fd,
    `${JSON.stringify({ ev: "start", id: rec.id, pid: process.pid, at: startedAt, promptBytes: prompt.length })}\n`,
  )

  const r = spawnSync(cmd, args, { input: prompt, maxBuffer: 1024 * 1024 * 256 })
  const endedAt = nowMs()

  const stdout = r.stdout ?? Buffer.alloc(0)
  const stderr = r.stderr ?? Buffer.alloc(0)
  writeFileSync(join(logDir, `${rec.id}.out`), stdout)
  writeFileSync(join(logDir, `${rec.id}.err`), stderr)

  // `spawnSync` reports a spawn failure (a missing command) as `error` with `status === null`. That is not
  // a model that said nothing — it is a broken configuration, and it must reach the product as a non-zero
  // exit so `llm.ts` raises `ModelCommandError` rather than recording an abstention.
  const status = r.status === null || r.status === undefined ? SHIM_CONFIG_EXIT : r.status
  writeSync(
    rec.fd,
    `${JSON.stringify({
      ev: "end",
      id: rec.id,
      pid: process.pid,
      at: endedAt,
      durationMs: endedAt - startedAt,
      status,
      signal: r.signal ?? null,
      stdoutBytes: stdout.length,
      stderrBytes: stderr.length,
      spawnError: r.error === undefined ? null : String(r.error.message ?? r.error),
    })}\n`,
  )
  closeSync(rec.fd)

  // PASSTHROUGH, byte for byte. `writeSync` on fd 1 rather than `process.stdout.write` so nothing is left
  // buffered when this process exits — a truncated answer would read to the product as a different claim.
  let off = 0
  while (off < stdout.length) off += writeSync(1, stdout, off, stdout.length - off)
  if (stderr.length > 0) {
    let e = 0
    while (e < stderr.length) e += writeSync(2, stderr, e, stderr.length - e)
  }
  process.exit(status)
}

// ── NO `is this the entry point?` GUARD, AND THAT IS THE FIX ─────────────────────────────────────────────
// This file is a COMMAND. Nothing imports it, so the usual `import.meta.url === argv[1]` guard buys nothing
// — and it costs the one failure this instrument must never have. The guard was written, and it was wrong
// twice over, because `process.argv[1]` and `import.meta.url` are not two spellings of one path:
//
//   argv[1] : /tmp/sp194/a dir with spaces/model-call-shim.mjs
//   meta.url: file:///private/tmp/sp194/a%20dir%20with%20spaces/model-call-shim.mjs
//
// They differ by percent-encoding (any space in a checkout path) AND by symlink resolution (`/tmp` and
// `/var/folders` — where `os.tmpdir()` points on macOS — are symlinks that ESM resolves and `argv` does not).
// Either divergence makes the guard false, `main()` never runs, and the shim exits 0 having written NOTHING
// to stdout — which `llm.ts` reads as an ABSTENTION (GEN-12). A whole run would then record "the model had
// nothing to say" at every site, about a model that was never asked. MEASURED: reproduced from a spaced
// path under `/tmp`, and pinned by `concurrency-report.test.mjs`.
//
// Correct guards exist (`realpathSync` + `pathToFileURL`, or `import.meta.filename` on new enough Node).
// None of them is worth a silent-abstention risk in a file whose only job is to be executed.
main()
