// @atlas/cli — src/ratify-cli.ts  (R3: `atlas propose`, `atlas proposals`, `atlas decide`)
//
// The ratification queue over the review log (D16). A reviewer PROPOSES a current fact for T1 or T0 with a reason
// (`--by` names who). A person DECIDES: `reject` only appends the decision, so the rejection stays in the history;
// `ratify` re-emits the fact at the proposed tier THROUGH the composed `atlas-emit` door — the same truth, authz and
// KNOW-8 ratify gates every emit faces, so `ATLAS_RATIFY_TOKEN` must name a ratifier and a T0 still needs `billy`.
// A ratification the door refuses writes NO decision: the proposal stays open and the door's own reason is printed.

import { appendReview, currentFactOf, headSha } from "@atlas/adapter-io"
import type { CurrentFact, ReviewOf } from "@atlas/adapter-io"
import { isRetired, isWeakerTier } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { Verdict } from "@atlas/tools"
import type { CliDeps } from "./cli.js"
import type { CliVerdict } from "./render.js"
import { foldOrRefuse, governedRefusal, requireBy, resolveId, reviewOutcome, usageError } from "./review-common.js"

/** What the emit door answered, reduced to what a decision needs. */
export interface EmitResult {
  readonly emitted: boolean
  readonly id?: string
  readonly rejected?: string
}

/** What propose/proposals/decide read and write through — injected so a test needs no composed runtime. */
export interface RatifyPorts {
  readonly repoPath: string
  readonly now: () => string
  /** The anchor rev a ratifying re-emit is stamped at (live HEAD). */
  readonly head: () => string
  readonly factOf: (nodeKey: string) => CurrentFact | undefined
  /** The composed `atlas-emit` door; `undefined` when the runtime is not composed. */
  readonly emit: ((node: GroundedFact, at: string) => EmitResult) | undefined
}

/** The production ports: the repository at cwd, the wall clock, live HEAD, the real store, the composed handler. */
export function ratifyPorts(deps: CliDeps): RatifyPorts {
  const repoPath = process.cwd()
  const handler = deps.handler
  return {
    repoPath,
    now: () => new Date().toISOString(),
    head: () => headSha(repoPath) ?? "",
    factOf: (nodeKey) => currentFactOf(repoPath, nodeKey),
    emit: handler === undefined ? undefined : (node, at) => emitResultOf(handler.handle("atlas-emit", { node, at })),
  }
}

export function runPropose(ports: RatifyPorts, positionals: readonly string[], flags: Readonly<Record<string, string>>): CliVerdict {
  const by = requireBy(flags)
  if (by === undefined) return usageError("propose requires --by <actor>: the reviewer the proposal is attributed to")
  const nodeKey = positionals[0] ?? ""
  const toTier = positionals[1] ?? ""
  const reason = positionals.slice(2).join(" ").trim()
  if (toTier !== "T1" && toTier !== "T0") return usageError(`propose: the target tier must be T1 or T0, got '${toTier}'`)
  if (reason.length === 0) return usageError("propose requires a reason after the tier")
  const current = ports.factOf(nodeKey)
  if (current === undefined) return usageError(`propose: no current fact has nodeKey '${nodeKey}'`)
  if (isRetired(current.fact)) return usageError(`propose: '${nodeKey}' is retired (authoring SUPERSEDED); a retired fact is not proposed`)
  if (!isWeakerTier(current.fact.tier, toTier)) {
    return usageError(`propose: '${nodeKey}' is already ${current.fact.tier}; a proposal must raise the tier`)
  }
  const read = foldOrRefuse(ports.repoPath)
  if ("refusal" in read) return read.refusal
  const open = read.fold.openProposals.find((p) => p.nodeKey === nodeKey && p.toTier === toTier)
  if (open !== undefined) return usageError(`propose: '${nodeKey}' already has an open ${toTier} proposal ${open.id}`)
  const record = appendReview(ports.repoPath, { kind: "proposal", nodeKey, toTier, reason, at: ports.now(), by })
  return reviewOutcome(`proposal ${record.id} waits for a person: \`atlas decide ${record.id} ratify|reject <reason...> --by <you>\``, [
    `proposal: ${record.id} ${nodeKey} ${current.fact.tier} -> ${toTier} by ${by}: ${reason}`,
  ])
}

export function runProposals(ports: Pick<RatifyPorts, "repoPath">): CliVerdict {
  const read = foldOrRefuse(ports.repoPath)
  if ("refusal" in read) return read.refusal
  const open = read.fold.openProposals
  return reviewOutcome(
    open.length === 0
      ? "no open proposals — `atlas propose <nodeKey> <T1|T0> <reason...> --by <you>` adds one"
      : `${open.length} open proposal(s) — decide one with \`atlas decide <proposalId> ratify|reject <reason...> --by <you>\``,
    open.map((p) => `  ${p.id} ${p.nodeKey} -> ${p.toTier} proposed by ${p.by} at ${p.at}: ${p.reason}`),
  )
}

export function runDecide(ports: RatifyPorts, positionals: readonly string[], flags: Readonly<Record<string, string>>): CliVerdict {
  const by = requireBy(flags)
  if (by === undefined) return usageError("decide requires --by <actor>: the person who decides")
  const wanted = positionals[0] ?? ""
  const verdict = positionals[1] ?? ""
  const reason = positionals.slice(2).join(" ").trim()
  if (verdict !== "ratify" && verdict !== "reject") return usageError(`decide: the verdict must be ratify or reject, got '${verdict}'`)
  if (reason.length === 0) return usageError("decide requires a reason after the verdict")
  const read = foldOrRefuse(ports.repoPath)
  if ("refusal" in read) return read.refusal
  const open = read.fold.openProposals
  const id = resolveId(open.map((p) => p.id), wanted)
  const proposal = open.find((p) => p.id === id)
  if (proposal === undefined) {
    return usageError(`decide: no open proposal matches '${wanted}' — \`atlas proposals\` lists the open ones (a decided proposal is closed)`)
  }
  if (verdict === "reject") {
    const record = appendReview(ports.repoPath, { kind: "decision", proposalId: proposal.id, verdict: "rejected", reason, at: ports.now(), by })
    return reviewOutcome(`proposal ${proposal.id} rejected; the fact keeps its tier and the rejection stays in the log`, [
      `decision: ${record.id} rejected ${proposal.nodeKey} -> ${proposal.toTier} by ${by}: ${reason}`,
    ])
  }
  return ratify(ports, proposal, reason, by)
}

/** Re-emit the proposed fact at its target tier through the governed door; record the decision only if it landed. */
function ratify(ports: RatifyPorts, proposal: ReviewOf<"proposal">, reason: string, by: string): CliVerdict {
  if (ports.emit === undefined) {
    return usageError("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP")
  }
  const current = ports.factOf(proposal.nodeKey)
  if (current === undefined || isRetired(current.fact)) {
    return governedRefusal(
      `ratify: '${proposal.nodeKey}' is no longer a current, live fact, so there is nothing to re-emit; no decision was written — reject the proposal instead`,
    )
  }
  const out = ports.emit({ ...current.fact, tier: proposal.toTier } as GroundedFact, ports.head())
  if (!out.emitted) {
    return governedRefusal(
      `ratify: the emit door refused the ${proposal.toTier} re-emit of '${proposal.nodeKey}' (${out.rejected ?? "no reason given"}); no decision was written and the proposal stays open. A T1 needs ATLAS_RATIFY_TOKEN to name a ratifier; a T0 needs ATLAS_RATIFY_TOKEN=billy`,
    )
  }
  const record = appendReview(ports.repoPath, { kind: "decision", proposalId: proposal.id, verdict: "ratified", reason, at: ports.now(), by })
  return reviewOutcome(`proposal ${proposal.id} ratified: '${proposal.nodeKey}' is now ${proposal.toTier}`, [
    `decision: ${record.id} ratified ${proposal.nodeKey} -> ${proposal.toTier} by ${by}: ${reason}`,
    `emitted: ${out.id ?? ""}`,
  ])
}

/** Reduce the handler's emit verdict: `data` is the door's `EmitOut` on both the admitted and the refused path. */
function emitResultOf(v: Verdict): EmitResult {
  const data = v.data as { readonly emitted?: unknown; readonly id?: unknown; readonly rejected?: unknown } | undefined
  if (data?.emitted === true) return typeof data.id === "string" ? { emitted: true, id: data.id } : { emitted: true }
  const rejected = typeof data?.rejected === "string" ? data.rejected : (v.rejected ?? "the emit door refused without a reason")
  return { emitted: false, rejected }
}
