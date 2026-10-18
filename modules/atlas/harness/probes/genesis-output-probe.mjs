#!/usr/bin/env node
// harness/probes/genesis-output-probe.mjs — judge ONE genesis run's OUTPUT SET against the written contract.
//
// The contract is `docs/design/genesis-output-contract.md`. This file is its instrument: it reports the
// EIGHT aggregate expectations of that document (GOC-1 … GOC-8) against a repository whose `.atlas/` store a
// run has populated — PASS / FAIL / UNEVALUABLE, one line each, with the offending row named.
//
// ── WHY `harness/probes/` AND NOT `harness/gates/` ───────────────────────────────────────────────────────
// `harness/gates/` is the standing-bar directory: what lives there is wired into `ci.yml` and fails the
// build. This must not be, and the reason is structural rather than taste — Atlas's own `.atlas/` store is
// NOT committed (a store that IS tracked is refused as `untrusted` by `store-provenance.ts`), so on CI there
// is nothing here to run against — and a gate with no input exits 0 having checked nothing, which reads
// exactly like coverage. That shape is already present next door: `drift-patterns.mjs` and `reachability.mjs`
// run to exit 0 with no output, being library modules whose checks live in their `.test.mjs` twins. So this
// sits BESIDE the gates and not among them, `package.json` exposes no script for it, and `ci.yml` is not
// touched. It is an instrument for judging a run, not a bar on the build.
//
// It keeps the harness invariant either way: NO `@atlas/*` import — it reads the store from the outside, the
// same posture `id-integrity.mjs` takes to the docs corpus, so it cannot be fooled by an in-process object
// that never reached disk and it cannot mutate what it is judging. Every filesystem call is a read.
//
// ── USAGE ────────────────────────────────────────────────────────────────────────────────────────────────
//   node harness/probes/genesis-output-probe.mjs <repo> [--report <file>] [--cli <bin>]
//     <repo>          the repository whose `.atlas/` a run populated
//     --report <file> captured stdout of `atlas mine` for THAT run. Without it GOC-8 is UNEVALUABLE — the
//                     store keeps no record of which sites the run visited.
//     --cli <bin>     the built entrypoint (`packages/cli/dist/src/bin.js`). Without it the command leg of
//                     GOC-7 is UNEVALUABLE — the structural leg still runs.
//
//   exit 0 — every expectation was EVALUATED and every one HELD.
//   exit 1 — at least one expectation FAILED.
//   exit 2 — nothing failed, but at least one could not be evaluated. An unevaluated expectation is not a
//            passing one and this probe will not round it up to one.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { HEX64, atlasDir, casGet, readSidecar, trackedStoreFiles, valuePath } from "./atlas-store-read.mjs"
import { parseMineReport } from "./mine-report.mjs"

// ── the vocabulary, transcribed from the product ────────────────────────────────────────────────────────
/** `Tier` — `packages/contracts/src/tier.ts`. */
const TIERS = new Set(["T0", "T1", "T2"])
/** `StructRef.kind` — `packages/contracts/src/struct.ts`. */
const ANCHOR_KINDS = new Set(["symbol", "block", "file", "repo", "project", "directory"])
/** `KnowledgeFreshness` — `packages/knowledge/src/types.ts`. */
const FRESHNESS = new Set(["FRESH", "DRIFTED"])
/** `PredicateSlot` — the CLOSED vocabulary; adding a member is a spec revision (`knowledge/src/types.ts`). */
const SLOTS = new Set([
  "invariant",
  "contract",
  "precondition",
  "postcondition",
  "sideeffect",
  "ownership",
  "perf-bound",
  "security-property",
  "gotcha",
  "rationale",
  "dependency",
  "definition",
])
/** `Status` — the predicate verdict (`packages/contracts/src/status.ts`). */
const STATUSES = new Set(["HOLDS", "BROKEN", "NA", "advisory"])
/** `MINED_SCOPE` / `MINED_TIER` — `packages/cli/src/mine.ts`, stamped from constants, never forwarded. */
const MINED_SCOPE = "atlas:mined"
const MINED_TIER = "T2"
/** The class `atlas query` bounds OUT of the pack (TOOLS-6: bounded read projection, tier>=T1). */
const UNSERVED_TIER = "T2"

// ── argv ────────────────────────────────────────────────────────────────────────────────────────────────
function parseArgv(args) {
  const out = { positional: [] }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--report" || args[i] === "--cli") out[args[i].slice(2)] = args[++i]
    else if (args[i].startsWith("--")) out.bad = args[i]
    else out.positional.push(args[i])
  }
  return out
}
const args = parseArgv(process.argv.slice(2))
if (args.positional.length !== 1 || args.bad !== undefined) {
  console.error("genesis-output-probe: usage: <repo> [--report <file>] [--cli <bin>]")
  process.exit(1)
}
const repo = args.positional[0]
const reportPath = args.report
const cliBin = args.cli

// ── the ledger ──────────────────────────────────────────────────────────────────────────────────────────
const results = []
const loud = []
const fails = (id, title, detail) => results.push({ id, title, state: "FAIL", detail })
const passes = (id, title, note) => results.push({ id, title, state: "PASS", detail: note === undefined ? [] : [note] })
const cannot = (id, title, why) => results.push({ id, title, state: "UNEVALUABLE", detail: [why] })

const projection = readSidecar(repo, "projection")
const staging = readSidecar(repo, "staging")
/** Only well-formed `[key, row]` pairs — the malformed ones are reported by GOC-2 and skipped by the rest. */
const pairs = (s) =>
  s.entries.filter(
    (e) => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && e[1] !== null && typeof e[1] === "object",
  )
const projPairs = pairs(projection)
const stagePairs = pairs(staging)

/** A PER-FACT expectation over an EMPTY row set is VACUOUS, not satisfied. Found by pointing the probe at a
 *  bare directory: GOC-2/-3/-4/-5/-7 each printed PASS having examined nothing — the "exits 0 having done
 *  nothing" disease this file's header names, in this file. A probe is not exempt from its own standard, so
 *  every row-examining leg routes its success through here and degrades when there is no row to judge. */
const heldOverRows = (id, title, note) => {
  if (projPairs.length > 0) passes(id, title, note)
  else
    cannot(
      id,
      title,
      "the projection holds ZERO rows, so this per-fact expectation examined nothing — VACUOUS, not satisfied",
    )
}

// ── GOC-1 — STORE: present, readable, schema-stamped, and produced by a DOOR rather than by a commit ─────
{
  const bad = []
  if (!existsSync(atlasDir(repo))) {
    bad.push(
      `no \`.atlas/\` at ${atlasDir(repo)} — nothing was produced, or this is not the repository the run wrote to`,
    )
  } else if (!projection.present) {
    bad.push(
      projection.unreadable
        ? 'a projection sidecar EXISTS but no generation of it parses. That is `unreadable`, which is NOT "0 facts": whatever was published is still on disk and could not be read'
        : "no projection sidecar at all — no governed fact has ever been published in this repository",
    )
  }
  // #112: an ABSENT identity stamp is not benign like `builtAt` or `gen`. It says what every hash in the
  // file MEANS, so an unstamped store is refused on the write doors rather than assumed current.
  for (const [name, s] of [
    ["projection", projection],
    ["staging", staging],
  ]) {
    if (s.present && s.identity === undefined) {
      bad.push(
        `${s.file}: the ${name} carries no \`identity\` stamp — the schema its hashes and anchor keys were minted under is UNKNOWN, so every write door refuses it (identity-schema.ts)`,
      )
    }
  }
  const tracked = trackedStoreFiles(repo)
  if (tracked === undefined) {
    bad.push(
      "git could not be consulted, so store PROVENANCE is unknown — a committed `.atlas/` reads as EMPTY and refuses every write, and this probe will not assume it is absent",
    )
  } else if (tracked.length > 0) {
    bad.push(
      `the durable store is TRACKED BY GIT (${tracked.length} file(s), e.g. ${tracked[0]}) — it arrived by COMMIT rather than through a door, so it serves nothing and refuses every write. \`git rm -r --cached .atlas/\``,
    )
  }
  if (bad.length > 0) fails("GOC-1", "STORE — present, readable, schema-stamped, door-produced", bad)
  else {
    passes(
      "GOC-1",
      "STORE — present, readable, schema-stamped, door-produced",
      `projection ${projection.file} (gen ${projection.gen ?? 0}, identity "${projection.identity}"); staging ${staging.present ? `${staging.file} (gen ${staging.gen ?? 0})` : "ABSENT"}; no store file tracked by git`,
    )
  }
}

// ── GOC-2 — ADDRESS: one current node per nodeKey, no duplicate address, the two identities stay apart ───
{
  const bad = []
  const seen = new Set()
  const byContent = new Map()
  for (const e of projection.entries) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== "string" || e[1] === null || typeof e[1] !== "object") {
      bad.push(`a \`current\` entry is not a [nodeKey, row] pair: ${JSON.stringify(e).slice(0, 120)}`)
      continue
    }
    const [key, row] = e
    // KNOW-4g, the representation invariant of `StoreProjection.current`: the MAP KEY *is* the row's own
    // `nodeKey`. `new Map(wire.current)` accepts any entry array, so the disk round-trip is the one producer
    // in the system that can mint a projection violating it (`sidecar.ts` `isKeyedEntry`).
    if (row.nodeKey !== key)
      bad.push(
        `row keyed '${key}' declares nodeKey '${String(row.nodeKey)}' — the map key must BE the row's nodeKey (KNOW-4g)`,
      )
    if (!HEX64.test(key)) bad.push(`nodeKey '${key}' is not 64 lowercase hex`)
    if (seen.has(key)) bad.push(`nodeKey '${key}' addresses two current nodes — exactly one lives per key (KNOW-4g)`)
    seen.add(key)
    if (typeof row.contentHash !== "string" || !HEX64.test(row.contentHash)) {
      bad.push(
        `row '${key}' carries contentHash ${JSON.stringify(row.contentHash)}, which is not a 64-lowercase-hex CAS address`,
      )
      continue
    }
    // `contentHash` is a pure function of the fact's bytes; `nodeKey` is derived from those same bytes. So
    // equal bytes MUST mean equal identity, and one address under two identities means one of the two legs
    // was not minted from the fact it addresses.
    const prior = byContent.get(row.contentHash)
    if (prior !== undefined && prior !== key)
      bad.push(`content address '${row.contentHash}' is claimed by two distinct nodeKeys ('${prior}' and '${key}')`)
    byContent.set(row.contentHash, key)
    if (row.contentHash === key)
      bad.push(
        `row '${key}' has contentHash === nodeKey — two different identifiers that are never interchangeable (docs/reference/commands/node.md)`,
      )
    // The CAS RETENTION set is the store's own record that these bytes are addressable; a row referencing
    // an address the projection does not retain is a fact `atlas doctor archive` cannot enumerate.
    if (!projection.cas.includes(row.contentHash))
      bad.push(`row '${key}' names '${row.contentHash}', which is absent from the projection's \`cas\` retention set`)
  }
  if (bad.length > 0) fails("GOC-2", "ADDRESS — one current node per nodeKey, no duplicate address", bad)
  else
    heldOverRows(
      "GOC-2",
      "ADDRESS — one current node per nodeKey, no duplicate address",
      `${projPairs.length} row(s), ${seen.size} distinct nodeKey(s), ${byContent.size} distinct content address(es), all retained in \`cas\``,
    )
}

// ── GOC-3 / GOC-4 / GOC-5 — the per-fact legs, in ONE pass over the rows ────────────────────────────────
{
  const shapeBad = []
  const groundBad = []
  const classBad = []
  let bounded = 0
  let served = 0
  let read = 0

  for (const [key, row] of projPairs) {
    // CLASS is read off the ROW, before a byte of CAS: ADR-0007's carrier exists precisely so authority does
    // not depend on storage health. An ABSENT carrier is not a grant and not a crash — it is a row whose
    // authority is UNCONFIRMABLE, which both write doors fail closed on. A run must not produce one.
    if (typeof row.scope !== "string" || row.scope.length === 0) {
      classBad.push(
        `row '${key}' carries no usable \`scope\` (${JSON.stringify(row.scope)}) — authority over it is UNCONFIRMABLE (ADR-0007)`,
      )
    }
    if (!TIERS.has(row.tier))
      classBad.push(`row '${key}' carries tier ${JSON.stringify(row.tier)}, which is not in the lattice {T0,T1,T2}`)
    else if (row.tier === UNSERVED_TIER) bounded++
    else served++
    if (row.scope === MINED_SCOPE && row.tier !== MINED_TIER) {
      classBad.push(
        `row '${key}' is scoped '${MINED_SCOPE}' but classed ${JSON.stringify(row.tier)} — a mined row is ${MINED_TIER}, stamped from a constant (packages/cli/src/mine.ts)`,
      )
    }
    if (row.slot !== undefined && !SLOTS.has(row.slot)) {
      shapeBad.push(
        `row '${key}' declares slot ${JSON.stringify(row.slot)}, which is not in the CLOSED predicateSlot vocabulary`,
      )
    }

    // SHAPE + GROUND are read off the BYTES — "the CAS bytes ARE the fact" (`governed-emit.ts` stage 3).
    const fact = casGet(repo, row.contentHash)
    if (fact === null || typeof fact !== "object") {
      shapeBad.push(
        `row '${key}' names contentHash ${JSON.stringify(row.contentHash)}, whose bytes the CAS cannot return — there is no fact behind this row`,
      )
      groundBad.push(`row '${key}': the fact could not be read, so its grounding cannot be checked`)
      continue
    }
    read++
    // `GroundedFact = AdvisoryNode | PredicateNode`, a discriminated union on `kind`.
    if (fact.kind === "advisory") {
      if (typeof fact.claimNorm !== "string" || fact.claimNorm.length === 0)
        shapeBad.push(`advisory fact '${row.contentHash}' has no \`claimNorm\``)
      if (fact.check !== undefined)
        shapeBad.push(
          `advisory fact '${row.contentHash}' carries a \`check\` — \`kind\` and check PRESENCE must agree (the door's \`malformed family\`)`,
        )
      if (fact.authoring !== "ADVISORY" && fact.authoring !== "SUPERSEDED")
        shapeBad.push(`advisory fact '${row.contentHash}' has authoring ${JSON.stringify(fact.authoring)}`)
    } else if (fact.kind === "predicate") {
      const c = fact.check
      const wellFormed =
        c !== null &&
        typeof c === "object" &&
        ((c.kind === "index-query" && typeof c.query === "string") ||
          (c.kind === "assertion" && typeof c.expr === "string"))
      if (!wellFormed)
        shapeBad.push(
          `predicate fact '${row.contentHash}' has no well-formed \`check\` — it is 'index-query'{query} | 'assertion'{expr}`,
        )
      if (!STATUSES.has(fact.status))
        shapeBad.push(`predicate fact '${row.contentHash}' has status ${JSON.stringify(fact.status)}`)
      if (fact.authoring !== "PREDICATED" && fact.authoring !== "SUPERSEDED")
        shapeBad.push(`predicate fact '${row.contentHash}' has authoring ${JSON.stringify(fact.authoring)}`)
    } else {
      shapeBad.push(
        `fact '${row.contentHash}' has kind ${JSON.stringify(fact.kind)} — a GroundedFact is 'advisory' | 'predicate'`,
      )
    }
    if (!TIERS.has(fact.tier)) shapeBad.push(`fact '${row.contentHash}' has tier ${JSON.stringify(fact.tier)}`)
    if (!FRESHNESS.has(fact.freshness))
      shapeBad.push(`fact '${row.contentHash}' has freshness ${JSON.stringify(fact.freshness)} — 'FRESH' | 'DRIFTED'`)
    if (!Array.isArray(fact.claims)) shapeBad.push(`fact '${row.contentHash}' has a non-array \`claims\``)
    // CORROBORATION. The row may decide who is heard; it is never the last word on WHAT the node is, because
    // the sidecar is unauthenticated mutable state while CAS bytes are content-addressed (ADR-0007).
    if (fact.id !== key)
      shapeBad.push(
        `fact '${row.contentHash}' records id ${JSON.stringify(fact.id)} but is the current node for '${key}' — the stored \`id\` leg carries the nodeKey`,
      )
    if (fact.scope !== row.scope)
      shapeBad.push(
        `fact '${row.contentHash}' declares scope ${JSON.stringify(fact.scope)}; its row declares ${JSON.stringify(row.scope)} — bytes and row must corroborate`,
      )
    if (fact.tier !== row.tier)
      shapeBad.push(
        `fact '${row.contentHash}' declares tier ${JSON.stringify(fact.tier)}; its row declares ${JSON.stringify(row.tier)}`,
      )

    // GROUND-2, the real-grounding predicate: >=1 entry AND every entry carries a non-empty `subtreeHash`.
    // An ungrounded grounding must NEVER surface FRESH, so a fact failing this has no business being stored.
    const entries = fact.grounding !== null && typeof fact.grounding === "object" ? fact.grounding.entries : undefined
    if (!Array.isArray(entries) || entries.length === 0) {
      groundBad.push(
        `fact '${row.contentHash}' has no grounding entries — a grounding is real iff it has >=1 (GROUND-2)`,
      )
      continue
    }
    entries.forEach((ent, i) => {
      const a = ent !== null && typeof ent === "object" ? ent.anchor : undefined
      if (a === null || typeof a !== "object") {
        groundBad.push(`fact '${row.contentHash}' entry ${i}: no \`anchor\` StructRef`)
        return
      }
      if (typeof a.subtreeHash !== "string" || a.subtreeHash.length === 0) {
        groundBad.push(
          `fact '${row.contentHash}' entry ${i}: empty \`anchor.subtreeHash\` — that hash IS the drift oracle, so this citation can never re-derive (GROUND-2)`,
        )
      }
      if (typeof a.qualifiedPath !== "string" || a.qualifiedPath.length === 0)
        groundBad.push(`fact '${row.contentHash}' entry ${i}: empty \`anchor.qualifiedPath\``)
      if (!ANCHOR_KINDS.has(a.kind))
        groundBad.push(
          `fact '${row.contentHash}' entry ${i}: anchor.kind ${JSON.stringify(a.kind)} is not a StructRef kind`,
        )
      if (typeof ent.path !== "string" || ent.path.length === 0)
        groundBad.push(`fact '${row.contentHash}' entry ${i}: no repo-relative \`path\``)
    })
  }

  const T3 = "SHAPE — every row's bytes are a whole GroundedFact and corroborate the row"
  if (shapeBad.length > 0) fails("GOC-3", T3, shapeBad)
  else
    heldOverRows(
      "GOC-3",
      T3,
      `${read} fact(s) read back from CAS: kind/tier/freshness/authoring well-formed, and each corroborates its row on id, scope and tier`,
    )

  if (groundBad.length > 0) fails("GOC-4", "GROUND — no fact without grounding", groundBad)
  else
    heldOverRows(
      "GOC-4",
      "GROUND — no fact without grounding",
      `${read} fact(s) satisfy GROUND-2: >=1 entry, every anchor.subtreeHash non-empty, every entry pathed and StructRef-kinded`,
    )

  const T5 = "CLASS — every fact carries its (scope, tier), and a mined fact is T2"
  if (classBad.length > 0) fails("GOC-5", T5, classBad)
  else {
    heldOverRows(
      "GOC-5",
      T5,
      `${projPairs.length} row(s) carry a (scope, tier); ${bounded} at ${UNSERVED_TIER} are bounded OUT of the \`atlas query\` pack (TOOLS-6), ${served} would be served`,
    )
    // The CONSEQUENCE is said out loud, never left to be inferred from a green line: it is the single
    // easiest result on this program to misread as a failed run.
    if (bounded > 0 && served === 0) {
      loud.push(
        `all ${bounded} fact(s) in this store are ${UNSERVED_TIER}, so \`atlas query\` will serve NONE of them — read them back with \`atlas node <addr>\`. An empty pack here means the TOOLS-6 bound held, not that the run produced nothing.`,
      )
    }
  }
}

// ── GOC-6 — PROVENANCE: every MINED fact in knowledge still has its staged origin ───────────────────────
// `atlas mine` writes only to staging (ADR-0008) and `atlas promote` is the only route out. Staging has NO
// DELETE and a promoted row is neither removed nor marked (promote.md), so the staged twin of every mined
// row that reached knowledge must still be there, at the same identity and the same address.
{
  const T = "PROVENANCE — every mined fact in knowledge has its staged origin"
  const staged = new Map(stagePairs)
  const mined = projPairs.filter(([, row]) => row.scope === MINED_SCOPE)
  const bad = []
  for (const [key, row] of mined) {
    const twin = staged.get(key)
    if (twin === undefined) {
      bad.push(
        `row '${key}' is scoped '${MINED_SCOPE}' in governed knowledge but appears in NO staging row — a mined fact reaches knowledge only through \`atlas promote\`, and staging has no delete (ADR-0008)`,
      )
    } else if (twin.contentHash !== row.contentHash) {
      bad.push(
        `row '${key}': knowledge holds '${row.contentHash}' but staging holds '${twin.contentHash}' — the promoted bytes are not the staged bytes`,
      )
    }
  }
  if (bad.length > 0) fails("GOC-6", T, bad)
  else if (mined.length === 0 && staged.size === 0) {
    cannot(
      "GOC-6",
      T,
      "no mined-scope row in knowledge AND no staging sidecar — there is no mining output in this store, so this expectation is VACUOUS here rather than satisfied",
    )
  } else {
    passes(
      "GOC-6",
      T,
      `${mined.length} mined row(s) in knowledge, each with its staged twin at the same address; ${staged.size} row(s) still staged`,
    )
  }
}

// ── GOC-7 — READBACK: every fact resolves through a SHIPPED read command ────────────────────────────────
{
  const T = "READBACK — every fact resolves through a shipped read command"
  const bad = []
  let structural = 0
  for (const [key, row] of projPairs) {
    if (casGet(repo, row.contentHash) === undefined) {
      bad.push(
        `row '${key}': no readable CAS object at ${typeof row.contentHash === "string" && HEX64.test(row.contentHash) ? valuePath(repo, row.contentHash) : JSON.stringify(row.contentHash)} — \`atlas node\` would answer \`no-such-node\``,
      )
    } else structural++
  }
  if (cliBin === undefined) {
    if (bad.length > 0) fails("GOC-7", T, bad)
    else {
      cannot(
        "GOC-7",
        T,
        `${structural} fact(s) are present and parse at the CAS value path, but NO shipped command was run: pass \`--cli <packages/cli/dist/src/bin.js>\` to drive \`atlas node <addr>\` per row. Bytes on disk are not a read door, and this probe will not report one as the other`,
      )
    }
  } else {
    let ok = 0
    for (const [key, row] of projPairs) {
      if (typeof row.contentHash !== "string") continue
      let out = ""
      let code = 0
      try {
        out = execFileSync(process.execPath, [cliBin, "node", row.contentHash], { cwd: repo, encoding: "utf8" })
      } catch (err) {
        out = String(err.stdout ?? "")
        code = typeof err.status === "number" ? err.status : 1
      }
      const quoted = out
        .trim()
        .split("\n")
        .map((l) => `        ${l}`)
        .join("\n")
      if (code !== 0)
        bad.push(
          `\`atlas node ${row.contentHash}\` exited ${code} — the fact for '${key}' is not readable through the shipped door:\n${quoted}`,
        )
      // The address TAKEN is the content hash and the identity PRINTED is the nodeKey. Asserting both in one
      // call is the only mechanical check here that the two 64-hex identities have not been swapped.
      else if (!out.includes(`  node: ${key}`))
        bad.push(
          `\`atlas node ${row.contentHash}\` exited 0 but did not print \`node: ${key}\` — the content address and the nodeKey are not the identities this row claims:\n${quoted}`,
        )
      else ok++
    }
    if (bad.length > 0) fails("GOC-7", T, bad)
    else
      heldOverRows(
        "GOC-7",
        T,
        `${ok} fact(s) resolved by the real \`atlas node <addr>\` binary, each printing back its own nodeKey`,
      )
  }
}

// ── GOC-8 — TOTALITY: the run's counters close over the store ───────────────────────────────────────────
// THE STORE CANNOT ANSWER THIS ALONE, and that is a finding rather than a limitation of this probe: a
// genesis run leaves no durable record of which sites it visited. `GenesisReport` carries `seeded`,
// `ratified`, `open`, `llmCalls`, `budgetSpent` and NO abstention field, and the controller drops the
// per-site `WhyNot`s anyway (`run-controller.ts`: `visit` returns `.facts` only). The only site ledger a run
// produces is the three lines it PRINTS, which is why `--report` exists and why its absence is not a pass.
{
  const T = "TOTALITY — the run's counters close: no site dropped, no candidate counted that is not durable"
  if (reportPath === undefined) {
    cannot(
      "GOC-8",
      T,
      "no `--report <file>` was given, and the store carries NO record of which sites the run visited (`GenesisReport` has no abstention field and the run controller drops every `WhyNot`). Capture the stdout of `atlas mine` and pass it, or this expectation is unfalsifiable",
    )
  } else {
    let text
    try {
      text = readFileSync(reportPath, "utf8")
    } catch {
      text = undefined
    }
    if (text === undefined) {
      fails("GOC-8", T, [`--report ${reportPath} could not be read`])
    } else {
      const bad = []
      const notes = []
      const r = parseMineReport(text)
      if (r === undefined) {
        bad.push(
          `${reportPath} does not carry the three lines \`atlas mine\` prints (\`genesis: seeded …\`, \`cost: llmCalls … · budgetSpent …\`, \`mine: … site(s) visited …\`) — a report this probe cannot parse is not a run it can vouch for`,
        )
      } else {
        const { seeded, budgetSpent, sites, candidates, allAbstained } = r
        // (a) one site is one unit of budget, so the two counters the run prints for the same quantity agree.
        if (sites !== budgetSpent)
          bad.push(
            `the run reports ${sites} site(s) visited but budgetSpent ${budgetSpent} — one site is one unit of budget, so a run that spent on a site it does not account for has dropped one`,
          )
        // (b) the two candidate counts the run prints for the same quantity agree.
        if (candidates !== seeded)
          bad.push(
            `the run reports \`seeded ${seeded}\` and \`${candidates} candidate facts\` — one quantity, counted twice, differently`,
          )
        // (c) SETTLED, never attempted. This is the measured failure the staging commit door exists for:
        //     8 processes x 5 sites reported 40 candidates committed with 5 durable, every process exiting 0.
        if (seeded > stagePairs.length)
          bad.push(
            `the run reports seeding ${seeded} candidate(s) but the staging sidecar holds ${stagePairs.length} row(s) — a count of what was ATTEMPTED is not a count of what SETTLED`,
          )
        else notes.push(`${seeded} candidate(s) reported, ${stagePairs.length} row(s) durable in staging`)
        // (d) ABSTENTION, accountable only on the branch where the product's own prose names it. There is no
        //     per-site WhyNot ledger anywhere, so on any other branch the residual is genuinely unknown.
        if (sites === 0)
          notes.push("abstention accounted vacuously: 0 sites visited, so there was nothing to abstain on")
        else if (candidates === 0 && allAbstained)
          notes.push(
            `abstention accounted: ${sites} site(s) visited, ${sites} abstained, 0 seeded — 0 + ${sites} = ${sites}`,
          )
        else
          bad.push(
            `${sites} site(s) visited and ${candidates} candidate(s) produced, and the run publishes NO PER-SITE OUTCOME — a site that abstained and a site that was silently dropped print identically. Abstention is a first-class outcome (a grounded WhyNot, GEN-12) and neither the GenesisReport nor the rendered report carries one, so this run's site set cannot be reconciled. Deliberately NOT computed as a subtraction: one site may yield more than one fact, so \`sites - candidates\` is not a residual`,
          )
      }
      if (bad.length > 0) fails("GOC-8", T, bad)
      else passes("GOC-8", T, notes.join("; "))
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────────────
const nFail = results.filter((r) => r.state === "FAIL").length
const nUnk = results.filter((r) => r.state === "UNEVALUABLE").length
const nPass = results.filter((r) => r.state === "PASS").length
const out = nFail > 0 ? console.error : console.log

out(`genesis-output-probe: ${nFail > 0 ? "FAIL" : nUnk > 0 ? "INCOMPLETE" : "OK"} — ${repo}`)
out("contract: docs/design/genesis-output-contract.md\n")
for (const r of results) {
  out(`  ${r.state === "PASS" ? "✓" : r.state === "FAIL" ? "✗" : "?"} ${r.id} ${r.state} — ${r.title}`)
  for (const d of r.detail) out(`      ${d}`)
}
for (const l of loud) out(`\n  ! LOUD: ${l}`)
out(`\n${nPass} held, ${nFail} FAILED, ${nUnk} could not be evaluated (of ${results.length}).`)
if (nUnk > 0) out("An unevaluated expectation is NOT a passing one — the reason is printed beside each `?`.")
process.exit(nFail > 0 ? 1 : nUnk > 0 ? 2 : 0)
