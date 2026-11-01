// @atlas/adapter-io — src/surface/types.ts  (the Atlas UI surface: the shapes it returns and accepts)
//
// Every shape `openSurface` (./index.ts) hands the Orchestra Atlas screen. All of them are plain JSON — no Map, no
// Set, no class, no branded type — so the host serializes them as they are.
//
// `AtlasSnapshot` is the object specs/atlas-ui/mock/extract.py writes to `window.Atlas.real`, key for key, with
// three differences: `reasoning` is read one entry at a time (`AtlasSurface.reasoning`); `dependents` and
// `dependentCount` come from the code index `.atlas/index.scip`, not from an import regex; the backend-label scrub
// is not ported. Every result carries `state`, so a repository with no `.atlas/` directory answers
// `{ state: "empty" }` from every method.
//
// The Atlas outputs a write returns (`EmitOut`, `LinkOut`, `DraftOut`, `CheckOut`, `PromoteOut`, `VerifyFactData`)
// are MIRRORED here field for field rather than imported: this file imports only its siblings ./types-memory.ts and ./types-review.ts, so the
// boundary declaration bundle that inlines it stays free of the engine's internal types. A mirror that drifts from its source fails the
// adapter-io typecheck, because ./index.ts assigns each source value to its mirror.
//
// Lead decision D3b adds four keys to the snapshot — `own`, `memory`, `orientation`, `territories` — whose shapes
// live in ./types-memory.ts, the one file this one imports from.
import type { AtlasMemoryRecord, AtlasOrientationEvent, AtlasOwnSnapshot, AtlasTerritory } from "./types-memory.js"
import type {
  AtlasAnswerInput,
  AtlasDecideInput,
  AtlasDelegateOut,
  AtlasHoldInput,
  AtlasMemoryDecideInput,
  AtlasProposeInput,
  AtlasReleaseInput,
  AtlasReview,
  AtlasReviewWriteOut,
  AtlasTerritoryInput,
} from "./types-review.js"

/** A repository with no `.atlas/` directory. Every read and every write answers this. */
export interface AtlasEmpty {  readonly state: "empty"
}

// ── the snapshot (extract.py) ────────────────────────────────────────────────────────────────────────────────────

/** The fact's first grounding anchor, from its CAS bytes. */
export interface AtlasAnchor {
  readonly kind: string
  readonly qualifiedPath: string
}

/** One claim's receipt (`CurrentNode.provenanceByClaim` values). */
export interface AtlasClaimProvenance {
  readonly source: string
  readonly trusted: boolean
  readonly sha?: string
}

/** One diff hunk: the `@@` range and at most 18 lines, each cut to 160 characters. */
export interface AtlasDriftHunk {
  readonly at: string
  readonly lines: readonly string[]
}

/** How the fact's file changed between the commit the fact was derived at and HEAD. */
export interface AtlasDrift {
  /** At most two hunks of `git diff -U2 <rev> HEAD -- <file>`. */
  readonly hunks: readonly AtlasDriftHunk[]
  /** `git diff --shortstat <rev> HEAD -- <file>`, trimmed. */
  readonly stat: string
  /** At most three `[short sha, subject]` pairs of `git log <rev>..HEAD -- <file>`. */
  readonly commits: readonly (readonly [string, string])[]
}

/** One projection row (`promoted: true`) or one staging row not in the projection (`promoted: false`). */
export interface AtlasFact {
  readonly key: string
  /** The row's `contentHash`. */
  readonly hash: string
  /** The row's first claim; "" when the row has none. */
  readonly claim: string
  /** The row's `primaryAnchor`; "" when absent. */
  readonly file: string
  readonly family: string
  /** "" when the row carries no tier. */
  readonly tier: string
  /** "" when the row carries no scope. */
  readonly scope: string
  /** The first 8 characters of the rev the row was derived at; "" when unknown. */
  readonly derivedAt: string
  /** The first 16 characters of the first anchor's `subtreeHash`; "" when the CAS bytes are absent. */
  readonly subtree: string
  readonly obvious: string | null
  readonly promoted: boolean
  /** The first 12 characters of the staging row's `answerRef`, the id `AtlasSurface.reasoning` takes. */
  readonly why: string | null
  readonly kind: string | null
  readonly authoring: string | null
  readonly storedFreshness: string | null
  readonly obviousBy: string | null
  /** null when the CAS bytes are absent. */
  readonly anchor: AtlasAnchor | null
  readonly slot: string | null
  readonly seal: string | null
  readonly supersededBy: string | null
  readonly sameAs: readonly string[] | null
  readonly provenance: Readonly<Record<string, AtlasClaimProvenance>> | null
  /** Present only when the file's blob at the derived rev differs from its blob at HEAD. */
  readonly drift?: AtlasDrift
}

/** Which durable store files git tracks (`git ls-files .atlas`). */
export interface AtlasTracked {
  readonly projection: boolean
  /** The number of tracked `.atlas/cas/` files. */
  readonly cas: number
  readonly staging: boolean
  readonly policy: boolean
  readonly memory: boolean
}

/** CAS files on disk against the hashes the projection's `cas` list names. */
export interface AtlasCasAudit {
  readonly objects: number
  readonly referenced: number
  readonly missing: number
  readonly orphan: number
}

export interface AtlasSnapshot {
  readonly state: "ok"
  /** The repository directory's base name. */
  readonly project: string
  /** HEAD, first 8 characters; "" outside git. */
  readonly head: string
  readonly builtAt: string
  readonly gen: number
  readonly stagingGen: number
  readonly identity: string | null
  /** Every file under `.atlas/cas/<dir>/`. */
  readonly casObjects: number
  /** `.atlas/policy.json` `authz.scopes`: scope → actors. */
  readonly policy: Readonly<Record<string, readonly string[]>>
  readonly t0Keywords: readonly string[]
  /** A code index exists: `.atlas/index.scip`, or at least one dump in `.atlas/index.d/`. */
  readonly scip: boolean
  readonly tracked: AtlasTracked
  /** Projection rows whose seal is `proven`. */
  readonly sealed: number
  readonly casAudit: AtlasCasAudit
  /** `projection[.N].json` and `staging[.N].json` file names in `.atlas/`, sorted. */
  readonly generations: readonly string[]
  readonly abstained: number
  /** Tracked files per extension (`ts`, `tsx`, `js`, `mjs`, `py`, `rs`, `go`, `sh`). */
  readonly langs: Readonly<Record<string, number>>
  readonly facts: readonly AtlasFact[]
  readonly candidates: readonly AtlasFact[]
  /** File → the files that use something it defines, sorted (resolved index edges). */
  readonly dependents: Readonly<Record<string, readonly string[]>>
  readonly dependentCount: Readonly<Record<string, number>>
  /** Directory ("." for the root) → the sorted names of its tracked children. */
  readonly children: Readonly<Record<string, readonly string[]>>
  /** D3b: the committed Own snapshot, coverage and published skills; null when `OWN-SNAPSHOT.json` is absent. */
  readonly own: AtlasOwnSnapshot | null
  /** D3b: memory records (`.atlas/members/<seat>/memory/`) by member, in fold order; {} when there are none. */
  readonly memory: Readonly<Record<string, readonly AtlasMemoryRecord[]>>
  /** D3b: `.atlas/project/orientation.jsonl` events in log order; [] when the log is absent. */
  readonly orientation: readonly AtlasOrientationEvent[]
  /** D3b: `TERRITORY-CATALOG.json` territories; [] when the file is absent or does not parse. */
  readonly territories: readonly AtlasTerritory[]
}

export type AtlasSnapshotResult = AtlasEmpty | AtlasSnapshot

// ── reasoning, own, health ───────────────────────────────────────────────────────────────────────────────────────

/** The miner's reasoning for one staged row: the CAS value its `answerRef` names. */
export interface AtlasReasoning {
  readonly state: "ok"
  readonly id: string
  readonly text: string
}

/** No staged row has that id, or its CAS bytes are absent. */
export interface AtlasReasoningMissing {
  readonly state: "missing"
  readonly id: string
}

export type AtlasReasoningResult = AtlasEmpty | AtlasReasoning | AtlasReasoningMissing

/** `atlas own <scope>`: the briefing the composed runtime's `own` leg returns. */
export interface AtlasOwn {
  readonly state: "ok"
  readonly scope: string
  /** The `own_<leaf>` tool name. */
  readonly tool: string
  /** The `OwnPackPlus` (`@atlas/retrieval`), carried as JSON. */
  readonly pack: unknown
  readonly readRefusal: string | null
}

export type AtlasOwnResult = AtlasEmpty | AtlasOwn

/** `atlas doctor cas` (tools `CasIntegrity`). */
export interface AtlasCasIntegrity {
  readonly objects: number
  readonly corrupt: readonly string[]
  readonly unreadable: readonly string[]
  readonly missing: readonly string[]
  readonly orphan: number
  readonly referenced: number
  readonly sound: boolean
}

/** `atlas verify-store` (`ReverifyReport` without its rows). */
export interface AtlasProofs {
  readonly sealedProven: number
  readonly reProven: number
  readonly broken: number
  readonly unverifiable: number
  readonly dangling: number
}

export type AtlasScipState =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly reason: string }
  | { readonly kind: "present"; readonly documents: number }

export interface AtlasIndexerPlan {
  readonly lang: string
  readonly tool: string
  readonly args: readonly string[]
  readonly version?: string
}

export interface AtlasPlannedLang {
  readonly plan: AtlasIndexerPlan
  readonly files: number
}

/** `atlas doctor index` (`IndexPlanReport`). */
export interface AtlasIndexPlan {
  readonly scipRel: string
  readonly scip: AtlasScipState
  readonly configured: readonly AtlasPlannedLang[]
  readonly holes: readonly AtlasPlannedLang[]
}

export interface AtlasHealth {
  readonly state: "ok"
  /** Who a write is judged as: `ATLAS_ACTOR`, else the repository's git e-mail, else "". */
  readonly actor: string
  readonly provenance: "trusted" | "tracked-staging" | "tracked-provable"
  readonly readRefusal: string | null
  readonly readAdvisory: string | null
  readonly cas: AtlasCasIntegrity
  readonly proofs: AtlasProofs
  readonly index: AtlasIndexPlan
  /** `atlas doctor hotset`: the number of facts served. */
  readonly hotSet: number
}

export type AtlasHealthResult = AtlasEmpty | AtlasHealth

// ── writes ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AtlasGuidance {
  readonly next: string
  readonly invariant: string
}

/** A door's verdict (tools `Verdict`): `ok` with `data`, or a refusal with `rejected`, always with guidance. */
export interface AtlasVerdict<T> {
  readonly state: "ok"
  readonly ok: boolean
  readonly data?: T
  readonly rejected?: string
  readonly guidance: AtlasGuidance
}

/** One staged row's outcome (`PromotedRow`). */
export interface AtlasPromoteRow {
  readonly nodeKey: string
  readonly settled: boolean
  readonly id?: string
  readonly rejected?: string
}

/** `atlas promote` (`PromoteOut`). */
export interface AtlasPromote {
  readonly state: "ok"
  readonly read: boolean
  readonly refusal?: "contended" | "unreadable" | "untrusted"
  readonly candidates: number
  readonly promoted: number
  readonly refused: number
  readonly rows: readonly AtlasPromoteRow[]
        /** R2: staged rows this pass skipped because a curator holds them (`PromoteOut.held`). Absent when none. */
        readonly held?: readonly string[]
        /** R2: named nodeKeys no staged row carries (`PromoteOut.unknown`). Absent when every named key was staged. */
        readonly unknown?: readonly string[]
}

export type AtlasPromoteResult = AtlasEmpty | AtlasPromote

/** `atlas draft` (`DraftOut`). `fact` is the drafted `GroundedFact`; pass it back unchanged to `emit`. */
export interface AtlasDraftOut {
  readonly fact: unknown
  readonly rev: string
  readonly operation: "CREATE" | "UPDATE"
  readonly route: "auto-accept" | "full-ratify"
  readonly requires?: string
}

export interface AtlasGateResult {
  readonly gate: "shape" | "truth" | "authz" | "ratify"
  readonly pass: boolean
  readonly reason?: string
  readonly remedy?: string
}

/** `atlas check` (`CheckOut`): the emit door's gates, dry-run, nothing written. */
export interface AtlasCheckOut {
  readonly wouldEmit: boolean
  readonly gates: readonly AtlasGateResult[]
}

/** A draft plus its dry run at the draft's own rev; `check` is null when the dry run could not run. */
export interface AtlasDraftData {
  readonly draft: AtlasDraftOut
  readonly check: AtlasCheckOut | null
}

/** `atlas emit` (`EmitOut`). */
export interface AtlasEmitOut {
  readonly emitted: boolean
  readonly id?: string
  readonly nodeKey?: string
  readonly rejected?: string
}

/** `atlas link` (`LinkOut`). */
export interface AtlasLinkOut {
  readonly linked: boolean
  readonly rejected?: string
  readonly a?: string
  readonly b?: string
  readonly retracted?: boolean
}

/** `atlas verify-fact` (`VerifyFactData`). */
export interface AtlasVerifyOut {
  readonly kind: "dependency" | "count" | "definition" | "negation"
  readonly verdict: "proven" | "refuted" | "abstain"
  readonly reason?: string
  readonly oracle: string
  readonly target: string
  readonly scope: string
}

export type AtlasDraftResult = AtlasEmpty | AtlasVerdict<AtlasDraftData>
export type AtlasEmitResult = AtlasEmpty | AtlasVerdict<AtlasEmitOut>
export type AtlasLinkResult = AtlasEmpty | AtlasVerdict<AtlasLinkOut>
export type AtlasVerifyResult = AtlasEmpty | AtlasVerdict<AtlasVerifyOut>
export type AtlasReviewResult = AtlasEmpty | AtlasReview
export type AtlasReviewWriteResult = AtlasEmpty | AtlasVerdict<AtlasReviewWriteOut>
export type AtlasDelegateResult = AtlasEmpty | AtlasDelegateOut
/** `token` is the ratify token (`ATLAS_RATIFY_TOKEN`) for this one write; absent ⇒ the process's own. */
export interface AtlasPromoteInput {
  /** D36: settle only these staged rows; absent or empty ⇒ every staged row. A held row is always skipped. */
  readonly nodeKeys?: readonly string[]
  readonly token?: string
}

/** `atlas draft <anchor> <slot> <claim>` and its dry run. `supersede` drafts a retirement (`draftSupersede`). */
export interface AtlasDraftInput {
  readonly anchor: string
  readonly slot: string
  readonly claim: string
  readonly supersede?: boolean
  readonly token?: string
}

/** `atlas emit` of a drafted fact at the draft's `rev`. */
export interface AtlasEmitInput {
  readonly fact: unknown
  readonly at: string
  readonly token?: string
}

/** `atlas link <a> <b> [--retract]`. */
export interface AtlasLinkInput {
  readonly a: string
  readonly b: string
  readonly retract?: boolean
  readonly token?: string
}

/** `atlas verify-fact <kind> <target> --scope <scope> [--world] [--min] [--exact]`. Nothing is written. */
export interface AtlasVerifyInput {
  readonly kind: string
  readonly target: string
  readonly scope: string
  readonly world?: string
  readonly min?: number
  readonly exact?: boolean
}

// ── install (D37) ────────────────────────────────────────────────────────────────────────────────────────────────

/** `install()`: Atlas set up in a repository with no `.atlas/` yet, or why not. Never `AtlasEmpty`. */
export interface AtlasInstallResult {
  readonly state: "ok"
  readonly installed: boolean
  readonly refusal: "already-installed" | "no-git" | "no-actor" | null
  /** Who the policy grants: `ATLAS_ACTOR`, else the repository's git e-mail, else "". */
  readonly actor: string
  /** The scopes `policy.json` grants the actor, sorted; empty when refused. */
  readonly scopes: readonly string[]
  readonly gitignore: "installed" | "already-present" | "partial-repaired" | "failed" | null
  /** The indexer plan for the repository's languages; null when refused. */
  readonly index: AtlasIndexPlan | null
}

// ── the surface ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface AtlasSurface {
  readonly snapshot: () => AtlasSnapshotResult
  /** D37: the one method that runs when `.atlas/` is absent. */
  readonly install: () => AtlasInstallResult
  readonly reasoning: (id: string) => AtlasReasoningResult
  readonly own: (scope: string) => AtlasOwnResult
  readonly health: () => AtlasHealthResult
  readonly promote: (input: AtlasPromoteInput) => AtlasPromoteResult
  readonly draft: (input: AtlasDraftInput) => AtlasDraftResult
  readonly emit: (input: AtlasEmitInput) => AtlasEmitResult
  readonly link: (input: AtlasLinkInput) => AtlasLinkResult
  readonly verify: (input: AtlasVerifyInput) => AtlasVerifyResult
  readonly review: () => AtlasReviewResult
    readonly hold: (input: AtlasHoldInput) => AtlasReviewWriteResult
    readonly release: (input: AtlasReleaseInput) => AtlasReviewWriteResult
    readonly propose: (input: AtlasProposeInput) => AtlasReviewWriteResult
    readonly decide: (input: AtlasDecideInput) => AtlasReviewWriteResult
    readonly answer: (input: AtlasAnswerInput) => AtlasReviewWriteResult
    readonly memoryDecide: (input: AtlasMemoryDecideInput) => AtlasReviewWriteResult
    readonly territory: (input: AtlasTerritoryInput) => AtlasReviewWriteResult
}
