export * as BackendToolkitProject from "./project-version"

import path from "path"
import { lstat, readFile, realpath } from "fs/promises"
import matter from "gray-matter"
import { Effect, Schema } from "effect"
import openapiGenerator from "./packs/openapi-generator"

export class Blocked extends Schema.TaggedErrorClass<Blocked>()("BackendToolkitProject.Blocked", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason
  }
}

// Deliberately bounded CLI grammar. Unknown flags/subcommands cannot bypass output discovery.
const VALUES = new Set([
  "-i", "--input-spec", "-g", "--generator-name", "-o", "--output", "-c", "--config",
  "-t", "--template-dir", "-p", "--additional-properties", "--global-property", "--library",
  "--api-package", "--model-package", "--invoker-package", "--package-name", "--artifact-id",
  "--artifact-version", "--group-id", "--git-host", "--git-user-id", "--git-repo-id",
  "--ignore-file-override", "--openapi-normalizer", "--type-mappings", "--import-mappings",
  "--schema-mappings", "--name-mappings", "--inline-schema-name-mappings", "--inline-schema-options",
  "--reserved-words-mappings", "--server-variables", "--operation-id-name-mappings", "--strict-spec",
])
const SWITCHES = new Set([
  "--dry-run", "--minimal-update", "--skip-overwrite", "--skip-validate-spec", "--enable-post-process-file",
  "--remove-operation-id-prefix", "--log-to-stderr", "-v", "--verbose",
])

/** Checks only owned OpenAPI generation calls; reads no project metadata for read-only subcommands. */
export const checkProjectVersion = Effect.fn("BackendToolkitProject.checkProjectVersion")(function* (input: {
  engine: "openapi-generator"
  argv: readonly string[]
  cwd: string
  projectDirectory: string
}) {
  if (["validate", "version", "help", "list", "config-help"].includes(input.argv[0])) return
  if (input.argv[0] !== "generate") return yield* blocked("unsupported-owned-call")
  const options = yield* Effect.try({ try: () => generationOptions(input.argv), catch: (error) =>
    error instanceof Blocked ? error : blocked("unsupported-owned-call") })
  const root = yield* Effect.tryPromise({
    try: () => realpath(input.projectDirectory),
    catch: () => blocked("unreadable-project"),
  })
  const cwd = yield* physical(root, input.cwd, "cwd")
  if (!cwd) return yield* blocked("unbound-cwd")
  if (options.config !== undefined && !boundPath(options.config)) return yield* blocked("unbound-config")
  const config = options.config === undefined ? undefined : yield* readMetadata(root, path.resolve(cwd, options.config), "config", true)
  const fields = config === undefined ? undefined : yield* document(config, "config", options.config?.endsWith(".json"))
  if (fields?.outputDir !== undefined && (typeof fields.outputDir !== "string" || !fields.outputDir.trim()))
    return yield* blocked("malformed-config")
  const output = options.output ?? (typeof fields?.outputDir === "string" ? fields.outputDir : undefined)
  if (!output || !boundPath(output)) return yield* blocked("unbound-output")
  if (options.output && typeof fields?.outputDir === "string" && path.resolve(cwd, options.output) !== path.resolve(cwd, fields.outputDir))
    return yield* blocked("conflicting-output")
  // Check the physical output even when it does not yet exist; symlink ancestors are not first generation.
  yield* physical(root, path.resolve(cwd, output), "output")
  const tools = yield* readMetadata(root, path.join(root, "openapitools.json"), "project-metadata")
  const project = tools === undefined ? undefined : yield* document(tools, "project-metadata", true)
  const cli = project?.["generator-cli"]
  if (cli !== undefined && (typeof cli !== "object" || cli === null || Array.isArray(cli)))
    return yield* blocked("malformed-project-metadata")
  const declared = cli !== undefined && "version" in cli ? cli.version : undefined
  const directory = path.resolve(cwd, output, ".openapi-generator")
  const metadata = yield* physical(root, directory, "output-metadata")
  const generated = yield* readMetadata(root, path.join(directory, "VERSION"), "output-metadata", metadata !== undefined)
  const pins = [declared, generated?.trim()].filter((pin) => pin !== undefined)
  if (pins.some((pin) => typeof pin !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pin)))
    return yield* blocked("malformed-version")
  const mismatch = pins.find((pin) => pin !== openapiGenerator.version)
  if (mismatch !== undefined)
    return yield* new Blocked({ reason: `engine-version-mismatch(project=${mismatch}, bundled=${openapiGenerator.version})` })
})

function blocked(reason: string) {
  return new Blocked({ reason: `engine-project-version:${reason}` })
}

function boundPath(file: string) {
  // No deferred substitution or symlink/.. normalization ambiguity in the supported path grammar.
  return !["\0", "$", "%", "~"].some((char) => file.includes(char)) && !file.split(/[\\/]/).includes("..")
}

function generationOptions(argv: readonly string[]) {
  const options: { output?: string; config?: string } = {}
  for (let i = 1; i < argv.length; i++) {
    const equal = argv[i].indexOf("=")
    const flag = equal < 0 ? argv[i] : argv[i].slice(0, equal)
    if (SWITCHES.has(flag) && equal < 0) continue
    if (!VALUES.has(flag)) throw blocked("unsupported-owned-call")
    const value = equal < 0 ? argv[++i] : argv[i].slice(equal + 1)
    if (!value || value.startsWith("-")) throw blocked("unbound-args")
    if (flag === "--strict-spec" && value !== "true" && value !== "false") throw blocked("unsupported-owned-call")
    if (flag === "-o" || flag === "--output") {
      if (options.output !== undefined) throw blocked("conflicting-output")
      options.output = value
    }
    if (flag === "-c" || flag === "--config") {
      if (options.config !== undefined) throw blocked("conflicting-config")
      options.config = value
    }
  }
  return options
}

function inside(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

// Walk from the canonical project, checking each existing component before reading any bytes.
// Only lstat ENOENT means absent. Broken links, denied traversal and ENOTDIR are named failures.
const physical = Effect.fnUntraced(function* (root: string, file: string, kind: string) {
  if (!inside(root, file)) return yield* blocked(`escaping-${kind}`)
  const components = path.relative(root, file).split(path.sep).filter(Boolean)
  for (let i = 0; i < components.length; i++) {
    const candidate = path.join(root, ...components.slice(0, i + 1))
    const info = yield* Effect.tryPromise({
      try: () => lstat(candidate).catch((error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
        throw error
      }),
      catch: () => blocked(`unreadable-${kind}`),
    })
    if (!info) return undefined
    const resolved = yield* Effect.tryPromise({ try: () => realpath(candidate), catch: () => blocked(`unreadable-${kind}`) })
    if (!inside(root, resolved)) return yield* blocked(`escaping-${kind}`)
    if (i < components.length - 1 && !(yield* Effect.tryPromise({ try: () => lstat(resolved), catch: () => blocked(`unreadable-${kind}`) })).isDirectory())
      return yield* blocked(`malformed-${kind}`)
  }
  return file
})

const readMetadata = Effect.fnUntraced(function* (root: string, file: string, kind: string, required = false) {
  const resolved = yield* physical(root, file, kind)
  if (!resolved) {
    if (required) return yield* blocked(`missing-${kind}`)
    return undefined
  }
  const info = yield* Effect.tryPromise({ try: () => lstat(resolved), catch: () => blocked(`unreadable-${kind}`) })
  // realpath was checked above; a symlink to an in-project regular file is allowed.
  const target = yield* Effect.tryPromise({ try: () => realpath(resolved).then(lstat), catch: () => blocked(`unreadable-${kind}`) })
  if ((!info.isFile() && !info.isSymbolicLink()) || !target.isFile() || target.size > 1024 * 1024)
    return yield* blocked(`malformed-${kind}`)
  return yield* Effect.tryPromise({ try: () => readFile(resolved, "utf8"), catch: () => blocked(`unreadable-${kind}`) })
})

const document = Effect.fnUntraced(function* (text: string, kind: string, json = false) {
  if (!text.trim() || text.includes("\0")) return yield* blocked(`malformed-${kind}`)
  if (json) yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
    Effect.mapError(() => blocked(`malformed-${kind}`)),
  )
  if (!json) yield* Effect.try({ try: () => validateYamlSource(text), catch: (error) =>
    error instanceof Blocked ? error : blocked("unsupported-yaml-config") })
  // safeLoad is not Jackson-equivalent. Bind only the closed YAML source grammar checked above, or strict JSON.
  const value: unknown = yield* Effect.try({
    try: () => matter(`\0begin\n${text}\n\0end`, { delimiters: ["\0begin", "\0end"], language: "yaml" }).data,
    catch: () => blocked(`malformed-${kind}`),
  })
  return yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(value).pipe(
    Effect.mapError(() => blocked(`malformed-${kind}`)),
  )
})

// Supported YAML is block mappings with simple string keys and single-line scalar values. Flow collections,
// sequences, directives, tags, anchors, aliases, merge keys and folded/block scalars are outside this grammar.
// Inspect source tokens before safeLoad can resolve/coerce them; quoted punctuation remains literal data.
function validateYamlSource(text: string) {
  const ambiguous = new Set(["y", "yes", "n", "no", "true", "false", "on", "off", "null", "~", ".inf", ".nan"])
  for (const line of text.split("\n")) {
    const source = line.replace(/\r$/, "").trimStart()
    if (!source || source.startsWith("#")) continue
    if (line.includes("\t") || /[\u0085\u2028\u2029]/.test(line)) throw blocked("unsupported-yaml-config")
    const colon = source.indexOf(":")
    const key = source.slice(0, colon)
    if (colon < 1 || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || (source[colon + 1] !== undefined && source[colon + 1] !== " "))
      throw blocked("unsupported-yaml-config")
    const scalar = source.slice(colon + 1).trimStart()
    const path = key === "outputDir" || key === "inputSpec"
    if (!scalar || scalar.startsWith("#")) {
      if (path) throw blocked(`ambiguous-yaml-scalar:${key}`)
      continue
    }
    if (scalar[0] === "'" || scalar[0] === '"') {
      let end = 1
      for (; end < scalar.length; end++) {
        if (scalar[0] === '"' && scalar[end] === "\\") {
          end++
          continue
        }
        if (scalar[end] !== scalar[0]) continue
        if (scalar[0] === "'" && scalar[end + 1] === "'") {
          end++
          continue
        }
        break
      }
      const trailing = scalar.slice(end + 1)
      if (end === scalar.length || (trailing.trim() && (!trailing.startsWith(" ") || !trailing.trimStart().startsWith("#"))))
        throw blocked("unsupported-yaml-config")
      if (scalar[0] === '"') Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(scalar.slice(0, end + 1))
      continue
    }
    const comment = scalar.indexOf(" #")
    const token = (comment < 0 ? scalar : scalar.slice(0, comment)).trimEnd()
    // This is a closed scalar token alphabet, not a scan for selected YAML features in arbitrary source.
    if (!/^[A-Za-z0-9_./\\ +~-]+$/.test(token)) throw blocked("unsupported-yaml-config")
    if (path && (ambiguous.has(token.toLowerCase()) || !/^[A-Za-z_./\\]/.test(token) || /^\.\d/.test(token)))
      throw blocked(`ambiguous-yaml-scalar:${key}`)
  }
}
