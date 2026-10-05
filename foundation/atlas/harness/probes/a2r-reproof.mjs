#!/usr/bin/env node
// harness/probes/a2r-reproof.mjs — the A2r (RE-PROOF staleness) perturb→detect scoring instrument.
//
// WHAT. Turns the ~20-minute hand trial (task #244/#245's brief) into a repeatable one-command measurement.
// For each labeled corpus entry (`a2r-corpus/index.mjs`) this DRIVES the real, shipped re-proof oracle —
// `reverifyFact(node, fact, leg, docExists)` (`packages/adapter-io/src/reverify-store.ts`), riding the SAME
// `createVerifyFactLeg` `atlas verify-fact`/`atlas verify-store` use — over a SCRATCH `git worktree` copy of
// THIS repo's own real source, with the entry's literal find/replace edits applied, a genuinely fresh build
// (`tsc -b` + `scip-typescript index`), and a hand-built `GroundedFact`/`CurrentNode` pair carrying the
// entry's witness (the SAME fixture shape `reverify-store.test.ts`'s `wellFormed()`/`node()` use). It does
// not re-implement the replay, the anchor binding, the tamper checks, or the claim derivation — see
// `packages/adapter-io/src/reverify-store.ts`'s header for the full narrative of what `reverifyFact` checks.
//
// WHY A SCRATCH WORKTREE, NOT THIS REPO'S OWN `.atlas/`. The 17 real `seal:'proven'` facts in this
// developer's local `.atlas/` are UNTRACKED (`store-provenance.ts`'s whole premise) — they exist only on
// this machine, are not reproducible in CI or a fresh clone, and would make this instrument's numbers
// depend on who last ran `atlas mine`/`atlas promote` here. This probe instead SEEDS ITS OWN witnesses
// (`a2r-corpus/index.mjs`), each citing a REAL symbol in THIS repo's REAL, committed source (`git worktree
// add` off HEAD) — reproducible anywhere this repo's git history and `node_modules` are present. It never
// reads or writes this repo's own `.atlas/cas`/`.atlas/projection.json`.
//
// TWO TRAPS THIS FILE MUST NOT REPRODUCE (already paid for in wall-clock time by other seats):
//   1. `scip-typescript index` MUST run AFTER `tsc -b` — a dist-absent index collapses cross-package refs
//      to opaque `local` symbols and silently swings recall/precision (`docs/design/95-benchmark-methodology.md`).
//   2. `rm -rf dist && tsc -b` is NOT a clean rebuild — `tsconfig.tsbuildinfo` makes `tsc -b` believe a
//      package is already built and leave `dist/` silently ABSENT. This file never removes `dist/` or
//      `tsconfig.tsbuildinfo` mid-run; the ONE full clean build (`cleanBuild`, both removed TOGETHER) runs
//      exactly once, before any mutation, and every per-entry rebuild after that is a correct INCREMENTAL
//      `tsc -b` (source changed ⇒ tsc's own mtime/hash tracking rebuilds exactly the affected package(s) —
//      this is the sanctioned use of the cache, not the anti-pattern of touching half of it by hand).
//
// ── THE PRODUCT ORACLE IS DRIVEN WITHOUT `harness/` LINKING `@atlas/*` ──────────────────────────────────
// Same arm's-length shape `a2-staleness.mjs` uses for `reDerives`: this file never imports `@atlas/adapter-
// io`/`@atlas/genesis` into ITS OWN process. It writes a small, self-contained runner script to a throwaway
// temp file that imports both packages by their resolved ABSOLUTE dist paths INSIDE THE SCRATCH WORKTREE
// (so a rebuilt dist is what gets driven, never a stale copy elsewhere), spawns it as a genuinely separate
// `node` process per corpus entry, and reads back a JSON verdict over stdout.
//
// NOT WIRED INTO `npm test`. `scip-typescript` is not an `npm` dependency of this repo (only `tsc` and
// vitest are) — CI's `npm ci` never installs it, so a probe that requires it cannot be a `*.test.mjs` file
// vitest picks up (`vitest.config.mjs`'s `include` is `harness/**/*.test.mjs`). This file is a standalone
// `.mjs` script, run BY NAME — the same posture `mine-report.mjs`/`bench-driver.mjs` already have. A light
// `a2r-corpus.test.mjs` DOES run under `npm test` — it checks the corpus's own shape (ids unique, both
// classes present, every entry `real`), no build required.
//
// Run it standalone (from repo root — the REAL atlas repo, not a copy):
//
//   node harness/probes/a2r-reproof.mjs

import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { CORPUS } from "./a2r-corpus/index.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, "..", "..")

/** Shell out, throwing with stdout+stderr attached on a non-zero exit (never a silent swallow). */
function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts })
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} (cwd=${opts.cwd ?? process.cwd()}) exited ${res.status}\n${res.stdout ?? ""}\n${res.stderr ?? ""}`,
    )
  }
  return res.stdout ?? ""
}

/** Apply one entry's literal find/replace edits to the worktree. Throws (a corpus bug, never a silent
 *  no-op) if `find` does not occur in the file EXACTLY once — a corpus entry that stops matching real
 *  source (e.g. after an unrelated refactor upstream) must fail loudly, not silently mutate nothing. */
function applyEdits(worktree, edits) {
  for (const { file, find, replace } of edits) {
    const path = join(worktree, file)
    const before = readFileSyncOrThrow(path)
    const occurrences = before.split(find).length - 1
    if (occurrences !== 1) {
      throw new Error(`corpus bug: '${find.slice(0, 60)}…' occurs ${occurrences} times in ${file} (expected exactly 1)`)
    }
    writeFileSync(path, before.replace(find, replace))
  }
}

function readFileSyncOrThrow(path) {
  if (!existsSync(path)) throw new Error(`corpus bug: ${path} does not exist in the worktree`)
  return readFileSync(path, "utf8")
}

/** The child-runner's full source: imports `readScip`/`createVerifyFactLeg`/`reverifyFact` and
 *  `claimNormFromWitness` by RESOLVED ABSOLUTE dist paths inside `worktree` — the ONLY place either package
 *  is imported anywhere in this measurement, in a process this file spawns, never the one it runs in. */
function runnerSource(worktree) {
  const adapterIoEntry = join(worktree, "packages", "adapter-io", "dist", "src", "index.js")
  const genesisEntry = join(worktree, "packages", "genesis", "dist", "src", "index.js")
  return `
import { readFileSync } from 'node:fs';
import { readScip, createVerifyFactLeg, reverifyFact } from '${adapterIoEntry}';
import { claimNormFromWitness } from '${genesisEntry}';

const scipPath = process.argv[2];
const entry = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const scip = readScip(scipPath);
const leg = createVerifyFactLeg(scip);
const docExists = (p) => scip.documents.some((d) => d.relativePath === p);

const witness = entry.witness;
const fact = {
  kind: 'advisory', id: entry.id, tier: 'T2', claimNorm: claimNormFromWitness(witness),
  grounding: { entries: [] }, freshness: 'FRESH', claims: [], authoring: 'ADVISORY',
  seal: 'proven', witness,
};
const node = { nodeKey: entry.id, family: 'advisory', contentHash: 'ch-' + entry.id, claims: [], primaryAnchor: entry.anchor };
const row = reverifyFact(node, fact, leg, docExists);
process.stdout.write(JSON.stringify(row ?? { outcome: undefined, reason: 'reverifyFact returned undefined (not seal:proven — a fixture bug)' }));
`
}

/** Score ONE corpus entry against the real oracle, over the ALREADY-built `worktree`+`scipPath` state
 *  (the caller is responsible for having applied this entry's edits and rebuilt before calling). */
function scoreAgainstOracle(worktree, scipPath, entry) {
  const dir = mkdtempSync(join(tmpdir(), "a2r-runner-"))
  try {
    const entryPath = join(dir, "entry.json")
    const runnerPath = join(dir, "runner.mjs")
    writeFileSync(entryPath, JSON.stringify(entry))
    writeFileSync(runnerPath, runnerSource(worktree))
    const out = run("node", [runnerPath, scipPath, entryPath])
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** ONE full clean rebuild — `dist/` AND every `tsconfig.tsbuildinfo` removed TOGETHER, then `tsc -b` from
 *  nothing. Runs exactly ONCE, before any mutation (trap #2 in the module header). */
function cleanBuild(worktree) {
  run(
    "bash",
    ["-c", "find packages -maxdepth 2 -name dist -exec rm -rf {} + ; find packages -name tsconfig.tsbuildinfo -delete"],
    { cwd: worktree },
  )
  run("npx", ["tsc", "-b"], { cwd: worktree })
}

/** Incremental `tsc -b` — the SANCTIONED per-entry rebuild (trap #2): never touches `dist/`/tsbuildinfo by
 *  hand, so tsc's own cache stays internally consistent and only recompiles what the edit actually reaches. */
function incrementalBuild(worktree) {
  run("npx", ["tsc", "-b"], { cwd: worktree })
}

/** A fresh `scip-typescript index` — never incremental (trap #1: must run AFTER `tsc -b`, every time). */
function scipIndex(worktree) {
  const scipPath = join(worktree, ".atlas-a2r-index.scip")
  run("scip-typescript", ["index", "--output", scipPath], { cwd: worktree })
  return scipPath
}

/** Build the throwaway worktree once (git worktree off HEAD + symlinked node_modules), clean-build it once,
 *  and return `{ worktree, cleanup }`. Every corpus entry reuses this SAME worktree: edits are applied,
 *  scored, then reverted (`git checkout --`) and the incremental build restored before the next entry — so
 *  every entry starts from the SAME known-good baseline, never a leftover mutation from the previous one. */
function makeWorktree() {
  const worktree = mkdtempSync(join(tmpdir(), "a2r-worktree-"))
  rmSync(worktree, { recursive: true, force: true }) // `git worktree add` refuses an existing dir
  run("git", ["worktree", "add", "--detach", worktree, "HEAD"], { cwd: REPO_ROOT })
  symlinkSync(join(REPO_ROOT, "node_modules"), join(worktree, "node_modules"))
  cleanBuild(worktree)
  return {
    worktree,
    cleanup: () => {
      run("git", ["worktree", "remove", "--force", worktree], { cwd: REPO_ROOT })
    },
  }
}

/** Score the whole corpus. Returns `{ rows, matrix }` — `matrix` keyed the same way `a2-staleness.mjs`'s
 *  is, so a reader can diff the two axes' shapes: `true_stale_caught`/`true_stale_missed` (invalidating),
 *  `correct_fresh`/`false_stale` (preserving, named to match — `correct_fresh` here means "correctly stayed
 *  re-proven", not FRESH; the A2 vocabulary is reused deliberately, not because the underlying oracle is
 *  the same one — see the methodology doc for why it is a SECOND, independent mechanism). */
export function scoreCorpus(corpus = CORPUS, { worktreeFactory = makeWorktree, log = () => {} } = {}) {
  const { worktree, cleanup } = worktreeFactory()
  const rows = []
  try {
    for (const entry of corpus) {
      log(`  scoring ${entry.id}…`)
      applyEdits(worktree, entry.edits)
      incrementalBuild(worktree)
      const scipPath = scipIndex(worktree)
      let actual
      let error
      try {
        const verdict = scoreAgainstOracle(worktree, scipPath, entry)
        actual = verdict.outcome
      } catch (err) {
        error = String((err && err.message) || err)
      } finally {
        rmSync(scipPath, { force: true })
      }
      // revert to baseline before the next entry, regardless of outcome
      run("git", ["checkout", "--", ...[...new Set(entry.edits.map((e) => e.file))]], { cwd: worktree })
      incrementalBuild(worktree)
      rows.push({
        id: entry.id,
        class: entry.class,
        real: entry.real,
        technique: entry.technique,
        expected: entry.expected,
        actual,
        error,
      })
    }
  } finally {
    cleanup()
  }
  const matrix = { true_stale_caught: 0, true_stale_missed: 0, correct_fresh: 0, false_stale: 0 }
  const errored = []
  for (const row of rows) {
    if (row.error !== undefined) {
      errored.push(row)
      continue
    }
    if (row.class === "invalidating") {
      if (row.actual === row.expected) matrix.true_stale_caught += 1
      else matrix.true_stale_missed += 1
    } else {
      if (row.actual === row.expected) matrix.correct_fresh += 1
      else matrix.false_stale += 1
    }
  }
  return { rows, matrix, errored }
}

export function formatReport({ rows, matrix, errored }) {
  const lines = []
  lines.push("A2r RE-PROOF staleness — perturb→detect confusion matrix (reverifyFact, reverify-store.ts)")
  lines.push("")
  for (const row of rows) {
    const status =
      row.error !== undefined
        ? `ERROR: ${row.error}`
        : `expected=${row.expected} actual=${row.actual} ${row.actual === row.expected ? "OK" : "MISMATCH"}`
    lines.push(`  [${row.class}/${row.technique}] ${row.id}: ${status}`)
  }
  lines.push("")
  const realN = rows.filter((r) => r.real).length
  const synthN = rows.length - realN
  lines.push(`corpus: ${rows.length} entries (${realN} real, ${synthN} synthetic)`)
  const invalidatingTotal = matrix.true_stale_caught + matrix.true_stale_missed
  const preservingTotal = matrix.correct_fresh + matrix.false_stale
  lines.push(
    `true_stale_caught=${matrix.true_stale_caught}/${invalidatingTotal}  true_stale_missed=${matrix.true_stale_missed}/${invalidatingTotal}`,
  )
  lines.push(
    `correct_fresh=${matrix.correct_fresh}/${preservingTotal}  false_stale=${matrix.false_stale}/${preservingTotal}`,
  )
  if (errored.length > 0)
    lines.push(
      `ERRORED (excluded from matrix, an instrument bug, not a drift finding): ${errored.map((r) => r.id).join(", ")}`,
    )
  return lines.join("\n")
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const result = scoreCorpus(CORPUS, { log: (m) => process.stderr.write(m + "\n") })
  console.log(formatReport(result))
  const clean = result.matrix.true_stale_missed === 0 && result.matrix.false_stale === 0 && result.errored.length === 0
  process.exit(clean ? 0 : 1)
}
