export type EventMaestroReviewReceived = {
  id: string
  type: "maestro.review.received"
  properties: {
    sessionID: string
    projectID: string
    validationRecordID: string
    workCardHash: string
    routedMemberID: string
    rosterHash: string
    grantHash: string
    reviewPolicyHash: string
    actor: {
      version: "rfc8785-v1"
      bytes: string
      sha256: string
    }
    reviewerID: "lucy"
    reviewMethodVersion: string
    artifact: {
      workCardHash: string
      sha256: string
      baseSHA: string
      headSHA: string
      worktree: string
      changedPaths: Array<string>
    }
    verdict: "APPROVE" | "FIX_FIRST" | "REJECT"
    findings: Array<MaestroReviewFinding>
    stage?: "plan" | "code"
    routingDigest?: string
    catalogDigest?: string
    items?: Array<MaestroReviewItem>
  }
}

// `MaestroEvent.Review` (packages/schema). Receipts recorded before the routed review carry only path, line and message.
export type MaestroReviewEvidence =
  | { kind: "probe"; option: string; command: string; result: string; uri?: string }
  | { kind: "tool"; pack: string; rule: string; version: string; uri?: string }
  | { kind: "quote"; path: string; startLine: number; endLine: number }

export type MaestroReviewFinding = {
  path: string
  line: number
  message: string
  id?: string
  endLine?: number
  severity?: "P0" | "P1" | "P2" | "P3"
  confidence?: "high" | "medium" | "low"
  difficulty?: "low" | "medium" | "high"
  lens?: string
  class?: string
  node?: string
  rule?: string
  trigger?: string
  rungs?: ReadonlyArray<string>
  evidence?: MaestroReviewEvidence
  cause?: { path: string; line: number }
  status?: "open" | "resolved" | "dismissed"
  dismissedReason?: string
  suggestedTest?: string
}

// A `review-result` card finding: the receipt's record, where `message` may be left out for `rule`.
export type MaestroReviewCardFinding = Omit<MaestroReviewFinding, "message"> & { message?: string }

export type MaestroReviewItem = {
  pack: string
  rule: string
  fingerprint: string
  outcome: "confirmed" | "refuted" | "not-pursued"
}

// The `review-result` card's routing record (`ReviewRouting.Record` in packages/core), carried structurally: client
// code never imports Core.
export type ReviewRoutingSource = "request" | "pin" | "risk" | "path" | "content" | "catalog"

export type ReviewRoutingEntry<Fields> = Fields &
  ({ source: ReviewRoutingSource } | { source: "model"; quote: string })

export type ReviewRoutingRecord = {
  version: "route-v1"
  catalog: string
  profile: { id: string; source: ReviewRoutingSource }
  tier: {
    id: string
    source: ReviewRoutingSource
    requested?: string
    signals: Array<string>
    raise?: { id: string; source: "model"; quote: string }
  }
  overlays: Array<ReviewRoutingEntry<{ id: string; signal?: string; confirmed?: string; declined?: string }>>
  languages: Array<ReviewRoutingEntry<{ id: string; signal?: string }>>
  lenses: Array<ReviewRoutingEntry<{ id: string; node: string; because: string }>>
  packs: Array<
    ReviewRoutingEntry<{ id: string; lane: string; status: "routed" | "ran" | "skipped" | "not-run"; reason?: string }>
  >
  budget: {
    lensChildren: number
    samples: number
    verifiers: number
    itemsPerLens: number
    loadsPerSession: number
    candidatesPerChild: number
    candidatesPerVerifier: number
    toolCallsPerSession: number
    probeAttempts: number
  }
  deviations: Array<{
    kind: string
    stage: "route" | "analyze" | "entry" | "hunt" | "merge" | "verify" | "finish"
    session?: string
    detail: string
    ref?: string
  }>
}
