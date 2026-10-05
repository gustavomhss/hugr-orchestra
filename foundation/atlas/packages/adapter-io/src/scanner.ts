// @atlas/adapter-io -- src/scanner.ts  (CAMPAIGN-11 W5 - MEM-9b/9c binding)
//
// ── REFERENCE MODEL ── NO PRODUCTION CALLERS ───────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `makeScannerAdapter` yet. `packages/memory/src/portable.ts`
// (`writeWithScanner`) defines the `NamedScanner` seam and BLOCKS a write fail-closed on a hit; that seam
// has never been bound to a real binary. Wiring it into the write door is W4, a different work package in
// this campaign -- declared here rather than pre-wired, because composing a door early just to clear this
// gate is exactly the stub `reference-model-guard.mjs` exists to refuse. It becomes shipped code the moment
// W4 composes it, and this entry goes STALE then (that leg of the gate says so out loud when it happens).
// Mirrors `packages/adapter-io/src/memory-store.ts` banner exactly (same campaign, same shape of gap).
//
// -- WHAT THIS FILE DOES, AND DOES NOT, CLAIM --------------------------------------------------------
// Detection QUALITY (which byte patterns ARE a secret) is delegated to the named binary (FR-12) -- this
// file authors ZERO regexes and ZERO entropy heuristics. Its only job is: locate a NAMED scanner binary on
// PATH, invoke it safely (argv only, no shell, bounded timeout, no shell-interpolation of record content),
// and turn its exit into one of THREE values -- clean | hit | could-not-run -- never collapsed to two.
// A caller must never be able to read "could not run the scanner" as "no secret found"; that conflation is
// the exact failure shape MEM-9 exists to close (see `ScannerBlockedError` own doc in portable.ts).
//
// -- THE NO-BINARY DISPOSITION (A9) ------------------------------------------------------------------
// When NEITHER `gitleaks` NOR `trufflehog` is on PATH, `makeScannerAdapter()` returns a NAMED scanner
// whose `scan()` ALWAYS returns `true` (block). This is a deliberate choice, not an omission:
//   - "we could not check" and "there is no secret" must never be the same boolean value. A silent-pass
//     no-op scanner would make MEM-9 fail-closed gate into fail-OPEN the moment the binary is missing --
//     silently, with no signal at the call site -- which is worse than not having the seam at all, because
//     it LOOKS gated.
//   - The seam contract (`writeWithScanner`) is already fail-closed on a HIT; making the absence of a
//     scanner ALSO block is the same discipline applied one level up, and it is the only disposition that
//     cannot be quietly defeated by uninstalling a binary.
//   - The cost is real and is stated, not hidden: in an environment with no scanner installed (this repo,
//     today -- neither `gitleaks` nor `trufflehog` is a dependency here), EVERY memory write refuses. That
//     is the intended shape until the owner installs a scanner; it is a loud, attributable refusal (the
//     adapter own name says so -- see `NO_SCANNER_NAME` below) rather than a silent pass.

import { execFileSync } from "node:child_process"
import type { MemoryRecord, NamedScanner } from "@atlas/memory"

/** The three-value scan outcome. `scan()` on the `NamedScanner` seam is boolean (block/pass) by contract
 *  (`writeWithScanner`) -- this richer value is what this module computes BEFORE it is collapsed to that
 *  boolean, and it is exported so a caller that wants to log/observe WHY a write blocked can. */
export type ScanVerdict = "clean" | "hit" | "could-not-run"

/** One known scanner binary invocation contract. `cleanExitCodes` / `hitExitCodes` are the DOCUMENTED
 *  exit codes for that binary "no secrets" / "secrets found" outcomes; ANY other exit (a crash, an
 *  unrecognised flag, a version that changed its codes) is `could-not-run` -- never silently read as clean.
 *  Record content is piped over STDIN (`input`), never interpolated into `args` or a shell string. */
export interface ScannerBinarySpec {
  readonly name: "gitleaks" | "trufflehog"
  readonly command: string
  readonly args: readonly string[]
  readonly cleanExitCodes: readonly number[]
  readonly hitExitCodes: readonly number[]
}

// ── ARGV IS CALIBRATED AGAINST A LIVE BINARY, AND THE FIRST VERSION WAS NOT ───────────────────────────
// This table used to be written best-effort from the tools' public docs, with the note that neither binary
// was installed here so it could not be checked -- and with the reassurance that a disagreeing binary would
// "fall through to `could-not-run`, the fail-closed default, not a silent misread."
//
// THAT REASONING HAD A HOLE, and using the door found it. gitleaks was invoked as
// `detect --no-git --source -`, and `--source -` is not how any gitleaks reads stdin: it resolves `-` as a
// PATH, fails, and exits **1**. Exit 1 is a code this table DOCUMENTS -- it means "a finding". So the
// unknown-exit fallback never ran; a wrong-argv failure arrived wearing the one exit code that means
// "secret detected", and the door refused EVERY memory write on any machine with gitleaks installed. Green
// unit tests (which inject a fake scanner) and eleven green gates all agreed it was fine.
//
// MEASURED on gitleaks 8.30.1, both directions, which is what makes the table below a fact rather than a
// reading of the docs:
//   `gitleaks detect --no-git --source -`  < clean input   -> exit 1   (the defect: clean read as a hit)
//   `gitleaks stdin --exit-code 1`         < clean input   -> exit 0
//   `gitleaks stdin --exit-code 1`         < an RSA key    -> exit 1
// The `stdin` SUBCOMMAND is the supported stdin path in 8.x (`detect --pipe` is the deprecated spelling and
// exits 1 on clean input here too). `scanner-conformance.test.ts` re-measures both directions against the
// real binary and is SKIP-when-absent but never vacuous -- with no binary it asserts the no-scanner refusal
// instead, so the file always asserts something.
//
// trufflehog remains DOC-DERIVED and unmeasured -- it is not installed on this machine. That is stated here
// rather than left to be assumed calibrated by association with the line above it.
const KNOWN_SCANNERS: readonly ScannerBinarySpec[] = [
  {
    name: "gitleaks",
    command: "gitleaks",
    args: ["stdin", "--report-format", "json", "--exit-code", "1"],
    cleanExitCodes: [0],
    hitExitCodes: [1],
  },
  {
    name: "trufflehog",
    command: "trufflehog",
    args: ["filesystem", "--no-update", "--fail", "-"],
    cleanExitCodes: [0],
    hitExitCodes: [183],
  },
]

/** The name a `NamedScanner` carries when NO real binary was found on PATH -- attributable, never blank,
 *  never a name that could be confused with a real scanner. */
export const NO_SCANNER_NAME = "no-scanner-on-path"

const DEFAULT_TIMEOUT_MS = 5_000

/** Is `command` runnable from PATH? Probed with `--version` (never mutates anything). An `ENOENT` from the
 *  spawn means the binary is genuinely absent; ANY other outcome (including a non-zero exit -- some tools
 *  reject `--version`) means the binary exists and is spawnable, which is all this predicate claims. */
function isOnPath(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore", timeout: DEFAULT_TIMEOUT_MS })
    return true
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code
    return code !== "ENOENT"
  }
}

/** Find the first `KNOWN_SCANNERS` entry whose binary is on PATH, in declared order. `null` when neither
 *  is available -- the caller (`makeScannerAdapter`) is responsible for the fail-closed no-binary case. */
export function detectAvailableScanner(
  scanners: readonly ScannerBinarySpec[] = KNOWN_SCANNERS,
): ScannerBinarySpec | null {
  for (const spec of scanners) {
    if (isOnPath(spec.command)) return spec
  }
  return null
}

/** Read a caught `execFileSync` error exit code. `status` is set on a plain non-zero exit; a TIMEOUT or a
 *  kill sets `signal` (and `status` is `null`) -- that path returns `null` here so it falls through to
 *  `could-not-run` rather than being misread as some numbered exit. */
function exitCodeOf(err: unknown): number | null {
  if (err === null || typeof err !== "object") return null
  const e = err as { status?: unknown; signal?: unknown }
  if (typeof e.status === "number") return e.status
  return null // ENOENT, timeout/signal-killed, or any other spawn failure.
}

/**
 * Invoke one scanner binary against a record content and return its verdict as one of THREE values.
 * The subprocess is invoked with `input` on stdin -- record content is NEVER interpolated into `args` or a
 * shell string (no shell is used at all; `execFileSync` with an argv array). Every error path -- a
 * non-zero/non-documented exit, a timeout, a spawn failure (binary vanished between detection and call),
 * unparseable/unexpected exit codes -- resolves to `could-not-run`, never silently to `clean`.
 */
export function runScanner(
  spec: ScannerBinarySpec,
  record: MemoryRecord,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): ScanVerdict {
  const input = JSON.stringify(record)
  try {
    execFileSync(spec.command, spec.args as string[], {
      input,
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    })
    // No throw => exit 0. Only a verdict if 0 is a DOCUMENTED clean code for this spec.
    return spec.cleanExitCodes.includes(0) ? "clean" : "could-not-run"
  } catch (err) {
    const code = exitCodeOf(err)
    if (code !== null && spec.hitExitCodes.includes(code)) return "hit"
    if (code !== null && spec.cleanExitCodes.includes(code)) return "clean"
    // Timeout, spawn failure, or an exit code neither spec documents -- fail closed, never clean.
    return "could-not-run"
  }
}

/**
 * Bind the memory package `NamedScanner` seam (`portable.ts`, MEM-9b) to a real binary when one is on
 * PATH, or to an honest fail-closed refusal when none is (A9 -- see the file header). `scan()` is the
 * boolean the seam contract requires; a `hit` AND a `could-not-run` verdict BOTH return `true`
 * (block) -- collapsing three values to two happens ONLY at this documented boundary, never inside
 * `runScanner`, and a caller that needs the distinction reaches for `runScanner`/`ScanVerdict` directly.
 */
export function makeScannerAdapter(
  opts: { readonly timeoutMs?: number; readonly scanners?: readonly ScannerBinarySpec[] } = {},
): NamedScanner {
  const spec = detectAvailableScanner(opts.scanners)
  if (spec === null) {
    return {
      name: NO_SCANNER_NAME,
      scan(): boolean {
        // No binary at all: "could not check" must never read as "no secret" (file header). Every write
        // refuses until the owner installs a named scanner.
        return true
      },
    }
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return {
    name: spec.name,
    scan(record: MemoryRecord): boolean {
      return runScanner(spec, record, timeoutMs) !== "clean"
    },
  }
}
