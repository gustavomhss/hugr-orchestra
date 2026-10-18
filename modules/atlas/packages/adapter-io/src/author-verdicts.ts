// @atlas/adapter-io — src/author-verdicts.ts  (WP-10.A5.MCP — the SHARED authoring/read verdict builders)
//
// The SHARED `Verdict` builders for the READ_SURFACE authoring/diagnostic doors (ADR-0005): `anchors`,
// `slots`, `draft`, `check`, `doctor`. They live HERE (not in @atlas/cli) because BOTH transports must drive
// the SAME body for byte-identical SCHEMA + VERDICT parity — the CLI cannot own them without the MCP server
// importing @atlas/cli (a layer the ring forbids). `anchorsVerdict`/`slotsVerdict`/`draftVerdict` were
// RELOCATED here verbatim from @atlas/cli (`cli/src/{anchors,slots,draft}.ts`, which now re-import them);
// `checkVerdict`/`doctorVerdict` are authored here for the first time (no prior verdict builder existed).
//
// Each is TOTAL and READ-ONLY: a missing/malformed argument fails CLOSED to a structured `ok:false` verdict
// (exit 1 on the CLI, `isError` on MCP), never a throw, and NONE opens a write path (persists nothing).
// `node` is NOT here: it is served by the ONE wired handler's `resolveNode` (already a total `Verdict`).

import { createDoctor, DOCTOR_GUIDANCE } from "@atlas/tools"
import type {
  AnchorsApi,
  AnchorsOut,
  CheckApi,
  CheckOut,
  DoctorOut,
  DoctorSource,
  DraftApi,
  DraftOut,
  Guidance,
  GroundingCandidate,
  SlotsApi,
  SlotsOut,
  Verdict,
} from "@atlas/tools"
import type { GroundedFact, PredicateSlot } from "@atlas/knowledge"
import type { Hash } from "@atlas/contracts"

// ── anchors (RELOCATED from cli/src/anchors.ts, WP-10.A1.CLI) ───────────────────────────────────────────

/** The one property a reader should check the rendered bytes against. */
const ANCHORS_INVARIANT =
  "AUTHOR-3/4: `atlas anchors <path>` is a READ-ONLY DISCOVERY PLANNER — it lists the groundable units the built index carries under `path` (each with qualifiedPath, kind, current subtreeHash) plus every declared language hole and the rev, off the SAME single grounding seam the emit truth-gate re-derives against, persisting NOTHING (AUTHOR-2); an empty listing carries an honest reason (untracked / non-git / unreadable), never a throw, no write path"

/** The one actionable sentence, derived from the result's OWN numbers — never a constant. */
function anchorsNext(path: string, out: AnchorsOut): string {
  if (out.units.length === 0) {
    // AUTHOR-3 guarantees a reason accompanies every empty set; surface it verbatim so a caller reads WHY.
    const why = out.reason ?? "no groundable units under path"
    return `no groundable units under '${path}' at rev ${out.rev} — ${why}`
  }
  const holes = out.holes.length === 0 ? "no language holes" : `${out.holes.length} declared language hole(s)`
  return `${out.units.length} groundable unit(s) under '${path}' at rev ${out.rev}, ${holes} — draft a fact against one with \`atlas draft\``
}

/**
 * The SHARED anchors read-verdict builder — identical `path` over the SAME `anchors` leg yields a byte-identical
 * `Verdict`, so the CLI and the MCP transport cannot diverge (the `data` IS the frozen `AnchorsOut`, carried
 * through unwrapped so a partially-populated result — empty `holes`, absent `reason` — serializes identically on
 * both). TOTAL: a missing/empty `path` fails CLOSED to a structured `ok:false` verdict, never a throw.
 */
export function anchorsVerdict(leg: AnchorsApi["anchors"], path: string): Verdict<AnchorsOut> {
  if (typeof path !== "string" || path.length === 0) {
    const guidance: Guidance = {
      next: "`atlas anchors <path>` requires the tree path whose groundable units to list",
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return { ok: false, rejected: "missing path: `atlas anchors` requires a non-empty tree path", guidance }
  }
  const out = leg(path)
  const guidance: Guidance = { next: anchorsNext(path, out), invariant: ANCHORS_INVARIANT }
  return { ok: true, guidance, data: out }
}

// ── slots (RELOCATED from cli/src/slots.ts, WP-10.A2-a.CLI) ─────────────────────────────────────────────

/** The one property a reader should check the rendered bytes against. */
const SLOTS_INVARIANT =
  "AUTHOR-5: `atlas slots` returns EXACTLY the members of the closed `PredicateSlot` union — all of them, none besides — each with its meaning, DERIVED from the union (never hand-transcribed), so a spec revision that adds a slot cannot leave this door stale"

/**
 * The SHARED slots read-verdict builder — the SAME `slots` leg yields a byte-identical `Verdict` every call
 * (no input, no clock), so the CLI and the MCP transport cannot diverge. TOTAL: no input, never a throw.
 */
export function slotsVerdict(leg: SlotsApi["slots"]): Verdict<SlotsOut> {
  const out = leg()
  const guidance: Guidance = {
    next: `${out.slots.length} slot(s) in the closed predicate vocabulary — pick one and draft a fact with \`atlas draft <anchor> <slot> <claim>\``,
    invariant: SLOTS_INVARIANT,
  }
  return { ok: true, guidance, data: out }
}

// ── draft (RELOCATED from cli/src/draft.ts, WP-10.A2-a.CLI) ─────────────────────────────────────────────

/** The one property a reader should check the rendered bytes against. */
const DRAFT_INVARIANT =
  "AUTHOR-6/6d/7: the author supplies EXACTLY the anchor, the slot, and the claim — `id` (the product's own `nodeKey` formula), the grounding's `subtreeHash` (the ONE grounding computer's current value) and the `rev` it was computed at are ALWAYS computed, NEVER demanded of the author; a draft is rev-stamped so a later mismatch at `atlas emit` is nameable, not attributed to the claim"

/** A structured `ok:false` verdict for a missing/empty required argument — CLI-1b, mirrors `anchorsVerdict`. */
function draftMissingArg(field: "anchor" | "claim"): Verdict<DraftOut> {
  const what =
    field === "anchor" ? "the groundable unit to cite (see `atlas anchors <path>`)" : "the claim body to draft"
  const guidance: Guidance = {
    next: `\`atlas draft <anchor> <slot> <claim>\` requires a non-empty ${field}: ${what}`,
    invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
  }
  return { ok: false, rejected: `missing ${field}: atlas draft requires a non-empty ${field}`, guidance }
}

/**
 * The SHARED draft composition-verdict builder — identical `(anchor, slot, claim)` over the SAME `draft`
 * leg yields a byte-identical `Verdict`. TOTAL: a missing/empty `anchor`/`claim`, or a `slot` outside the
 * closed vocabulary the injected `slots` leg reports, fails CLOSED to a structured `ok:false` verdict,
 * never a throw and never a call into `leg`.
 */
export function draftVerdict(
  leg: DraftApi["draft"],
  slotsLeg: SlotsApi["slots"],
  anchor: string,
  slotRaw: string,
  claim: string,
): Verdict<DraftOut> {
  if (typeof anchor !== "string" || anchor.length === 0) return draftMissingArg("anchor")
  if (typeof claim !== "string" || claim.length === 0) return draftMissingArg("claim")

  const known = slotsLeg().slots.map((s) => s.slot)
  if (!known.includes(slotRaw as PredicateSlot)) {
    const guidance: Guidance = {
      next: `unknown slot '${slotRaw}' — one of: ${known.join(", ")} (see \`atlas slots\`)`,
      invariant: "AUTHOR-5: the predicate slot is the CLOSED vocabulary — nothing outside it is a valid draft target",
    }
    return {
      ok: false,
      rejected: `unknown slot '${slotRaw}': not a member of the closed PredicateSlot vocabulary`,
      guidance,
    }
  }

  const candidate: GroundingCandidate = { anchor, slot: slotRaw as PredicateSlot, claim }
  const out = leg(candidate)
  const requiresNote = out.requires !== undefined ? ` (requires ${out.requires})` : ""
  const guidance: Guidance = {
    next: `drafted a ${out.operation} '${candidate.slot}' fact at '${anchor}' — rev ${out.rev}, route ${out.route}${requiresNote}; emit it with \`atlas emit <file> --at ${out.rev}\` (the SAME rev — a different one is refused as a rev mismatch, not a bad claim)`,
    invariant: DRAFT_INVARIANT,
  }
  return { ok: true, guidance, data: out }
}

// ── check (AUTHORED here — no prior verdict builder existed, WP-10.A3 / AUTHOR-11/12) ───────────────────

/** The one property a reader should check the rendered bytes against. */
const CHECK_INVARIANT =
  "AUTHOR-11/12: `atlas check` DRY-RUNS the governed emit door's WHOLE gate chain over a candidate `GroundedFact` at a rev, WITHOUT any write — the `wouldEmit` verdict and the first-refusing gate agree with the real door's BY CONSTRUCTION (PROP-AUTH-11, the SAME `runGateChain` fold), persisting NOTHING, opening no write path, never a throw"

/** The one actionable sentence, derived from the dry-run's OWN gate rows — never a guess. */
function checkNext(out: CheckOut): string {
  if (out.wouldEmit) {
    return `the candidate would be ADMITTED — all ${out.gates.length} gate(s) pass; emit it through the governed door with \`atlas emit <file> --at <rev>\``
  }
  const failed = out.gates.find((g) => !g.pass)
  const remedy = failed?.remedy ?? failed?.reason ?? "inspect the first refusing gate"
  return `the candidate would be REFUSED at gate '${failed?.gate ?? "unknown"}' — ${remedy}`
}

/**
 * The SHARED check dry-run verdict builder — AUTHORED here (no prior builder existed anywhere). Identical
 * `(candidate, at)` over the SAME `check` leg yields a byte-identical `Verdict`. The input is a WHOLE
 * `GroundedFact` object plus an `at` rev hash — NOT a string. TOTAL: a non-object `candidate` or a
 * missing/non-string `at` fails CLOSED to a structured `ok:false` verdict; the leg itself is pure+total over
 * the injected `GateChainRunner`, and a defensive `try/catch` keeps the transport total even if a malformed
 * fact drives the fold to throw (attributed as an internal fault, never propagated to the SDK).
 */
export function checkVerdict(leg: CheckApi["check"], candidate: unknown, at: unknown): Verdict<CheckOut> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    const guidance: Guidance = {
      next: "`atlas check` requires a candidate GroundedFact object (compose one with `atlas draft`) plus an `at` rev",
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return { ok: false, rejected: "missing fact: `atlas check` requires a candidate GroundedFact object", guidance }
  }
  if (typeof at !== "string" || at.length === 0) {
    const guidance: Guidance = {
      next: "`atlas check` requires the `at` rev the candidate was drafted against (the draft's own `rev`)",
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return {
      ok: false,
      rejected: "missing at: `atlas check` requires the rev the candidate is checked against",
      guidance,
    }
  }
  let out: CheckOut
  try {
    out = leg(candidate as GroundedFact, at as Hash)
  } catch (e) {
    const guidance: Guidance = {
      next: "the candidate could not be dry-run — check it is a well-formed GroundedFact (see `atlas draft`)",
      invariant: CHECK_INVARIANT,
    }
    return { ok: false, rejected: `check dry-run fault: ${e instanceof Error ? e.message : String(e)}`, guidance }
  }
  const guidance: Guidance = { next: checkNext(out), invariant: CHECK_INVARIANT }
  return { ok: true, guidance, data: out }
}

// ── doctor (AUTHORED here — the CLI renders its own string envelope; MCP needs a `Verdict`) ─────────────

/** The four read/advisory `DoctorApi` legs reachable over MCP. `index` is CLI-only: it reads the FILE TREE +
 *  the SCIP dump through a SEPARATE provider (not the durable-store `DoctorSource`), which the MCP entrypoint
 *  does not thread — so it is not on this surface (reported honestly, not silently dropped). */
const DOCTOR_SUBS = ["archive", "why", "hotset", "reground", "cas"] as const
type DoctorMcpSub = (typeof DOCTOR_SUBS)[number]

function isDoctorMcpSub(s: string): s is DoctorMcpSub {
  return (DOCTOR_SUBS as readonly string[]).includes(s)
}

/** A structured doctor-layer `ok:false` verdict — mirrors the CLI's `doctorError`, in the shared `Verdict`
 *  shape MCP renders through `verdictToResult`. */
function doctorError(next: string): Verdict<DoctorOut> {
  return { ok: false, rejected: next, guidance: { next, invariant: DOCTOR_GUIDANCE.invariant } }
}

/**
 * The SHARED doctor verdict builder over the injected READ-ONLY `DoctorSource` — AUTHORED here so the MCP
 * transport can carry a `DoctorOut` in a `Verdict`. It builds `createDoctor(source)` (structurally
 * write-incapable) and dispatches the four `DoctorApi` read legs. TOTAL: an unknown/absent sub, a missing
 * required arg, or a source that THROWS (the provenance tripwire on a committed store — the SAME condition
 * the CLI's `runDoctor` catches) all fail CLOSED to a structured `ok:false` verdict, never a throw. READ-ONLY:
 * `reground` returns a proposal only; the store changes solely when it is run through `atlas-emit`.
 */
export function doctorVerdict(source: DoctorSource, subRaw: string, arg: string | undefined): Verdict<DoctorOut> {
  if (typeof subRaw !== "string" || !isDoctorMcpSub(subRaw)) {
    return doctorError(
      `unknown doctor subcommand '${subRaw ?? ""}': expected one of ${DOCTOR_SUBS.join("|")} (index is CLI-only)`,
    )
  }
  const doctor = createDoctor(source)
  try {
    switch (subRaw) {
      case "archive":
        return { ok: true, data: doctor.archive(arg), guidance: DOCTOR_GUIDANCE }
      case "why":
        if (arg === undefined || arg.length === 0) return doctorError("doctor why requires a <fact>")
        return { ok: true, data: doctor.whyBroken(arg), guidance: DOCTOR_GUIDANCE }
      case "hotset":
        if (arg === undefined || !Number.isFinite(Number(arg)))
          return doctorError("doctor hotset requires a numeric <budget>")
        return { ok: true, data: doctor.hotSet(Number(arg)), guidance: DOCTOR_GUIDANCE }
      case "reground":
        if (arg === undefined || arg.length === 0) return doctorError("doctor reground requires a <fact>")
        return { ok: true, data: doctor.reground(arg), guidance: DOCTOR_GUIDANCE }
      case "cas":
        // ADR-0022. Routed HERE, in the SHARED body, and not only at the CLI — the ADR's reason for making
        // this a `DoctorApi` leg rather than a CLI-side one like `index` is that it must be reachable over
        // MCP. A leg wired on one transport would make that argument false in the file that carries it.
        return { ok: true, data: doctor.casIntegrity(), guidance: DOCTOR_GUIDANCE }
    }
  } catch (e) {
    // The refusal's own text, verbatim (the provenance tripwire discriminant) — never re-worded.
    return doctorError(e instanceof Error ? e.message : String(e))
  }
}
