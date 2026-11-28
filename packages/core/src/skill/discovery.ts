export * as SkillDiscovery from "./discovery"

import path from "path"
import { Context, Effect, Layer, Schedule, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { FSUtil } from "../fs-util"
import { Global } from "../global"
import { makeGlobalNode } from "../effect/app-node"
import { httpClient } from "../effect/app-node-platform"
import { AbsolutePath } from "../schema"
import { collectBoundedBytes, collectBoundedResponseBody } from "../tool/http-body"
import { HttpRedirect } from "../tool/http-redirect"

const skillConcurrency = 4
const fileConcurrency = 8

// Sized from real skills: the largest file seen is 242 KB (an office schema) and the largest whole skill about
// 1.2 MB, so these leave about eight times the room. Cached and network chunks share one admitted-content budget.
export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_PULL_BYTES = 32 * 1024 * 1024
export const MAX_INDEX_BYTES = 1024 * 1024
const MAX_VERSION_BYTES = 4096

function isSafeSegment(value: string) {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  )
}

function isSafeRelativePath(value: string) {
  const segments = value.split("/")
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.includes("?") &&
    !value.includes("#") &&
    !URL.canParse(value) &&
    !path.posix.isAbsolute(value) &&
    !path.win32.isAbsolute(value) &&
    segments.every((segment) => {
      try {
        const decoded = decodeURIComponent(segment)
        return (
          decoded.length > 0 &&
          decoded !== "." &&
          decoded !== ".." &&
          !decoded.includes("/") &&
          !decoded.includes("\\") &&
          !decoded.includes("\0")
        )
      } catch {
        return false
      }
    })
  )
}

class IndexSkill extends Schema.Class<IndexSkill>("SkillDiscovery.IndexSkill")({
  name: Schema.String,
  version: Schema.optional(Schema.String),
  files: Schema.Array(Schema.String),
}) {}

class Index extends Schema.Class<Index>("SkillDiscovery.Index")({
  skills: Schema.Array(IndexSkill),
}) {}

const decodeIndex = Schema.decodeUnknownEffect(Schema.fromJsonString(Index))

export interface RemoteSkill {
  readonly directory: AbsolutePath
  readonly markdown: readonly { readonly filepath: string; readonly content: string }[]
}

export interface Interface {
  readonly pull: (url: string) => Effect.Effect<readonly RemoteSkill[]>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SkillDiscovery") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const http = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient({
        retryOn: "errors-and-responses",
        times: 2,
        schedule: Schedule.exponential(200).pipe(Schedule.jittered),
      }),
    )

    // Redirects are followed by hand, so a catalog cannot send a download to a local or private address, and the
    // body is read with a cap, so a catalog cannot fill the disk. This path keeps the generic follow seam: the
    // webfetch tool is the enforced caller through followGuarded; discovery stays preflight-only (no regression).
    const get = (url: string, limit: number, tooLarge: () => Error, charge?: (bytes: number) => Error | undefined) =>
      HttpRedirect.follow(http, HttpClientRequest.get(url)).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => collectBoundedResponseBody(response, limit, tooLarge, charge)),
        // One deadline covers redirects, the existing retries, and complete body consumption.
        Effect.timeoutOrElse({ duration: 10_000, orElse: () => Effect.fail(new Error("Skill request timed out")) }),
      )

    const read = Effect.fn("SkillDiscovery.read")(function* (
      filename: string,
      limit: number,
      tooLarge: () => Error,
      charge?: (bytes: number) => Error | undefined,
    ) {
      const info = yield* fs.stat(filename)
      if (info.type !== "File" || info.size > BigInt(limit)) return yield* Effect.fail(tooLarge())
      return yield* collectBoundedBytes(fs.stream(filename, { bytesToRead: limit + 1 }), limit, tooLarge, charge)
    })

    const download = Effect.fn("SkillDiscovery.download")(function* (
      url: string,
      destination: string,
      charge: (bytes: number) => Error | undefined,
    ) {
      const tooLarge = () => new Error(`Skill file exceeds the ${MAX_FILE_BYTES} byte file limit`)
      const cached = yield* read(destination, MAX_FILE_BYTES, tooLarge, charge).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
      )
      if (cached !== undefined) return cached
      const body = yield* get(url, MAX_FILE_BYTES, tooLarge, charge)
      yield* fs.writeWithDirs(destination, body)
      return body
    })

    return Service.of({
      pull: Effect.fn("SkillDiscovery.pull")(
        function* (url) {
          const base = url.endsWith("/") ? url : `${url}/`
          const source = new URL(base)
          const index = new URL("index.json", source).href
          const pulled = { bytes: 0 }
          const charge = (bytes: number) => {
            if (pulled.bytes + bytes > MAX_PULL_BYTES)
              return new Error(`Skill pull exceeds the ${MAX_PULL_BYTES} byte limit`)
            // No suspension between this check and debit, across every concurrent HTTP/cache collector.
            pulled.bytes += bytes
          }
          const data = yield* get(
            index,
            MAX_INDEX_BYTES,
            () => new Error(`Skill index exceeds the ${MAX_INDEX_BYTES} byte limit`),
          ).pipe(
            Effect.flatMap((body) => decodeIndex(new TextDecoder().decode(body))),
            Effect.catch((error) =>
              Effect.logError("failed to fetch skill index", { url: index, error }).pipe(Effect.as(undefined)),
            ),
          )
          if (!data) return []
          // Count the entire decoded index, including entries that path validation would later discard.
          if (
            data.skills.length > 128 ||
            data.skills.some((skill) => skill.files.length > 256) ||
            data.skills.reduce((count, skill) => count + skill.files.length, 0) > 4096
          )
            return []

          const sourceRoot = path.resolve(global.cache, "skills", Bun.hash(base).toString(16))
          return yield* Effect.forEach(
            data.skills.flatMap((skill) => {
              if (skill.version !== undefined && Buffer.byteLength(skill.version, "utf8") > MAX_VERSION_BYTES) return []
              if (!isSafeSegment(skill.name)) {
                return []
              }
              if (!skill.files.includes("SKILL.md") && !skill.files.includes(`${skill.name}.md`)) {
                return []
              }

              const root = path.resolve(sourceRoot, skill.name)
              if (!FSUtil.contains(sourceRoot, root) || root === sourceRoot) {
                return []
              }

              const skillUrl = new URL(`${encodeURIComponent(skill.name)}/`, source)
              const versionFile = path.join(root, ".orchestra-version")
              const files = skill.files.map((file) => {
                if (!isSafeRelativePath(file)) return undefined
                let resource: URL
                try {
                  resource = new URL(file, skillUrl)
                } catch {
                  return undefined
                }
                if (resource.origin !== source.origin) return undefined

                const destination = path.resolve(root, file)
                if (!FSUtil.contains(root, destination) || destination === root) return undefined
                return {
                  url: resource.href,
                  destination,
                  file,
                }
              })
              if (files.some((file) => file === undefined)) {
                return []
              }
              return [{ skill, root, versionFile, files: files.filter((file) => file !== undefined) }]
            }),
            ({ skill, root, versionFile, files }) =>
              Effect.gen(function* () {
                const version = skill.version
                const current =
                  version === undefined
                    ? undefined
                    : yield* read(
                        versionFile,
                        MAX_VERSION_BYTES,
                        () => new Error("Skill version marker exceeds its byte limit"),
                      ).pipe(
                        Effect.map((body) => new TextDecoder().decode(body)),
                        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
                      )
                const acquire = (directory: string) =>
                  Effect.gen(function* () {
                    const acquired = yield* Effect.forEach(
                      files,
                      (file) =>
                        download(file.url, path.resolve(directory, file.file), charge).pipe(
                          Effect.map((body) => ({ file, body })),
                          Effect.catch((error) =>
                            Effect.logError("failed to download skill file", { url: file.url, error }).pipe(
                              Effect.as(undefined),
                            ),
                          ),
                        ),
                      { concurrency: fileConcurrency },
                    )
                    if (acquired.some((file) => file === undefined))
                      return yield* Effect.fail(new Error("Skill files are incomplete"))
                    return acquired.flatMap((item) =>
                      item !== undefined && fs.globMatch("{*.md,**/SKILL.md}", item.file.file)
                        ? [{ filepath: item.file.destination, content: new TextDecoder().decode(item.body) }]
                        : [],
                    )
                  })
                if (version === undefined || current === version) {
                  const markdown = yield* acquire(root)
                  return [{ directory: AbsolutePath.make(root), markdown }]
                }
                const token = crypto.randomUUID()
                const staging = `${root}.tmp-${token}`
                const backup = `${root}.old-${token}`
                return yield* Effect.gen(function* () {
                  const markdown = yield* acquire(staging)
                  yield* fs.writeFileString(path.join(staging, ".orchestra-version"), version)
                  yield* Effect.uninterruptible(
                    Effect.gen(function* () {
                      const cached = yield* fs.exists(root)
                      if (cached) yield* fs.rename(root, backup)
                      yield* fs.rename(staging, root).pipe(
                        Effect.catch((error) =>
                          Effect.gen(function* () {
                            if (cached) yield* fs.rename(backup, root).pipe(Effect.ignore)
                            return yield* Effect.fail(error)
                          }),
                        ),
                      )
                      if (cached) yield* fs.remove(backup, { recursive: true, force: true }).pipe(Effect.ignore)
                    }),
                  )
                  return [{ directory: AbsolutePath.make(root), markdown }]
                }).pipe(Effect.ensuring(fs.remove(staging, { recursive: true, force: true }).pipe(Effect.ignore)))
              }).pipe(
                Effect.catch((error) =>
                  Effect.logError("failed to acquire skill", { skill: skill.name, error }).pipe(Effect.as([])),
                ),
              ),
            { concurrency: skillConcurrency },
          ).pipe(Effect.map((directories) => directories.flat()))
        },
        Effect.timeoutOrElse({ duration: 60_000, orElse: () => Effect.succeed([]) }),
      ),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [httpClient, FSUtil.node, Global.node] })
