// @atlas/adapter-io — src/surface/types-review.ts  (the Atlas UI surface: the review queue — D31, D35)
//
// The shapes `openSurface().review()` returns and the review writes accept: held candidates (R2), open ratification
// proposals (R3), open memory proposals (R1), the interview batch with its model drafts (R11), a territory
// declaration (R4) and the host-only interview delegation (D33). Plain JSON; an absent value is `null`, never an
// omitted key (lead decision D35), except optional INPUT fields. Every engine shape here is MIRRORED field for
// field, not imported, and this file imports nothing, for the reason ./types.ts gives. The result unions that need
// `AtlasEmpty`/`AtlasVerdict` live in ./types.ts, which imports this file.

/** One open ratification proposal (`ReviewOf<\"proposal\">`). */
export interface AtlasReviewProposal {
  readonly id: string
  readonly nodeKey: string
  readonly toTier: "T1" | "T0"
  readonly reason: string
  readonly by: string
  readonly at: string
}

/** One open memory proposal (`ReviewOf<\"memory-proposal\">`): a seat's project rule waiting for a person. */
export interface AtlasMemoryProposal {
  readonly id: string
  readonly member: string
  readonly rule: string
  readonly scope: string
  readonly by: string
  readonly at: string
}

/** A model's drafted answer (`InterviewQuestion.draft`). The question stays open until a person answers it. */
export interface AtlasInterviewDraft {
  readonly answer: string
  readonly model: string
  readonly why: string
  readonly by: string
  readonly at: string
}

/** One interview question (`InterviewQuestion`). `site` is the anchored path (`OpenQ.site.qualifiedPath`). */
export interface AtlasInterviewQuestion {
  readonly id: string
  readonly kind: "owner" | "tier" | "contested" | "intent"
  readonly subject: string
  readonly ask: string
  readonly rank: number
  readonly site: string
  readonly options: readonly string[] | null
  readonly nodeKey: string | null
  readonly draft: AtlasInterviewDraft | null
}

/** `review()`. `unreadable`: the review log has lines that do not verify, or cannot be read at all — what did verify
 *  is still served, and every review write refuses until the log is repaired. */
export interface AtlasReview {
  readonly state: "ok"
  readonly unreadable: boolean
  /** The staged candidates' nodeKeys every `promote` skips, sorted. */
  readonly held: readonly string[]
  readonly proposals: readonly AtlasReviewProposal[]
  readonly memoryProposals: readonly AtlasMemoryProposal[]
  readonly interview: { readonly batch: readonly AtlasInterviewQuestion[]; readonly deferred: number }
}

/** What a review write returns as `data`: the appended record's id (the catalog path for `territory`). */
export interface AtlasReviewWriteOut {
  readonly id: string
}

/** `atlas hold <nodeKey>`. */
export interface AtlasHoldInput {
  readonly nodeKey: string
}

/** `atlas release <nodeKey>`. */
export interface AtlasReleaseInput {
  readonly nodeKey: string
}

/** `atlas propose <nodeKey> <T1|T0> <reason...>`. */
export interface AtlasProposeInput {
  readonly nodeKey: string
  readonly toTier: "T1" | "T0"
  readonly reason: string
}

/** `atlas decide <proposalId> ratify|reject <reason...>`. `token` is the ratify token for a ratification. */
export interface AtlasDecideInput {
  readonly proposalId: string
  readonly verdict: "ratified" | "rejected"
  readonly reason: string
  readonly token?: string
}

/** `atlas answer <questionId> <answer...>`. `drafted` marks a model's draft, which never proposes. */
export interface AtlasAnswerInput {
  readonly questionId: string
  readonly answer: string
  readonly drafted?: { readonly model: string; readonly why: string }
}

/** A person's decision on a memory proposal. A non-empty `rule`/`scope` replaces the proposal's text. */
export interface AtlasMemoryDecideInput {
  readonly proposalId: string
  readonly verdict: "indexed" | "discarded"
  readonly rule?: string
  readonly scope?: string
}

/** `atlas territory <name> <glob...> --owner --tier [--project]`. `projectId` is required only for the first catalog
 *  (the Orchestra project id; issues/c-engine.md item 2). `token` is the ratify token, else the process's own. */
export interface AtlasTerritoryInput {
  readonly name: string
  readonly owner: string
  readonly tier: "T0" | "T1" | "T2"
  readonly globs: readonly string[]
  readonly token?: string
  readonly projectId?: string
}

/** The host-only interview delegation (D33): one model drafts an answer per question id. */
export interface AtlasDelegateInput {
  readonly questionIds: readonly string[]
  readonly providerID: string
  readonly modelID: string
}

/** What the delegation drafted: one row per question id, `rejected` naming why a draft was not written. */
export interface AtlasDelegateOut {
  readonly state: "ok"
  readonly drafted: readonly { readonly questionId: string; readonly ok: boolean; readonly rejected: string | null }[]
}
