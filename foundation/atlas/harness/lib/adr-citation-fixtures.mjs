// harness/lib/adr-citation-fixtures.mjs — the shared fixture plumbing for adr-citation-guard's twins.
//
// A LIBRARY, not a gate: importing it runs no sweep, asserts nothing and prints nothing (the contract
// `gate-directory.test.mjs` enforces on everything in `harness/lib/`). It exists because the guard now has
// TWO corpora and therefore two twins — `adr-citation-guard.test.mjs` (the `docs/**` teeth, the report
// shape, the four original refusals) and `adr-citation-guard.packages.test.mjs` (the `packages/**` teeth,
// the A4 fixture exclusion, A-4/A-5) — and the alternative was ~45 lines of scratch-tree plumbing copied
// into both, where the two copies drift and the second one silently stops meaning what it says.
//
// Everything here builds INPUT trees or reads the gate's OUTPUT. No expectations live in this file: a
// helper that asserts moves the teeth out of the twin that is supposed to own them.

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

/**
 * Run the gate against `root` via `ADR_CITATION_GUARD_ROOT`. The exit code comes from `execFileSync`'s
 * thrown `status` — NEVER from a shell pipeline, which reports the LAST command's status and has already
 * bought this repo two false greens.
 */
export function runGate(gatePath, root) {
  try {
    const stdout = execFileSync(process.execPath, [gatePath], {
      env: { ...process.env, ADR_CITATION_GUARD_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out: stdout }
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

/** A scratch-root factory whose temp dirs are all removed by the returned `cleanup`. The prefix is this
 *  harness's own, so nothing else in the tree is ever a removal candidate. */
export function scratchPool() {
  const temps = []
  return {
    scratch() {
      const d = mkdtempSync(join(tmpdir(), "atlas-adrcite-"))
      temps.push(d)
      return d
    },
    cleanup() {
      for (const d of temps) rmSync(d, { recursive: true, force: true })
    },
  }
}

/** The `citing file:line → ADR-NNNN` occurrences the gate reported, in order. */
export const reported = (out) =>
  out
    .split("\n")
    .map((l) => /^\s*✗\s+(\S+)\s+→\s+(ADR-\d{4})\b/.exec(l))
    .filter((m) => m !== null)
    .map((m) => `${m[1]} → ${m[2]}`)

/** The refusal code (`A-0`…`A-5`) the gate printed, or `null` if it reported dangling citations instead. */
export const refusal = (out) => (/^\s*✗\s+(A-\d)\s/m.exec(out) ?? [null, null])[1]

/** The `N file(s) excluded` figure the gate reports for the A4 fixture exclusion, as a number. */
export const excludedCount = (out) =>
  Number((/fixture exclusion .*: (\d+) file\(s\) excluded/.exec(out) ?? [null, NaN])[1])

/** Write one `docs/adr/ADR-<n>-<slug>.md` into the index. */
export const adr = (root, n, slug) => {
  mkdirSync(join(root, "docs", "adr"), { recursive: true })
  writeFileSync(join(root, "docs", "adr", `ADR-${n}-${slug}.md`), `# ADR-${n} — ${slug}\n`)
}

/** The minimal `packages/**` corpus that satisfies A-4 + A-5 while contributing ZERO citations — so a
 *  docs-focused fixture's hand-written expected report cannot gain rows from its own scaffolding. */
export const pkgFloor = (root) => {
  mkdirSync(join(root, "packages", "p", "src"), { recursive: true })
  writeFileSync(join(root, "packages", "p", "src", "a.ts"), "export const a = 1;\n")
}

/** Write one file into the code corpus at a path relative to `packages/`. */
export const pkgFile = (root, relPath, text) => {
  const abs = join(root, "packages", ...relPath.split("/"))
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

/** A complete, CLEAN docs half — one ADR in the index and one resolving citation. Used by the code-corpus
 *  twin so every failure it observes is attributable to the `packages/**` leg and nothing else. */
export const cleanDocs = (root) => {
  adr(root, "0001", "exists")
  writeFileSync(join(root, "docs", "note.md"), "ADR-0001 is cited here.\n")
}
