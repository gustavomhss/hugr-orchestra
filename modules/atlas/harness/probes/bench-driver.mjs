#!/usr/bin/env node
// harness/probes/bench-driver.mjs — the #95 benchmark's A1 (precision) + A3 (cost) DATA COLLECTOR.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────────────────
// The A1/A3 axes need ONE reproducible run over a chosen corpus, joinable to what the model was actually
// asked and what it actually cost — until now hand-orchestrated per bench run. The pieces already exist:
//   - `metered-claude.mjs` — the metering model wrapper, keys every call by a pool-safe SITE (`qualifiedPath`
//     recovered from the prompt's `<unit …>` header). `cost-sum.mjs` rolls it to a total; this does per-SITE.
//   - `RunCoverage`/`SiteOutcome` (`packages/genesis/src/types.ts`) — the per-site run LEDGER, printed by
//     `mine-render.ts` and parsed whole by `mine-report.mjs` `parseFullMineReport`.
//   - `mine-answer.ts` `answerReceipt` — the CAS-addressed, tamper-evident receipt a mined answer carries
//     (`answerRef` in the staging sidecar row); read back here via `atlas-store-read.mjs` `casGet`.
// This file RUNS `atlas mine` over a corpus and STITCHES those into one per-site MANIFEST row: outcome ×
// fact + provenance × cost × model identity. It does NOT adjudicate truth (J1's job) or compute recall
// (A4's job) — it only COLLECTS.
//
// ── THE JOIN KEY ─────────────────────────────────────────────────────────────────────────────────────────
// Three sources name a site three different ways, reconciled to ONE key here — the printed `path` on the
// coverage row, the `qualifiedPath` `mine-render.ts` prints (bare path for a file/repo anchor, `path::name`
// for a symbol/block):
//   - the LEDGER's `path` — one row per PLANNED site (`mine-report.mjs` `parseSiteRows`).
//   - the SIDECAR's `site` — `metered-claude.mjs`'s `deriveSiteKey`, reconstructed from the SAME `<unit
//     path="…" name="…">` prompt header, so it is the SAME qualifiedPath string by construction (MEASURED).
//   - the STAGING sidecar's `primaryAnchor` — the site a candidate row is anchored to (`sidecar.ts`).
// None of the three is a synthetic id this file invents.
//
// ── CROSS-UNIT COST ISOLATION (bug fixed after cold review, 2026-08-11) ─────────────────────────────────
// `deriveSiteKey`'s `site` is the bare REPO-RELATIVE `qualifiedPath` — no package/unit identity, since
// `metered-claude.mjs` only ever sees the piped prompt. Two units sharing a relative path (routine —
// `src/index.ts` in every package) therefore share a site key, and one sidecar accumulates EVERY unit's rows
// across the whole run, so joining by `site` against the WHOLE sidecar would splice unit A's cost onto unit
// B's site: `costJoined` stays `true`, the shape looks right, the number is simply WRONG.
//
// FIX: a SIDECAR OFFSET, not a namespaced key. `runCorpus` checkpoints the sidecar's byte length BEFORE each
// unit's `runMineOnce`, and joins ONLY the bytes appended after. Within one repo's run every `qualifiedPath`
// is unique, so "this unit's own appended rows" closes the gap — two units' slices never meet. See
// `bench-driver.test.mjs` "cross-unit cost isolation" (two fixture units sharing `src/index.ts`).
//
// A HONEST GAP, NAMED RATHER THAN HIDDEN: a `seeded` row's `facts` array carries the PRE-write-door
// `Fact.id` (`genesis/src/coverage.ts`), NOT the nodeKey the write door mints (MEASURED: they differ). So
// facts are looked up by `primaryAnchor === row.path` instead — correct for one-fact-per-site (today's only
// mined shape) and NAMED (`factLookup: 'by-primary-anchor'`) rather than silently trusted.
//
// ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────────────────────────────────
// It does not adjudicate, does not compute recall, does not touch product code, and does not fabricate a
// cost/precision number for a live run it has not driven — a live metered run is a SEPARATE, explicitly
// PENDING step; this file's own `.test.mjs` proves the pipeline deterministically on the fake model, at $0.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.
//
// ── USAGE ────────────────────────────────────────────────────────────────────────────────────────────────
//   node harness/probes/bench-driver.mjs \
//     --corpus <corpus.json>  # array of `{ "repo": "<abs path>", "label"?: "<string>" }`
//     --cli <path/to/bin.js>  # the built @atlas/cli entrypoint (packages/cli/dist/src/bin.js)
//     --model <model-id>      # stamped on every row; passed to metered-claude as $METERED_MODEL
//     --manifest <out.json>   # where the joined manifest is written
//     [--model-cmd <path>]    # the propose.cmd script; default metered-claude.mjs (real metering)
//     [--claude-bin <bin>]    # $METERED_CLAUDE_BIN, default `claude`; point at a fake for a $0 rehearsal.
//     [--sidecar <path>]      # metering sidecar path; default a fresh temp file
//     [--config-dir <dir>]    # where $ATLAS_MODEL_CONFIG is written — MUST be outside every corpus repo (in-repo is refused); default a fresh temp dir
//
// Every corpus entry runs as `node <cli> mine .` with `cwd: repo` — `mine`'s CLI takes no `--scope`
// (`<repo>` is currently ignored; the entrypoint calls `runMine(process.cwd())`), so scoping one run to one
// unit means running it FROM that unit's directory. A "13 packages" corpus is 13 separate invocations.

import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { casGet, readSidecar } from "./atlas-store-read.mjs"
import { parseFullMineReport } from "./mine-report.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

/** Read + validate a corpus spec: a JSON array of `{ repo: string, label?: string }`. Every `repo` is
 *  resolved to an absolute path relative to the CWD it was invoked from (not this file's directory) — a
 *  corpus file is a caller artifact, not a harness one. Throws with the offending index named; a corpus this
 *  cannot read is not a run this driver should silently run zero sites over. */
export function readCorpus(path) {
  let raw
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch (e) {
    throw new Error(`bench-driver: corpus ${path} is not valid JSON: ${(e && e.message) || e}`)
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`bench-driver: corpus ${path} must be a non-empty JSON array of { repo, label? }`)
  }
  return raw.map((entry, i) => {
    if (entry === null || typeof entry !== "object" || typeof entry.repo !== "string" || entry.repo.trim() === "") {
      throw new Error(`bench-driver: corpus[${i}] must be an object carrying a non-empty string \`repo\``)
    }
    return { repo: resolve(entry.repo), label: typeof entry.label === "string" ? entry.label : entry.repo }
  })
}

/** Build the `$ATLAS_MODEL_CONFIG` JSON `loadModelConfig` reads — `roles.propose.cmd/args` only; every other
 *  field takes the product's own default. `modelCmd` is the metering wrapper's own path (not the underlying
 *  `claude`/fake binary — that is `$METERED_CLAUDE_BIN`, an env knob `metered-claude.mjs` reads itself). */
export function buildModelConfig(modelCmd) {
  return { roles: { propose: { cmd: "node", args: [modelCmd] } } }
}

/** Write a model config OUTSIDE every corpus repo (`configDir` is the caller's job to keep clear of them) —
 *  `loadModelConfig` refuses a config read from inside the repository under analysis (`docs/reference/commands/mine.md`
 *  §"What it refuses"), so a config planted inside a corpus repo would make every run in that repo exit 2. */
export function writeModelConfig(configDir, modelCmd) {
  mkdirSync(configDir, { recursive: true })
  const path = join(configDir, "model.json")
  writeFileSync(path, JSON.stringify(buildModelConfig(modelCmd)))
  return path
}

/** Run `atlas mine .` once, in `repo`, under the given model config + metering env. Returns the raw
 *  captured stdout+stderr (merged) and the exit code — NEVER throws on a non-zero exit (exit 1/2 are
 *  legitimate `mine` outcomes, `docs/reference/commands/mine.md` §"Exit codes"); only a `node`-level spawn
 *  failure (a missing `cli` binary) throws, since that is a driver misconfiguration, not a run outcome. */
export function runMineOnce({ repo, cliBin, modelConfigPath, model, sidecarPath, claudeBin, extraEnv = {} }) {
  const env = {
    ...process.env,
    ATLAS_MODEL_CONFIG: modelConfigPath,
    METERED_MODEL: model,
    ATLAS_COST_SIDECAR: sidecarPath,
    // The bench measures ONE axis per run, and that axis is now EXPLICIT: the default `atlas mine` unions all
    // arms (advisory + dependency + count), so a per-site manifest join needs the single-arm render. Advisory
    // reproduces the prior single-axis measurement byte-for-byte; a future per-axis sweep parameterizes this.
    ATLAS_MINE_SLOT: "advisory",
    ...(claudeBin !== undefined ? { METERED_CLAUDE_BIN: claudeBin } : {}),
    ...extraEnv,
  }
  let status = 0
  let out = ""
  try {
    out = execFileSync("node", [cliBin, "mine", "."], {
      cwd: repo,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (e) {
    // A non-zero `mine` exit lands here (`execFileSync` throws on any non-zero status) — that is a real run
    // outcome (partial / governed refusal), not a driver failure, so it is folded into the return value
    // rather than re-thrown. `e.status === null` (spawn never happened — e.g. `node` itself missing) is the
    // one case that IS a driver misconfiguration, and that alone is re-thrown.
    if (e.status === null || e.status === undefined) {
      throw new Error(`bench-driver: could not spawn \`node ${cliBin} mine .\` in ${repo}: ${(e && e.message) || e}`)
    }
    status = e.status
    out = (e.stdout ?? "") + (e.stderr ?? "")
  }
  return { stdout: out, exitCode: status }
}

/** Look up every staging row anchored at `path`, by `primaryAnchor` (see the header note on why NOT by the
 *  ledger's own fact id). Returns `[]` when the staging sidecar could not be read at all (`unreadable`) OR
 *  simply carries no such row — both cases are reported by the caller as an explicit note, never silently. */
function stagingRowsAt(repo, path) {
  const staging = readSidecar(repo, "staging")
  if (!staging.present) return []
  return staging.entries
    .filter((e) => Array.isArray(e) && e.length === 2 && e[1] !== null && typeof e[1] === "object")
    .map(([nodeKey, row]) => ({ nodeKey, ...row }))
    .filter((row) => row.primaryAnchor === path)
}

/** The CAS-addressed answer receipt for one staging row, read back through `atlas-store-read.mjs`
 *  (`answerRef` is the CAS id of the scrubbed answer text — `mine-answer.ts`). `undefined` when the row
 *  carries no `answerRef` (a pre-#195 row) or the CAS object could not be read — never fabricated. */
function answerFor(repo, row) {
  if (typeof row.answerRef !== "string") return undefined
  const obj = casGet(repo, row.answerRef)
  return { answerRef: row.answerRef, answerText: typeof obj === "string" ? obj : undefined }
}

/** The metering sidecar row(s) for one site, joined by the SAME qualifiedPath string `metered-claude.mjs`
 *  derives (`deriveSiteKey`). ALL matching rows are returned (a pool can retry/duplicate a call).
 *  `sidecarLines` MUST already be scoped to the ONE unit being joined (this unit's own byte-offset slice —
 *  see `readSidecarSince` / "CROSS-UNIT COST ISOLATION" above), never the whole multi-unit sidecar. */
function costRowsAt(sidecarLines, path) {
  return sidecarLines.filter((r) => r.site === path)
}

/** The sidecar's current byte length — the CHECKPOINT `runCorpus` takes immediately before a unit's
 *  `runMineOnce`. `0` for a sidecar that does not exist yet (not an error — the first unit's checkpoint is
 *  legitimately 0); an existing-but-unstatable sidecar THROWS rather than silently reading as 0, which would
 *  let a later checkpoint under-count and pull an EARLIER unit's rows into its own slice. */
function sidecarByteLength(sidecarPath) {
  try {
    return statSync(sidecarPath).size
  } catch (e) {
    if (e && e.code === "ENOENT") return 0
    throw new Error(`bench-driver: could not stat sidecar ${sidecarPath} to checkpoint it: ${(e && e.message) || e}`)
  }
}

/**
 * Read ONLY the sidecar lines APPENDED after byte offset `fromByte` — the per-unit slice that closes the
 * cross-unit collision gap. Three outcomes, not two — an unreadable sidecar is never collapsed into a
 * silent "no cost rows":
 *   - `error: undefined`             — read cleanly, including "does not exist yet" (honest pre-call state).
 *   - `error: <message>`, `rows: []` — untrustworthy for this unit: unreadable, OR SHORTER than `fromByte`
 *     (truncated/replaced mid-run — the offset is no longer meaningful). A benchmark that read this as
 *     `$0`/`costJoined:false` would print a PLAUSIBLE, WRONG number; this refuses instead.
 * `malformed` names any appended line that is not valid JSON (offset-scoped).
 */
function readSidecarSince(sidecarPath, fromByte) {
  let text
  try {
    text = readFileSync(sidecarPath, "utf8")
  } catch (e) {
    if (e && e.code === "ENOENT") return { rows: [], malformed: [], error: undefined }
    return { rows: [], malformed: [], error: `sidecar ${sidecarPath} could not be read: ${(e && e.message) || e}` }
  }
  const buf = Buffer.from(text, "utf8")
  if (buf.length < fromByte) {
    return {
      rows: [],
      malformed: [],
      error: `sidecar ${sidecarPath} is ${buf.length} byte(s), SHORTER than the ${fromByte}-byte checkpoint taken before this unit ran — it was truncated or replaced mid-run, so this unit's slice cannot be trusted`,
    }
  }
  const appended = buf.subarray(fromByte).toString("utf8")
  const rows = []
  const malformed = []
  for (const line of appended.split("\n")) {
    if (line.trim() === "") continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      malformed.push(line)
    }
  }
  return { rows, malformed, error: undefined }
}

/**
 * Build one corpus unit's manifest rows: one per PLANNED site in its ledger, joining outcome + fact +
 * provenance (staging/CAS) + cost (metering sidecar) + the model identity the caller stamped this run with.
 * `factLookup: 'by-primary-anchor'` on every `seeded` row is the NAMED assumption from the header (one fact
 * per seeded site — today's only mined shape).
 *
 * `sidecarLines` MUST be this unit's own offset-sliced rows (`readSidecarSince`), never the whole sidecar —
 * see "CROSS-UNIT COST ISOLATION" above. `costError`, when given, means the sidecar could not be trusted for
 * this unit at all: every site is stamped `costStatus: 'error'` rather than the false-cheap `costJoined:
 * false` a silently-empty read would produce.
 */
export function buildUnitManifest({ repo, label, model, stdout, sidecarLines, costError }) {
  const parsed = parseFullMineReport(stdout)
  if (parsed === undefined) {
    return {
      repo,
      label,
      model,
      parseError:
        "stdout did not carry the three lines `atlas mine` pins (genesis/cost/mine) — not a run this driver can join",
      sites: [],
    }
  }
  const sites = parsed.siteRows.map((row) => {
    // `costStatus`: 'error' — this unit's sidecar slice could not be trusted (`costError` set); 'joined' —
    // ≥1 cost row matched within this unit's own slice; 'none' — the slice was readable but held no row for
    // this site. 'none' and 'error' are NEVER conflated — that conflation is the silent-false finding this fixes.
    const cost = costError === undefined ? costRowsAt(sidecarLines, row.path) : []
    const costStatus = costError !== undefined ? "error" : cost.length > 0 ? "joined" : "none"
    const base = {
      repo,
      label,
      model,
      rank: row.rank,
      kind: row.kind,
      path: row.path,
      outcome: row.outcome,
      cost: cost.length > 0 ? cost : null,
      costJoined: costStatus === "joined", // kept for existing callers; `costStatus` is the honest tri-state
      costStatus,
      ...(costError !== undefined ? { costError } : {}),
    }
    if (row.outcome === "seeded") {
      const staged = stagingRowsAt(repo, row.path)
      return {
        ...base,
        ledgerFactIds: row.facts, // the pre-write-door ids the ledger itself names — carried, not discarded
        facts: staged.map((s) => ({
          nodeKey: s.nodeKey,
          claims: s.claims,
          tier: s.tier,
          scope: s.scope,
          contentHash: s.contentHash,
          ...answerFor(repo, s),
        })),
        factLookup: "by-primary-anchor",
      }
    }
    if (row.outcome === "abstained") return { ...base, whyNot: row.whyNot }
    if (row.outcome === "unrecorded") return { ...base, note: row.note }
    if (row.outcome === "unvisited") return { ...base, cause: row.cause }
    return base // 'interrupted' carries only the base shape
  })
  return {
    repo,
    label,
    model,
    coverageVerdict: parsed.coverageVerdict,
    malformedSiteRows: parsed.malformedSiteRows,
    aggregate: {
      seeded: parsed.seeded,
      ratified: parsed.ratified,
      llmCalls: parsed.llmCalls,
      budgetSpent: parsed.budgetSpent,
    },
    sites,
  }
}

/**
 * Run the whole corpus and return the FULL manifest — one `units[]` entry per corpus repo, each carrying its
 * own `sites[]`. `deps` swaps `runMineOnce`/`readSidecarSince`/`sidecarByteLength` — the only three functions
 * that touch the filesystem/a subprocess — for the unit tests.
 *
 * CROSS-UNIT COST ISOLATION: the sidecar's byte length is checkpointed IMMEDIATELY BEFORE each unit's
 * `runMineOnce`, and that unit's cost is joined ONLY against bytes appended after its own checkpoint — never
 * the whole multi-unit sidecar, which is what makes a shared relative path (`src/index.ts` in two packages)
 * safe: the two slices are never looked up together.
 */
export function runCorpus({ corpus, cliBin, model, modelConfigPath, sidecarPath, claudeBin, extraEnv, deps = {} }) {
  const run = deps.runMineOnce ?? runMineOnce
  const checkpoint = deps.sidecarByteLength ?? sidecarByteLength
  const readSince = deps.readSidecarSince ?? readSidecarSince
  const units = corpus.map(({ repo, label }) => {
    const offsetBefore = checkpoint(sidecarPath)
    const { stdout, exitCode } = run({ repo, cliBin, modelConfigPath, model, sidecarPath, claudeBin, extraEnv })
    const {
      rows: sidecarLines,
      malformed: malformedSidecarLines,
      error: costError,
    } = readSince(sidecarPath, offsetBefore)
    const unit = buildUnitManifest({ repo, label, model, stdout, sidecarLines, costError })
    return { ...unit, exitCode, malformedSidecarLines, ...(costError !== undefined ? { costError } : {}) }
  })
  return {
    generatedAt: new Date().toISOString(),
    model,
    cliBin,
    sidecarPath,
    modelConfigPath,
    units,
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────
function parseArgv(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    out[a.slice(2)] = argv[++i]
  }
  return out
}

function main(argv) {
  const args = parseArgv(argv)
  const required = ["corpus", "cli", "model", "manifest"]
  const missing = required.filter((k) => args[k] === undefined)
  if (missing.length > 0) {
    process.stderr.write(
      `bench-driver: missing --${missing.join(", --")}\n` +
        "usage: node bench-driver.mjs --corpus <file.json> --cli <bin.js> --model <id> --manifest <out.json> " +
        "[--model-cmd <path>] [--claude-bin <bin>] [--sidecar <path>] [--config-dir <dir>]\n",
    )
    process.exit(2)
  }
  const corpus = readCorpus(resolve(args.corpus))
  const cliBin = resolve(args.cli)
  const modelCmd = resolve(args["model-cmd"] ?? join(HERE, "metered-claude.mjs"))
  const configDir =
    args["config-dir"] !== undefined ? resolve(args["config-dir"]) : mkdtempSync(join(tmpdir(), "atlas-bench-config-"))
  const sidecarPath =
    args.sidecar !== undefined
      ? resolve(args.sidecar)
      : join(mkdtempSync(join(tmpdir(), "atlas-bench-sidecar-")), "sidecar.jsonl")
  const modelConfigPath = writeModelConfig(configDir, modelCmd)

  const manifest = runCorpus({
    corpus,
    cliBin,
    model: args.model,
    modelConfigPath,
    sidecarPath,
    claudeBin: args["claude-bin"],
  })
  writeFileSync(resolve(args.manifest), JSON.stringify(manifest, null, 2))

  const totalSites = manifest.units.reduce((n, u) => n + u.sites.length, 0)
  const seeded = manifest.units.reduce((n, u) => n + u.sites.filter((s) => s.outcome === "seeded").length, 0)
  process.stdout.write(
    `bench-driver: ${manifest.units.length} unit(s), ${totalSites} planned site(s), ${seeded} seeded — manifest at ${args.manifest}\n`,
  )
}

// ── entry-point guard ────────────────────────────────────────────────────────────────────────────────────
// This file IS imported (by `bench-driver.test.mjs`), so `` `file://${argv[1]}` `` is NOT the right guard —
// `argv[1]` is unencoded/symlink-UNresolved, `import.meta.url` is both (see `concurrency-report.mjs`'s header
// for the measured `/tmp`/spaced-path divergence). `realpathSync` + `pathToFileURL` fixes it; a missing/stale
// `argv[1]` answers "not the entry point" — the safe direction for an imported module.
function isEntryPoint(url) {
  if (process.argv[1] === undefined) return false
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === url
  } catch {
    return false
  }
}

if (isEntryPoint(import.meta.url)) main(process.argv.slice(2))
