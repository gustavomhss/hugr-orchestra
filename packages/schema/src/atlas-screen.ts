import { Schema } from "effect"
import { AtlasDelegateOk, AtlasReview } from "./atlas-review"
import { AtlasIndexOk, AtlasMineOk } from "./atlas-setup"

// The Atlas screen's wire shapes, shared by the legacy instance routes and the V2 server. They transcribe
// modules/atlas/packages/adapter-io/src/surface/types.ts and types-memory.ts field for field; a repository with no
// `.atlas/` answers `{ state: "empty" }` on every route.

export const AtlasEmpty = Schema.Struct({ state: Schema.Literal("empty") }).annotate({ identifier: "AtlasEmpty" })

const Strings = Schema.Array(Schema.String)

export const AtlasDrift = Schema.Struct({
  hunks: Schema.Array(Schema.Struct({ at: Schema.String, lines: Strings })),
  stat: Schema.String,
  commits: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
}).annotate({ identifier: "AtlasDrift" })

export const AtlasFact = Schema.Struct({
  key: Schema.String,
  hash: Schema.String,
  claim: Schema.String,
  file: Schema.String,
  family: Schema.String,
  tier: Schema.String,
  scope: Schema.String,
  derivedAt: Schema.String,
  subtree: Schema.String,
  obvious: Schema.NullOr(Schema.String),
  promoted: Schema.Boolean,
  why: Schema.NullOr(Schema.String),
  kind: Schema.NullOr(Schema.String),
  authoring: Schema.NullOr(Schema.String),
  storedFreshness: Schema.NullOr(Schema.String),
  obviousBy: Schema.NullOr(Schema.String),
  anchor: Schema.NullOr(Schema.Struct({ kind: Schema.String, qualifiedPath: Schema.String })),
  slot: Schema.NullOr(Schema.String),
  seal: Schema.NullOr(Schema.String),
  supersededBy: Schema.NullOr(Schema.String),
  sameAs: Schema.NullOr(Strings),
  provenance: Schema.NullOr(
    Schema.Record(
      Schema.String,
      Schema.Struct({ source: Schema.String, trusted: Schema.Boolean, sha: Schema.optional(Schema.String) }),
    ),
  ),
  drift: Schema.optional(AtlasDrift),
}).annotate({ identifier: "AtlasFact" })

export const AtlasOwnSnapshot = Schema.Struct({
  status: Schema.Literals(["READY", "HOLD"]),
  reason: Schema.NullOr(Schema.String),
  snapshot: Schema.NullOr(Schema.String),
  sourceRevision: Schema.NullOr(Schema.String),
  sourcePaths: Strings,
  units: Schema.Array(Schema.Unknown),
  coverage: Schema.NullOr(Schema.Struct({ snapshot: Schema.String, sourceRevision: Schema.String, units: Strings })),
  skills: Schema.Array(Schema.Struct({ path: Schema.String, size: Schema.Finite, head: Schema.String })),
}).annotate({ identifier: "AtlasOwnSnapshot" })

export const AtlasMemoryRecord = Schema.Struct({
  eventId: Schema.String,
  seq: Schema.Finite,
  member: Schema.String,
  kind: Schema.String,
  text: Schema.String,
  scope: Schema.NullOr(Schema.String),
  at: Schema.NullOr(Schema.String),
  refs: Strings,
  entry: Schema.Unknown,
}).annotate({ identifier: "AtlasMemoryRecord" })

export const AtlasOrientationEvent = Schema.Struct({
  eventId: Schema.String,
  seq: Schema.Finite,
  channel: Schema.String,
  label: Schema.String,
  supersedes: Strings,
}).annotate({ identifier: "AtlasOrientationEvent" })

export const AtlasTerritory = Schema.Struct({
  name: Schema.String,
  owner: Schema.String,
  tier: Schema.String,
  globs: Strings,
}).annotate({ identifier: "AtlasTerritory" })

export const AtlasSnapshot = Schema.Struct({
  state: Schema.Literal("ok"),
  project: Schema.String,
  head: Schema.String,
  builtAt: Schema.String,
  gen: Schema.Finite,
  stagingGen: Schema.Finite,
  identity: Schema.NullOr(Schema.String),
  casObjects: Schema.Finite,
  policy: Schema.Record(Schema.String, Strings),
  t0Keywords: Strings,
  scip: Schema.Boolean,
  tracked: Schema.Struct({
    projection: Schema.Boolean,
    cas: Schema.Finite,
    staging: Schema.Boolean,
    policy: Schema.Boolean,
    memory: Schema.Boolean,
  }),
  sealed: Schema.Finite,
  casAudit: Schema.Struct({
    objects: Schema.Finite,
    referenced: Schema.Finite,
    missing: Schema.Finite,
    orphan: Schema.Finite,
  }),
  generations: Strings,
  abstained: Schema.Finite,
  langs: Schema.Record(Schema.String, Schema.Finite),
  facts: Schema.Array(AtlasFact),
  candidates: Schema.Array(AtlasFact),
  dependents: Schema.Record(Schema.String, Strings),
  dependentCount: Schema.Record(Schema.String, Schema.Finite),
  children: Schema.Record(Schema.String, Strings),
  own: Schema.NullOr(AtlasOwnSnapshot),
  memory: Schema.Record(Schema.String, Schema.Array(AtlasMemoryRecord)),
  orientation: Schema.Array(AtlasOrientationEvent),
  territories: Schema.Array(AtlasTerritory),
}).annotate({ identifier: "AtlasSnapshot" })

export const AtlasSnapshotResult = Schema.Union([AtlasEmpty, AtlasSnapshot]).annotate({
  identifier: "AtlasSnapshotResult",
})

export const AtlasReasoningResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({ state: Schema.Literal("ok"), id: Schema.String, text: Schema.String }),
  Schema.Struct({ state: Schema.Literal("missing"), id: Schema.String }),
]).annotate({ identifier: "AtlasReasoningResult" })

export const AtlasOwnResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    state: Schema.Literal("ok"),
    scope: Schema.String,
    tool: Schema.String,
    pack: Schema.Unknown,
    readRefusal: Schema.NullOr(Schema.String),
  }).annotate({ identifier: "AtlasOwn" }),
]).annotate({ identifier: "AtlasOwnResult" })

const AtlasPlannedLang = Schema.Struct({
  plan: Schema.Struct({
    lang: Schema.String,
    tool: Schema.String,
    args: Strings,
    version: Schema.optional(Schema.String),
  }),
  files: Schema.Finite,
})

const AtlasIndexPlan = Schema.Struct({
  scipRel: Schema.String,
  scip: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("absent") }),
    Schema.Struct({ kind: Schema.Literal("unreadable"), reason: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("present"), documents: Schema.Finite }),
  ]),
  configured: Schema.Array(AtlasPlannedLang),
  holes: Schema.Array(AtlasPlannedLang),
})

export const AtlasHealth = Schema.Struct({
  state: Schema.Literal("ok"),
  actor: Schema.String,
  provenance: Schema.Literals(["trusted", "tracked-staging", "tracked-provable"]),
  readRefusal: Schema.NullOr(Schema.String),
  readAdvisory: Schema.NullOr(Schema.String),
  cas: Schema.Struct({
    objects: Schema.Finite,
    corrupt: Strings,
    unreadable: Strings,
    missing: Strings,
    orphan: Schema.Finite,
    referenced: Schema.Finite,
    sound: Schema.Boolean,
  }),
  proofs: Schema.Struct({
    sealedProven: Schema.Finite,
    reProven: Schema.Finite,
    broken: Schema.Finite,
    unverifiable: Schema.Finite,
    dangling: Schema.Finite,
  }),
  index: AtlasIndexPlan,
  hotSet: Schema.Finite,
}).annotate({ identifier: "AtlasHealth" })

export const AtlasHealthResult = Schema.Union([AtlasEmpty, AtlasHealth]).annotate({ identifier: "AtlasHealthResult" })

export const AtlasPromoteResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    state: Schema.Literal("ok"),
    read: Schema.Boolean,
    refusal: Schema.optional(Schema.Literals(["contended", "unreadable", "untrusted"])),
    candidates: Schema.Finite,
    promoted: Schema.Finite,
    refused: Schema.Finite,
    rows: Schema.Array(
      Schema.Struct({
        nodeKey: Schema.String,
        settled: Schema.Boolean,
        id: Schema.optional(Schema.String),
        rejected: Schema.optional(Schema.String),
      }),
    ),
    held: Schema.optional(Strings),
    unknown: Schema.optional(Strings),
  }).annotate({ identifier: "AtlasPromote" }),
]).annotate({ identifier: "AtlasPromoteResult" })

/** The fields every door verdict carries (surface `AtlasVerdict`); each verdict struct adds its own `data`. */
const VerdictFields = {
  state: Schema.Literal("ok"),
  ok: Schema.Boolean,
  rejected: Schema.optional(Schema.String),
  guidance: Schema.Struct({ next: Schema.String, invariant: Schema.String }),
}

export const AtlasDraftResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        draft: Schema.Struct({
          fact: Schema.Unknown,
          rev: Schema.String,
          operation: Schema.Literals(["CREATE", "UPDATE"]),
          route: Schema.Literals(["auto-accept", "full-ratify"]),
          requires: Schema.optional(Schema.String),
        }),
        check: Schema.NullOr(
          Schema.Struct({
            wouldEmit: Schema.Boolean,
            gates: Schema.Array(
              Schema.Struct({
                gate: Schema.Literals(["shape", "truth", "authz", "ratify"]),
                pass: Schema.Boolean,
                reason: Schema.optional(Schema.String),
                remedy: Schema.optional(Schema.String),
              }),
            ),
          }),
        ),
      }),
    ),
  }).annotate({ identifier: "AtlasDraft" }),
]).annotate({ identifier: "AtlasDraftResult" })

export const AtlasEmitResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        emitted: Schema.Boolean,
        id: Schema.optional(Schema.String),
        nodeKey: Schema.optional(Schema.String),
        rejected: Schema.optional(Schema.String),
      }),
    ),
  }).annotate({ identifier: "AtlasEmit" }),
]).annotate({ identifier: "AtlasEmitResult" })

export const AtlasLinkResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        linked: Schema.Boolean,
        rejected: Schema.optional(Schema.String),
        a: Schema.optional(Schema.String),
        b: Schema.optional(Schema.String),
        retracted: Schema.optional(Schema.Boolean),
      }),
    ),
  }).annotate({ identifier: "AtlasLink" }),
]).annotate({ identifier: "AtlasLinkResult" })

export const AtlasVerifyResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        kind: Schema.Literals(["dependency", "count", "definition", "negation"]),
        verdict: Schema.Literals(["proven", "refuted", "abstain"]),
        reason: Schema.optional(Schema.String),
        oracle: Schema.String,
        target: Schema.String,
        scope: Schema.String,
      }),
    ),
  }).annotate({ identifier: "AtlasVerify" }),
]).annotate({ identifier: "AtlasVerifyResult" })

export const AtlasReviewResult = Schema.Union([AtlasEmpty, AtlasReview]).annotate({ identifier: "AtlasReviewResult" })

/** Every review write (hold, release, propose, decide, answer, memory-decide, territory) answers this verdict. */
export const AtlasReviewWriteResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(Schema.Struct({ id: Schema.String })),
  }).annotate({ identifier: "AtlasReviewWrite" }),
]).annotate({ identifier: "AtlasReviewWriteResult" })

export const AtlasDelegateResult = Schema.Union([AtlasEmpty, AtlasDelegateOk]).annotate({
  identifier: "AtlasDelegateResult",
})

export const AtlasInstall = Schema.Struct({
  state: Schema.Literal("ok"),
  installed: Schema.Boolean,
  refusal: Schema.NullOr(Schema.Literals(["already-installed", "no-git", "no-actor"])),
  actor: Schema.String,
  scopes: Strings,
  gitignore: Schema.NullOr(Schema.Literals(["installed", "already-present", "partial-repaired", "failed"])),
  index: Schema.NullOr(AtlasIndexPlan),
}).annotate({ identifier: "AtlasInstall" })

export const AtlasIndexResult = Schema.Union([AtlasEmpty, AtlasIndexOk]).annotate({ identifier: "AtlasIndexResult" })

export const AtlasMineResult = Schema.Union([AtlasEmpty, AtlasMineOk]).annotate({ identifier: "AtlasMineResult" })

export const AtlasPromoteInput = Schema.Struct({
  token: Schema.optional(Schema.String),
  nodeKeys: Schema.optional(Schema.Array(Schema.String)),
})
export const AtlasDraftInput = Schema.Struct({
  anchor: Schema.String,
  slot: Schema.String,
  claim: Schema.String,
  supersede: Schema.optional(Schema.Boolean),
  token: Schema.optional(Schema.String),
})
export const AtlasEmitInput = Schema.Struct({
  fact: Schema.Unknown,
  at: Schema.String,
  token: Schema.optional(Schema.String),
})
export const AtlasLinkInput = Schema.Struct({
  a: Schema.String,
  b: Schema.String,
  retract: Schema.optional(Schema.Boolean),
  token: Schema.optional(Schema.String),
})
export const AtlasVerifyInput = Schema.Struct({
  kind: Schema.String,
  target: Schema.String,
  scope: Schema.String,
  world: Schema.optional(Schema.String),
  min: Schema.optional(Schema.Finite),
  exact: Schema.optional(Schema.Boolean),
})
