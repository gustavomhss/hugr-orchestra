export * as InstructionContext from "./instruction-context"

import { Array, Effect, Layer, Schema } from "effect"
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "path"
import { Config } from "./config"
import { FSUtil } from "./fs-util"
import { Flag } from "./flag/flag"
import { Global } from "./global"
import { Location } from "./location"
import { AbsolutePath } from "./schema"
import { SystemContext } from "./system-context/index"
import { SystemContextRegistry } from "./system-context/registry"
import { makeLocationNode } from "./effect/app-node"

class File extends Schema.Class<File>("InstructionContext.File")({
  path: AbsolutePath,
  content: Schema.String,
}) {}

const Files = Schema.Array(File)
const key = SystemContext.Key.make("core/instructions")

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const config = yield* Config.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service

    const source = (value: ReadonlyArray<File> | SystemContext.Unavailable) =>
      SystemContext.make({
        key,
        codec: Schema.toCodecJson(Files),
        load: Effect.succeed(value),
        baseline: render,
        update: (_previous, current) =>
          `These instructions replace all previously loaded ambient instructions.\n\n${render(current)}`,
        removed: () => "Previously loaded instructions no longer apply.",
      })

    // `instructions` lists local files, relative to the config file that names them. A project file may only name files
    // inside the project: a cloned repository must not be able to pull arbitrary host files into the model context.
    const configuredInstructions = Effect.gen(function* () {
      const documents = (yield* config.entries()).filter((entry): entry is Config.Document => entry.type === "document")
      const project = yield* fs.resolve(location.project.directory)
      const resolved = (yield* Effect.forEach(
        documents.flatMap((document) => (document.info.instructions ?? []).map((entry) => ({ document, entry }))),
        ({ document, entry }) =>
          Effect.gen(function* () {
            const base = dirname(document.path ?? global.config)
            const isGlobal = contains(global.config, base)
            const home = entry === "~" || entry.startsWith("~/")
            const pattern = home ? join(global.home, entry.slice(1)) : resolve(base, entry)
            // A glob names whatever matches now; a plain path stays listed so a missing file is reported, not skipped.
            const targets = /[*?[{]/.test(entry)
              ? yield* Effect.promise(() => Array.fromAsync(new Bun.Glob(relative(parse(pattern).root, pattern)).scan({ cwd: parse(pattern).root, absolute: true, onlyFiles: true, dot: true }))).pipe(
                  Effect.map((matches) => matches.toSorted()),
                  Effect.orElseSucceed(() => []),
                )
              : [pattern]
            return yield* Effect.forEach(targets, (target) =>
              fs.resolve(target).pipe(Effect.map((resolved) => ({ path: resolved, allowed: isGlobal || contains(project, resolved) }))),
            )
          }),
      )).flat()
      // A project instruction that escapes the project makes the whole context unavailable, so it fails closed.
      return {
        paths: Array.dedupe(resolved.filter((item) => item.allowed).map((item) => item.path)),
        escaped: resolved.some((item) => !item.allowed),
      }
    })

    const observe = Effect.fn("InstructionContext.observe")(function* () {
      const start = yield* fs.resolve(location.directory)
      const stop = yield* fs.resolve(location.project.directory)
      const fromProject = relative(stop, start)
      const insideProject =
        fromProject === "" || (fromProject !== ".." && !fromProject.startsWith(`..${sep}`) && !isAbsolute(fromProject))
      const discovered = new Set(
        yield* Effect.forEach(
          Flag.ORCHESTRA_DISABLE_PROJECT_CONFIG || !insideProject
            ? []
            : yield* fs.up({
                targets: ["AGENTS.md"],
                start,
                stop,
              }),
          fs.resolve,
        ),
      )
      const configured = yield* configuredInstructions
      const paths = Array.dedupe([yield* fs.resolve(join(global.config, "AGENTS.md")), ...discovered, ...configured.paths])
      const files = yield* Effect.forEach(
        paths,
        (path) =>
          fs
            .readFileStringSafe(path)
            .pipe(
              Effect.map((content) =>
                content === undefined ? undefined : new File({ path: AbsolutePath.make(path), content }),
              ),
            ),
        { concurrency: "unbounded" },
      )
      if (configured.escaped) return SystemContext.unavailable
      if (files.some((file, index) => file === undefined && (discovered.has(paths[index]) || configured.paths.includes(paths[index]))))
        return SystemContext.unavailable
      return files.filter((file): file is File => file !== undefined)
    })

    yield* registry.register({
      key,
      load: observe().pipe(
        Effect.map((files) =>
          files === SystemContext.unavailable
            ? source(files)
            : files.length === 0
              ? SystemContext.empty
              : source(files),
        ),
        Effect.catch(() => Effect.succeed(source(SystemContext.unavailable))),
        Effect.catchDefect(() => Effect.succeed(source(SystemContext.unavailable))),
      ),
    })
  }),
)

export const node = makeLocationNode({
  name: "instruction-context",
  layer,
  deps: [Config.node, FSUtil.node, Global.node, Location.node, SystemContextRegistry.node],
})

function render(files: ReadonlyArray<File>) {
  return files.map((file) => `Instructions from: ${file.path}\n${file.content}`).join("\n\n")
}

function contains(parent: string, child: string) {
  const path = relative(parent, child)
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}
