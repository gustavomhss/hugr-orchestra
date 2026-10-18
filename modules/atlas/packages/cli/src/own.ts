// @atlas/cli — src/own.ts  (CLI-8: the `atlas own <scope>` scoped-briefing door)
//
// The CLI leg of the `own_<scope>` READ door (RETR-12). It owns exactly two things: driving the composition
// root's `own` leg once, and projecting its `OwnDispatch` to a `CliVerdict`. Every ranking decision, every
// cap and every "what is even available" answer belongs to `@atlas/retrieval`'s `createOwn` and the feed
// under it (`adapter-io/own-source.ts`) — read that module's header first; it carries the four inputs this
// product cannot honestly source yet and says so by name.
//
// WHY THIS FILE EXISTS AT ALL, RATHER THAN A LEG ON THE HANDLER — the same answer `promote.ts` gives, one
// authority class down. `own` opens no new governed surface: `GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS`
// stays `{atlas-emit, atlas-link}`, and this door writes nothing at all. So there is no `Tool` token to
// dispatch and nothing for `WiredHandler.handle` to route — the command is intercepted at the entrypoint,
// exactly as `node`, `doctor`, `mine` and `promote` are, and its outcome rides the ONE process-outcome path.
//
// NO AUTHZ GATE, AND THAT IS A DECISION RATHER THAN AN OMISSION. Reads are universal in Atlas (KNOW-11b).
// The actor is a self-asserted string — `ATLAS_ACTOR`, or a line of `git config` the caller owns — so a read
// gate over it would refuse honest callers and stop a dishonest one for as long as it takes to export one
// environment variable. The trust boundary here is STATED (compose.ts, ARCH-12), not enforced.
//
// THE EXIT CODE. `own` is a read that cannot be refused by a gate, so it has no exit-2 leg of its own; the
// one governance refusal that can reach a caller (a COMMITTED durable store) fires at the entrypoint, before
// this function is called, and renders as `rejected`/2 there.
//   0  the briefing was composed — INCLUDING the honest empty one (a scope with nothing filed under it)
//   1  the runtime is not composed (handled in cli.ts, never here)

import type { OwnDispatch } from "@atlas/adapter-io"
import type { GroundedFact } from "@atlas/knowledge"
import type { CliVerdict } from "./render.js"

/** The invariant line every `own` outcome carries — the one property a reader should check the bytes against.
 *  It names the TWO BANDS (REQ-RETR-12m) because the difference between a ratified row and a machine
 *  proposal is the one thing an operator must not have to infer from a tier column. */
const INVARIANT =
  "RETR-12: `own_<scope>` is composed by INDEX READS ALONE — 0 LLM, 0 free prose, byte-identical for equal input — two bands (governing tier>=T1 + separately capped advisory T2), and it is bounded: what did not fit is listed as pull-reachable, never silently dropped"

/** The advisory claim body of a fact. An `AdvisoryNode` carries `claimNorm`; a `PredicateNode` carries a
 *  `check` and no claim body, so it renders EMPTY rather than a stringified record. (`GroundedFact.claims`
 *  is a kernel `ClaimEntry[]`, not a string list — joining it would print `[object Object]`.) */
function claimOf(fact: GroundedFact): string {
  return fact.kind === "advisory" ? fact.claimNorm : ""
}

/**
 * Project one composed briefing to the CLI's process outcome. PURE — a function of the `OwnDispatch` alone
 * (no clock, no paths, no re-reading of the store), so the same briefing renders byte-identically (CLI-3c).
 *
 * THE ROW VOCABULARY IS THE EXISTING ONE. `inv <tier> <nodeId>: <claim>` is byte-for-byte the line
 * `render.ts` already emits for a query pack, because it is the same `PackInvariant` — a reader who has seen
 * one `atlas query` has already read this format. The other rows follow the indented `<verb> <subject>`
 * shape `promote` established. No new renderer, no JSON mode, no second way to print a fact.
 */
export function ownVerdict(out: OwnDispatch): CliVerdict {
  const { tool, pack } = out
  const lines = [
    "status: ok",
    `next: ${nextLine(out)}`,
    `invariant: ${INVARIANT}`,
    // The header states the BUDGET, not just the content: a briefing is a bounded artifact and its size
    // against its cap is the number that tells a caller whether they are reading all of it.
    `own: ${tool} — ${pack.invariants.length} invariant(s), ${pack.gotchas.length} gotcha(s), ${pack.advisory.length} advisory; tokenEstimate ${pack.tokenEstimate}`,
    `  role: ${pack.unit}`,
    `  grounding: ${pack.grounding.source}`,
    `  owner: ${pack.shape.owner}`,
    `  tier: ${pack.shape.tier}`,
    ...pack.shape.contents.map((c) => `  contains ${c}`),
    ...pack.invariants.map((i) => `  inv ${i.tier} ${i.nodeId}: ${i.claim}`),
    ...pack.gotchas.map((g) => `  gotcha ${g.tier} ${g.id}: ${claimOf(g)}`),
    // THE ADVISORY BAND GETS ITS OWN VERB AND IS NEVER INTERLEAVED (REQ-RETR-12m, the same rule ADR-0013
    // put on the query pack). The row format is byte-for-byte `render.ts`'s advisory line, including the
    // bracketed per-row freshness verdict, because it IS the same `PackInvariant` — a reader who has seen
    // one `atlas query` has already read this. An operator who skips these rows loses nothing ratified.
    ...pack.advisory.map((i) => `  advisory ${i.tier} ${i.nodeId} [${i.freshness}]: ${i.claim}`),
    `  advisoryDropped: ${pack.advisoryDropped}`,
    ...pack.edges.dependents.map((d) => `  dependent ${d}`),
    ...pack.edges.dependencies.map((d) => `  dependency ${d}`),
    ...pack.drill.finer.map((f) => `  finer ${f.id}`),
    // D1 — content-free availability. Each row names a reachable surface and HOW to pull it; none of them
    // carries its content, which is the entire point of the manifest.
    ...pack.manifest.pointers.map((p) => `  available ${p.name} (${p.kind}) -> ${p.pull}`),
    // 0 SILENT DROPS. A fact the cap pushed out is named here, so "the briefing did not mention it" and
    // "there is nothing to mention" are never the same bytes.
    ...pack.pullReachable.map((k) => `  pull-reachable ${k}`),
    `  refresh: ${pack.drill.refresh.pull}`,
    `  complement: ${pack.drill.complement.pull}`,
  ]
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` }
}

/**
 * The one actionable sentence, derived from the briefing's own numbers — never a guess about the wiring.
 *
 * THE TWO EMPTINESSES ARE DISTINGUISHED, because they need different verbs from the caller and rendering
 * them alike is how a typo reads as an honest "nothing here". `own` is TOTAL (RETR-9): a scope that names no
 * unit at all answers with an empty briefing rather than an error, which is right for a briefing and wrong
 * to leave ambiguous. `shape.contents` is the discriminator — it comes from the code index, not from the
 * knowledge store, so it is non-empty exactly when the path IS a real structural unit.
 *
 * AN ADVISORY ROW COUNTS AS A FACT HERE, and that is a correctness fix rather than a preference: `facts`
 * gates the sentence "NO fact is filed under it yet". Counting only the governing band would print that
 * sentence over a briefing that had just listed `T2` rows from the store — the guidance would contradict
 * the bytes three lines below it. The row's STATUS is not blurred: the caveat below says what an advisory
 * row is, and the band is rendered under its own verb.
 */
function nextLine(out: OwnDispatch): string {
  const { pack } = out
  const facts = pack.invariants.length + pack.gotchas.length + pack.advisory.length
  /** Appended whenever an advisory row is on screen — the same warning `atlas query`'s guidance carries. */
  const caveat =
    pack.advisory.length === 0
      ? ""
      : "; an advisory row is a machine proposal no ratifier saw — check its per-row freshness"
  if (facts === 0 && pack.shape.contents.length === 0) {
    return "this path names no unit in the code index and serves nothing — check the spelling (`own` is TOTAL: an unknown scope answers with an empty briefing, never an error), or point it at a directory/file that exists at HEAD"
  }
  if (facts === 0) {
    return "the scope is a real code unit but NO fact is filed under it yet — the terrain, the finer units and the availability rows below are structural (from the index); `atlas emit` is what puts knowledge here"
  }
  if (out.pack.pullReachable.length > 0) {
    // THE IDENTIFIER CLASS IS NAMED, because pointing a caller at the wrong door is how guidance lies. Every
    // row this command prints — `inv`, `gotcha`, `dependent`, `pull-reachable` — carries a **nodeKey**, the
    // same identifier `atlas query`'s `inv` lines carry. `atlas node` takes a CONTENT ADDRESS and would miss
    // on every one of them, so it is deliberately not the verb suggested here.
    return `${out.pack.invariants.length} invariant(s) and ${out.pack.advisory.length} advisory row(s) fit the budget; ${out.pack.pullReachable.length} more are pull-reachable, named below by nodeKey — narrow the scope to one of the \`finer\` units to fit them into a briefing, or inspect one with \`atlas doctor why <nodeKey>\`${caveat}`
  }
  return `the whole of what is filed under this scope fits the briefing — drill with \`atlas own <finer>\`, widen with \`atlas query ${out.pack.drill.complement.pull.replace(/^relate:/, "")}\`${caveat}`
}

/**
 * Drive ONE `own_<scope>` composition and project it. `own` is the composition root's leg (`ComposedRuntime`),
 * injected rather than constructed here for the same reason `handler` and `promote` are: the CLI must not
 * stand up a second runtime, or the store it briefs from stops being the store `atlas query` reads.
 */
export function runOwn(own: (scope: string) => OwnDispatch, scope: string): CliVerdict {
  return ownVerdict(own(scope))
}
