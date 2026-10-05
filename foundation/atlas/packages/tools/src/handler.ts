// @atlas/tools — src/handler.ts   (WP-7.26-a.TOOLS — TOOLS-1 / TOOLS-2 / TOOLS-4, INV-TOOLS-1 / -2 / -4)
//
// THE ONE handler behind EVERY transport — the spine facet. Owns the `GOVERNANCE_SURFACE` (six members —
// ADR-0006 Decision 2: DERIVED and BUDGETED, not a fixed count) + the three governed `WRITE_PATHS`
// (`atlas-emit` / `atlas-link` / `atlas-memory-emit`, TOOLS-1 / ADR-0003, extended WP-11.W8), the
// published per-tool `SCHEMAS` (CLI≡MCP,
// TOOLS-3), and `handle`/`resolveNode` — PURE + TOTAL, malformed args fail CLOSED, guidance on every path.
//
// Every fail-closed path is also ATTRIBUTED: the caller's arguments, a door's deliberate refusal, and a
// fault inside Atlas are three different things and carry three different names (see ./fault.ts). They used
// to share one label — `malformed args — fail-closed:` — which reported our own crashes as the caller's bad
// input and sent an operator to debug an invocation that was fine.

import type { NodeKey, ToolSchema } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import {
  classifyThrown,
  internalReason,
  malformedArgsReason,
  malformedReason,
  missingRequiredReason,
  INTERNAL_GUIDANCE,
} from "./fault.js"
import type { Guidance, HandlerApi, Tool, ToolData, Transport, Verdict } from "./types.js"

/** The governance surface (TOOLS-1) — the order is fixed; membership is the load-bearing fact.
 *  [EXTENDED — WP-SAMEAS] `atlas-link` joins as a governed write tool (owner-authorized 2026-07-21):
 *  the read/derive trio (init/query/reconcile) + the two write doors (emit/link), `GOVERNANCE_SURFACE`
 *  five members.
 *  [EXTENDED — WP-11.W8 / CAMPAIGN-11] `atlas-memory-emit` joins as a THIRD write door — the governed
 *  MEMORY write door (MEM-1..9, `@atlas/adapter-io` `memory-emit.ts`/`wire.ts`). It is genuinely NEW
 *  governed surface (a separate durable log, not a reuse of `atlas-emit`'s door — see the `Tool` union's
 *  own doc comment, types.ts), so `GOVERNANCE_SURFACE` grows to SIX under ADR-0006's derived-and-budgeted
 *  amendment (ARCH-6/ARCH-7: `advertised ≡ invocable ≡ Tool`, bounded at 30 — never a re-fixed count). */
export const GOVERNANCE_SURFACE: readonly Tool[] = [
  "atlas-init",
  "atlas-query",
  "atlas-emit",
  "atlas-reconcile",
  "atlas-link",
  "atlas-memory-emit",
]

/** The write surface (TOOLS-1). [EXTENDED — WP-SAMEAS] `atlas-emit` (grounded fact admission) +
 *  `atlas-link` (governed human sameAs assertion). [EXTENDED — WP-11.W8] `atlas-memory-emit` (governed
 *  MEMORY admission, MEM-1..9) joins as a THIRD write door — THREE fail-closed governed mutations now; the
 *  other three governance tools read/derive, and the read projections (diff / doctor / node) carry no write
 *  authority (guarded structurally in `./guard.ts`). */
export const WRITE_PATHS: readonly Tool[] = ["atlas-emit", "atlas-link", "atlas-memory-emit"]

/** The token vocabulary for `READ_SURFACE` (WP-10.A5.TOOLS, ADR-0005 / ENTRY-MCP-3) — deliberately its OWN
 *  closed union, NOT a widening of `Tool`. `Tool` names the `GOVERNANCE_SURFACE` members (ADR-0005 §Why
 *  this does not weaken TOOLS-1: growing `Tool` to admit a read door would make `GOVERNANCE_SURFACE`'s own
 *  count meaningless — see the ADR's rejected alternative (a)). A `ReadDoor` is
 *  never accepted by `handle(tool, args)`; each is its OWN planner/projection function (`createAnchors` /
 *  `createSlots` / `createDraft` / `createCheck` / `createDoctor` / `HandlerApi.resolveNode` /
 *  the CAMPAIGN-11 memory read doors), never routed through this handler's `Tool` dispatch.
 *
 *  [OWNER-DECIDED 2026-08-24 — `atlas-diff` is NOT a member.] `diff.ts` is a declared ZERO-production-caller
 *  reference model (`reference-model-guard.mjs`'s ledger; its own header states "no `atlas diff` CLI
 *  command") — ARCH-5's advertised≡invocable property means an unwired door has no business in an
 *  ADVERTISED surface. Re-add it only alongside real CLI/MCP wiring, in its own WP; see ADR-0005 (reconciled). */
export type ReadDoor =
  | "atlas-anchors"
  | "atlas-slots"
  | "atlas-draft"
  | "atlas-check"
  | "atlas-doctor"
  | "atlas-node"
  | "atlas-memory-recall"
  | "atlas-memory-header"
  | "atlas-memory-awareness"
  | "atlas-memory-orientation"

/** `READ_SURFACE` (ADR-0005, ENTRY-MCP-3) — the disjoint read/planner surface `GOVERNANCE_SURFACE` unions
 *  with over MCP (A5.MCP wires the advertisement itself; this WP only freezes the constant + its two
 *  disjointness properties + the write-freedom proof — see `harness/gates/spec-conformance-guard.mjs`'s
 *  CODE-SURFACE PIN and `test/wp-10.a5-tools.test.ts`).
 *
 *  Membership — the SIX pre-existing invocable read doors (ARCH-5 advertised≡invocable, `layer-guard.mjs`'s
 *  `boundReadDoor` verifies each mechanically against the real binding site):
 *    - the four ADR-0004 authoring PLANNERS (AUTHOR-2: persist nothing, hold no store handle), bound as
 *      fields on `ComposedRuntime` (`@atlas/adapter-io` `compose.ts`) — `atlas-anchors` / `atlas-slots` /
 *      `atlas-draft` / `atlas-check`;
 *    - the two already-shipped READ projections (TOOLS-10/12) — `atlas-doctor` / `atlas-node` — which are
 *      NOT their own leg: the CLI intercepts `doctor`/`node` before the handler and reuses the bound
 *      `atlas-query` leg (`cli/src/map.ts` `COMMAND_LEG`), a second projection of that one read door.
 *
 *  [EXTENDED — WP-11.W8 / CAMPAIGN-11] FOUR memory read doors join — the CAMPAIGN-11 durable memory READ
 *  doors (`@atlas/adapter-io` `memory-read.ts`/`awareness-store.ts`/`orientation-store.ts`), exposed the SAME
 *  way `doctor`/`node` are: intercepted before the handler and bound onto the `atlas-query` leg (`cli/src/
 *  map.ts` `COMMAND_LEG`, `layer-guard.mjs`'s `boundReadDoor` kind (b)) — `atlas-memory-recall` (MEM-4b's
 *  explicit-recall gate), `atlas-memory-header` (MEM-1/4/7's per-seat turn header), `atlas-memory-awareness`
 *  and `atlas-memory-orientation` (the two derived, shared slabs — MEM-6/11/12). NONE persists — the write
 *  half (`atlas-memory-emit`) is a `GOVERNANCE_SURFACE` member instead, exactly as `atlas-emit`/`atlas-link`
 *  are the write halves of the knowledge/sameAs read doors.
 *
 *  Order is fixed; membership is the load-bearing fact (mirrors `GOVERNANCE_SURFACE`'s own convention).
 *  `atlas-diff` is DELIBERATELY EXCLUDED (see the `ReadDoor` note above) — it stays a declared reference
 *  model until it is genuinely wired to a transport, in its own WP. */
export const READ_SURFACE: readonly ReadDoor[] = [
  "atlas-anchors",
  "atlas-slots",
  "atlas-draft",
  "atlas-check",
  "atlas-doctor",
  "atlas-node",
  "atlas-memory-recall",
  "atlas-memory-header",
  "atlas-memory-awareness",
  "atlas-memory-orientation",
]

/** A per-tool leg — the concrete tool computation the handler wraps. It MAY throw on a malformed argument;
 *  the wrapper converts that to a structured rejected `Verdict` (TOOLS-2 totality). */
export type ToolLeg = (args: unknown) => ToolData

/** The injected legs, keyed by tool. Partial: a leg not wired at this seam fails closed to a rejected
 *  verdict (never a throw), so the handler is total over the whole surface. */
export type ToolLegs = Partial<Record<Tool, ToolLeg>>

/** The READ-ONLY per-node projection port — the pack-grained node oracle (TOOLS-10, X1 drill-down). It
 *  resolves a node by its CONTENT ADDRESS reached AS A DRILL-DOWN WITHIN its pack (never a top-level node
 *  swarm — wave-plan §X1). Read/subscribe ONLY: it exposes NO store-mutating method (writes still funnel
 *  through `atlas-emit`, TOOLS-1). @atlas/tools CONSUMES this port; the concrete pack/CAS resolution is the
 *  @atlas/index / @atlas/knowledge axis, injected here, never computed in this facet. */
export interface NodeSource {
  /** Resolve a node by content address; `undefined` ⇒ no such grounded node. READ-ONLY. */
  resolve(nodeAddr: NodeKey): GroundedFact | undefined
}

/** The `next + invariant` guidance every per-node read ships (TOOLS-4) — non-empty on hit AND miss paths. */
const NODE_GUIDANCE: Guidance = {
  next: "a node is reached as a drill-down within its pack; the same address resolves byte-identically over MCP | poke | CLI",
  invariant: "TOOLS-10: one read-only oracle, no divergence across transports, no write path",
}

/** The `next + invariant` guidance stamped on every result (TOOLS-4) — non-empty on ok AND reject paths. */
const GUIDANCE: Record<Tool, Guidance> = {
  "atlas-init": {
    next: "review the T2/advisory move-in skeleton, then promote territories via atlas-emit",
    invariant: "TOOLS-5: $0-LLM structural move-in, no auto-promotion above T2",
  },
  "atlas-query": {
    // ADR-0013 (owner-ratified 2026-08-03): the pack is TWO bands. This is the string the user actually
    // sees on every invocation — the one ADR-0013 named as the place any implementation of the amendment
    // must land — so it says which band is which and that an advisory row passed no ratifier.
    next: "re-ground stale packs before trusting; an advisory row is a machine proposal no ratifier saw — check its per-row freshness; scope must be a path string",
    invariant:
      "TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), every row carrying its own freshness",
  },
  "atlas-emit": {
    next: "a rejected write did not re-derive at source@sha — fix the citation and re-emit",
    invariant:
      "TOOLS-1/7: atlas-emit is a governed fail-closed write door (WRITE_PATHS: atlas-emit, atlas-link — ADR-0003)",
  },
  "atlas-reconcile": {
    next: "a semantic flip blocks the merge (exit 2) — re-author before merging",
    invariant: "TOOLS-8: reviewable drift, block on any semantic flip",
  },
  "atlas-link": {
    next: "a rejected link failed a governance gate (two distinct known nodes, authorized on both scopes, ratified) or a pair-state gate (not-linked / already-retracted / retracted-pair) — fix and re-run; `retract:true` withdraws an asserted equivalence through the same gates",
    invariant:
      "WP-SAMEAS / KNOW-11 / A-D3: sameAs is a governed symmetric edge — authz on BOTH scopes + a non-empty ratifier over the whole merged class (billy when any member is T0) — never a merge; retraction is a MODE of this door (WRITE_PATHS: atlas-emit, atlas-link, atlas-memory-emit) and is an APPEND, never a delete",
  },
  "atlas-memory-emit": {
    next: "a refused write named the gate that declined (undetermined-kind / template-invalid / unowned / logbook-duplicate / logbook-unauthorized / over-cap / scanner-blocked / scanner-unavailable) — fix and re-emit; nothing is persisted on a refusal",
    invariant:
      "MEM-1..9 / WP-11.W8: atlas-memory-emit is a governed fail-closed write door (WRITE_PATHS: atlas-emit, atlas-link, atlas-memory-emit — GOVERNANCE_SURFACE six members) — one append on admission, nothing on refusal",
  },
}

/** Fallback guidance for an off-surface tool token — still non-empty (TOOLS-4 totality). */
const GUIDANCE_OFF_SURFACE: Guidance = {
  next: "invoke one of the governance tools: atlas-init | atlas-query | atlas-emit | atlas-reconcile | atlas-link | atlas-memory-emit",
  invariant:
    "TOOLS-1: GOVERNANCE_SURFACE is six tools (three governed write doors: atlas-emit, atlas-link, atlas-memory-emit)",
}

const guidanceFor = (tool: Tool): Guidance => GUIDANCE[tool] ?? GUIDANCE_OFF_SURFACE

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** The DISCRIMINANT of `resolveNode`'s two fail-closed outcomes (the text before the first `:`, the form
 *  `reasonOf` compares for EQUALITY). Before these existed the whole reason string WAS the discriminant, and
 *  it embedded the address — so no two misses shared one, and nothing could be asserted on but prose. */
const NO_NODE_SOURCE = "no-node-source"
const NO_SUCH_NODE = "no-such-node"

/** A leg return is a FAIL-CLOSED governed write iff it carries `emitted:false` (`EmitOut`), `linked:false`
 *  (`LinkOut`, WP-SAMEAS), OR `admitted:false` (`MemoryEmitOut`, WP-11.W8). A fail-closed write is a
 *  GOVERNANCE refusal, NOT a success — it MUST surface as a rejected `Verdict`, legible on BOTH user doors
 *  (MCP `isError:true`, CLI exit 2), never a silent `ok:true` an agent reads as success (F2/F5). All three
 *  write doors funnel through this one refusal-visibility guard. */
const isFailClosedWrite = (data: ToolData): boolean =>
  typeof data === "object" &&
  data !== null &&
  ((data as { emitted?: unknown }).emitted === false ||
    (data as { linked?: unknown }).linked === false ||
    (data as { admitted?: unknown }).admitted === false)

/** THE one published input schema per governance tool (TOOLS-3) — CLI and MCP share it byte-for-byte; the
 *  schema carries NO transport parameter, so the same bytes back every surface (the divergence this seam
 *  prevents). Each `inputSchema` is a JSON-Schema object (the external MCP schema DSL, kept structural). The
 *  arg names mirror the frozen per-tool signatures: `init(path)` / `query(scope, by?)` / `emit(node,at)` /
 *  `reconcile(mergeBase, options?)`.
 *
 *  WHAT A SCHEMA HERE PROMISES, now that the door ENFORCES it (./fault.ts): the property set is CLOSED
 *  (`additionalProperties: false` refuses an undeclared name), a declared `type` is checked on every present
 *  property at every depth, and a declared `enum` is checked against the value. So a property NOT written
 *  here cannot reach a leg, and a property a leg reads MUST be written here — the two directions of one
 *  honesty, and BOTH were open before: a declared-and-dead `acceptReground` and an undeclared-and-live `by`.
 *  Adding an argument to a leg without adding it here is now a refused call, not a silent success. */
const SCHEMAS: Record<Tool, ToolSchema> = {
  "atlas-init": {
    name: "atlas-init",
    description:
      "$0-LLM structural move-in — returns the T2/advisory territory skeleton, blast radius, and T0-candidate flags (TOOLS-5)",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "repo/subtree path to walk structurally" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  "atlas-query": {
    name: "atlas-query",
    // ADR-0013 clause 3: this string is what an MCP client SHOWS a calling agent, so it is the first place
    // the two-band amendment has to be true. It said "the merged covering pack of tier>=T1 invariants" for
    // the whole window after the split shipped — an agent was promised ratified rows only and handed
    // machine proposals beside them, under the same word. The sibling `GUIDANCE['atlas-query'].invariant`
    // above was corrected and this one was not, which is why the claim is now pinned by an off-the-wire
    // test (e2e-blackbox S26.4) that asserts the WHOLE string, not a substring of it.
    description:
      "bounded read projection — resolves a scope to a covering pack in TWO bands: `invariants` is GOVERNING " +
      "(tier>=T1, ratified) and `advisory` is ADVISORY (T2 machine proposals NO ratifier saw, separately " +
      "capped, with `advisoryDropped` counting what the cap dropped). Every row carries its own `freshness`; " +
      "the pack-level `stale` flag means re-ground before trusting (TOOLS-6, ADR-0013)",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "file/folder/module/crate scope to resolve" },
        // [N2 / INDEX-6] the retrieval MODE. It was read by the composed leg (adapter-io/src/wire.ts) and
        // marshalled by the CLI (`--by`) while being ABSENT from this schema — an UNDER-declared surface, so
        // over MCP `--by dependency` worked only by relying on `additionalProperties:false` being dead.
        // Declared here with its CLOSED value set, so both transports refuse an unknown mode identically
        // (the CLI marshaller already did; MCP silently served `scope`).
        by: {
          type: "string",
          enum: ["scope", "dependency", "trigger"],
          description: "retrieval mode — defaults to `scope` when absent (CLI: `atlas query <scope> --by dependency`)",
        },
      },
      required: ["scope"],
      additionalProperties: false,
    },
  },
  "atlas-emit": {
    name: "atlas-emit",
    description:
      "a governed fail-closed write door (one of WRITE_PATHS: atlas-emit, atlas-link) — re-derives the citation at source@sha, rejects a node that does not re-derive (TOOLS-1/7, ADR-0003)",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "object", description: "the templated grounded candidate fact to admit" },
        at: { type: "string", description: "the source@sha anchor the citation must re-derive at" },
      },
      required: ["node", "at"],
      additionalProperties: false,
    },
  },
  "atlas-reconcile": {
    name: "atlas-reconcile",
    description: "the merge gate — classifies drift into a reviewable set, exits 2 on any semantic flip (TOOLS-8)",
    inputSchema: {
      type: "object",
      properties: {
        mergeBase: { type: "string", description: "the merge-base sha to classify drift against" },
        // [SURFACE-LIE, CLOSED] `acceptReground` was declared HERE, at the TOP level, and the wired leg read
        // `args.options.acceptReground` (adapter-io/src/wire.ts). Measured over real MCP stdio: the DECLARED
        // spelling returned `regroundedCount: 0` and the UNDECLARED `{options:{acceptReground:true}}`
        // returned `1` — the published knob did nothing and the working one was invisible.
        //
        // The `options` bag is canonical because it is what already EXISTED on both sides of the seam: the
        // frozen signature is `reconcile(mergeBase, options?)` (./reconcile.ts) and the CLI marshaller has
        // always produced `{mergeBase, options:{acceptReground}}` (cli/src/marshal.ts). Moving the schema to
        // the leg removes the divergence without inventing a third shape, and the old top-level spelling is
        // now REFUSED by the closed-set check rather than accepted and dropped.
        options: {
          type: "object",
          description: "the reconcile options bag — the frozen `reconcile(mergeBase, options?)` second argument",
          properties: {
            acceptReground: {
              type: "boolean",
              description: "auto-re-ground the mechanical subset in one pass (TOOLS-13; CLI: `--accept-reground`)",
            },
          },
          additionalProperties: false,
        },
      },
      required: ["mergeBase"],
      additionalProperties: false,
    },
  },
  "atlas-link": {
    name: "atlas-link",
    description:
      "the governed sameAs write door — asserts two nodeKeys name the SAME fact (a symmetric, transitive, NON-destructive equivalence edge surfaced on read), or with retract:true WITHDRAWS a previously asserted one (an append, never a delete — the class splits on the next read); fail-closed on authz/ratify, and retraction is priced through the SAME gates as assertion (WP-SAMEAS, A-D3)",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "string", description: "the first nodeKey to equate" },
        b: { type: "string", description: "the second nodeKey to equate" },
        // [A-D3] the MODE, not a second tool. DECLARED here so both transports validate it identically: the
        // door's own `malformedArgsReason` type-checks every DECLARED property that is present, so a
        // non-boolean `retract` over MCP is `malformed-args` rather than a silently-ignored assertion. The
        // CLI marshaller produces a real boolean from `--retract`, so the two doors agree by construction.
        retract: {
          type: "boolean",
          description:
            "withdraw the previously asserted equivalence instead of asserting it (CLI: `atlas link <a> <b> --retract`)",
        },
      },
      required: ["a", "b"],
      additionalProperties: false,
    },
  },
  "atlas-memory-emit": {
    name: "atlas-memory-emit",
    description:
      "the governed MEMORY write door (one of WRITE_PATHS: atlas-emit, atlas-link, atlas-memory-emit) — admits a per-seat MemoryEntry through seven fail-closed gates (kind derivation, template, partition+owner, logbook discipline, cap, pre-write scan, persist) and appends it to the durable memory log; a refusal at any gate persists nothing (MEM-1..9, WP-11.W8)",
    inputSchema: {
      type: "object",
      properties: {
        entry: {
          type: "object",
          description:
            "the MemoryEntry to admit — a project/task/pr/logbook record (its own derived `kind` selects the required template fields)",
        },
      },
      required: ["entry"],
      additionalProperties: false,
    },
  },
}

/** Fallback schema for an off-surface tool token — still a well-formed `ToolSchema` (totality).
 *
 *  It declares NO `additionalProperties: false`, and that is deliberate now that the door ENFORCES the
 *  constraint (./fault.ts). This schema knows the tool's NAME and nothing else — it cannot know the argument
 *  shape of a leg some composition root bound under an off-surface token — so claiming a closed property set
 *  here would refuse every argument of a wired leg on the authority of a schema that was never authored.
 *  The envelope demand (`type: 'object'`) is a real thing this fallback does know, and it stays. */
const SCHEMA_OFF_SURFACE = (tool: Tool): ToolSchema => ({
  name: tool,
  description: "not one of the GOVERNANCE_SURFACE tools (TOOLS-1)",
  inputSchema: { type: "object" },
})

/**
 * Build THE one handler over the injected per-tool `legs` and (optionally) a read-only per-node projection
 * `nodes`. The returned object conforms EXACTLY to the frozen `HandlerApi`. `handle` is pure + total: it
 * reads no clock and holds no cache, and it converts a missing leg OR a leg throw into a structured rejected
 * `Verdict` — never a throw (TOOLS-2) — with guidance stamped on every path (TOOLS-4). When `nodes` is
 * omitted, `resolveNode` fails closed to a rejected verdict (no source wired) — still total, never a throw.
 */
export function createHandler(legs: ToolLegs, nodes?: NodeSource): HandlerApi {
  const handle = (tool: Tool, args: unknown): Verdict<ToolData> => {
    const guidance = guidanceFor(tool)
    const leg = legs[tool]
    if (leg === undefined) {
      return { ok: false, rejected: `tool '${tool}' not wired at this seam`, guidance }
    }
    // CLASS (a) — the arguments, judged by the DOOR against this tool's own published schema (TOOLS-3),
    // BEFORE the leg runs. Deciding it here is the whole point: inferring "malformed args" from a throw is
    // what let an internal `TypeError` be reported as the caller's bad input (see ./fault.ts).
    const argFault = malformedArgsReason(tool, schema(tool), args)
    if (argFault !== undefined) {
      return { ok: false, rejected: argFault, guidance }
    }
    try {
      const data = leg(args)
      if (isFailClosedWrite(data)) {
        // F2/F5: a fail-closed write (emit OR link OR memory-emit) is a governance REJECTION, not a silent
        // ok. Surface it uniformly across doors as an `ok:false` verdict carrying the reason. The record
        // rides `data` so the CLI can still classify it exit-2 (rejected) — distinct from the exit-1 error
        // of a malformed/unwired call. Fallback reason is write-kind-specific — our doors always set `rejected`.
        const d = data as { emitted?: unknown; linked?: unknown; admitted?: unknown; rejected?: string }
        const fallback =
          d.emitted === false
            ? "emit failed closed (ungrounded)"
            : d.linked === false
              ? "link failed closed"
              : "memory write failed closed"
        return { ok: false, data, rejected: d.rejected ?? fallback, guidance }
      }
      return { ok: true, data, guidance }
    } catch (e) {
      // TOOLS-2: fail CLOSED — a structured rejected verdict, never a throw. ATTRIBUTED, which is the part
      // this catch used to get wrong: it stamped `malformed args — fail-closed:` on every throw, so a fault
      // INSIDE a door arrived at the operator as their own bad input, carrying the door's caller-facing
      // guidance. The three classes and how each is decided are documented in ./fault.ts.
      const kind = classifyThrown(e)
      if (kind === "internal-fault") {
        // Before claiming a defect of ours: did the caller leave a REQUIRED argument out? That is the better
        // explanation for a crash the engine raised, and it is the one case an up-front `required` check
        // cannot cover (see `missingRequiredReason`). It never over-fires — a leg that tolerates the
        // omission returns normally and never reaches this catch.
        const missing = missingRequiredReason(tool, schema(tool), args)
        if (missing !== undefined) {
          return { ok: false, rejected: missing, guidance }
        }
        // It NAMES ITSELF, and it does NOT borrow the tool guidance — that guidance tells the caller to go
        // and change their arguments, which is precisely the wrong instruction for a defect of ours.
        return { ok: false, rejected: internalReason(tool, e), guidance: INTERNAL_GUIDANCE }
      }
      if (kind === "malformed-args") {
        return { ok: false, rejected: malformedReason(e), guidance }
      }
      // A governed refusal: its reason travels VERBATIM, so a refusal that already carries a discriminant
      // (`untrusted-store: …`) keeps it and `reasonOf` still answers WHICH gate refused.
      return { ok: false, rejected: reason(e), guidance }
    }
  }

  // resolveNode — THE tri-transport per-node read (TOOLS-10, EPIC-26-c). READ-ONLY: it opens NO write path
  // (writes still funnel through `atlas-emit`, TOOLS-1). `transport` records the ROUTE only — the resolved
  // node content is byte-identical over MCP | poke | CLI (the one handler is the single oracle), so it never
  // changes the result. Per wave-plan §X1 a node is reached as a DRILL-DOWN WITHIN its pack. Total: a missing
  // source or an unknown address fails closed to a rejected verdict, never a throw; guidance rides every path.
  //
  // TOTALITY, AND THE CONTRACT DECISION BEHIND IT. `resolveNode` was DOCUMENTED total and was NOT: nothing
  // wrapped `nodes.resolve`, so a throwing source escaped as a raw exception at the user door — and because
  // `main` is `async`, as an unhandled rejection rather than a rendered outcome. `adapter-io/src/wire.ts`
  // says so in as many words and works around it by collapsing its provenance refusal to `undefined`. The
  // decision taken here is to make the code match the contract it already publishes (a catch + the same
  // three-class attribution `handle` uses) rather than to widen the signature: a refusal thrown by a source
  // is then LEGIBLE and total, with no ripple through `HandlerApi` / `WiredHandler` / every test fake.
  //
  // WHAT THAT DOES NOT FIX, STATED RATHER THAN GLOSSED: the composed `NodeSource` still RETURNS `undefined`
  // for a refused store, so over the assembled runtime an untrusted store is still reported as a miss. That
  // half lives on the other side of the port and is a one-line change there (`return undefined` → throw the
  // named refusal, the channel `ToolLeg` already uses, TOOLS-2) — not a port-signature change, and not this
  // module's to make.
  const resolveNode = (nodeAddr: NodeKey, _transport: Transport): Verdict => {
    if (nodes === undefined) {
      return {
        ok: false,
        rejected: `${NO_NODE_SOURCE}: no per-node projection source wired at this seam`,
        guidance: NODE_GUIDANCE,
      }
    }
    let node: GroundedFact | undefined
    try {
      node = nodes.resolve(nodeAddr)
    } catch (e) {
      const kind = classifyThrown(e)
      if (kind === "internal-fault") {
        return { ok: false, rejected: internalReason("atlas node", e), guidance: INTERNAL_GUIDANCE }
      }
      return { ok: false, rejected: reason(e), guidance: NODE_GUIDANCE }
    }
    if (node === undefined) {
      return {
        ok: false,
        rejected: `${NO_SUCH_NODE}: no grounded node at content address '${nodeAddr}'`,
        guidance: NODE_GUIDANCE,
      }
    }
    return { ok: true, data: node, guidance: NODE_GUIDANCE }
  }

  // schema — THE one published input schema (TOOLS-3): CLI ≡ MCP, byte-identical (no transport parameter).
  const schema = (tool: Tool): ToolSchema => SCHEMAS[tool] ?? SCHEMA_OFF_SURFACE(tool)

  return { handle, resolveNode, schema }
}

// differential-vs-oracle (compile-time): the handler conforms to the frozen `HandlerApi` (co-located in types.ts).
const _handlerConforms: HandlerApi = createHandler({})
void _handlerConforms
