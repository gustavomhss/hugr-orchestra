// @atlas/adapter-io — src/surface/read-store.ts  (the Atlas UI surface: what the store files say)
//
// The store half of specs/atlas-ui/mock/extract.py: the projection and staging MIRRORS (`projection.json`,
// `staging.json`), the CAS value files they name, and `policy.json`. It reads the files directly instead of through
// `readSidecarSet`, because the snapshot reports what is ON DISK, including a store `store-provenance.ts` would refuse
// to serve; the snapshot's `tracked` field tells the screen which case it is looking at.
//
// TOTAL, like extract.py is not: a missing, unreadable or malformed file reads as empty, and a row whose CAS bytes are
// absent keeps its row fields and reports its CAS fields as null. A CAS name is read only when it is lowercase hex,
// so a hash taken from the store can never name a path outside `.atlas/cas/`.

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CurrentNode } from "@atlas/knowledge"
import { loadPolicy } from "../policy.js"
import { mirrorPath } from "../sidecar.js"
import type { WireProjection } from "../sidecar.js"
import type { AtlasCasAudit, AtlasFact, AtlasReasoningResult, AtlasSnapshot } from "./types.js"

/** The two sidecar mirrors of one store, read once per snapshot. */
export interface StoreFiles {
  readonly atlasDir: string
  readonly projection: WireProjection
  readonly staging: WireProjection
}

/** A fact row before its git drift is known, with the full rev it was derived at ("" when unknown). */
export interface PendingFact {
  readonly fact: AtlasFact
  readonly rev: string
}

/** The snapshot fields that come from the store files alone. */
export type StoreSummary = Pick<
  AtlasSnapshot,
  | "builtAt"
  | "gen"
  | "stagingGen"
  | "identity"
  | "casObjects"
  | "policy"
  | "t0Keywords"
  | "sealed"
  | "casAudit"
  | "generations"
  | "abstained"
>

/** The fields of a CAS fact object the snapshot reads. Untrusted bytes: every field is optional. */
interface CasFact {
  readonly kind?: string
  readonly authoring?: string
  readonly freshness?: string
  readonly obviousness?: { readonly rank?: string; readonly by?: string }
  readonly grounding?: {
    readonly entries?: readonly {
      readonly anchor?: { readonly kind?: string; readonly qualifiedPath?: string; readonly subtreeHash?: string }
    }[]
  }
}

const EMPTY_WIRE: WireProjection = { current: [], cas: [] }
const GENERATION = /^(projection|staging)(\.\d+)?\.json$/
const CAS_NAME = /^[0-9a-f]{3,}$/

/** Read the projection and staging mirrors of the store at `<repoPath>/.atlas`. */
export function readStoreFiles(repoPath: string): StoreFiles {
  const atlasDir = join(repoPath, ".atlas")
  return {
    atlasDir,
    projection: readWire(mirrorPath(atlasDir, "projection")),
    staging: readWire(mirrorPath(atlasDir, "staging")),
  }
}

/** extract.py `entry()` for every projection row (promoted) and every staging row not in the projection. */
export function pendingFacts(files: StoreFiles): {
  readonly facts: readonly PendingFact[]
  readonly candidates: readonly PendingFact[]
} {
  const answers = new Map(files.staging.current.map(([key, row]) => [key, row.answerRef]))
  const promoted = new Set(files.projection.current.map(([key]) => key))
  const entry = (key: string, row: CurrentNode, isPromoted: boolean, builtAt: string | undefined) =>
    factRow(files.atlasDir, key, row, answers.get(key), isPromoted, row.derivedAt ?? builtAt ?? "")
  return {
    facts: files.projection.current.map(([key, row]) => entry(key, row, true, files.projection.builtAt)),
    candidates: files.staging.current
      .filter(([key]) => !promoted.has(key))
      .map(([key, row]) => entry(key, row, false, files.staging.builtAt)),
  }
}

/** The snapshot fields read from the store files, the policy and the CAS directory. */
export function storeSummary(repoPath: string, files: StoreFiles): StoreSummary {
  const policy = loadPolicy(repoPath)
  const present = casNames(files.atlasDir)
  return {
    builtAt: typeof files.projection.builtAt === "string" ? files.projection.builtAt.slice(0, 8) : "",
    gen: typeof files.projection.gen === "number" ? files.projection.gen : 0,
    stagingGen: typeof files.staging.gen === "number" ? files.staging.gen : 0,
    identity: typeof files.projection.identity === "string" ? files.projection.identity : null,
    casObjects: present.length,
    // `loadPolicy` builds null-prototype maps; the snapshot is plain JSON.
    policy: Object.fromEntries(Object.entries(policy.authz.scopes).map(([scope, actors]) => [scope, [...actors]])),
    t0Keywords: [...policy.t0Heuristic.keywords],
    sealed: files.projection.current.filter(([, row]) => row.seal === "proven").length,
    casAudit: casAudit(present, new Set(files.projection.cas)),
    generations: listNames(files.atlasDir)
      .filter((name) => GENERATION.test(name))
      .sort(),
    abstained: Array.isArray(files.projection.abstained) ? files.projection.abstained.length : 0,
  }
}

/** The CAS value a staging row's `answerRef` names, found by the 12-character prefix `AtlasFact.why` carries. */
export function readReasoning(files: StoreFiles, id: string): AtlasReasoningResult {
  const ref = files.staging.current
    .map(([, row]) => row.answerRef)
    .find((answer): answer is string => typeof answer === "string" && answer.length > 0 && answer.slice(0, 12) === id)
  const value = ref === undefined ? undefined : readCas(files.atlasDir, ref)
  if (value === undefined) return { state: "missing", id }
  return { state: "ok", id, text: typeof value === "string" ? value : JSON.stringify(value) }
}

function factRow(
  atlasDir: string,
  key: string,
  row: CurrentNode,
  answerRef: string | undefined,
  promoted: boolean,
  rev: string,
): PendingFact {
  const obj = casFact(readCas(atlasDir, row.contentHash))
  const anchor = obj?.grounding?.entries?.[0]?.anchor
  return {
    rev,
    fact: {
      key,
      hash: row.contentHash,
      claim: row.claims[0] ?? "",
      file: row.primaryAnchor ?? "",
      family: row.family,
      tier: row.tier ?? "",
      scope: row.scope ?? "",
      derivedAt: rev.slice(0, 8),
      subtree: (anchor?.subtreeHash ?? "").slice(0, 16),
      obvious: obj?.obviousness?.rank ?? null,
      promoted,
      why: answerRef !== undefined && answerRef.length > 0 ? answerRef.slice(0, 12) : null,
      kind: obj?.kind ?? null,
      authoring: obj?.authoring ?? null,
      storedFreshness: obj?.freshness ?? null,
      obviousBy: obj?.obviousness?.by ?? null,
      anchor: anchor === undefined ? null : { kind: anchor.kind ?? "", qualifiedPath: anchor.qualifiedPath ?? "" },
      slot: row.slot ?? null,
      seal: row.seal ?? null,
      supersededBy: row.supersededBy ?? null,
      sameAs: row.sameAs ?? null,
      provenance: row.provenanceByClaim ?? null,
    },
  }
}

function casAudit(present: readonly string[], referenced: ReadonlySet<string>): AtlasCasAudit {
  const names = new Set(present)
  return {
    objects: names.size,
    referenced: referenced.size,
    missing: [...referenced].filter((hash) => !names.has(hash)).length,
    orphan: [...names].filter((hash) => !referenced.has(hash)).length,
  }
}

/** Every CAS value file name, `.atlas/cas/<dir>/<name>`; dot-names are skipped, as extract.py's glob skips them. */
function casNames(atlasDir: string): readonly string[] {
  const root = join(atlasDir, "cas")
  return listNames(root)
    .filter((dir) => !dir.startsWith("."))
    .flatMap((dir) => listNames(join(root, dir)).filter((name) => !name.startsWith(".")))
}

function readCas(atlasDir: string, hash: string): unknown {
  if (!CAS_NAME.test(hash)) return undefined
  return readJson(join(atlasDir, "cas", hash.slice(0, 2), hash))
}

function casFact(value: unknown): CasFact | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as CasFact) : undefined
}

function readWire(path: string): WireProjection {
  const raw = readJson(path)
  if (typeof raw !== "object" || raw === null) return EMPTY_WIRE
  const wire = raw as WireProjection
  if (!Array.isArray(wire.current) || !Array.isArray(wire.cas)) return EMPTY_WIRE
  return { ...wire, current: wire.current.filter(isEntry) }
}

/** A `[key, row]` pair whose row has the two fields every snapshot row reads; any other entry is dropped. */
function isEntry(entry: unknown): entry is readonly [string, CurrentNode] {
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") return false
  const row: unknown = entry[1]
  if (typeof row !== "object" || row === null) return false
  const fields = row as { readonly contentHash?: unknown; readonly claims?: unknown }
  return typeof fields.contentHash === "string" && Array.isArray(fields.claims)
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown
  } catch {
    return undefined
  }
}

function listNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
