export * as MaestroAtlasSourceV2 from "./atlas-source"

import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import path from "node:path"
import { inspectOwnSnapshot, OWN_CAP, verifyHostContext } from "@orchestra/atlas-boundary"
import type { VerifiedHostContext, VerifiedOwnUnit } from "@orchestra/atlas-boundary"
import { Config } from "@orchestra/core/config"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { SkillV2 } from "@orchestra/core/skill"
import { AgentV2 } from "@orchestra/core/agent"
import { Effect, Option, Schema } from "effect"
import { Seats } from "../seats"
import type { MaestroSeats } from "./seats-service"

// The verified Atlas Own reader, over V2 services. Config comes from the Location's documents (`maestro.atlas`), Git from the process git command line, and
// files through the Location's filesystem. Every failure is an explicit hold, never an absence claim.

export type Owner = "backend" | "jimmy" | "archie" | "live"

/** The Atlas Memory owner an agent is: a native seat of this Location whose seat definition carries Atlas Memory. */
export function owner(id: string, seats: MaestroSeats.Interface): Owner | undefined {
  if (!seats.has(id) || Seats.all[id]?.atlasMemory !== true) return undefined
  return id === "backend" || id === "jimmy" || id === "archie" || id === "live" ? id : undefined
}

/** Atlas context reads (catalog, unit) also reach Maestro; anchor and the memory tools stay with the seats. */
export function reader(id: string, seats: MaestroSeats.Interface): Owner | "maestro" | undefined {
  if (id === AgentV2.defaultID) return "maestro"
  return owner(id, seats)
}

export class Held extends Schema.TaggedErrorClass<Held>()("MaestroAtlasV2.Held", {
  reason: Schema.String,
  evidence: Schema.Array(Schema.String),
}) {}

export type Placement = { readonly projectID: string; readonly directory: string }

export type Source = {
  readonly directory: string
  readonly identityHash: string
  readonly context: VerifiedHostContext
}

export type Services = {
  readonly config: Config.Interface
  readonly git: GitCli.Interface
  readonly fs: FSUtil.Interface
  readonly skills: SkillV2.Interface
}

const gitHash = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

/** Bounded unit and territory metadata of the verified Own catalog; bodies are never loaded. */
export const catalog = Effect.fn("MaestroAtlasV2.catalog")(function* (services: Services, placement: Placement) {
  const source = yield* read(services, placement)
  const units = boundedRows(
    source.context.units.map((unit) => ({
      unit: unit.unit,
      skillName: unit.skillName,
      graphCoverage: unit.receipt.graphCoverage,
      tokenEstimate: unit.tokenEstimate,
      complete: complete(unit),
    })),
  )
  const territories = boundedRows(
    source.context.territories.map((territory) => ({
      name: territory.name,
      owner: territory.owner,
      tier: territory.tier,
      globs: territory.globs,
    })),
  )
  return {
    projectID: placement.projectID,
    sourceIdentity: source.identityHash,
    sourceRevision: source.context.sourceRevision,
    catalogVersion: source.context.catalogVersion,
    units,
    territories,
    coverage: {
      state:
        units.length === source.context.units.length && territories.length === source.context.territories.length
          ? ("complete" as const)
          : ("partial" as const),
      scope: "verified-own-catalog" as const,
      units: { returned: units.length, total: source.context.units.length },
      territories: { returned: territories.length, total: source.context.territories.length },
      bodiesLoaded: false,
    },
  }
})

/** The complete, fresh, verified bytes of one exact unit. */
export const unit = Effect.fn("MaestroAtlasV2.unit")(function* (services: Services, placement: Placement, id: string) {
  const source = yield* read(services, placement)
  const loaded = yield* loadSkill(services, placement, source, id)
  const selected = source.context.units.find((candidate) => candidate.unit === loaded.unit)
  if (!selected) return yield* held("unit-missing-or-ambiguous", [id])
  return {
    projectID: placement.projectID,
    sourceIdentity: source.identityHash,
    sourceRevision: source.context.sourceRevision,
    ...loaded,
    receipt: selected.receipt,
    coverage: {
      state: "complete" as const,
      scope: "verified-own-unit" as const,
      graphCoverage: selected.receipt.graphCoverage,
      freshness: "FRESH" as const,
      currentBlobsChecked: true,
      truncated: false,
      // COMPLETE is Atlas's declared graph coverage, not universal semantic-language support.
      note: "Verified Atlas Own coverage; no additional semantic-language coverage is claimed.",
    },
  }
})

export const read = Effect.fn("MaestroAtlasV2.read")(
  function* (services: Services, placement: Placement) {
    const provider = yield* configured(services.config)
    if (!provider) return yield* held("provider-unconfigured", [placement.projectID])
    if (provider.projectID !== placement.projectID)
      return yield* held("provider-project-mismatch", [provider.projectID, placement.projectID])
    if (provider.directory !== "." && !canonicalPath(provider.directory))
      return yield* held("provider-path-invalid", [provider.directory])
    const top = yield* services.git.run(["rev-parse", "--show-toplevel"], { cwd: placement.directory })
    if (top.exitCode !== 0 || top.truncated || !top.text().trim())
      return yield* held("repository-unavailable", [placement.directory, top.stderr.toString()])
    const repository = yield* services.fs.realPath(top.text().replace(/\r?\n$/, ""))
    const sessionDirectory = yield* services.fs.realPath(placement.directory)
    if (sessionDirectory !== path.resolve(placement.directory) || !inside(repository, sessionDirectory))
      return yield* held("session-directory-invalid", [placement.directory, sessionDirectory, repository])
    const directory = yield* fencedPath(services.fs, repository, provider.directory, "Directory")
    const sourceDirectory = yield* fencedPath(services.fs, repository, provider.sourceDirectory ?? ".", "Directory")
    const catalogContent = yield* readStatic(services.fs, directory, "TERRITORY-CATALOG.json")
    const snapshotContent = yield* readStatic(services.fs, directory, "OWN-SNAPSHOT.json")
    const catalog = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(catalogContent)
    if (Option.isNone(catalog)) return yield* held("catalog-json-invalid", [directory])
    const inspection = inspectOwnSnapshot(snapshotContent)
    if (inspection.status === "HOLD")
      return yield* held(inspection.reason, [path.join(directory, "OWN-SNAPSHOT.json"), ...inspection.evidence])
    const head = yield* services.git.run(["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repository })
    if (head.exitCode !== 0 || head.truncated || !gitHash.test(head.text().trim()))
      return yield* held("repository-head-invalid", [repository])
    const ancestor = yield* services.git.run(
      ["merge-base", "--is-ancestor", inspection.sourceRevision, head.text().trim()],
      { cwd: repository },
    )
    if (ancestor.exitCode !== 0 || ancestor.truncated)
      return yield* held("source-revision-not-ancestor", [inspection.sourceRevision, head.text().trim()])
    const files = yield* Effect.forEach(inspection.artifactPaths, (file) =>
      readStatic(services.fs, directory, file).pipe(Effect.map((content) => ({ path: file, content }))),
    )
    // Metadata and source roots are explicit, separate bindings; neither comes from model scope.
    const currentBlobs = Object.fromEntries(
      yield* Effect.forEach(inspection.sourcePaths, (file) => readBlob(services, sourceDirectory, file)),
    )
    const verified = verifyHostContext({
      projectId: placement.projectID,
      catalog: catalog.value,
      snapshotContent,
      files,
      currentBlobs,
    })
    if (verified.status === "HOLD") return yield* held(verified.reason, verified.evidence)
    if (!verified.context.units.length) return yield* held("context-empty", [directory])
    // A read cannot authorize a mix of old snapshot/artifact bytes and newer source bytes.
    yield* Effect.forEach(
      [
        { path: "TERRITORY-CATALOG.json", content: catalogContent },
        { path: "OWN-SNAPSHOT.json", content: snapshotContent },
        ...files,
      ],
      Effect.fnUntraced(function* (file) {
        if ((yield* readStatic(services.fs, directory, file.path)) !== file.content)
          return yield* held("static-data-changed-during-read", [file.path])
      }),
    )
    yield* Effect.forEach(
      inspection.sourcePaths,
      Effect.fnUntraced(function* (file) {
        const blob = yield* readBlob(services, sourceDirectory, file)
        if (blob[1] !== currentBlobs[file]) return yield* held("source-changed-during-read", [file])
      }),
    )
    const currentHead = yield* services.git.run(["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repository })
    const currentProvider = yield* configured(services.config)
    if (
      currentHead.exitCode !== 0 ||
      currentHead.truncated ||
      currentHead.text() !== head.text() ||
      currentProvider?.projectID !== provider.projectID ||
      currentProvider.directory !== provider.directory ||
      currentProvider.sourceDirectory !== provider.sourceDirectory ||
      (yield* fencedPath(services.fs, repository, provider.directory, "Directory")) !== directory
    )
      return yield* held("provider-changed-during-read", [directory])
    return {
      directory,
      identityHash: sha256(
        JSON.stringify({ directory, sourceDirectory, catalogContent, snapshotContent, files, currentBlobs }),
      ),
      context: verified.context,
    } satisfies Source
  },
  Effect.catch((error) => Effect.fail(normalize(error))),
  Effect.catchDefect((error) => Effect.fail(normalize(error))),
)

const loadSkill = Effect.fn("MaestroAtlasV2.loadSkill")(
  function* (services: Services, placement: Placement, source: Source, unit: string) {
    const fresh = yield* read(services, placement)
    if (fresh.identityHash !== source.identityHash || fresh.directory !== source.directory)
      return yield* held("source-identity-changed", [source.identityHash, fresh.identityHash])
    const matches = fresh.context.units.filter((candidate) => candidate.unit === unit)
    if (matches.length !== 1) return yield* held("unit-missing-or-ambiguous", [unit])
    const selected = matches[0]
    if (
      !Number.isSafeInteger(selected.tokenEstimate) ||
      selected.tokenEstimate < 0 ||
      selected.tokenEstimate > OWN_CAP ||
      !complete(selected)
    )
      return yield* held("unit-context-incomplete", [unit])
    const expected = yield* fencedPath(services.fs, fresh.directory, selected.path, "File")
    const raw = yield* readStatic(services.fs, fresh.directory, selected.path)
    if (raw !== selected.content) return yield* held("skill-bytes-changed", [expected])
    const parsed = yield* Effect.try({ try: () => ConfigMarkdown.parse(raw), catch: normalize })
    if (parsed.data.name !== selected.skillName) return yield* held("skill-name-mismatch", [expected])
    // The earlier runtime also requires the skill registry to serve these bytes. V2 discovers Own skills only under a project skill
    // root, so the check binds a registered skill of this name to the verified file and refuses a shadowing one.
    const registered = (yield* services.skills.list()).find((skill) => skill.name === selected.skillName)
    if (registered) {
      const location = yield* services.fs.realPath(registered.location)
      if (location !== expected || path.resolve(registered.location) !== expected)
        return yield* held("skill-location-mismatch", [registered.location, expected])
      if (registered.content !== parsed.content)
        return yield* held("skill-cache-content-mismatch", [registered.name, expected])
    }
    if ((yield* readStatic(services.fs, fresh.directory, selected.path)) !== selected.content)
      return yield* held("skill-bytes-changed", [expected])
    const after = yield* read(services, placement)
    if (after.directory !== fresh.directory || after.identityHash !== fresh.identityHash)
      return yield* held("source-changed-during-load", [fresh.identityHash, after.identityHash])
    return {
      unit,
      name: selected.skillName,
      content: parsed.content,
      contentHash: selected.receipt.contentHash,
      receiptHash: sha256(stableJSON(selected.receipt)),
    }
  },
  Effect.catch((error) => Effect.fail(normalize(error))),
  Effect.catchDefect((error) => Effect.fail(normalize(error))),
)

const configured = Effect.fnUntraced(function* (config: Config.Interface) {
  return Config.latest(yield* config.entries(), "maestro")?.atlas
})

const fencedPath = Effect.fn("MaestroAtlasV2.fencedPath")(function* (
  fs: FSUtil.Interface,
  root: string,
  relative: string,
  type: "File" | "Directory",
) {
  if (!(type === "Directory" && relative === ".") && !canonicalPath(relative))
    return yield* held("path-not-canonical", [relative])
  const expected = path.resolve(root, relative)
  const actual = yield* fs.realPath(expected)
  if (!inside(root, actual) || actual !== expected) return yield* held("path-escape-or-alias", [relative, actual, root])
  if ((yield* fs.stat(actual)).type !== type) return yield* held("path-type-invalid", [relative, type])
  return actual
})

const readStatic = Effect.fn("MaestroAtlasV2.readStatic")(function* (
  fs: FSUtil.Interface,
  root: string,
  relative: string,
) {
  const file = yield* fencedPath(fs, root, relative, "File")
  const bytes = yield* fs.readFile(file)
  const content = Buffer.from(bytes).toString("utf8")
  if (!Buffer.from(content, "utf8").equals(Buffer.from(bytes))) return yield* held("static-encoding-invalid", [file])
  if ((yield* fencedPath(fs, root, relative, "File")) !== file) return yield* held("path-changed-during-read", [file])
  return content
})

const readBlob = Effect.fn("MaestroAtlasV2.readBlob")(function* (
  services: Services,
  repository: string,
  relative: string,
) {
  const file = yield* fencedPath(services.fs, repository, relative, "File")
  const result = yield* services.git.run(["hash-object", "--no-filters", "--", file], { cwd: repository })
  if (result.exitCode !== 0 || result.truncated || !gitHash.test(result.text().trim()))
    return yield* held("source-blob-unavailable", [relative, result.stderr.toString()])
  yield* fencedPath(services.fs, repository, relative, "File")
  return [relative, result.text().trim()] as const
})

function complete(unit: VerifiedOwnUnit) {
  return (
    unit.truncated === false &&
    unit.pullReachable.length === 0 &&
    unit.advisoryDropped === 0 &&
    unit.receipt.graphCoverage === "COMPLETE"
  )
}

// Each metadata list is bounded independently; omitted rows remain explicit in coverage, never an absence claim.
function boundedRows<T>(rows: readonly T[]) {
  return rows.reduce<{ rows: T[]; bytes: number }>(
    (result, row) => {
      const bytes = Buffer.byteLength(JSON.stringify(row), "utf8") + 1
      if (result.rows.length === 50 || result.bytes + bytes > 6 * 1024) return result
      return { rows: [...result.rows, row], bytes: result.bytes + bytes }
    },
    { rows: [], bytes: 2 },
  ).rows
}

function canonicalPath(value: string) {
  return (
    value.length > 0 &&
    !/[\\:\p{Cc}]/u.test(value) &&
    !path.posix.isAbsolute(value) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  )
}

function inside(root: string, value: string) {
  const relative = path.relative(root, value)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

function held(reason: string, evidence: readonly string[]) {
  return new Held({ reason, evidence })
}

function normalize(error: unknown) {
  return error instanceof Held ? error : held("atlas-source-unavailable", [String(error)])
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJSON(entry)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
