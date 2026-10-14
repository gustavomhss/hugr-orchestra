export * as FileSystemSearch from "./search"

import { makeLocationNode } from "../effect/app-node"
import path from "path"
import { Context, Deferred, Effect, Exit, Layer, Schema, Scope } from "effect"
import { Fff } from "#fff"
import fuzzysort from "fuzzysort"
import { FileSystem } from "../filesystem"
import { FSUtil } from "../fs-util"
import { Location } from "../location"
import { Ripgrep } from "../ripgrep"
import { RelativePath } from "../schema"
import { Flag } from "../flag/flag"

/** A search that could not run, with ripgrep's reason (missing, still downloading, an invalid pattern). */
export class SearchError extends Schema.TaggedErrorClass<SearchError>()("FileSystem.SearchError", {
  message: Schema.String,
}) {}

export interface Interface {
  readonly find: (input: FileSystem.FindInput) => Effect.Effect<FileSystem.Entry[], SearchError>
  readonly glob: (input: FileSystem.GlobInput) => Effect.Effect<readonly FileSystem.Entry[], SearchError>
  readonly grep: (input: FileSystem.GrepInput) => Effect.Effect<readonly FileSystem.Match[], SearchError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/FileSystem/Search") {}

const searchError = (error: { readonly message: string }) => new SearchError({ message: error.message })

export const ripgrepLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const ripgrep = yield* Ripgrep.Service
    const scope = yield* Scope.Scope
    const state = {
      files: [] as string[],
      directories: [] as string[],
      index: Deferred.makeUnsafe<void, SearchError>(),
    }

    // Builds the file index in the background, so opening a Location never waits for ripgrep. The check and the
    // registration are one synchronous step, so concurrent callers share one scan.
    const start = () => {
      const done = Deferred.makeUnsafe<void, SearchError>()
      state.index = done
      const files: string[] = []
      const directories = new Set<string>()
      return ripgrep
        .find({
          cwd: location.directory,
          pattern: "*",
          limit: location.vcs ? Number.MAX_SAFE_INTEGER : 100_000,
          onEntry: (entry) =>
            Effect.sync(() => {
              files.push(entry.path)
              const parts = entry.path.split("/")
              parts.slice(0, -1).forEach((_, index) => directories.add(parts.slice(0, index + 1).join("/") + path.sep))
            }),
        })
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              state.files = files
              state.directories = Array.from(directories)
            }),
          ),
          Effect.asVoid,
          Effect.mapError(searchError),
          Effect.tapError((error) => Effect.logWarning("failed to index files with ripgrep", { error: error.message })),
          Effect.exit,
          Effect.flatMap((exit) => Deferred.done(done, exit)),
          Effect.forkIn(scope),
          Effect.as(done),
        )
    }
    yield* start()

    // Waits for the index. A failed index is rebuilt once per call, so find recovers when ripgrep becomes available
    // (ripgrep's own cooldown keeps a failing rebuild cheap); if it still fails, find fails with the reason.
    const indexed = Effect.gen(function* () {
      const attempt = state.index
      const first = yield* Effect.exit(Deferred.await(attempt))
      if (Exit.isSuccess(first)) return
      const retry = yield* Effect.suspend(() => (state.index === attempt ? start() : Effect.succeed(state.index)))
      yield* Deferred.await(retry)
    })

    return Service.of({
      glob: (input) =>
        Effect.gen(function* () {
          const target = path.resolve(location.directory, input.path ?? ".")
          const info = yield* fs.stat(target).pipe(Effect.orDie)
          const cwd = info.type === "File" ? path.dirname(target) : target
          return yield* ripgrep
            .glob({
              cwd,
              pattern: input.pattern,
              limit: input.limit ?? Number.MAX_SAFE_INTEGER,
            })
            .pipe(
              Effect.map((result) =>
                result.map((entry) =>
                  FileSystem.Entry.make({
                    ...entry,
                    path: RelativePath.make(path.relative(location.directory, path.resolve(cwd, entry.path))),
                  }),
                ),
              ),
              Effect.mapError(searchError),
            )
        }),
      grep: (input) =>
        Effect.gen(function* () {
          const target = path.resolve(location.directory, input.path ?? ".")
          const info = yield* fs.stat(target).pipe(Effect.orDie)
          const cwd = info.type === "File" ? path.dirname(target) : target
          return yield* ripgrep
            .grep({
              cwd,
              pattern: input.pattern,
              file: info.type === "File" ? path.basename(target) : undefined,
              include: input.include,
              limit: input.limit ?? Number.MAX_SAFE_INTEGER,
            })
            .pipe(
              Effect.map((result) =>
                result.map((match) =>
                  FileSystem.Match.make({
                    ...match,
                    entry: FileSystem.Entry.make({
                      ...match.entry,
                      path: RelativePath.make(path.relative(location.directory, path.resolve(cwd, match.entry.path))),
                    }),
                  }),
                ),
              ),
              Effect.mapError(searchError),
            )
        }),
      find: (input) =>
        Effect.gen(function* () {
          yield* indexed
          const items =
            input.type === "file"
              ? state.files
              : input.type === "directory"
                ? state.directories
                : [...state.files, ...state.directories]
          return fuzzysort.go(input.query, items, { limit: input.limit ?? 50 }).map((item) => {
            const relative = item.target
            const type = relative.endsWith(path.sep) ? ("directory" as const) : ("file" as const)
            return FileSystem.Entry.make({
              path: RelativePath.make(relative),
              type,
            })
          })
        }),
    })
  }),
)

export const fffLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const result = yield* Effect.try({
      try: () =>
        Fff.create({
          basePath: location.directory,
          aiMode: true,
          disableMmapCache: true,
          disableContentIndexing: true,
        }),
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((error) => Effect.logWarning("failed to initialize fff", { error }).pipe(Effect.as(undefined))),
    )
    if (!result?.ok) {
      if (result) yield* Effect.logWarning("failed to initialize fff", { error: result.error })
      return Service.of({
        find: () => Effect.succeed([]),
        glob: () => Effect.succeed([]),
        grep: () => Effect.succeed([]),
      })
    }
    yield* Effect.addFinalizer(() => Effect.sync(() => result.value.destroy()).pipe(Effect.ignore))
    return Service.of({
      glob: (input) =>
        Effect.sync(() => {
          const prefix = input.path?.replaceAll("\\", "/").replace(/\/$/, "")
          const found = result.value.glob(prefix ? `${prefix}/${input.pattern}` : input.pattern, {
            pageIndex: 0,
            pageSize: input.limit,
          })
          if (!found.ok) throw found.error
          return found.value.items.map((item) =>
            FileSystem.Entry.make({
              path: RelativePath.make(item.relativePath.replaceAll("\\", "/")),
              type: "file",
            }),
          )
        }),
      grep: (input) =>
        Effect.sync(() => {
          const prefix = input.path?.replaceAll("\\", "/").replace(/\/$/, "")
          const found = result.value.grep(
            [prefix ? `${prefix}/**` : undefined, input.include, input.pattern]
              .filter((value) => value !== undefined)
              .join(" "),
            { mode: "regex", pageSize: input.limit, timeBudgetMs: 1_500 },
          )
          if (!found.ok) throw found.error
          return found.value.items.map((match) => {
            const bytes = Buffer.from(match.lineContent)
            return FileSystem.Match.make({
              entry: FileSystem.Entry.make({
                path: RelativePath.make(match.relativePath.replaceAll("\\", "/")),
                type: "file",
              }),
              line: match.lineNumber,
              offset: match.byteOffset,
              text: match.lineContent.length > 2_000 ? match.lineContent.slice(0, 2_000) + "..." : match.lineContent,
              submatches: match.matchRanges.map(([start, end]) => ({
                text: bytes.subarray(start, end).toString("utf8"),
                start,
                end,
              })),
            })
          })
        }),
      find: (input) =>
        Effect.sync(() => {
          const options = { pageIndex: 0, pageSize: input.limit ?? 50 }
          const items = (() => {
            if (input.type === "file") {
              const found = result.value.fileSearch(input.query.trim(), options)
              if (!found.ok) throw found.error
              return found.value.items.map((item, index) => ({
                path: item.relativePath,
                type: "file" as const,
                score: found.value.scores[index]?.total ?? 0,
              }))
            }
            if (input.type === "directory") {
              const found = result.value.directorySearch(input.query.trim(), options)
              if (!found.ok) throw found.error
              return found.value.items.map((item, index) => ({
                path: item.relativePath,
                type: "directory" as const,
                score: found.value.scores[index]?.total ?? 0,
              }))
            }
            const found = result.value.mixedSearch(input.query.trim(), options)
            if (!found.ok) throw found.error
            return found.value.items.map((item, index) => ({
              path: item.item.relativePath,
              type: item.type,
              score: found.value.scores[index]?.total ?? 0,
            }))
          })()
          return items
            .sort((a, b) => b.score - a.score || a.path.length - b.path.length)
            .map((item) => {
              const relative = item.path.replaceAll("\\", "/").replace(/\/$/, "")
              return FileSystem.Entry.make({
                path: RelativePath.make(relative + (item.type === "directory" ? path.sep : "")),
                type: item.type,
              })
            })
        }),
    })
  }),
)

const layer = Layer.unwrap(Effect.sync(() => (Flag.ORCHESTRA_DISABLE_FFF || !Fff.available() ? ripgrepLayer : fffLayer)))

export const locationLayer = layer

export const node = makeLocationNode({ service: Service, layer, deps: [FSUtil.node, Location.node, Ripgrep.node] })
