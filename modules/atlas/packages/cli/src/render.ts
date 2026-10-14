// @atlas/cli — src/render.ts  (CLI-3: render a handler Verdict to a process outcome)
//
// Render the frozen `Verdict` (@atlas/tools) to the CLI's process-level outcome (exit code + stdout).
// DETERMINISTIC: a PURE function of the verdict — NO clock/nonce/paths — so the same verdict renders
// byte-identically every time (CLI-3c). WIRE-LOOP Seam-2 adds the `data:` block that closes GAP-B (the CLI
// used to DROP `verdict.data`, so an emitted fact was invisible at the user surface). The block is appended
// AFTER the status/next/invariant lines and ONLY for a known `ok` data shape — an unknown/absent `data`
// yields NO block, so every pre-existing rendering stays byte-unchanged (back-compat).

import type { Verdict } from "@atlas/tools"
import { deriveStatus, EXIT } from "./map.js"
import type { Status } from "./map.js"

/** The CLI's process-level projection of one handler verdict (ring shape). */
export interface CliVerdict {
  readonly exitCode: number
  readonly stdout: string
}

/** A `PackInvariant`-shaped row inside a query pack (structural — never a prose blob). */
interface InvRow {
  readonly nodeId: string
  readonly tier: string
  readonly claim: string
  /** The row's OWN freshness verdict (ADR-0013 clause 5). Typed optional HERE and only here, because this
   *  renderer reads an `unknown` verdict payload rather than a `Pack`: a shape guard that assumed the field
   *  would make a pack from an older door render nothing at all. Rendered as `?` when absent — never
   *  silently as `FRESH`, which is the one value that would read as a verification that did not happen. */
  readonly freshness?: string
}

/** A `broader ⊃ narrower` coverage edge inside the query envelope (Seam-3). */
interface SubRow {
  readonly broader: string
  readonly narrower: string
}

/** A `a ≡ b` human equivalence edge inside the query envelope (WP-SAMEAS). */
interface SameRow {
  readonly a: string
  readonly b: string
}

/**
 * Render the DETERMINISTIC `data:` block for a known `ok` verdict data shape, or `''` when the shape is
 * unknown/absent (back-compat: no block ⇒ existing output byte-unchanged). PURE — every byte is a function
 * of `data` alone, in a fixed field order (CLI-3c). The recognised shapes, in guard order:
 *   - query envelope `{ pack, subsumes }` → `  inv <tier> <nodeId> [<freshness>]: <claim>` per (pre-sorted)
 *     GOVERNING invariant, then `  advisory <tier> <nodeId> [<freshness>]: <claim>` per ADVISORY row (its own
 *     verb, never interleaved — ADR-0013), `  advisoryDropped: <n>`, `  stale: <bool>`, then
 *     `  subsumes <broader> ⊃ <narrower>` per (pre-sorted) edge.
 *   - emit `{ id }` (a Hash) → `  id: <hash>`.
 *   - init `{ territories }` → `  territory: <name>` per territory, sorted by name.
 */
function renderData(data: unknown): string {
  if (typeof data !== "object" || data === null) return ""
  const d = data as Record<string, unknown>

  // query envelope { pack, subsumes } — the observability readback (Seam-1+3).
  const pack = d.pack as
    | {
        invariants?: unknown
        advisory?: unknown
        advisoryDropped?: unknown
        stale?: unknown
        tokenEstimate?: unknown
        territory?: unknown
        axisHash?: unknown
      }
    | undefined
  if (pack && typeof pack === "object" && Array.isArray(pack.invariants)) {
    const invs = pack.invariants as readonly InvRow[]
    const adv = Array.isArray(pack.advisory) ? (pack.advisory as readonly InvRow[]) : []
    const advDropped = typeof pack.advisoryDropped === "number" ? pack.advisoryDropped : 0
    const subs = Array.isArray(d.subsumes) ? (d.subsumes as readonly SubRow[]) : []
    const sames = Array.isArray(d.sameAs) ? (d.sameAs as readonly SameRow[]) : []
    // N12 CLI/MCP parity: surface `tokenEstimate` (the advisory pack size) on the CLI too — MCP already ships
    // it in the pack JSON, so dropping it here was a real CLI-vs-MCP asymmetry. Deterministic (a number field).
    const tokenEstimate = typeof pack.tokenEstimate === "number" ? pack.tokenEstimate : 0
    const lines = [
      // ADR-0013 clause 3 — the GOVERNING band keeps the `inv` verb it has always had, now carrying the row's
      // own freshness verdict. The ADVISORY band below gets its OWN verb (`advisory`) and is never
      // interleaved: a reader must not have to parse a tier letter to know nobody ratified a claim.
      ...invs.map((i) => `  inv ${i.tier} ${i.nodeId} [${i.freshness ?? "?"}]: ${i.claim}`),
      ...adv.map((i) => `  advisory ${i.tier} ${i.nodeId} [${i.freshness ?? "?"}]: ${i.claim}`),
      // The truncation ledger rides out BESIDE the data (#130) — a bounded set that was cut and does not say
      // so reads as "we covered everything". Printed unconditionally, so `0` is a measured fact and not a
      // line the reader has to notice is missing.
      `  advisoryDropped: ${advDropped}`,
      `  stale: ${pack.stale === true}`,
      `  tokenEstimate: ${tokenEstimate}`,
      ...subs.map((s) => `  subsumes ${s.broader} ⊃ ${s.narrower}`),
      // WP-SAMEAS: one line per (pre-sorted) human equivalence edge — surfaced like subsumes, never a merge.
      ...sames.map((s) => `  sameAs ${s.a} ≡ ${s.b}`),
    ]
    // [ENTRY-CLI-6] `territory` + `axisHash` are the two `Pack` fields (@atlas/contracts) this block used to
    // drop silently — a caller could see the invariants a query resolved but never which territory/axis they
    // were resolved AGAINST. APPENDED (never inserted earlier), so every pre-existing line stays in place.
    if (typeof pack.territory === "string") lines.push(`  territory: ${pack.territory}`)
    if (typeof pack.axisHash === "string") lines.push(`  axisHash: ${pack.axisHash}`)
    return `data:\n${lines.join("\n")}\n`
  }

  // relations { relations, unit, direction } — the grounded relation edges touching a unit (`atlas relations`,
  // #99a). Recognised by a `relations` array (no other data shape carries that key), guarded BEFORE the shapes
  // below (none of which has a `relations` field, so no cross-shadowing). A header line states the unit,
  // direction and COUNT, so an EMPTY result is a measured fact ("0 edge(s)") and never an absent line; each
  // edge renders `  relation <kind> <A> -> <B> (<nodeKey>)` in the fold's own deterministic order.
  if (Array.isArray(d.relations)) {
    const edges = d.relations as readonly {
      nodeKey: string
      relationKind: string
      endpointA: string
      endpointB: string
      seal?: string
    }[]
    const unit = typeof d.unit === "string" ? d.unit : ""
    const direction = typeof d.direction === "string" ? d.direction : "both"
    // #99 R6 (AR-12): each edge surfaces its two-seal provenance as a trailing `[<seal>]` — a sound-minted
    // proven `depends-on` and an advisory relation would otherwise read IDENTICALLY at the CLI. Printed ONLY
    // when the fold carried a seal (additive/absent-tolerant, the `seal`/`freshness` discipline elsewhere in
    // this file): an unsealed edge renders byte-identically to its pre-R6 output (no `[...]` suffix), so a
    // missing seal is never a silent `[proven]`.
    const lines = [
      `  relations: ${unit} ${direction} — ${edges.length} edge(s)`,
      ...edges.map(
        (e) =>
          `  relation ${e.relationKind} ${e.endpointA} -> ${e.endpointB} (${e.nodeKey})` +
          (typeof e.seal === "string" ? ` [${e.seal}]` : ""),
      ),
    ]
    return `data:\n${lines.join("\n")}\n`
  }

  // negations { negations, abstentions, scope, abstained } — the grounded negatives + honest abstentions under
  // a scope (`atlas negations`, #99b). Recognised by a `negations` array (no other data shape carries that
  // key; the relations shape carries `relations`, not `negations`, so no cross-shadowing), guarded BEFORE the
  // shapes below. A header line states the scope and BOTH counts, so an EMPTY result is a measured fact and an
  // abstention that fired is never an absent line. Each negative renders `  negation <kind> <target> in
  // <scope> (<nodeKey>)`; each abstention renders `  abstained <kind> <target> in <scope> — <reason>` — the
  // ABSTAINED section is the #202 observability. `--abstained` FOCUSES the render on the abstentions ONLY (the
  // data still carries both arrays, so parity + observability hold); the default shows negatives AND
  // abstentions, so a fired abstention is visible without any flag.
  if (Array.isArray(d.negations)) {
    const negs = d.negations as readonly {
      nodeKey: string
      relationKind: string
      target: string
      scope: string
      freshness?: string
    }[]
    const absts = d.abstentions as
      | readonly { relationKind: string; target: string; scope: string; reason: string }[]
      | undefined
    const abstentions = Array.isArray(absts) ? absts : []
    const scope = typeof d.scope === "string" ? d.scope : ""
    const focus = d.abstained === true
    const abstainedLines = abstentions.map(
      (a) => `  abstained ${a.relationKind} ${a.target} in ${a.scope} — ${a.reason}`,
    )
    // N4: each grounded negative renders its per-row §3 freshness verdict (FRESH/DRIFTED) — a re-opened scope
    // or an extractor-model bump reads DRIFTED, so "does this negative still hold" is legible on the surface.
    const lines = focus
      ? [`  negations: ${scope} — ${abstentions.length} abstention(s)`, ...abstainedLines]
      : [
          `  negations: ${scope} — ${negs.length} negation(s), ${abstentions.length} abstention(s)`,
          ...negs.map(
            (n) =>
              `  negation ${n.relationKind} ${n.target} in ${n.scope} [${n.freshness ?? "DRIFTED"}] (${n.nodeKey})`,
          ),
          ...abstainedLines,
        ]
    return `data:\n${lines.join("\n")}\n`
  }

  // anchors { rev, units, holes, reason? } — the read-only DISCOVERY planner listing (`atlas anchors <path>`,
  // WP-10.A1.CLI / ADR-0004, the frozen `AnchorsOut`). Recognised by a `units` array PLUS a `holes` array (no
  // other data shape carries either key, so no cross-shadowing with the shapes above/below). A header line states
  // the rev and BOTH counts, so an EMPTY listing is a MEASURED fact ("0 unit(s), 0 hole(s)") and never an absent
  // line; each unit renders `  unit <kind> <qualifiedPath> [<subtreeHash>]` in the leg's own deterministic (index)
  // order — [ENTRY-CLI-6] the fourth `AnchorUnit` field, `path` (the FILE the unit lives under, distinct from
  // `qualifiedPath`'s folded `::` symbol form for a `symbol`-kind unit), used to have NO rendered line at all;
  // it now rides a SEPARATE trailing `  unit-path <qualifiedPath>: <path>` line per unit rather than being
  // spliced into the pre-existing `unit` line, so that line's bytes stay byte-for-byte what they always were
  // — and each declared language hole renders `  hole <ext> — <fileCount> file(s): <reason>` (AUTHOR-4, the
  // real census). The honest-empty `reason` (AUTHOR-3) renders as a trailing `  reason: <reason>` line ONLY
  // when present (the leg sets it iff `units` is empty), so a populated listing stays byte-clean and an
  // empty one is never silent about WHY.
  if (Array.isArray(d.units) && Array.isArray(d.holes)) {
    const units = d.units as readonly { qualifiedPath: string; kind: string; subtreeHash: string; path: string }[]
    const holes = d.holes as readonly { ext: string; fileCount: number; reason: string }[]
    const rev = typeof d.rev === "string" ? d.rev : ""
    const lines = [
      `  anchors: rev ${rev} — ${units.length} unit(s), ${holes.length} hole(s)`,
      ...units.map((u) => `  unit ${u.kind} ${u.qualifiedPath} [${u.subtreeHash}]`),
      ...units.map((u) => `  unit-path ${u.qualifiedPath}: ${u.path}`),
      ...holes.map((h) => `  hole ${h.ext} — ${h.fileCount} file(s): ${h.reason}`),
    ]
    if (typeof d.reason === "string") lines.push(`  reason: ${d.reason}`)
    return `data:\n${lines.join("\n")}\n`
  }

  // slots { slots } — the closed PredicateSlot vocabulary listing (`atlas slots`, AUTHOR-5, WP-10.A2-a.CLI).
  // Recognised by a `slots` array of `{slot, meaning}` rows (no other data shape carries a `slots` key). A
  // header line states the COUNT (a measured fact, never a hardcoded "13"); each row renders `  slot <name>:
  // <meaning>` in the mapping's own declaration order.
  if (Array.isArray(d.slots)) {
    const rows = d.slots as readonly { slot: string; meaning: string }[]
    const lines = [`  slots: ${rows.length} predicate slot(s)`, ...rows.map((s) => `  slot ${s.slot}: ${s.meaning}`)]
    return `data:\n${lines.join("\n")}\n`
  }

  // draft { fact, rev, operation, route, requires? } — the COMPOSITION planner's candidate payload (`atlas
  // draft <anchor> <slot> <claim>`, AUTHOR-6/7/9/10, WP-10.A2-a.CLI). Recognised by `operation` + `route`
  // (no other data shape carries either key). Renders the drafted fact's identity/tier/slot/claim, the rev
  // its grounding was computed at (AUTHOR-7 — pair this with `--at` at emit time), the CREATE/UPDATE call
  // and the stated ratification route (AUTHOR-9/10); the authorizing channel renders ONLY when present
  // (additive/absent-tolerant, matching the `seal`/`witness` discipline above).
  if (typeof d.operation === "string" && typeof d.route === "string" && typeof d.fact === "object" && d.fact !== null) {
    const fact = d.fact as Record<string, unknown>
    const lines = [
      `  draft: ${String(fact.id)}`,
      `  tier: ${String(fact.tier)}`,
      `  slot: ${String(fact.predicateSlot)}`,
      `  claim: ${String(fact.claimNorm)}`,
      `  rev: ${String(d.rev)}`,
      `  operation: ${d.operation}`,
      `  route: ${d.route}`,
    ]
    if (typeof d.requires === "string") lines.push(`  requires: ${d.requires}`)
    return `data:\n${lines.join("\n")}\n`
  }

  // link { linked, a, b, retracted? } — the governed sameAs write door result (WP-SAMEAS). A SUCCESSFUL link
  // renders a single `  linked: <a> ≡ <b>` line; a REJECTED link (linked:false) carries its `rejected` string
  // through the handler's ok:false path → the `reason:` block (mirrors emit), so it is never shadowed here.
  // Guarded on `linked === true` BEFORE the `{id}` shape below (a LinkOut has no `id`, so no cross-shadowing).
  //
  // [A-D3 / task #83] a RETRACTION renders its OWN verb — `  retracted: <a> ≢ <b>` — and never the `linked:`
  // line. Both modes settle as `linked:true` (that field means "the act changed the stored relation"), so
  // rendering them alike would put "linked: a ≡ b" on a human's screen at the exact moment the equivalence
  // was withdrawn. Distinct verb, distinct symbol, no way to misread which act happened.
  if (d.linked === true && typeof d.a === "string" && typeof d.b === "string") {
    return d.retracted === true ? `data:\n  retracted: ${d.a} ≢ ${d.b}\n` : `data:\n  linked: ${d.a} ≡ ${d.b}\n`
  }

  // node (TEST-VACUITY) — a resolved `TestVacuityNode` (the `atlas node <addr>` read door) for the single-anchor
  // proven family (#95, ADR-0015 D5). Recognised by `kind:'test-vacuity'` + a `grounding` object; the emit
  // `{ id }` shape below has NEITHER and the other node shapes carry a different `kind`, so no cross-shadowing. A
  // test-vacuity has no `claimNorm` at this seam — its claim IS the (testName @ unitKey, shape) triple, so that
  // is what renders. The seal + witness render ONLY when present (additive/absent-tolerant, the `seal`/
  // `witness` discipline the relation/predicate branches use); the witness is a `TestVacuityWitness`
  // (shape/testName) — the re-runnable derivation `scanTestVacuity` re-proves at HEAD, never model prose.
  if (d.kind === "test-vacuity" && typeof d.grounding === "object" && d.grounding !== null) {
    let out =
      `data:\n  node: ${String(d.id)}\n  tier: ${String(d.tier)}\n  kind: test-vacuity\n` +
      `  test-vacuity: ${String(d.testName)} @ ${String(d.unitKey)} (${String(d.shape)})\n`
    if (typeof d.seal === "string") out += `  seal: ${d.seal}\n`
    if (typeof d.witness === "object" && d.witness !== null) {
      const w = d.witness as Record<string, unknown>
      out += `  witness:\n    shape: ${String(w.shape)}\n    testName: ${String(w.testName)}\n`
    }
    return out
  }

  // node (RELATION) — a resolved `RelationNode` (the `atlas node <addr>` read door) for the 2-ended family
  // (#99 R6, AR-12). Recognised by `kind:'relation'` + a `grounding` object; the emit `{ id }` shape below has
  // NEITHER and the `relations` LIST shape above carries `relations` (not a bare `kind`), so no cross-shadowing.
  // A relation has no `claimNorm` — its claim IS the directed triple `endpointA <relationKind> endpointB`, so
  // that is what renders. Before R6 this door produced NO block for a relation (the branch below was gated to
  // advisory|predicate), so a proven `depends-on` was invisible at the user surface. The seal + witness render
  // ONLY when present (additive/absent-tolerant); the witness is a `RelationWitness` (relationKind/target/
  // sourceScope), NOT a `PredicateWitness` (slot/target/scope/atLeast) — a relation has no `PredicateSlot`.
  if (d.kind === "relation" && typeof d.grounding === "object" && d.grounding !== null) {
    let out =
      `data:\n  node: ${String(d.id)}\n  tier: ${String(d.tier)}\n  kind: relation\n` +
      `  relation: ${String(d.endpointA)} ${String(d.relationKind)} ${String(d.endpointB)}\n`
    if (typeof d.seal === "string") out += `  seal: ${d.seal}\n`
    if (typeof d.witness === "object" && d.witness !== null) {
      const w = d.witness as Record<string, unknown>
      out += `  witness:\n    relationKind: ${String(w.relationKind)}\n    target: ${String(w.target)}\n    sourceScope: ${String(w.sourceScope)}\n`
    }
    return out
  }

  // node — a resolved `GroundedFact` (the `atlas node <addr>` read door, N6). Recognised by its `kind`
  // (advisory|predicate) + a `grounding` object — the emit `{ id }` shape below has NEITHER, so it is never
  // shadowed. Renders the node's identity + tier + claim (advisory `claimNorm`, else the `claims` set-union).
  if ((d.kind === "advisory" || d.kind === "predicate") && typeof d.grounding === "object" && d.grounding !== null) {
    const claim =
      typeof d.claimNorm === "string" && d.claimNorm.length > 0
        ? d.claimNorm
        : Array.isArray(d.claims)
          ? (d.claims as readonly string[]).join("; ")
          : ""
    let out = `data:\n  node: ${String(d.id)}\n  tier: ${String(d.tier)}\n  kind: ${d.kind}\n  claim: ${claim}\n`
    // #239 — a `seal:'proven'` fact's own re-check derivation (SEAL-CARRIES-ITS-WITNESS, PR #195), the ONE
    // leg the original WP deliberately left un-rendered. Printed ONLY when present (additive/absent-
    // tolerant, matching `seal`/`obviousness`'s own discipline above) — an un-sealed node renders byte-
    // identically to before this change.
    if (typeof d.seal === "string") out += `  seal: ${d.seal}\n`
    if (typeof d.witness === "object" && d.witness !== null) {
      const w = d.witness as Record<string, unknown>
      // NESTED, deliberately, mirroring the stored shape: `d.scope` (the KNOW-11a AUTHZ scope, e.g.
      // 'atlas:mined') and `d.witness.scope` (the VERIFY-SCOPE directory the oracle ranged over, e.g.
      // 'src/pay') are DIFFERENT things — PR #195 nested them precisely so a reader could not misread one
      // for the other. Indenting `witness:`'s own `scope:` one level under it (rather than a flat
      // `witnessScope:` sibling of a top-level `scope:`) keeps that distinction visible in this render too:
      // the path to each field on the page matches the path to each field on the stored object.
      out += `  witness:\n    slot: ${String(w.slot)}\n    target: ${String(w.target)}\n    scope: ${String(w.scope)}\n`
      if (typeof w.atLeast === "number") out += `    atLeast: ${w.atLeast}\n`
    }
    return out
  }

  // memory-emit { admitted, owner?, kind? } — WP-11.W8, the governed MEMORY write door's receipt
  // (`MemoryEmitOut`). Recognised by a BOOLEAN `admitted` (no other data shape carries that key). Rendered
  // ONLY on `admitted:true` (`renderAs` only calls `renderData` for an `ok` verdict, and a fail-closed write
  // is `ok:false` — its `reason:` line already carries the named MEM gate + human reason, mirroring
  // `EmitOut`/`LinkOut`). `MemoryRecord` carries no CAS `id` of its own (unlike a knowledge `GroundedFact`)
  // — `owner`/`kind` are its two structural fields, so those are what a receipt has to show.
  if (typeof d.admitted === "boolean") {
    if (!d.admitted) return ""
    const record = d.record as { owner?: unknown; kind?: unknown } | undefined
    let out = "data:\n"
    if (typeof record?.owner === "string") out += `  owner: ${record.owner}\n`
    if (typeof record?.kind === "string") out += `  kind: ${record.kind}\n`
    return out
  }

  // emit { id, nodeKey? } — the CAS id of the persisted fact. [ENTRY-CLI-6 / AUTHOR-14] `nodeKey` — the
  // SAME identity `atlas node <addr>` reads back — used to ride the `EmitOut` receipt completely unrendered;
  // it now gets its OWN trailing line, APPENDED after `id` (never replacing it), and ONLY when present
  // (additive/absent-tolerant — a pre-#… receipt with no `nodeKey` renders byte-identically to before).
  if (typeof d.id === "string") {
    let out = `data:\n  id: ${d.id}\n`
    if (typeof d.nodeKey === "string") out += `  nodeKey: ${d.nodeKey}\n`
    return out
  }

  // init { territories, blastRadius, t0Candidates } — the structural move-in (`InitOut`, ENTRY-CLI-6 §
  // regression witness: two of the record's three fields — `blastRadius` and `t0Candidates` — used to be
  // dropped here entirely; a reader saw the territory set and NOTHING about the reachability closure or
  // which T0-keyword territories got flagged). `blastRadius`/`t0Candidates` render as their OWN trailing
  // line-groups, APPENDED after the pre-existing (sorted) `territory:` lines — never spliced into them — so
  // a zero-territory / zero-blastRadius / zero-t0Candidates init still renders NOTHING for that group (a
  // measured absence, not a header for an empty set) and the whole block stays byte-identical to the
  // pre-#ENTRY-CLI-6 output whenever all three arrays are empty (back-compat, SCN-CLI-6b-1 pins the
  // populated case; the pre-existing sorted-by-name territory line order is UNCHANGED).
  if (Array.isArray(d.territories)) {
    const names = (d.territories as readonly { name: string }[])
      .map((t) => t.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const blastRadius = Array.isArray(d.blastRadius) ? (d.blastRadius as readonly string[]) : []
    const t0Candidates = Array.isArray(d.t0Candidates) ? (d.t0Candidates as readonly string[]) : []
    const lines = [
      ...names.map((n) => `  territory: ${n}`),
      ...blastRadius.map((b) => `  blastRadius: ${b}`),
      ...t0Candidates.map((c) => `  t0Candidate: ${c}`),
    ]
    if (lines.length === 0) return ""
    return `data:\n${lines.join("\n")}\n`
  }

  // reconcile { drift, mechanical, semantic, regroundedCount, reauthorCount, exitCode } — the drift-review
  // pass (`ReconcileOut`, TOOLS-8/13). [ENTRY-CLI-6] this shape used to render NO block at all — every field
  // was silently dropped (the `renderData` guard chain had no branch for it, so `renderAs`'s dataBlock was
  // always `''` for a reconcile verdict, even though the SAME verdict already carries `exitCode` into the
  // exit-code derivation via `deriveStatus`/duck-typing in map.ts). Recognised by `mechanical`+`semantic`
  // arrays PLUS a numeric `exitCode` (no other shape carries all three; `relations`/`negations` carry
  // arrays under different keys, so no cross-shadowing). A header line states BOTH review-set counts and the
  // exit code (a measured fact, matching what the process actually returns), then the two named-fact lists,
  // then the re-ground/re-author counts. `drift`'s richer `DriftItem` rows render their fact + class +
  // anchors so a reviewer sees WHAT moved, not just its name twice.
  if (Array.isArray(d.mechanical) && Array.isArray(d.semantic) && typeof d.exitCode === "number") {
    const drift = Array.isArray(d.drift)
      ? (d.drift as readonly { fact: string; class: string; anchorWas: unknown; anchorNow: unknown }[])
      : []
    const mechanical = d.mechanical as readonly string[]
    const semantic = d.semantic as readonly string[]
    const regroundedCount = typeof d.regroundedCount === "number" ? d.regroundedCount : 0
    const reauthorCount = typeof d.reauthorCount === "number" ? d.reauthorCount : 0
    const lines = [
      `  reconcile: exitCode ${d.exitCode} — ${mechanical.length} mechanical, ${semantic.length} semantic`,
      ...drift.map((item) => `  drift ${item.class} ${item.fact}`),
      ...mechanical.map((f) => `  mechanical: ${f}`),
      ...semantic.map((f) => `  semantic: ${f}`),
      `  regroundedCount: ${regroundedCount}`,
      `  reauthorCount: ${reauthorCount}`,
    ]
    return `data:\n${lines.join("\n")}\n`
  }

  // check { wouldEmit, gates } — the DRY-RUN planner's gate-chain verdict (`atlas check <anchor> <slot>
  // <claim>`, AUTHOR-11/12, WP-10.A3.CLI). Recognised by `wouldEmit` (boolean) + `gates` (array) — no other
  // data shape carries either key. Renders the overall `wouldEmit` decision, then EVERY gate row in door order
  // (shape → truth → authz → ratify) with pass/refuse and, for a refusing gate, its reason + remedy — so the
  // CLI shows the WHOLE chain the MCP `atlas-check` tool already returns, not just the first refusal the
  // top-level `next:` guidance names. Closes the CLI-vs-MCP asymmetry (mirrors the `draft` render's rule of
  // printing its whole payload, not a hand-picked subset).
  if (typeof d.wouldEmit === "boolean" && Array.isArray(d.gates)) {
    const gates = d.gates as ReadonlyArray<Record<string, unknown>>
    const lines = [
      `  wouldEmit: ${d.wouldEmit}`,
      ...gates.map((g) => {
        const head = `  gate ${String(g.gate)}: ${g.pass === true ? "pass" : "refuse"}`
        const why = typeof g.reason === "string" && g.reason.length > 0 ? ` — ${g.reason}` : ""
        const fix = typeof g.remedy === "string" && g.remedy.length > 0 ? ` [remedy: ${g.remedy}]` : ""
        return `${head}${why}${fix}`
      }),
    ]
    return `data:\n${lines.join("\n")}\n`
  }

  return ""
}

/**
 * Render a frozen handler `Verdict` to an exit code + stdout (CLI-3). DETERMINISTIC: a PURE function of the
 * verdict — NO clock, NO nonce, NO duration — so the same verdict renders byte-identically every time
 * (CLI-3c). The exit code is `f(status)` (CLI-3b, `deriveStatus`), and the stdout block carries `status`
 * plus BOTH guidance fields (`next`, `invariant`) in a fixed order (CLI-3d — guidance always present), then
 * the Seam-2 `data:` block when the verdict is `ok` and carries a known data shape (else nothing appended).
 */
export function renderVerdict(v: Verdict): CliVerdict {
  return renderAs(v, deriveStatus(v))
}

/**
 * Render a verdict the CLI itself has already classified as a GOVERNANCE REFUSAL — `status: rejected`,
 * exit 2 — through the SAME byte-for-byte body as {@link renderVerdict}.
 *
 * WHY IT EXISTS RATHER THAN A BRANCH IN `deriveStatus`. `deriveStatus` is a pure function of ONE verdict and
 * classifies by the RECORD a governed door carries back (`emitted:false` / `linked:false` / a non-zero
 * reconcile `exitCode`). A refusal raised at the ENTRYPOINT, before any door opens, has no such record and
 * never will — there is no door result to inspect. Fabricating an `EmitOut` so the duck-type fires would be
 * a lie in the data, and widening `deriveStatus` to treat every `ok:false` as a rejection would re-classify
 * an unwired tool and a parse error as governance refusals, which they are not (it also MOVES the pinned
 * SCN-CLI-3b exit derivation). So the classification is made where the knowledge is — at the call site that
 * knows a gate refused — and the rendering stays one function.
 */
export function renderRefusal(v: Verdict): CliVerdict {
  return renderAs(v, "rejected")
}

/** The shared body: identical bytes for a given verdict, with the status/exit supplied by the caller. */
function renderAs(v: Verdict, status: Status): CliVerdict {
  const dataBlock = v.ok && v.data !== undefined ? renderData(v.data) : ""
  // F5: on a fail-closed / rejected verdict (`ok:false` with a reason), render the REASON so the CLI door is
  // as legible as the MCP `isError` door — the governed refusal is never silent. DETERMINISTIC: a pure
  // function of `v.rejected`, appended after the status/guidance lines (mutually exclusive with `dataBlock`,
  // which renders only on `ok`). An `ok` verdict carries no reason ⇒ pre-existing output stays byte-identical.
  const reasonBlock = !v.ok && v.rejected ? `reason: ${v.rejected}\n` : ""
  const stdout =
    `status: ${status}\n` +
    `next: ${v.guidance.next}\n` +
    `invariant: ${v.guidance.invariant}\n` +
    reasonBlock +
    dataBlock
  return { exitCode: EXIT[status], stdout }
}
