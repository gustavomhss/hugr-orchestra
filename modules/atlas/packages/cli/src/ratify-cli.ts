// @atlas/cli — src/ratify-cli.ts  (R3: `atlas propose`, `atlas proposals`, `atlas decide`)
//
// The ratification queue over the review log (D16). A reviewer PROPOSES a current fact for T1 or T0 with a reason
// (`--by` names who). A person DECIDES through `decideProposal` (@atlas/adapter-io review-decide.ts, D29), the one
// function the Atlas screen decides through too: `reject` only appends the decision, so the rejection stays in the
// history; `ratify` re-emits the fact at the proposed tier THROUGH the composed `atlas-emit` door — the same truth,
// authz and KNOW-8 ratify gates every emit faces, so `ATLAS_RATIFY_TOKEN` must name a ratifier and a T0 still needs
// `billy`. A ratification the door refuses writes NO decision: the proposal stays open and the door's own reason is
// printed.

import { appendReview, currentFactOf, decideProposal, emitOutcomeOf, headSha } from "@atlas/adapter-io"
import type { CurrentFact, EmitOutcome } from "@atlas/adapter-io"
import { isRetired, isWeakerTier } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import type { CliDeps } from "./cli.js"
import type { CliVerdict } from "./render.js"
import { foldOrRefuse, governedRefusal, requireBy, reviewOutcome, usageError } from "./review-common.js"

/** What propose/proposals/decide read and write through — injected so a test needs no composed runtime. */
export interface RatifyPorts {
  readonly repoPath: string
  readonly now: () => string
  /** The anchor rev a ratifying re-emit is stamped at (live HEAD). */
  readonly head: () => string
  readonly factOf: (nodeKey: string) => CurrentFact | undefined
  /** The composed `atlas-emit` door; `undefined` when the runtime is not composed. */
  readonly emit: ((node: GroundedFact, at: string) => EmitOutcome) | undefined
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
    emit: handler === undefined ? undefined : (node, at) => emitOutcomeOf(handler.handle("atlas-emit", { node, at })),
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
  const emit = ports.emit
  if (verdict === "ratify" && emit === undefined) {
    return usageError("atlas runtime is not composed yet — the WireConfig seams need the composition-root WP")
  }
  const out = decideProposal(
    ports.repoPath,
    { proposalId: wanted, verdict: verdict === "ratify" ? "ratified" : "rejected", reason, by, at: ports.now() },
    // A rejection never reaches the door, and a ratification without one returned above.
    (fact) => emit?.(fact, ports.head()) ?? { emitted: false, rejected: "atlas runtime is not composed yet" },
    ports.factOf,
  )
  if (!out.ok) return out.refusal === "invalid" ? usageError(out.reason) : governedRefusal(out.reason)
  const p = out.proposal
  const line = `decision: ${out.decision.id} ${out.decision.verdict} ${p.nodeKey} -> ${p.toTier} by ${by}: ${reason}`
  if (out.decision.verdict === "rejected") {
    return reviewOutcome(`proposal ${p.id} rejected; the fact keeps its tier and the rejection stays in the log`, [line])
  }
  return reviewOutcome(`proposal ${p.id} ratified: '${p.nodeKey}' is now ${p.toTier}`, [line, `emitted: ${out.emittedId ?? ""}`])
}
