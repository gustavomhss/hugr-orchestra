export * as AtlasRestore from "./atlas-restore"

import { Effect, Layer, Option, Schema } from "effect"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionV2 } from "@orchestra/core/session"
import { SessionStore } from "@orchestra/core/session/store"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { SystemContext } from "@orchestra/core/system-context"
import { Config } from "@orchestra/core/config"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"
import { SkillV2 } from "@orchestra/core/skill"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { createHash } from "node:crypto"
import path from "node:path"
import { Buffer } from "node:buffer"
import { inspectOwnSnapshot, verifyHostContext } from "@orchestra/atlas-boundary"
import { SessionSchema } from "@orchestra/core/session"

const makeLayer = Effect.gen(function* () {
  const registry = yield* SystemContextRegistry.Service
  const sessions = yield* SessionV2.Service
  const store = yield* SessionStore.Service
  const config = yield* Config.Service
  const appProcess = yield* AppProcess.Service
  const fsUtil = yield* FSUtil.Service
  const skills = yield* SkillV2.Service

  const loadAtlasMemory = Effect.fn("AtlasMemorySource.load")(function* (input: { sessionID: string }) {
    const session = yield* sessions.get(SessionSchema.ID.make(input.sessionID)).pipe(Effect.orDie)
    const sessionInfo = yield* store.get(session.id)
    if (!sessionInfo) {
      return SystemContext.empty
    }

    const sessionData = {
      id: sessionInfo.id,
      projectID: sessionInfo.projectID,
      directory: sessionInfo.location.directory,
    }

    const source = yield* readAtlasSource(sessionData, appProcess, fsUtil, config).pipe(
      Effect.catch(() => Effect.succeed(null)),
    )

    if (!source) {
      return SystemContext.empty
    }

    // Return Atlas memory as a system context source
    const text = [
      "## Atlas Memory (persisted across compaction)",
      "",
      `Project: ${sessionInfo.projectID}`,
      `Source: ${source.identityHash.slice(0, 16)}`,
      `Revision: ${source.context.sourceRevision.slice(0, 12)}`,
      `Catalog Version: ${source.context.catalogVersion}`,
      "",
      "### Territories",
      source.context.territories.map((t: any) =>
        `- ${t.name} (owner: ${t.owner}, tier: ${t.tier})`
      ).join("\n") || "(none)",
      "",
      "### Units",
      source.context.units.map((u: any) =>
        `- ${u.unit} (${u.skillName}, ${u.receipt.graphCoverage}, ~${u.tokenEstimate} tokens)`
      ).join("\n") || "(none)",
      "",
      "This context survives compaction and is restored on resume.",
    ].join("\n")

    return SystemContext.make({
      key: SystemContext.Key.make("maestro/atlas-memory"),
      codec: Schema.toCodecJson(Schema.String),
      load: Effect.succeed(text),
      baseline: (text) => text,
      update: (_prev, text) => text,
    })
  })

  yield* registry.register({
    key: SystemContext.Key.make("maestro/atlas-memory"),
    load: loadAtlasMemory as unknown as Effect.Effect<SystemContext.SystemContext>,
  })
  yield* Effect.logInfo("Atlas restore integration registered: Atlas memory source registered for compaction survival")
})

export const node = makeLocationNode({
  name: "maestro/atlas-restore",
  layer: Layer.effectDiscard(makeLayer),
  deps: [
    SessionCompaction.node,
    SessionV2.node,
    SessionStore.node,
    SystemContextRegistry.node,
    Config.node,
    AppProcess.node,
    FSUtil.node,
    SkillV2.node,
  ] as const,
})

const readAtlasSource = Effect.fn("Maestro.readAtlasSource")(
  function* (session: { id: string; projectID: string; directory: string }, appProcess: any, fsUtil: any, config: any) {
    const provider = (yield* config.get()).maestro?.atlas
    if (!provider) return yield* Effect.fail(new Error("provider-unconfigured"))
    if (provider.projectID !== session.projectID) {
      return yield* Effect.fail(new Error("provider-project-mismatch"))
    }
    if (provider.directory !== "." && !canonicalPath(provider.directory)) {
      return yield* Effect.fail(new Error("provider-path-invalid"))
    }
    const top = yield* gitRun(appProcess, ["rev-parse", "--show-toplevel"], session.directory)
    if (top.exitCode !== 0 || top.truncated || !top.text().trim()) {
      return yield* Effect.fail(new Error("repository-unavailable"))
    }
    const repository = yield* fsUtil.realPath(windowsPath(top.text().replace(/\r?\n$/, "")))
    const sessionDirectory = yield* fsUtil.realPath(session.directory)
    if (sessionDirectory !== session.directory) {
      return yield* Effect.fail(new Error("session-directory-invalid"))
    }
    const directory = yield* fencedPath(fsUtil, repository, provider.directory, "Directory")
    const sourceDirectory = yield* fencedPath(fsUtil, repository, provider.sourceDirectory ?? ".", "Directory")
    const catalogContent = yield* readStatic(fsUtil, directory, "TERRITORY-CATALOG.json")
    const snapshotContent = yield* readStatic(fsUtil, directory, "OWN-SNAPSHOT.json")
    const catalog = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(catalogContent)
    if (Option.isNone(catalog)) return yield* Effect.fail(new Error("catalog-json-invalid"))
    const inspection = inspectOwnSnapshot(snapshotContent)
    if (inspection.status === "HOLD") {
      return yield* Effect.fail(new Error(inspection.reason))
    }
    const head = yield* gitRun(appProcess, ["rev-parse", "--verify", "HEAD^{commit}"], repository)
    if (head.exitCode !== 0 || head.truncated || !gitHash.test(head.text().trim())) {
      return yield* Effect.fail(new Error("repository-head-invalid"))
    }
    const ancestor = yield* gitRun(appProcess, ["merge-base", "--is-ancestor", inspection.sourceRevision, head.text().trim()], repository)
    if (ancestor.exitCode !== 0 || ancestor.truncated) {
      return yield* Effect.fail(new Error("source-revision-not-ancestor"))
    }
    const files = yield* Effect.forEach(inspection.artifactPaths, (file) =>
      readStatic(fsUtil, directory, file).pipe(Effect.map((content) => ({ path: file, content }))),
    )
    const currentBlobs = Object.fromEntries(
      yield* Effect.forEach(inspection.sourcePaths, (file) => readBlob(appProcess, fsUtil, sourceDirectory, file)),
    )
    const verified = verifyHostContext({
      projectId: session.projectID,
      catalog: catalog.value,
      snapshotContent,
      files,
      currentBlobs,
    })
    if (verified.status === "HOLD") return yield* Effect.fail(new Error(verified.reason))
    if (!verified.context.units.length) return yield* Effect.fail(new Error("context-empty"))
    yield* Effect.forEach(
      [
        { path: "TERRITORY-CATALOG.json", content: catalogContent },
        { path: "OWN-SNAPSHOT.json", content: snapshotContent },
        ...files,
      ],
      Effect.fnUntraced(function* (file) {
        if ((yield* readStatic(fsUtil, directory, file.path)) !== file.content) {
          return yield* Effect.fail(new Error("static-data-changed-during-read"))
        }
      }),
    )
    yield* Effect.forEach(
      inspection.sourcePaths,
      Effect.fnUntraced(function* (file) {
        const blob = yield* readBlob(appProcess, fsUtil, sourceDirectory, file)
        if (blob[1] !== currentBlobs[file]) return yield* Effect.fail(new Error("source-changed-during-read"))
      }),
    )
    const currentHead = yield* gitRun(appProcess, ["rev-parse", "--verify", "HEAD^{commit}"], repository)
    const currentProvider = (yield* config.get()).maestro?.atlas
    if (
      currentHead.exitCode !== 0 ||
      currentHead.truncated ||
      currentHead.text() !== head.text() ||
      currentProvider?.projectID !== provider.projectID ||
      currentProvider.directory !== provider.directory ||
      currentProvider.sourceDirectory !== provider.sourceDirectory ||
      (yield* fencedPath(fsUtil, repository, provider.directory, "Directory")) !== directory
    ) {
      return yield* Effect.fail(new Error("provider-changed-during-read"))
    }
    return {
      directory,
      identityHash: sha256(
        JSON.stringify({ directory, sourceDirectory, catalogContent, snapshotContent, files, currentBlobs }),
      ),
      context: verified.context,
    }
  },
  Effect.catch((error) => Effect.fail(normalizeError(error))),
  Effect.catchDefect((error) => Effect.fail(normalizeError(error))),
)

const fencedPath = Effect.fn("Maestro.atlasFencedPath")(function* (
  fsUtil: any,
  root: string,
  relative: string,
  type: "File" | "Directory",
) {
  if (!(type === "Directory" && relative === ".") && !canonicalPath(relative)) {
    return yield* Effect.fail(new Error("path-not-canonical"))
  }
  const expected = path.resolve(root, relative)
  const actual = yield* fsUtil.realPath(expected)
  if (!inside(root, actual) || actual !== expected) return yield* Effect.fail(new Error("path-escape-or-alias"))
  if ((yield* fsUtil.stat(actual)).type !== type) return yield* Effect.fail(new Error("path-type-invalid"))
  return actual
})

const readStatic = Effect.fn("Maestro.atlasReadStatic")(function* (fsUtil: any, root: string, relative: string) {
  const file = yield* fencedPath(fsUtil, root, relative, "File")
  const bytes = yield* fsUtil.readFile(file)
  const content = Buffer.from(bytes).toString("utf8")
  if (!Buffer.from(content, "utf8").equals(Buffer.from(bytes))) return yield* Effect.fail(new Error("static-encoding-invalid"))
  if ((yield* fencedPath(fsUtil, root, relative, "File")) !== file) return yield* Effect.fail(new Error("path-changed-during-read"))
  return content
})

const readBlob = Effect.fn("Maestro.atlasReadBlob")(function* (appProcess: any, fsUtil: any, repository: string, relative: string) {
  const file = yield* fencedPath(fsUtil, repository, relative, "File")
  const result = yield* gitRun(appProcess, ["hash-object", "--no-filters", "--", file], repository)
  if (result.exitCode !== 0 || result.truncated || !gitHash.test(result.text().trim())) {
    return yield* Effect.fail(new Error("source-blob-unavailable"))
  }
  yield* fencedPath(fsUtil, repository, relative, "File")
  return [relative, result.text().trim()] as const
})

const gitRun = Effect.fn("Maestro.gitRun")(function* (appProcess: any, args: string[], cwd: string) {
  const result = yield* appProcess.run(
    { command: "git", args },
    { cwd, extendEnv: true, stdin: "ignore" },
  ).pipe(Effect.catch(() => Effect.succeed({ exitCode: 1, text: () => "", stdout: Buffer.alloc(0), stderr: Buffer.from(""), truncated: false })))
  return {
    exitCode: result.exitCode,
    text: () => result.stdout.toString("utf8"),
    stderr: () => result.stderr.toString("utf8"),
    truncated: result.truncated,
  }
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

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error("atlas-source-unavailable")
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function windowsPath(p: string): string {
  if (process.platform !== "win32") return p
  return (
    p
      .replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/cygdrive\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
  )
}

const gitHash = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/