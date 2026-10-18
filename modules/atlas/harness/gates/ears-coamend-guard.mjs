#!/usr/bin/env node
// ears-coamend-guard — when a REQ's `normative-clause` changes, its EARS phrase must change in the SAME
// commit (issue #198). The reasoning, the block model and the limits are in `harness/lib/ears-coamend.mjs`;
// this file is the thin git shell around that pure core: resolve a base, read the corpus THERE and HERE,
// diff, report.
//
// ── WHY IT IS A DIFF GATE AND HOW IT STAYS HONEST ON AN EMPTY / SHALLOW TREE ──────────────────────────
// The property is co-amendment, which only exists across two snapshots — so this gate needs a base commit
// to compare HEAD against. Two failure modes are designed for explicitly, because a diff gate that cannot
// find a base is the classic silently-green non-gate (issue #172):
//   • NO CORPUS (empty tree — the `gate-directory` fitness probe copies `harness/` alone): the working
//     tree read finds zero REQ blocks and this FAILS before it ever looks for git. That is the sibling
//     behaviour every gate here has, and it is what makes this file a real gate.
//   • NO BASE (shallow clone / detached history / `origin/master` absent): under CI this FAILS — a diff
//     gate that green-passes because it could not fetch history is misconfigured, not satisfied
//     (`ci.yml` sets `fetch-depth: 0` precisely so this branch is never taken on a real PR). Run locally
//     off CI with a corpus present but no resolvable base, it prints SKIPPED and exits 0: there is genuinely
//     no delta to judge, and the LOGIC is proven by the pure-core teeth regardless of git.
//
// Base is `git merge-base origin/master HEAD` (the fork point of a PR branch; on master itself it is HEAD,
// so the diff is empty and the gate is a no-op). Overridable by `EARS_COAMEND_BASE` for the git teeth, and
// the repo ROOT by `EARS_COAMEND_ROOT`, the same seams the sibling gates expose.
//
// STATED LIMIT (not a bug — the honest boundary): the base is read at the CURRENT filenames. A commit that
// RENAMES a requirement file AND changes a clause in it reads those REQs as new (absent at base) and skips
// them — git rename detection is not modelled. This is a rare corner (rename + normative edit in one
// commit) and it fails toward under-firing on that commit only; the clause quote itself is still held by
// `req-clause-guard` and the shape by `id-integrity`.

import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { REQ_FILE_RE, parseReqBlocks, coamendViolations } from "../lib/ears-coamend.mjs"
import { atlasRevisionSource } from "../../scripts/git-source-root.mjs"

const ROOT = process.env.EARS_COAMEND_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const REQ_DIR = join(ROOT, "docs", "requirements")

/** Strict Git reads; only default base discovery retains the local missing-base policy. */
function git(args) {
  return execFileSync("git", ["--no-replace-objects", "-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

function defaultBase() {
  try {
    return git(["merge-base", "origin/master", "HEAD"]).trim() || null
  } catch {
    return null
  }
}

/** The REQ-owner corpus files that exist in the working tree, relative to the current Atlas root. */
function corpusFiles() {
  let names
  try {
    names = readdirSync(REQ_DIR).filter((n) => REQ_FILE_RE.test(n))
  } catch {
    names = []
  }
  return names.sort().map((n) => `docs/requirements/${n}`)
}

/** Merge every file's blocks into ONE id→block map for a given reader (working tree, or a git ref). */
function corpusAt(read, files) {
  const byId = new Map()
  for (const rel of files) {
    const text = read(rel)
    if (text === null) continue // absent at this snapshot — its REQs are new/removed, not amended
    for (const [id, block] of parseReqBlocks(text)) byId.set(id, block)
  }
  return byId
}

function revisionCorpus(base, files) {
  try {
    const source = atlasRevisionSource(base, git, { allowEmpty: true })
    const corpus = corpusAt((rel) => {
      const path = `${source.prefix ? `${source.prefix}/` : ""}${rel}`
      const entry = git(["--literal-pathspecs", "ls-tree", "-z", "--full-tree", source.revision, "--", path])
        .split("\0")
        .find((entry) => entry.slice(entry.indexOf("\t") + 1) === path)
      // An absent file is a new requirement domain; a failed Git read is never absence.
      if (entry === undefined) return null
      if (entry.slice(0, entry.indexOf("\t")).split(" ")[1] !== "blob") {
        throw new Error(`ATLAS_SOURCE_CORPUS_NOT_BLOB: ${source.revision}:${path}`)
      }
      return git(["show", `${source.revision}:${path}`])
    }, files)
    if (corpus.size === 0) {
      console.log(`ears-coamend-guard: FIRST-IMPORT / NEW-CORPUS — no prior REQ blocks at ${source.revision.slice(0, 8)}; new requirements have no amendments to compare.`)
    }
    return corpus
  } catch (error) {
    if (error?.code === "ATLAS_SOURCE_PREFIX_MISSING") {
      console.log(`ears-coamend-guard: FIRST-IMPORT — Atlas absent at valid base ${base}; current requirements are new.`)
      return new Map()
    }
    console.error(`ears-coamend-guard: FAIL — cannot read base corpus: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

// ── (1) working-tree corpus — the empty-tree fail-closed lives here ──────────────────────────────────
const files = corpusFiles()
const head = corpusAt((rel) => {
  try {
    return readFileSync(join(ROOT, rel), "utf8")
  } catch {
    return null
  }
}, files)
if (head.size === 0) {
  console.error(
    "ears-coamend-guard: FAIL — no REQ corpus found under docs/requirements/ (req-*/requirements-*.md). " +
      "Nothing to check; a gate with no input is a misconfiguration, not a pass.",
  )
  process.exit(1)
}

// ── (2) base resolution ──────────────────────────────────────────────────────────────────────────────
const base = (process.env.EARS_COAMEND_BASE ?? defaultBase()) || null
if (base === null) {
  if (process.env.CI) {
    console.error(
      "ears-coamend-guard: FAIL — could not resolve a base (git merge-base origin/master HEAD). " +
        "On CI this means the checkout is shallow; set actions/checkout fetch-depth: 0 so the diff has history.",
    )
    process.exit(1)
  }
  console.log(
    "ears-coamend-guard: SKIPPED — no base commit to diff against (run in CI, or set EARS_COAMEND_BASE). " +
      `Corpus present (${head.size} REQ blocks); the co-amend logic is proven by ears-coamend-guard.test.mjs.`,
  )
  process.exit(0)
}

// ── (3) diff the corpus at base against the working tree ─────────────────────────────────────────────
const baseById = revisionCorpus(base, files)
const violations = coamendViolations(baseById, head)

if (violations.length > 0) {
  console.error(
    `\nears-coamend-guard: FAIL — ${violations.length} REQ(s) changed a normative-clause without co-amending its EARS phrase:`,
  )
  for (const v of violations) {
    console.error(`  ✗ ${v.id}: normative-clause changed but the EARS restatement above it did not.`)
    console.error(`      was:  ${v.clauseBefore}`)
    console.error(`      now:  ${v.clauseAfter}`)
  }
  console.error(
    "  Amend the EARS sentence to match, or add `<!-- COAMEND-EXEMPT: <why the prose is unaffected> -->` " +
      "inside the block if the change genuinely leaves the restatement true.",
  )
  process.exit(1)
}
console.log(
  `ears-coamend-guard: OK — ${head.size} REQ blocks; every normative-clause changed since ${base.slice(0, 8)} co-amended its EARS phrase.`,
)
