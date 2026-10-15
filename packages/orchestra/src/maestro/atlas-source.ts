import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import path from "node:path"
import { inspectOwnSnapshot, OWN_CAP, verifyHostContext } from "@orchestra/atlas-boundary"
import type { VerifiedHostContext } from "@orchestra/atlas-boundary"
import { Effect, FileSystem, Option, Schema } from "effect"
import { Config } from "../config/config"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import { Filesystem } from "../util/filesystem"
import { Git } from "../git"
import type { Session } from "../session/session"
import { Skill } from "../skill"
import { compileContextToolPlan, type ContextToolPlan } from "./context-tool-plan"

export class AtlasContextHeld extends Schema.TaggedErrorClass<AtlasContextHeld>()("AtlasContextHeld", {
  reason: Schema.String,
  evidence: Schema.Array(Schema.String),
}) {
  override get message() {
    const held = `${this.reason}: ${this.evidence.join("; ")}`
    const next = nextSteps[this.reason]
    return next ? `${held}. ${next}` : held
  }
}

// Holds a governed flow meets in practice; Atlas data itself is only fixed by the owner or a maintainer.
const nextSteps: Record<string, string> = {
  "provider-unconfigured":
    "Atlas is not configured for this project (maestro.atlas), so governed work cannot proceed here; the owner decides.",
  "provider-project-mismatch":
    "maestro.atlas names another project, so governed work cannot proceed here; the owner decides.",
  "artifacts-invalid":
    "Own artifacts are stale against the current source or their snapshot and must be re-materialized by the owner or a maintainer before governed work can proceed.",
  "source-revision-not-ancestor":
    "The Own snapshot was built from a revision outside this branch's history; the owner or a maintainer must re-materialize it.",
  "context-dirty": "Leave the working tree clean (untracked files count), then record the context again.",
  "plan-grounding-stale":
    "The Atlas source changed after this plan revision; call maestro_catalog_context again and record a new plan revision.",
  "grounded-plan-required": "Record a new plan revision with verified Own unit IDs in units.",
  "territory-unavailable": "Use exact territory names from maestro_catalog_context.",
  "unit-unavailable": "Use exact unit IDs from maestro_catalog_context.",
}

export type AtlasSource = {
  readonly directory: string
  readonly identityHash: string
  readonly context: VerifiedHostContext
}

type SessionInput = Pick<Session.Info, "id" | "projectID" | "directory">
const gitHash = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

export const readAtlasSource = Effect.fn("Maestro.readAtlasSource")(
  function* (session: SessionInput) {
    const config = yield* Config.Service
    const git = yield* Git.Service
    const fs = yield* FileSystem.FileSystem
    const provider = (yield* config.get()).maestro?.atlas
    if (!provider) return yield* held("provider-unconfigured", [session.projectID])
    if (provider.projectID !== session.projectID) {
      return yield* held("provider-project-mismatch", [provider.projectID, session.projectID])
    }
    if (provider.directory !== "." && !canonicalPath(provider.directory)) {
      return yield* held("provider-path-invalid", [provider.directory])
    }
    const top = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: session.directory })
    if (top.exitCode !== 0 || top.truncated || !top.text().trim()) {
      return yield* held("repository-unavailable", [session.directory, top.stderr.toString()])
    }
    const repository = yield* fs.realPath(Filesystem.windowsPath(top.text().replace(/\r?\n$/, "")))
    const sessionDirectory = yield* fs.realPath(session.directory)
    if (sessionDirectory !== path.resolve(session.directory) || !inside(repository, sessionDirectory)) {
      return yield* held("session-directory-invalid", [session.directory, sessionDirectory, repository])
    }
    const directory = yield* fencedPath(repository, provider.directory, "Directory")
    const sourceDirectory = yield* fencedPath(repository, provider.sourceDirectory ?? ".", "Directory")
    const catalogContent = yield* readStatic(directory, "TERRITORY-CATALOG.json")
    const snapshotContent = yield* readStatic(directory, "OWN-SNAPSHOT.json")
    const catalog = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(catalogContent)
    if (Option.isNone(catalog)) return yield* held("catalog-json-invalid", [directory])
    const inspection = inspectOwnSnapshot(snapshotContent)
    if (inspection.status === "HOLD") {
      return yield* held(inspection.reason, [path.join(directory, "OWN-SNAPSHOT.json"), ...inspection.evidence])
    }
    const head = yield* git.run(["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repository })
    if (head.exitCode !== 0 || head.truncated || !gitHash.test(head.text().trim())) {
      return yield* held("repository-head-invalid", [repository])
    }
    const ancestor = yield* git.run(["merge-base", "--is-ancestor", inspection.sourceRevision, head.text().trim()], {
      cwd: repository,
    })
    if (ancestor.exitCode !== 0 || ancestor.truncated) {
      return yield* held("source-revision-not-ancestor", [inspection.sourceRevision, head.text().trim()])
    }
    const files = yield* Effect.forEach(inspection.artifactPaths, (file) =>
      readStatic(directory, file).pipe(Effect.map((content) => ({ path: file, content }))),
    )
    // Metadata and source roots are explicit, separate bindings; neither comes from model scope.
    const currentBlobs = Object.fromEntries(
      yield* Effect.forEach(inspection.sourcePaths, (file) => readBlob(sourceDirectory, file)),
    )
    const verified = verifyHostContext({
      projectId: session.projectID,
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
        if ((yield* readStatic(directory, file.path)) !== file.content) {
          return yield* held("static-data-changed-during-read", [file.path])
        }
      }),
    )
    yield* Effect.forEach(
      inspection.sourcePaths,
      Effect.fnUntraced(function* (file) {
        const blob = yield* readBlob(sourceDirectory, file)
        if (blob[1] !== currentBlobs[file]) return yield* held("source-changed-during-read", [file])
      }),
    )
    const currentHead = yield* git.run(["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repository })
    const currentProvider = (yield* config.get()).maestro?.atlas
    if (
      currentHead.exitCode !== 0 ||
      currentHead.truncated ||
      currentHead.text() !== head.text() ||
      currentProvider?.projectID !== provider.projectID ||
      currentProvider.directory !== provider.directory ||
      currentProvider.sourceDirectory !== provider.sourceDirectory ||
      (yield* fencedPath(repository, provider.directory, "Directory")) !== directory
    ) {
      return yield* held("provider-changed-during-read", [directory])
    }
    return {
      directory,
      identityHash: sha256(
        JSON.stringify({ directory, sourceDirectory, catalogContent, snapshotContent, files, currentBlobs }),
      ),
      context: verified.context,
    } satisfies AtlasSource
  },
  Effect.catch((error) => Effect.fail(normalizeError(error))),
  Effect.catchDefect((error) => Effect.fail(normalizeError(error))),
)

export const loadAtlasSkill = Effect.fn("Maestro.loadAtlasSkill")(
  function* (session: SessionInput, source: AtlasSource, unit: string) {
    const fresh = yield* readAtlasSource(session)
    if (fresh.identityHash !== source.identityHash || fresh.directory !== source.directory) {
      return yield* held("source-identity-changed", [source.identityHash, fresh.identityHash])
    }
    const matches = fresh.context.units.filter((candidate) => candidate.unit === unit)
    if (matches.length !== 1) return yield* held("unit-missing-or-ambiguous", [unit])
    const selected = matches[0]
    if (
      !Number.isSafeInteger(selected.tokenEstimate) ||
      selected.tokenEstimate < 0 ||
      selected.tokenEstimate > OWN_CAP ||
      selected.truncated !== false ||
      selected.pullReachable.length > 0 ||
      selected.advisoryDropped !== 0 ||
      selected.receipt.graphCoverage !== "COMPLETE"
    ) {
      return yield* held("unit-context-incomplete", [unit])
    }
    const fs = yield* FileSystem.FileSystem
    const skill = yield* Skill.Service
    const expected = yield* fencedPath(fresh.directory, selected.path, "File")
    const raw = yield* readStatic(fresh.directory, selected.path)
    if (raw !== selected.content) return yield* held("skill-bytes-changed", [expected])
    const parsed = yield* Effect.try({
      try: () => ConfigMarkdown.parse(raw),
      catch: (error) => normalizeError(error),
    })
    if (parsed.data.name !== selected.skillName) return yield* held("skill-name-mismatch", [expected])
    const loaded = yield* skill.require(selected.skillName)
    const location = yield* fs.realPath(loaded.location)
    if (location !== expected || path.resolve(loaded.location) !== expected) {
      return yield* held("skill-location-mismatch", [loaded.location, expected])
    }
    if (loaded.name !== selected.skillName || loaded.content !== parsed.content) {
      return yield* held("skill-cache-content-mismatch", [loaded.name, expected])
    }
    if ((yield* readStatic(fresh.directory, selected.path)) !== selected.content) {
      return yield* held("skill-bytes-changed", [expected])
    }
    const after = yield* readAtlasSource(session)
    if (after.directory !== fresh.directory || after.identityHash !== fresh.identityHash) {
      return yield* held("source-changed-during-load", [fresh.identityHash, after.identityHash])
    }
    return {
      unit,
      name: loaded.name,
      content: loaded.content,
      contentHash: selected.receipt.contentHash,
      receiptHash: sha256(stableJSON(selected.receipt)),
    }
  },
  Effect.catch((error) => Effect.fail(normalizeError(error))),
  Effect.catchDefect((error) => Effect.fail(normalizeError(error))),
)

export const loadAtlasSkills = Effect.fn("Maestro.loadAtlasSkills")(
  function* (session: SessionInput, source: AtlasSource, plan: ContextToolPlan) {
    if (plan.actor.projectId !== session.projectID || plan.actor.sessionId !== session.id) {
      return yield* held("plan-session-binding-mismatch", [
        plan.actor.projectId,
        plan.actor.sessionId,
        session.projectID,
        session.id,
      ])
    }
    const fresh = yield* readAtlasSource(session)
    if (fresh.directory !== source.directory || fresh.identityHash !== source.identityHash) {
      return yield* held("source-identity-changed", [source.identityHash, fresh.identityHash])
    }
    const compiled = compileContextToolPlan({
      actor: plan.actor,
      revision: { ...plan.planRevision, projectId: session.projectID, sessionId: session.id },
      territories: plan.territories,
      units: plan.actions.map((action) => action.unit),
      context: fresh.context,
    })
    if (compiled.status === "HOLD") return yield* held(compiled.reason, compiled.evidence)
    if (compiled.plan.hash !== plan.hash || stableJSON(compiled.plan) !== stableJSON(plan)) {
      return yield* held("context-tool-plan-changed", [plan.hash, compiled.plan.hash])
    }
    const rows = yield* Effect.forEach(
      plan.actions,
      Effect.fnUntraced(function* (action) {
        const loaded = yield* loadAtlasSkill(session, fresh, action.unit)
        if (
          loaded.name !== action.skillName ||
          loaded.contentHash !== action.contentHash ||
          loaded.receiptHash !== action.receiptHash
        ) {
          return yield* held("loaded-action-mismatch", [action.unit])
        }
        return loaded
      }),
    )
    const after = yield* readAtlasSource(session)
    if (after.directory !== fresh.directory || after.identityHash !== fresh.identityHash) {
      return yield* held("source-changed-during-load", [fresh.identityHash, after.identityHash])
    }
    return rows
  },
  Effect.catch((error) => Effect.fail(normalizeError(error))),
  Effect.catchDefect((error) => Effect.fail(normalizeError(error))),
)

const fencedPath = Effect.fn("Maestro.atlasFencedPath")(function* (
  root: string,
  relative: string,
  type: "File" | "Directory",
) {
  if (!(type === "Directory" && relative === ".") && !canonicalPath(relative)) {
    return yield* held("path-not-canonical", [relative])
  }
  const fs = yield* FileSystem.FileSystem
  const expected = path.resolve(root, relative)
  const actual = yield* fs.realPath(expected)
  if (!inside(root, actual) || actual !== expected) return yield* held("path-escape-or-alias", [relative, actual, root])
  if ((yield* fs.stat(actual)).type !== type) return yield* held("path-type-invalid", [relative, type])
  return actual
})

const readStatic = Effect.fn("Maestro.atlasReadStatic")(function* (root: string, relative: string) {
  const fs = yield* FileSystem.FileSystem
  const file = yield* fencedPath(root, relative, "File")
  const bytes = yield* fs.readFile(file)
  const content = Buffer.from(bytes).toString("utf8")
  if (!Buffer.from(content, "utf8").equals(Buffer.from(bytes))) return yield* held("static-encoding-invalid", [file])
  if ((yield* fencedPath(root, relative, "File")) !== file) return yield* held("path-changed-during-read", [file])
  return content
})

const readBlob = Effect.fn("Maestro.atlasReadBlob")(function* (repository: string, relative: string) {
  const git = yield* Git.Service
  const file = yield* fencedPath(repository, relative, "File")
  const result = yield* git.run(["hash-object", "--no-filters", "--", file], { cwd: repository })
  if (result.exitCode !== 0 || result.truncated || !gitHash.test(result.text().trim())) {
    return yield* held("source-blob-unavailable", [relative, result.stderr.toString()])
  }
  yield* fencedPath(repository, relative, "File")
  return [relative, result.text().trim()] as const
})

function canonicalPath(value: string) {
  return (
    typeof value === "string" &&
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
  return new AtlasContextHeld({ reason, evidence })
}

function normalizeError(error: unknown) {
  return error instanceof AtlasContextHeld ? error : held("atlas-source-unavailable", [String(error)])
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJSON(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}
