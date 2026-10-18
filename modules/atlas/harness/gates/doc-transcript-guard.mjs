#!/usr/bin/env node
// doc-transcript-guard — a documented TRANSCRIPT is re-run against the BUILT BINARY, or it is named as
// unverifiable. Every block, every run. There is no third outcome and there is no silent skip.
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────
// #107 changed the shape of `atlas query` output: two guidance strings rewritten, an `advisoryDropped` row
// added to the `data:` block, a `[<freshness>]` field added to every `inv` row. Eight documented transcripts
// across five pages went on showing the old shape, in a PUBLIC repo, and nothing went red — because
// `command-doc-guard` checks that each shipped command IS documented and deliberately never reads what the
// page CLAIMS it prints. A page can be present, correspond to a real command, and describe output the
// product stopped producing a commit ago.
//
// ── WHAT IT CHECKS ───────────────────────────────────────────────────────────────────────────────────
//   (1) EVERY fenced block under `docs/**` that purports to be `atlas` output is ENUMERATED and CLASSIFIED.
//       The set, not a sample. Three classes, and a block is in exactly one:
//         VERIFIED     — re-run against a fixture repo built here, diffed line by line against the page.
//         FROZEN       — deliberately quotes output the product no longer produces, with a stated reason.
//         UNVERIFIABLE — cannot be mechanically reproduced; the reason is printed BY NAME on every run.
//   (2) A VERIFIED block's every line — BLANK LINES INCLUDED — and its exit code match the real run. First
//       divergence is reported with the file, line, command, and both sides.
//       VERIFIED IS A CLAIM ABOUT BYTES, NOT NARRATIVE STATE: the page shows what the binary prints for that
//       invocation against this fixture, NOT that the page's story produced it. A block can be byte-true and
//       still contradict its own page — it happened here, a promotion transcript regenerated from the wrong
//       fixture carrying a nodeKey the page never uses — and no byte comparison sees that. Page-level
//       consistency stays a human job and is not claimed.
//   (3) VERIFIED is the DEFAULT, and that is the anti-regression leg. A block reaches the other two classes
//       only by being NAMED below; a transcript nobody declared is RUN, so a new page cannot arrive
//       unchecked — the way it arrives is red. (This default is also why there is no separate "an undeclared
//       `query` transcript fails" check: it could never fire.)
//   (4) Every FROZEN / UNVERIFIABLE declaration must still RESOLVE to a real block. One whose block moved or
//       was deleted is a stale exemption and fails, so the list cannot outlive what it exempts.
//
// ── WHY THE COMMAND IS READ FROM THE TRANSCRIPT, NOT TRANSCRIBED HERE ────────────────────────────────
// The `$ …` line IS the command. This gate parses it (leading `KEY=VALUE` env, then a literal `atlas`, then
// argv) and runs exactly that, carrying no second copy of any invocation — a gate holding its own list would
// be a second source of truth with the failure mode of the prose it guards: agreeing with itself.
//
// ── WHAT IT CANNOT DO, MEASURED RATHER THAN GLOSSED ──────────────────────────────────────────────────
// `harness/` may not import `@atlas/*` (`gate-directory.test.mjs`, the one-way dependency). A grounded fact
// can only be authored by computing the `subtreeHash` the index computes, and NO SHIPPED COMMAND PRINTS IT —
// the repo's own how-to says so, re-measured four ways: `emit`'s refusal names the gate (`ungrounded: …`)
// not the hash, `doctor why` on an unknown key says `whyBroken: none`, `doctor index` prints the indexer
// plan, `mine` abstains. So this gate cannot put a fact in a pack, and every transcript showing a POPULATED
// pack is UNVERIFIABLE and named as such. That is the product's authoring gap (campaign 10) reaching the
// harness, not a shortcut taken here.
//
// COVERAGE, by intersecting the EIGHT transcripts #107 rotted (the set differing between master `e4882a3`
// and this branch) with the set re-run here: THREE — `how-to/move-a-repo-in.md#2`, `query.md#2`,
// `query.md#4`. 3/8 = 37.5%. The five out of reach (`emit-a-grounded-fact.md#2`, `find-and-fix-drift.md#1`,
// `link.md#2`, `promote.md#6`, `query.md#1`) all show a POPULATED pack. Three still turns this red the day
// #107 lands.
//
// Run: `node harness/gates/doc-transcript-guard.mjs` (requires a BUILT `packages/cli/dist` — it runs the
// product, it does not read it).

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = process.env.DOC_TRANSCRIPT_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const DOCS = join(ROOT, "docs")
const CLI = join(ROOT, "packages", "cli", "dist", "src", "bin.js")

/** The fixture actor. Synthetic, and it is not a credential: `.atlas/policy.json` is a self-asserted
 *  anti-accident guardrail (policy.ts says so in its own header), so this is a name, not a secret. */
const ACTOR = "dev@example.com"
/** The fixture tree — the repository the reference pages describe (`README.md` and `src/{greet,math}.ts`). */
const FILES = {
  "README.md": "# demo\n",
  "src/greet.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
  "src/math.ts": "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
}

// ── the declarations ────────────────────────────────────────────────────────────────────────────────────
// Keyed `<docs-relative file>#<invocation slug>#<ordinal among blocks with THAT slug, 1-based>`.
//
// NOT by line number: a line key breaks on any edit ABOVE the block, and an exemption list that breaks
// constantly gets RE-KEYED rather than re-examined.
//
// AND NOT BY A FILE-WIDE ORDINAL EITHER, which is what this was and why it changed. A bare ordinal is
// SILENTLY REASSIGNED by an insertion: adding one worked example partway down a page shifts every later
// block by one, so each declaration below quietly re-attaches to its NEIGHBOUR — a stated reason like "needs
// a stored grounded fact" lands on a block that needs no such thing, and NOTHING FAILS, because the key
// still exists and still names *a* block. Measured while adding the `doctor cas` example to
// `reference/commands/doctor.md`: the new block inherited an exemption belonging to a different one.
//
// Scoping the ordinal to the INVOCATION fixes the silence rather than the symptom. Inserting a block with a
// different command now shifts NOTHING. Inserting one with the SAME command still shifts — but that case
// cannot pass quietly: the tail key stops resolving, and leg (4) reports it as a STALE DECLARATION. Silence
// became noise, which is the only property that matters in an exemption ledger.
//
// The slug is the invocation reduced to `[A-Za-z0-9._/@-]`, capped — readable enough to review by eye, and
// free of the quotes and backticks that real `atlas` argv carry. Two distinct commands that slug alike merely
// share one ordinal slot, which is still far narrower than the file-wide counter this replaced.
//
// Checked for staleness by leg (4), and for TIGHTNESS by the twin: a declared block that reproduces
// byte-exactly is one that silently stopped being checked.

/** Blocks that quote output the product no longer produces, ON PURPOSE. Each states why. */
const FROZEN = {
  "adr/ADR-0013-the-pack-has-two-bands-governing-and-advisory.md#atlas-query-packages/kernel#1":
    'ADR-0013 quotes the PRE-#107 output as its own "before" evidence. Regenerating it would delete the ' +
    "record of the change the ADR exists to justify.",
}

/** A stored grounded fact — unreachable from the binary alone (see the header). */
const NEEDS_FACT =
  "needs a stored grounded fact; authoring one requires the subtreeHash the index computes, and no shipped command prints it"
/** A staged candidate — `mine` abstains at every site with no operator model wired (ADR-0011). */
const NEEDS_STAGED = "needs a staged/promoted candidate; `mine` abstains with no operator model wired"
/** The page DECLARES a transformation, so the block is deliberately not a verbatim run. */
const EDITED =
  "the page states the block is edited (path shortened / trimmed / long line reflowed) — good documentation, not drift"
/** An argument this gate\'s fixture cannot hold. */
const FOREIGN_REV = "an argument names a revision or nodeKey from the authoring repository, absent here"

/** `{key: reason}` for keys sharing one obstruction. */
const each = (reason, ...keys) => Object.fromEntries(keys.map((k) => [k, reason]))

/** Blocks that cannot be reproduced mechanically. Each states the precise obstruction. Grouped by reason,
 *  every key still listed individually — the LIST is the evidence, so it is never summarised to a count. */
const UNVERIFIABLE = {
  ...each(
    NEEDS_FACT,
    "how-to/emit-a-grounded-fact.md#ATLAS_RATIFY_TOKEN-lead-atlas-emit-greet-fact.json---at-20ff#1",
    "how-to/emit-a-grounded-fact.md#atlas-query-src#1",
    "how-to/emit-a-grounded-fact.md#atlas-node-20512b7622b0d8864f20311700f4091b991ea5317797ce615#1",
    "how-to/find-and-fix-drift.md#atlas-query-src#1",
    "how-to/find-and-fix-drift.md#atlas-doctor-why-f9517988f330a775ffc767c072fa01e52f386422204#1",
    "how-to/find-and-fix-drift.md#atlas-doctor-reground-f9517988f330a775ffc767c072fa01e52f3864#1",
    "reference/commands/doctor.md#atlas-doctor-archive#1",
    "reference/commands/doctor.md#atlas-doctor-why-f9517988f330a775ffc767c072fa01e52f386422204#1",
    "reference/commands/doctor.md#atlas-doctor-reground-f9517988f330a775ffc767c072fa01e52f3864#1",
    "reference/commands/doctor.md#atlas-doctor-hotset-2000#1",
    "reference/commands/emit.md#ATLAS_RATIFY_TOKEN-lead-atlas-emit-greet-fact.json---at-20ff#1",
    "reference/commands/emit.md#atlas-emit-greet-fact.json---at-20ff947f42e7a2052326a59399a9#1",
    "reference/commands/emit.md#atlas-emit-greet-fact.json---at-20ff947f42e7a2052326a59399a9#2",
    "reference/commands/emit.md#ATLAS_RATIFY_TOKEN-lead-atlas-emit-bad-fact.json---at-22b3ca#1",
    "reference/commands/link.md#ATLAS_RATIFY_TOKEN-lead-atlas-link-bb4094b5aa8ca84d6d5d4e2c1#1",
    "reference/commands/link.md#atlas-query-src#1",
    "reference/commands/node.md#atlas-node-20512b7622b0d8864f20311700f4091b991ea5317797ce615#1",
    "reference/commands/own.md#atlas-own-src#1",
    "reference/commands/own.md#atlas-own-src/greet.ts#1",
    "reference/commands/own.md#atlas-own-src#2",
    "reference/commands/own.md#atlas-own-packages/adapter-io#1",
    "reference/commands/own.md#atlas-own-src/typo.ts#1",
    "reference/commands/own.md#atlas-own-lib#1",
    "reference/commands/query.md#atlas-query-src#1",
  ),
  ...each(
    "an annotated composite of three runs with margin notes; it has no `status:` header and is not one run",
    "how-to/find-and-fix-drift.md#ATLAS_RATIFY_TOKEN-lead-atlas-emit-f.json---at-HEAD#1",
  ),
  ...each(
    FOREIGN_REV,
    "how-to/find-and-fix-drift.md#atlas-reconcile-20ff947f42e7a2052326a59399a94a1864301b47#1",
    "reference/commands/link.md#ATLAS_RATIFY_TOKEN-lead-atlas-link-bb4094b5-f9517988---retra#1",
    "reference/commands/link.md#atlas-link-bb4094b5-f9517988#1",
    "reference/commands/link.md#ATLAS_RATIFY_TOKEN-lead-atlas-link-bb4094b5-bb4094b5#1",
    "reference/commands/link.md#ATLAS_RATIFY_TOKEN-lead-atlas-link-bb4094b5-1111111111111111#1",
    "reference/commands/link.md#atlas-link-bb4094b5-f9517988---hurry#1",
    "reference/commands/link.md#ATLAS_RATIFY_TOKEN-lead-atlas-link-bb4094b5-f9517988#1",
    "reference/commands/reconcile.md#atlas-reconcile-20ff947f42e7a2052326a59399a94a1864301b47#1",
    "reference/commands/reconcile.md#atlas-reconcile-22b3ca01865aaa34fff93f050db9c7bd927b4546#1",
  ),
  ...each(
    EDITED,
    "how-to/move-a-repo-in.md#atlas-init-.#1",
    "how-to/move-a-repo-in.md#atlas-query-src#2",
    "reference/commands/init.md#atlas-init-.#1",
    "reference/commands/init.md#atlas-init-.#2",
    "reference/commands/init.md#atlas-init-src#1",
    "reference/commands/init.md#atlas-init-no/such/path#1",
    "reference/commands/query.md#atlas-query-src#3",
  ),
  ...each(
    "shows a SCIP-indexed repository and a pinned external indexer version",
    "reference/commands/doctor.md#atlas-doctor-index#1",
    "reference/commands/doctor.md#atlas-doctor-index#2",
  ),
  ...each(
    NEEDS_STAGED,
    "reference/commands/mine.md#ATLAS_MINE_SLOT-advisory-atlas-mine-.#2",
    "reference/commands/mine.md#ATLAS_MINE_SLOT-advisory-atlas-mine-.#3",
    "reference/commands/mine.md#ATLAS_MODEL_CONFIG-PWD/.atlas/model.json-atlas-mine-.#1",
    "reference/commands/mine.md#atlas-mine-.#1",
    "reference/commands/promote.md#atlas-mine-.#1",
    "reference/commands/promote.md#atlas-mine-.#2",
    "reference/commands/promote.md#ATLAS_ACTOR-seat-orchestrator-atlas-promote#1",
    "reference/commands/promote.md#ATLAS_ACTOR-seat-orchestrator-ATLAS_RATIFY_TOKEN-seat-orches#1",
    "reference/commands/promote.md#atlas-node-83660b81ecf5f0b371e37448124b1465d1626bc134b7be5ac#1",
    "reference/commands/promote.md#atlas-query-src#1",
    "reference/commands/promote.md#ATLAS_ACTOR-seat-orchestrator-ATLAS_RATIFY_TOKEN-seat-orches#2",
    "reference/commands/promote.md#ATLAS_ACTOR-seat-orchestrator-ATLAS_RATIFY_TOKEN-seat-orches#3",
    "reference/commands/promote.md#ATLAS_ACTOR-seat-orchestrator-ATLAS_RATIFY_TOKEN-seat-orches#4",
    "reference/commands/promote.md#ATLAS_ACTOR-seat-orchestrator-ATLAS_RATIFY_TOKEN-seat-orches#6",
  ),
  // #99a — `atlas relations` worked examples are ILLUSTRATIVE: they show fabricated unit keys
  // (`pkg/order.ts::placeOrder`) and abbreviated relation nodeKeys (`rel:abc…`), so no clean checkout
  // reproduces them byte-exactly — a store first has to be seeded with those exact grounded relations
  // (`atlas emit` a `family:relation` fact per edge). The BEHAVIOUR they illustrate is mechanically pinned
  // by `packages/cli/test/relations-cli.test.ts` (real composed store) — this page is the human narration of it.
  ...each(
    "an illustrative worked example over fabricated units + abbreviated relation nodeKeys; the behaviour is pinned by relations-cli.test.ts over a real composed store, not reproducible from a clean checkout",
    "reference/commands/relations.md#atlas-relations-pkg/order.ts-placeOrder-both#1",
    "reference/commands/relations.md#atlas-relations-pkg/order.ts-placeOrder-out#1",
  ),
  // #99b — POPULATED `atlas negations` examples show a SEEDED negation + fired abstention a clean checkout lacks (it reproduces to the empty negations.md#3, which IS diffed).
  ...each(
    "an illustrative worked example over a SEEDED negation + fired abstention (a clean checkout stores neither, so it reproduces to the empty form of negations.md#3); the behaviour is pinned by negations-cli.test.ts + negations-mcp.test.ts, not reproducible from a clean checkout",
    "reference/commands/negations.md#atlas-negations-src#1",
    "reference/commands/negations.md#atlas-negations-src---abstained#1",
  ),
  // sound-genesis PROVEN family — PROVEN/REFUTED need a witnessed caller edge an un-indexed fixture lacks
  // (it ABSTAINS on every symbol — that IS the diffed verify-fact.md#1); pinned by s32-verify-fact.blackbox.
  ...each(
    "an illustrative worked example needing a witnessed caller edge in the index (a clean checkout has none, so it reproduces to the ABSTAIN form of verify-fact.md#1); the PROVEN/REFUTED behaviour is pinned by s32-verify-fact.blackbox.test.ts over a controlled index.scip, not reproducible from a clean checkout",
    "reference/commands/verify-fact.md#atlas-verify-fact-dependency-scip-.-.-greet---scope-src/app#1",
    "reference/commands/verify-fact.md#atlas-verify-fact-negation-scip-.-.-greet---scope-src/app#1",
  ),
  // REVERIFY-GATE — the `broken`/`unverifiable` transcripts need a POPULATED durable store carrying a
  // sealed-proven fact (a clean checkout has none, so it reproduces to the empty form of verify-store.md#1,
  // which IS diffed). Both buckets are mechanically pinned end to end by
  // reverify-gate-compose.test.ts (@atlas/adapter-io, a real composed runtime + real oracle) and
  // s34-reverify-store.blackbox.test.ts (the shipped binary), not reproducible from a clean checkout.
  ...each(
    "needs a populated durable store carrying a seal:'proven' fact (a clean checkout has none, so it reproduces to the empty form of the same page’s zero-fact block); the broken/unverifiable behaviour is pinned by reverify-gate-compose.test.ts + s34-reverify-store.blackbox.test.ts, not reproducible from a clean checkout",
    "reference/commands/verify-store.md#atlas-verify-store#2",
    "reference/commands/verify-store.md#atlas-verify-store#3",
  ),
  // #99 R7 — the `atlas derive-relations` OUTPUT-SHAPE block is an ILLUSTRATIVE template over placeholders
  // (`<N>`/`<E>`/`<A>`/`<contentHash>`), not one run: a real pass needs a SCIP-indexed repo with a witnessed
  // cross-unit edge AND an actor granted the subject scope (a clean checkout has neither). The behaviour is
  // pinned end to end by relation-derive-reachability.test.ts (@atlas/adapter-io, a real composed runtime +
  // real oracle, AR-13) and derive-relations-cli.test.ts (the CLI render), not reproducible from a clean checkout.
  ...each(
    "an illustrative output-shape template over placeholders needing a SCIP-indexed repo + a witnessed cross-unit edge + an authorized actor (a clean checkout has none); the behaviour is pinned by relation-derive-reachability.test.ts + derive-relations-cli.test.ts, not reproducible from a clean checkout",
    "reference/commands/derive-relations.md#status#1",
  ),
  // #234 D4 — the `atlas transitions`/`atlas transition` POPULATED examples show a unit lineage
  // (`src/pay.ts::charge`) with a produced transition across two revs where its content changed. The clean
  // fixture (README + src/{greet,math}.ts, one commit) holds no such unit and no two-rev change, so it
  // reproduces to the EMPTY/rejected form, not the populated success shown. The behaviour is pinned by the
  // #234 acceptance suite (transition-family.test.ts / cli/test/transitions-cli.test.ts + the blackbox e2e over
  // a real 2-rev fixture), not reproducible from a clean checkout.
  ...each(
    "an illustrative worked example over a produced 2-rev transition (a clean fixture holds no such unit lineage nor two-rev change, so it reproduces to the empty/rejected form); the behaviour is pinned by the #234 acceptance suite + the blackbox e2e over a real 2-rev fixture, not reproducible from a clean checkout",
    "reference/commands/transitions.md#atlas-transitions-src/pay.ts-charge#1",
    "reference/commands/transition.md#atlas-transition-src/pay.ts-charge-HEAD-1-HEAD#1",
  ),
  // #95 D5 — the `atlas test-vacuity`/`atlas test-vacuities` POPULATED examples show a produced proven
  // test-vacuity fact (a named test whose only assertions sit inside `catch`). The clean fixture (README +
  // src/{greet,math}.ts, one commit) holds no `*.test.ts` unit with an assertion-only-in-catch test, so it
  // reproduces to the EMPTY/abstain form, not the populated success shown. The behaviour is pinned by the #95
  // acceptance anchor (s95-test-vacuity.blackbox.test.ts over a real fixture repo), not reproducible from a
  // clean checkout.
  ...each(
    "an illustrative worked example over a produced proven test-vacuity fact (a clean fixture holds no assertion-only-in-catch test unit, so it reproduces to the empty/abstain form); the behaviour is pinned by the #95 acceptance anchor s95-test-vacuity.blackbox.test.ts over a real fixture repo, not reproducible from a clean checkout",
    "reference/commands/test-vacuity.md#atlas-test-vacuity-.#1",
    "reference/commands/test-vacuities.md#atlas-test-vacuities-test/sample.test.ts#1",
  ),
  // WP-10.A3.CLI — the `atlas check` dry-run verdict NAMES the first refusing gate and carries that gate's
  // remedy; the gate and remedy vary by candidate, anchor, and revision (over the clean fixture the citation
  // does not re-derive so gate 'truth' refuses, but the remedy string is not byte-stable across fixtures). The
  // behaviour — composes via the draft planner, dry-runs the gate chain, fails closed, refuses an out-of-vocab
  // slot at the draft surface — is pinned by packages/cli/test/check-cli.test.ts over a real composed runtime.
  ...each(
    "an illustrative dry-run verdict naming the first refusing gate + its remedy (which vary by candidate, anchor, and revision — not byte-stable across fixtures); the behaviour is pinned by check-cli.test.ts over a real composed runtime, not reproducible from a clean checkout",
    "reference/commands/check.md#status#1",
  ),
  // WP-11.W8 — `atlas memory-emit` needs a `MemoryEntry` JSON file on disk (like `atlas emit` needs a fact
  // file, NEEDS_FACT above); this gate's fixture writes ONLY `README.md`/`src/{greet,math}.ts` (see `FILES`),
  // never an arbitrary entry file a page's worked example references. The scanner-unavailable refusal and
  // the illustrative-admit shape are both pinned by `packages/cli/test/memory-emit-cli.test.ts` and
  // `packages/mcp-server/test/memory-emit-mcp.test.ts` over a real composed runtime with an injected fixture
  // entry file, not reproducible from a clean checkout with no such file. `memory-emit.md#3` (the
  // `missing.json` usage error) needs no entry file to exist AT ALL — that is the point of the block — so it
  // stays VERIFIED, not listed here.
  ...each(
    "needs a MemoryEntry JSON file this gate's fixture does not create (like atlas emit's NEEDS_FACT); the behaviour is pinned by memory-emit-cli.test.ts + memory-emit-mcp.test.ts over a real composed runtime with an injected fixture file, not reproducible from a clean checkout",
    "reference/commands/memory-emit.md#ATLAS_ACTOR-dev@example.com-atlas-memory-emit-project-entry.#1",
    "reference/commands/memory-emit.md#status#1",
  ),
}

// ── enumeration ─────────────────────────────────────────────────────────────────────────────────────────

/** Every `.md` under `docs/`, sorted, recursive. */
function markdown(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) markdown(p, out)
    else if (e.name.endsWith(".md")) out.push(p)
  }
  return out
}

/**
 * Every fenced block under `docs/**` that purports to be `atlas` output: a `$ …atlas …` invocation line, or
 * a bare `status:` verdict header. Returns `{ key, file, ord, line, body }` — `key` is the stable
 * `file#ordinal` the declarations above use, and `line` is carried for the REPORT only, never for lookup.
 */
/** The invocation, reduced to a key-safe slug. Deterministic and total: any argv reduces to SOMETHING, and
 *  an empty reduction falls back to `cmd` rather than to an empty key that would silently pool blocks. */
function slugOf(invocation) {
  const s = invocation
    .replace(/[^A-Za-z0-9._/@-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return s.length === 0 ? "cmd" : s
}

function transcripts() {
  const out = []
  for (const abs of markdown(DOCS)) {
    const file = abs
      .slice(DOCS.length + 1)
      .split(/[\\/]/)
      .join("/")
    const ords = new Map() // slug -> how many blocks with that slug have been seen in THIS file
    const lines = readFileSync(abs, "utf8").split("\n")
    let open = null
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)(```+|~~~+)(.*)$/.exec(lines[i])
      if (m === null) continue
      if (open === null) {
        open = { line: i + 1, indent: m[1], info: m[3].trim() }
        continue
      }
      if (m[3].trim() !== "") continue // an opener for a new block cannot close the current one
      const body = lines.slice(open.line, i).map((l) => (l.startsWith(open.indent) ? l.slice(open.indent.length) : l))
      if (body.some((l) => /^\$ .*\batlas\b/.test(l) || /^status: (ok|error|rejected)$/.test(l))) {
        // The invocation IS the key's discriminant. A block with no `$` line is a bare verdict header; those
        // share the `status` slot, which is exactly as narrow as the information available.
        const dollar = body.find((l) => /^\$ .*\batlas\b/.test(l))
        const slug = dollar === undefined ? "status" : slugOf(dollar.slice(2).trim())
        const ord = (ords.get(slug) ?? 0) + 1
        ords.set(slug, ord)
        out.push({ key: `${file}#${slug}#${ord}`, file, ord, line: open.line, body })
      }
      open = null
    }
  }
  return out
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────────────────

/** A fresh on-disk git fixture: the tree above, a policy authorizing {@link ACTOR} over `src`, one commit. */
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "atlas-doc-transcript-"))
  for (const [rel, body] of Object.entries(FILES)) {
    mkdirSync(join(repo, dirname(rel)), { recursive: true })
    writeFileSync(join(repo, rel), body)
  }
  mkdirSync(join(repo, ".atlas"), { recursive: true })
  writeFileSync(
    join(repo, ".atlas", "policy.json"),
    JSON.stringify({
      nearDup: { claimNormThreshold: 1 },
      t0Heuristic: { keywords: [] },
      authz: { scopes: { src: [ACTOR] } },
    }),
  )
  const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" })
  git("init", "-q")
  git("config", "user.email", ACTOR)
  git("config", "user.name", "demo")
  git("add", "-A")
  git("commit", "-q", "-m", "genesis")
  return repo
}

/**
 * Parse a transcript's `$ …` line into `{ env, argv }`, or `null` when it is not a literal invocation this
 * gate can run (an elided argument, a shell construct, a binary that is not `atlas`). `null` is never
 * treated as "nothing to check" — the caller turns it into a NAMED unverifiable.
 */
function invocation(dollarLine) {
  const toks = dollarLine.slice(2).trim().split(/\s+/)
  const env = {}
  let i = 0
  for (; i < toks.length && /^[A-Z][A-Z0-9_]*=[^\s]*$/.test(toks[i]); i++) {
    const eq = toks[i].indexOf("=")
    env[toks[i].slice(0, eq)] = toks[i].slice(eq + 1)
  }
  if (toks[i] !== "atlas") return null
  const argv = toks.slice(i + 1)
  if (argv.some((a) => a.includes("…") || a.includes("<") || a.includes("$"))) return null
  return { env, argv }
}

/**
 * Split a transcript body into `[{ dollar, expected }]` segments, one per `$ …` line. A blank line INSIDE a
 * run is OUTPUT and is compared; only the trailing blanks a page uses to separate one run from the next are
 * dropped. An earlier revision dropped every blank on both sides, so three could be inserted into a verified
 * block and the gate still claimed it matched "line for line" — a comparison too lenient to notice re-opens
 * the hole it closes.
 */
function segments(body) {
  const segs = []
  for (const raw of body) {
    if (raw.startsWith("$ ")) segs.push({ dollar: raw, expected: [] })
    else if (segs.length > 0) segs.at(-1).expected.push(raw)
  }
  for (const s of segs) while (s.expected.length > 0 && s.expected.at(-1) === "") s.expected.pop()
  return segs
}

/**
 * Compare documented lines against real ones. A documented line that is exactly `[…]` is an ELISION and
 * matches ZERO OR MORE real lines (the quality standard sanctions eliding long output with an explicit
 * marker; a gate that did not understand the marker would push pages toward dumping instead). Returns
 * `null` on a match, or `{ at, want, got }` naming the FIRST divergence.
 */
function diff(expected, actual) {
  let e = 0
  let a = 0
  while (e < expected.length) {
    if (expected[e].trim() === "[…]") {
      const next = expected[e + 1]
      if (next === undefined) return null // a trailing elision swallows whatever remains
      while (a < actual.length && actual[a] !== next) a++
      e++
      continue
    }
    if (a >= actual.length) return { at: e, want: expected[e], got: "<end of output>" }
    if (actual[a] !== expected[e]) return { at: e, want: expected[e], got: actual[a] }
    e++
    a++
  }
  if (a < actual.length) return { at: expected.length, want: "<end of block>", got: actual[a] }
  return null
}

/** Run one transcript's segments against a fresh fixture. Returns a list of human-readable failures. */
function verify(t) {
  const segs = segments(t.body)
  if (segs.length === 0) return [`${t.key} (docs/${t.file}:${t.line}) — VERIFIED block has no \`$ \` line to run`]
  const bad = []
  const repo = fixture()
  try {
    for (const seg of segs) {
      const inv = invocation(seg.dollar)
      if (inv === null) {
        bad.push(
          `${t.key} (docs/${t.file}:${t.line}) — cannot parse \`${seg.dollar}\`; declare it UNVERIFIABLE instead`,
        )
        continue
      }
      const res = spawnSync(process.execPath, [CLI, ...inv.argv], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, ATLAS_ACTOR: ACTOR, ...inv.env },
      })
      // Only TRAILING empties are dropped (the final-newline artifact); interior blanks are real output.
      const actual = (res.stdout ?? "").split("\n")
      while (actual.length > 0 && actual.at(-1) === "") actual.pop()
      const want = seg.expected.filter((l) => !/^# exit \d+$/.test(l))
      const wantExit = seg.expected.find((l) => /^# exit \d+$/.test(l))
      const d = diff(want, actual)
      if (d !== null) {
        bad.push(
          `${t.key} (docs/${t.file}:${t.line}) — output diverged\n      ran:  atlas ${inv.argv.join(" ")}  (cwd = a fresh fixture repo)\n` +
            `      doc:  ${JSON.stringify(d.want)}\n      real: ${JSON.stringify(d.got)}`,
        )
      } else if (wantExit !== undefined && wantExit !== `# exit ${res.status}`) {
        bad.push(
          `${t.key} (docs/${t.file}:${t.line}) — exit code diverged\n      ran:  atlas ${inv.argv.join(" ")}\n` +
            `      doc:  ${wantExit}\n      real: # exit ${res.status}`,
        )
      }
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
  return bad
}

// ── the sweep ───────────────────────────────────────────────────────────────────────────────────────────

const fail = []

if (!existsSync(DOCS)) {
  console.error(
    `doc-transcript-guard: FAIL\n\n  ✗ no docs/ tree at ${DOCS}. There is nothing to check, and a gate that reports OK on an unreadable corpus is the defect it exists to stop.\n`,
  )
  process.exit(1)
}
if (!existsSync(CLI)) {
  console.error(
    `doc-transcript-guard: FAIL\n\n  ✗ no built CLI at ${CLI}. This gate RUNS the product; without a build it could only ever agree with the page. Run \`npm run build\` first.\n`,
  )
  process.exit(1)
}

const blocks = transcripts()
if (blocks.length === 0) {
  console.error(
    "doc-transcript-guard: FAIL\n\n  ✗ ZERO output transcripts found under docs/. Either every page lost its worked example, or this gate's block extraction broke — and a gate that checks zero transcripts prints OK for a fully rotted docs tree. Failing instead.\n",
  )
  process.exit(1)
}

const verified = []
const frozen = []
const unverifiable = []
const seen = new Set()

/** `docs/<file>:<line>  <the command>` — how a block is NAMED to a human, derived, never used for lookup. */
const where = (t) => {
  const cmd = t.body.find((l) => l.startsWith("$ "))
  return `${t.key}  (docs/${t.file}:${t.line}${cmd === undefined ? "" : `, \`${cmd}\``})`
}

for (const t of blocks) {
  seen.add(t.key)
  if (FROZEN[t.key] !== undefined) {
    frozen.push(`${where(t)}\n        ${FROZEN[t.key]}`)
  } else if (UNVERIFIABLE[t.key] !== undefined) {
    unverifiable.push(`${where(t)}\n        ${UNVERIFIABLE[t.key]}`)
  } else {
    verified.push(where(t))
    fail.push(...verify(t))
  }
}

// (4) a declaration that no longer resolves to a block is a stale exemption.
for (const [key, why] of [...Object.entries(FROZEN), ...Object.entries(UNVERIFIABLE)]) {
  if (!seen.has(key)) {
    fail.push(
      `STALE DECLARATION — ${key} is exempted here ("${why}") and names no transcript in docs/.\n` +
        "      The block moved or was deleted. Re-key the declaration or drop it: an exemption that outlives\n" +
        "      what it exempts is a hole with a comment in front of it.",
    )
  }
}

// I4 — the unverifiable set is named on EVERY run, pass or fail. It is printed BEFORE the verdict branch so
// there is no path through this file that reports a result without it.
console.log(
  `doc-transcript-guard: ${blocks.length} output transcript(s) under docs/ — ` +
    `${verified.length} re-run against the built binary, ${frozen.length} frozen, ${unverifiable.length} not mechanically reproducible.\n`,
)
console.log(`  VERIFIED (${verified.length}) — re-run and diffed:`)
for (const v of verified) console.log(`    ✓ ${v}`)
console.log(`\n  FROZEN (${frozen.length}) — quotes superseded output on purpose:`)
for (const f of frozen) console.log(`    ○ ${f}`)
console.log(`\n  NOT MECHANICALLY REPRODUCIBLE (${unverifiable.length}) — NOT checked, and this is why:`)
for (const u of unverifiable) console.log(`    ! ${u}`)
console.log("")

if (fail.length > 0) {
  console.error("doc-transcript-guard: FAIL\n")
  for (const f of fail) console.error(`  ✗ ${f}\n`)
  console.error(
    `${fail.length} violation(s). The BINARY is the oracle: regenerate the block from a real run — never hand-edit\n` +
      "it to match what the output is believed to be, which is how this drift entered in the first place.",
  )
  process.exit(1)
}

console.log("doc-transcript-guard: OK — every re-runnable transcript matches the built binary line for line.")
