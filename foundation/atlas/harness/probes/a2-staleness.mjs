#!/usr/bin/env node
// harness/probes/a2-staleness.mjs — the A2 (staleness) perturb→detect scoring instrument.
//
// WHAT. For each labeled corpus entry (`a2-corpus/index.mjs`) this DRIVES the real, shipped drift oracle —
// `createRevIndex(repo).reDerives(fact, newSha)` (packages/adapter-io/src/rev-index.ts:82), which resolves
// to `driftDetect(fact.grounding, axesAt(newSha))` (packages/grounding/src/drift.ts). It does not re-derive
// drift by any other means: a throwaway git repo is materialized, the entry's BASE state is committed (rev
// A), the anchored unit's `StructRef` is resolved there, the entry's MUTATED state is committed (rev B),
// and `reDerives` is asked whether the fact grounded at A still holds at B. The full methodology — why the
// corpus has exactly these two classes, why no callee/interface-fold leg, why negations are excluded — is
// docs/design/95b-staleness-a2-methodology.md.
//
// ── HOW THE PRODUCT ORACLE IS DRIVEN WITHOUT `harness/` LINKING `@atlas/*` ────────────────────────────────
// `harness/README.md`'s stated invariant is that `harness/` reasons about a repo from the OUTSIDE and never
// LINKS Atlas internals into its own process (so `harness/` stays a clean `git mv` into a future Orchestra
// repo), and `harness/gates/gate-directory.test.mjs` mechanically checks that no committed `.mjs` under
// `harness/` contains a static `import .. from '@atlas/…'`/`export .. from '@atlas/…'`. A2's whole mandate,
// though, is to measure the PRODUCT's own drift oracle — forking a look-alike would make this axis agree
// only with itself (see the methodology doc §2). The resolution used here is the SAME arm's-length shape
// `adjudicate/judge.mjs` uses for the `claude` binary: this file never links `@atlas/adapter-io` into its
// OWN process. It writes a small, self-contained RUNNER script to a throwaway temp file (never committed,
// never under `harness/`) that imports `@atlas/adapter-io` by its resolved ABSOLUTE dist path, spawns it as
// a genuinely separate `node` process, and reads back a JSON verdict over stdout. The two pure matching
// helpers below (`collectKeys`/`resolveQualifiedPath`) are inlined into that runner via `Function.toString`
// so the SAME code — not a second hand-copied implementation — runs in both the unit-tested parent process
// and the oracle-driving child, and can never drift apart.
//
// An anchor that fails to resolve at the BASE rev is a corpus bug, not a drift finding — it is reported
// separately (`unresolved`), never silently folded into the confusion matrix.

import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { CORPUS } from "./a2-corpus/index.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, "..", "..")
// The built entrypoint of @atlas/adapter-io. Its dist/ is produced by `npm run build`/`typecheck` (`tsc
// -b`), which CI runs before `npm test` (ci.yml) — the same build-order dependency `rev-index.test.ts`'s
// OWN cross-package `@atlas/index` import already relies on. Computed as a path string only — this line
// resolves no module and links nothing into THIS process.
const ADAPTER_IO_ENTRY = pathToFileURL(join(REPO_ROOT, "packages", "adapter-io", "dist", "src", "index.js")).href

/** Every node key in `node`'s subtree, preorder. Pure, no product import. */
function collectKeys(node, out = []) {
  out.push(node.key)
  for (const child of node.children) collectKeys(child, out)
  return out
}

/** Resolve `entry.anchor` to a qualifiedPath in `axes` (the built index at rev A): the file's own path for
 *  `{file:true}`, or the UNIQUE `::`-qualified key whose trailing name component is `needle` for `{needle}`
 *  — the same "search by trailing name" convention `ast-gap2-doc-comment.test.ts` uses, so a corpus entry
 *  never has to hardcode the exact ordinal-bearing key `unitPath` (ast.ts) mints. `undefined` if not found
 *  or ambiguous (≥2 candidates) — a badly-specified corpus entry is reported, never guessed. Pure. */
function resolveQualifiedPath(axes, entry) {
  if (entry.anchor.file === true) return entry.file
  const needle = entry.anchor.needle
  const keys = [...collectKeys(axes.spatial), ...collectKeys(axes.territory)]
  const candidates = [...new Set(keys.filter((k) => k.includes("::") && k.endsWith(`:${needle}`)))]
  return candidates.length === 1 ? candidates[0] : undefined
}

/** The child-process runner's full source, generated fresh each call (so `ADAPTER_IO_ENTRY` and the two
 *  inlined pure helpers above are always the CURRENT ones — never a stale copy on disk). This is the ONLY
 *  place `@atlas/adapter-io` is imported anywhere in this measurement, and it happens in a process this
 *  file spawns, not the one it runs in. */
function runnerSource() {
  return `
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRevIndex, initAst } from '${ADAPTER_IO_ENTRY}';

const g = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

function makeRepo() {
  const repoPath = mkdtempSync(join(tmpdir(), 'a2-staleness-'));
  g(repoPath, ['init', '-q']);
  g(repoPath, ['config', 'user.email', 't@t.t']);
  g(repoPath, ['config', 'user.name', 'T']);
  g(repoPath, ['config', 'commit.gpgsign', 'false']);
  return repoPath;
}

function commitFile(repoPath, relPath, content, msg) {
  const p = join(repoPath, relPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  g(repoPath, ['add', '-A']);
  g(repoPath, ['commit', '-q', '-m', msg]);
  return g(repoPath, ['rev-parse', 'HEAD']);
}

const collectKeys = ${collectKeys.toString()};
const resolveQualifiedPath = ${resolveQualifiedPath.toString()};

function scoreEntry(entry) {
  const repoPath = makeRepo();
  try {
    const A = commitFile(repoPath, entry.file, entry.base, 'A: base (' + entry.id + ')');
    const rev = createRevIndex(repoPath);
    const axesA = rev.axesAt(A);
    const qualifiedPath = resolveQualifiedPath(axesA, entry);
    if (qualifiedPath === undefined) {
      return { id: entry.id, class: entry.class, expected: entry.expected, actual: undefined, unresolved: true };
    }
    const anchor = rev.resolveAnchorAt(A, qualifiedPath);
    if (anchor === undefined) {
      return { id: entry.id, class: entry.class, expected: entry.expected, actual: undefined, unresolved: true };
    }
    const fact = { grounding: { entries: [{ anchor, path: entry.file }] } };
    const B = commitFile(repoPath, entry.file, entry.mutated, 'B: mutated (' + entry.id + ')');
    const holds = rev.reDerives(fact, B);
    const actual = holds ? 'FRESH' : 'DRIFTED';
    return { id: entry.id, class: entry.class, expected: entry.expected, actual, unresolved: false };
  } catch (err) {
    return { id: entry.id, class: entry.class, expected: entry.expected, actual: undefined, error: String(err && err.message || err) };
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
}

async function main() {
  await initAst();
  const corpusPath = process.argv[2];
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
  const rows = corpus.map(scoreEntry);
  process.stdout.write(JSON.stringify(rows));
}

main();
`
}

/** Run `corpus` (a plain-data array, JSON-serializable) through the real oracle in a spawned child process.
 *  Never throws on a per-entry failure (those are caught inside the runner and reported as `error` rows);
 *  DOES throw if the child process itself cannot be spawned or produces no parseable output — that is an
 *  infrastructure failure (e.g. dist/ not built), not a drift finding, and must not be swallowed. */
function runCorpusInSubprocess(corpus) {
  const dir = mkdtempSync(join(tmpdir(), "a2-runner-"))
  try {
    const corpusPath = join(dir, "corpus.json")
    const runnerPath = join(dir, "runner.mjs")
    writeFileSync(corpusPath, JSON.stringify(corpus))
    writeFileSync(runnerPath, runnerSource())
    const out = execFileSync("node", [runnerPath, corpusPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Score a single corpus entry (convenience for a one-entry unit test — still a real subprocess run). */
export function scoreEntry(entry) {
  const [row] = runCorpusInSubprocess([entry])
  return row
}

/**
 * Score the whole corpus. Returns `{ rows, matrix, unresolved, errored }`:
 *   - `matrix.true_stale_caught`     — invalidating, expected DRIFTED, oracle said DRIFTED (correct).
 *   - `matrix.true_stale_missed`     — invalidating, expected DRIFTED, oracle said FRESH (the dangerous miss).
 *   - `matrix.false_stale`           — preserving, expected FRESH, oracle said DRIFTED (false alarm).
 *   - `matrix.correct_fresh`         — preserving, expected FRESH, oracle said FRESH (correct).
 *   - `unresolved`/`errored`         — corpus entries the oracle never got a verdict on; NOT folded into the
 *     matrix, reported alongside it so a bad fixture can never masquerade as a passing score.
 */
export function scoreCorpus(corpus = CORPUS) {
  const rows = runCorpusInSubprocess(corpus)
  const matrix = { true_stale_caught: 0, true_stale_missed: 0, false_stale: 0, correct_fresh: 0 }
  const unresolved = []
  const errored = []
  for (const row of rows) {
    if (row.error !== undefined) {
      errored.push(row)
      continue
    }
    if (row.unresolved) {
      unresolved.push(row)
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
  return { rows, matrix, unresolved, errored }
}

function formatReport({ rows, matrix, unresolved, errored }) {
  const lines = []
  lines.push("A2 staleness — perturb→detect confusion matrix (reDerives, rev-index.ts)")
  lines.push("")
  for (const row of rows) {
    const status =
      row.error !== undefined
        ? `ERROR: ${row.error}`
        : row.unresolved
          ? "UNRESOLVED"
          : `expected=${row.expected} actual=${row.actual} ${row.actual === row.expected ? "OK" : "MISMATCH"}`
    lines.push(`  [${row.class}] ${row.id}: ${status}`)
  }
  lines.push("")
  const invalidatingTotal = matrix.true_stale_caught + matrix.true_stale_missed
  const preservingTotal = matrix.correct_fresh + matrix.false_stale
  lines.push(
    `true_stale_caught=${matrix.true_stale_caught}/${invalidatingTotal}  true_stale_missed=${matrix.true_stale_missed}/${invalidatingTotal}`,
  )
  lines.push(
    `correct_fresh=${matrix.correct_fresh}/${preservingTotal}  false_stale=${matrix.false_stale}/${preservingTotal}`,
  )
  if (unresolved.length > 0)
    lines.push(`UNRESOLVED (excluded from matrix, corpus bug): ${unresolved.map((r) => r.id).join(", ")}`)
  if (errored.length > 0) lines.push(`ERRORED (excluded from matrix): ${errored.map((r) => r.id).join(", ")}`)
  return lines.join("\n")
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const result = scoreCorpus(CORPUS)
  console.log(formatReport(result))
  const clean =
    result.matrix.true_stale_missed === 0 &&
    result.matrix.false_stale === 0 &&
    result.unresolved.length === 0 &&
    result.errored.length === 0
  process.exit(clean ? 0 : 1)
}

export { resolveQualifiedPath, formatReport }
