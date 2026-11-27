export * as InstructionContext from "./instruction-context"

import { Array, Effect, Layer, Option, Schema } from "effect"
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from "path"
import { Config } from "./config"
import { ConfigMarkdown } from "./config/markdown"
import { FSUtil } from "./fs-util"
import { Flag } from "./flag/flag"
import { Global } from "./global"
import { Location } from "./location"
import { Project } from "./project"
import { AbsolutePath } from "./schema"
import { SystemContext } from "./system-context/index"
import { SystemContextRegistry } from "./system-context/registry"
import { makeLocationNode } from "./effect/app-node"

class File extends Schema.Class<File>("InstructionContext.File")({
  path: AbsolutePath,
  content: Schema.String,
  agentsAlias: Schema.optional(Schema.Literal(true)),
  nativePaths: Schema.optional(Schema.Array(AbsolutePath)),
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
              ? yield* Effect.promise(async () => {
                  // Scan from the deepest literal directory, never from the filesystem root.
                  const segments = pattern.split(sep)
                  const literal = segments.findIndex((segment) => /[*?[{]/.test(segment))
                  const root = segments.slice(0, literal).join(sep) || parse(pattern).root
                  const matches: string[] = []
                  for await (const match of new Bun.Glob(segments.slice(literal).join("/")).scan({ cwd: root, absolute: true, onlyFiles: true, dot: true }))
                    matches.push(match)
                  return matches
                }).pipe(
                  Effect.map((matches) => matches.toSorted()),
                  Effect.orElseSucceed(() => []),
                )
              : [pattern]
            return yield* Effect.forEach(targets, (target) =>
              fs.resolve(target).pipe(Effect.map((resolved) => ({
                path: resolved,
                target,
                allowed: isGlobal || contains(project, resolved),
                agents: basename(target) === "AGENTS.md",
              }))),
            )
          }),
      )).flat()
      // A project instruction that escapes the project makes the whole context unavailable, so it fails closed.
      return {
        paths: Array.dedupe(resolved.filter((item) => item.allowed).map((item) => item.path)),
        escaped: resolved.some((item) => !item.allowed),
        agents: resolved.filter((item) => item.allowed && item.agents).map((item) => item.path),
        aliases: resolved.filter((item) => item.allowed && item.path !== item.target),
      }
    })

    const observe = Effect.fn("InstructionContext.observe")(function* () {
      const start = yield* fs.resolve(location.directory)
      const stop = yield* fs.resolve(location.project.directory)
      const turn = yield* SystemContextRegistry.Turn
      const insideProject = contains(stop, start)
      const importRoot = insideProject && !Project.isRoot(stop) ? stop : start
      const discoveryStop = turn?.hosted ? importRoot : stop
      const discoveredFiles = yield* Effect.forEach(
        Flag.ORCHESTRA_DISABLE_PROJECT_CONFIG || !insideProject ? [] : yield* fs.up({ targets: ["AGENTS.md"], start, stop: discoveryStop }),
        (target) => fs.resolve(target).pipe(Effect.map((path) => ({ path, target }))),
      ).pipe(
        // Discovery finds lexical names; ignore tracked symlinks to host files before any content is read.
        Effect.map((files) => files.filter((file) => contains(discoveryStop, file.path))),
      )
      const discovered = new Set(discoveredFiles.map((file) => file.path))
      const configured = yield* configuredInstructions
      const globalAgents = yield* fs.resolve(join(global.config, "AGENTS.md"))
      const paths = Array.dedupe([globalAgents, ...discovered, ...configured.paths])
      const agents = new Set([globalAgents, ...discovered, ...configured.agents])
      const files = yield* Effect.forEach(
        paths,
        (path) =>
          fs
            .readFileStringSafe(path)
            .pipe(
              Effect.map((content) =>
                content === undefined
                  ? undefined
                  : new File({
                      path: AbsolutePath.make(path),
                      content,
                      ...(agents.has(path) && basename(path) !== "AGENTS.md" ? { agentsAlias: true as const } : {}),
                    }),
              ),
            ),
        { concurrency: "unbounded" },
      )
      if (configured.escaped) return SystemContext.unavailable
      if (files.some((file, index) => file === undefined && (discovered.has(paths[index]) || configured.paths.includes(paths[index]))))
        return SystemContext.unavailable
      const admitted = files.filter((file): file is File => file !== undefined)
      if (!turn?.hosted) return admitted
      return yield* withImports(admitted, [...discoveredFiles, ...configured.aliases], importRoot, global.home, fs)
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

/** Native instruction paths already delivered by the admitted Context Epoch. */
export function agentsPaths(snapshot: SystemContext.Snapshot): ReadonlyArray<string> {
  const files = Schema.decodeUnknownOption(Files)(snapshot[key]?.value)
  return Array.dedupe(Option.getOrElse(files, () => []).flatMap((file) => {
    if (file.nativePaths) return file.nativePaths
    // Snapshots written by older hosts have no import closure.
    return (file.agentsAlias || basename(file.path) === "AGENTS.md") && !/(^|\s)@[^\s`@]/.test(file.content)
      ? [file.path]
      : []
  }))
}

export const nativeExclusions = Effect.fnUntraced(function* (
  snapshot: SystemContext.Snapshot,
  location: Location.Interface,
  fs: FSUtil.Interface,
) {
  const directory = yield* fs.resolve(location.directory)
  const root = yield* fs.resolve(location.project.directory)
  const project = !Project.isRoot(root) && contains(root, directory) ? root : directory
  const excluded = new Set(agentsPaths(snapshot))
  // The native AGENTS plugin walks ancestors above the project and can follow a root instruction symlink.
  for (let current = directory; !Project.isRoot(current); current = dirname(current)) {
    for (const path of [join(current, "AGENTS.md"), join(current, ".claude", "AGENTS.md")]) {
      if (!contains(project, current)) {
        excluded.add(path)
        continue
      }
      const physical = yield* fs.realPath(path).pipe(Effect.option)
      if (Option.isSome(physical) && (!contains(project, physical.value) || excluded.has(physical.value))) excluded.add(path)
    }
  }
  return [...excluded]
})

// Text types accepted by the pinned Claude Code import loader. Extensionless files are also accepted.
const importExtensions = new Set([
  ".adoc", ".asciidoc", ".astro", ".bash", ".bat", ".c", ".cc", ".cfg", ".cjs", ".clj", ".cljc", ".cljs",
  ".cmake", ".cmd", ".conf", ".config", ".cpp", ".cs", ".css", ".csv", ".cts", ".cxx", ".dart", ".diff", ".edn",
  ".ejs", ".elm", ".env", ".erb", ".erl", ".ex", ".exs", ".f", ".f90", ".f95", ".fish", ".for", ".go", ".gql",
  ".gradle", ".graphql", ".h", ".hbs", ".hpp", ".hrl", ".hs", ".htm", ".html", ".hxx", ".ini", ".jade", ".java",
  ".js", ".json", ".jsx", ".kt", ".kts", ".latex", ".less", ".lhs", ".lock", ".log", ".lua", ".make", ".makefile",
  ".md", ".mjs", ".ml", ".mli", ".mts", ".org", ".patch", ".php", ".pl", ".pm", ".properties", ".proto", ".ps1",
  ".pug", ".py", ".pyi", ".pyw", ".r", ".rake", ".rb", ".rs", ".rst", ".sass", ".sbt", ".scala", ".scss", ".sh",
  ".sql", ".svelte", ".swift", ".tex", ".text", ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml", ".zsh",
])

const withImports = Effect.fnUntraced(function* (
  admitted: ReadonlyArray<File>,
  aliases: ReadonlyArray<{ readonly path: string; readonly target: string }>,
  project: string,
  home: string,
  fs: FSUtil.Interface,
) {
  const files = new Map<string, File>(admitted.map((file) => [file.path, file]))
  const nativePaths = new Map(admitted.map((file) => [file.path, new Set([file.path])]))
  for (const alias of aliases) nativePaths.get(AbsolutePath.make(alias.path))?.add(AbsolutePath.make(alias.target))
  const depths = new Map<string, number>()
  const descend = (file: File, depth: number): Effect.Effect<void, FSUtil.Error> =>
    Effect.gen(function* () {
      // Claude Code skips an excluded file's entire subtree. Capture its in-project imports before excluding it.
      if (depth >= 4 || (depths.get(file.path) ?? Infinity) <= depth) return
      depths.set(file.path, depth)
      for (const reference of yield* importReferences(file.content)) {
        const target = reference.startsWith("~/") ? resolve(home, reference.slice(2)) : resolve(dirname(file.path), reference)
        const extension = extname(target).toLowerCase()
        if (!contains(project, target) || (extension && !importExtensions.has(extension))) continue
        const path = AbsolutePath.make(yield* fs.resolve(target))
        if (!contains(project, path)) continue
        const existing = files.get(path)
        const content = existing?.content ?? (yield* fs.stat(path).pipe(
          Effect.flatMap((stat) => stat.type === "File" && stat.size <= 4 * 1024 * 1024 ? fs.readFileStringSafe(path) : Effect.succeed(undefined)),
          Effect.catchTag("PlatformError", (error) => error.reason._tag === "NotFound" ? Effect.succeed(undefined) : Effect.fail(error)),
        ))
        if (content === undefined || content.includes("\0")) continue
        const imported = existing ?? new File({ path, content })
        files.set(path, imported)
        const paths = nativePaths.get(path) ?? new Set([path])
        paths.add(AbsolutePath.make(target))
        nativePaths.set(path, paths)
        yield* descend(imported, depth + 1)
      }
    })
  yield* Effect.forEach(admitted, (file) => descend(file, 0), { discard: true })
  return [...files.values()].map((file) => new File({ ...file, nativePaths: [...(nativePaths.get(file.path) ?? [])] }))
})

const importReferences = Effect.fnUntraced(function* (content: string) {
  if (!content.includes("@")) return []
  const { Lexer, defaults } = yield* Effect.promise(() => import("marked"))
  const references = new Set<string>()
  const collect = (text: string) => {
    for (const match of text.matchAll(/(?:^|\s)@((?:[^\s\\]|\\ )+)/g)) {
      const reference = match[1].split("#", 1)[0].replaceAll("\\ ", " ")
      if (/^(?:[a-z0-9_.-]|~\/|\/)/i.test(reference)) references.add(reference)
    }
  }
  const visit = (token: {
    readonly type: string
    readonly text?: string
    readonly raw?: string
    readonly tokens?: readonly unknown[]
    readonly items?: readonly unknown[]
  }) => {
    if (token.type === "code" || token.type === "codespan") return
    if (token.type === "html") {
      if (token.raw?.trimStart().startsWith("<!--")) collect(token.raw.replace(/<!--[\s\S]*?-->/g, ""))
      return
    }
    if (token.type === "text" && token.text && !token.tokens?.length) collect(token.text)
    for (const child of [...(token.tokens ?? []), ...(token.items ?? [])]) {
      if (isMarkdownToken(child)) visit(child)
    }
  }
  for (const token of new Lexer({ ...defaults, gfm: false }).lex(ConfigMarkdown.parseOption(content)?.content ?? content)) visit(token)
  return [...references]
})

function isMarkdownToken(value: unknown): value is { readonly type: string } {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
}

function render(files: ReadonlyArray<File>) {
  return files.map((file) => `Instructions from: ${file.path}\n${file.content}`).join("\n\n")
}

function contains(parent: string, child: string) {
  const path = relative(parent, child)
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}
