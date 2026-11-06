export * as ReviewOxlintInput from "./oxlint-input"

import { constants } from "node:fs"
import { chmod, lstat, mkdtemp, mkdir, open, realpath, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Context, Effect, Scope } from "effect"
import { Probe } from "../../research-toolkit/probe/types"
import { ResearchProcess } from "../../research-toolkit/process"
import { ReviewNativeFiles } from "../native-files"

export type Prepared = {
  status: "ok"
  root: string
  files: readonly string[]
  paths: readonly { file: string; path: string }[]
  config: string
  rules: readonly string[]
}
export type Input = { root: string; files: readonly string[]; scratch: string; excluded?: readonly string[] }
export type Refused = { status: "not-run" | "unsupported"; reason: string }

export const BeforeRead = Context.Reference<(input: { root: string; file: string }) => Effect.Effect<void>>(
  "@orchestra/ReviewOxlintInput/BeforeRead",
  { defaultValue: () => () => Effect.void },
)
export const Copied = Context.Reference<(input: { root: string; file: string }) => Effect.Effect<void>>(
  "@orchestra/ReviewOxlintInput/Copied",
  { defaultValue: () => () => Effect.void },
)
export const NoFollow = Context.Reference<boolean>("@orchestra/ReviewOxlintInput/NoFollow", { defaultValue: () => true })

const MAX_BYTES = 4 * 1024 * 1024
const MAX_FILES = 10_000
const rules = ["eslint(no-debugger)", "typescript(no-explicit-any)"] as const
const configNames = ["eslint/no-debugger", "typescript/no-explicit-any"] as const
const ENVIRONMENT_OVERRIDES = new Set(["HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"])
const refuse = (reason: string): Refused => ({ status: "not-run", reason })

export const prepare = (input: Input): Effect.Effect<Prepared | Refused, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    if (!input.files.length) return refuse("no-input")
    if (input.files.length > MAX_FILES) return refuse("too-many-inputs")
    const excluded = input.excluded ?? []
    if (
      excluded.some((rule) => !rules.includes(rule as typeof rules[number])) ||
      new Set(excluded).size !== excluded.length
    ) return refuse("native-rule-selection-unsupported")
    const selectedRules = rules.filter((rule) => !excluded.includes(rule))
    if (!selectedRules.length) return refuse("no-selected-rules")
    if (!constants.O_NOFOLLOW || !(yield* NoFollow)) return refuse("no-follow-unavailable")
    const rawPath = ReviewNativeFiles.flavor(input.root)
    const hostPath = process.platform === "win32" ? path.win32 : path.posix
    if (rawPath !== hostPath) return { status: "unsupported" as const, reason: "nonnative-root" }
    if (
      !safeAbsolute(input.root, rawPath) ||
      ReviewNativeFiles.flavor(input.scratch) !== rawPath ||
      !safeAbsolute(input.scratch, rawPath)
    ) return refuse("unsafe-root-or-scratch")
    const root = yield* Effect.tryPromise({ try: () => realpath(input.root), catch: () => refuse("root-missing") })
    const scratch = yield* Effect.tryPromise({ try: () => realpath(input.scratch), catch: () => refuse("scratch-missing") })
    const nativePath = ReviewNativeFiles.flavor(root)
    const overlaps = (value: string) => value === "" || value === ".." || !nativePath.isAbsolute(value) && !value.startsWith(`..${nativePath.sep}`)
    if (overlaps(nativePath.relative(root, scratch)) || overlaps(nativePath.relative(scratch, root))) return refuse("scratch-overlaps-source")
    const selected = yield* ReviewNativeFiles.select({
      root,
      files: input.files,
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"],
    })
    if (selected.status !== "ok") return selected
    if (selected.files.length > MAX_FILES) return refuse("too-many-inputs")
    let total = 0
    const contents: { file: string; relative: string; bytes: Buffer; mode: number }[] = []
    const selectedPaths = new Set<string>()
    for (const file of selected.files) {
      const relative = nativePath.relative(root, file).split(nativePath.sep).join("/")
      const invalidName = invalidRelative(relative, nativePath.sep === "\\")
      if (invalidName) return refuse(invalidName)
      const key = nativePath.sep === "\\" ? relative.toLowerCase() : relative
      if (selectedPaths.has(key)) return refuse("case-alias-path")
      selectedPaths.add(key)
      const identity = yield* Effect.tryPromise({
        try: () => captureIdentity(root, file),
        catch: () => refuse("path-replaced"),
      }).pipe(Effect.uninterruptible)
      const beforeRead = yield* BeforeRead
      yield* beforeRead({ root, file })
      const result = yield* Effect.tryPromise({
        try: async () => {
          const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
          try {
            const stat = await handle.stat()
            if (!sameIdentity(identity.file, stat) || !stat.isFile()) throw new Error("not-file")
            for (const parent of identity.parents) {
              const current = await lstat(parent.path)
              if (current.isSymbolicLink() || !current.isDirectory() || !sameIdentity(parent.stat, current)) throw new Error("path-replaced")
            }
            const chunks: Buffer[] = []
            let offset = 0
            while (offset <= MAX_BYTES - total) {
              const chunk = Buffer.alloc(Math.min(64 * 1024, MAX_BYTES - total + 1 - offset))
              const read = await handle.read(chunk, 0, chunk.length, offset)
              if (!read.bytesRead) break
              chunks.push(chunk.subarray(0, read.bytesRead))
              offset += read.bytesRead
            }
            return { bytes: Buffer.concat(chunks, offset), mode: stat.mode & 0o777 }
          } finally { await handle.close() }
        },
        catch: () => refuse("read-or-path-replaced"),
      }).pipe(Effect.uninterruptible)
      if (total + result.bytes.length > MAX_BYTES) return refuse("input-too-large")
      let text: string
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(result.bytes) }
      catch { return refuse("input-not-utf8") }
      if (text.includes("eslint-") || text.includes("oxlint-")) return refuse("inline-directive-marker-unsupported")
      contents.push({ file, relative, bytes: result.bytes, mode: result.mode })
      total += result.bytes.length
    }
    const dir = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => mkdtemp(path.join(scratch, "oxlint-")), catch: () => refuse("projection-create-failed") }),
      (value) => Effect.tryPromise({ try: () => rm(value, { recursive: true, force: true }), catch: () => new Error("projection-cleanup-failed") }).pipe(Effect.orDie),
    )
    yield* Effect.tryPromise({ try: async () => { await mkdir(path.join(dir, ".git")); await mkdir(path.join(dir, ".host")) }, catch: () => refuse("projection-create-failed") }).pipe(Effect.uninterruptible)
    const copied = yield* Copied
    for (const item of contents) {
      const target = path.join(dir, ...item.relative.split("/"))
      yield* Effect.tryPromise({
        try: async () => {
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, item.bytes, { mode: item.mode })
          await chmod(target, item.mode)
        },
        catch: () => refuse("projection-copy-failed"),
      }).pipe(Effect.uninterruptible)
      yield* copied({ root: dir, file: target })
    }
    const config = path.join(dir, ".host/oxlint.json")
    const names = selectedRules.map((rule) => configNames[rules.indexOf(rule as typeof rules[number])])
    yield* Effect.tryPromise({
      try: () => writeFile(config, JSON.stringify({ plugins: ["eslint", "typescript"], rules: Object.fromEntries(names.map((name) => [name, "error"])) }), { mode: 0o600 }),
      catch: () => refuse("projection-config-failed"),
    }).pipe(Effect.uninterruptible)
    return {
      status: "ok" as const,
      root: dir,
      files: contents.map((item) => path.join(dir, ...item.relative.split("/"))),
      paths: contents.map((item) => ({ file: item.relative, path: item.relative })),
      config,
      rules: selectedRules,
    }
  }).pipe(Effect.catch((error) => Effect.succeed(isRefusal(error) ? error : refuse("filesystem-error"))))

export function argv(executable: string, prepared: Prepared): { status: "ok"; argv: string[] } | Refused {
  const pathApi = ReviewNativeFiles.flavor(prepared.root)
  if (!safeAbsolute(prepared.root, pathApi) || !safeAbsolute(executable, pathApi)) return refuse("invalid-projection")
  const root = pathApi.resolve(prepared.root)
  const fileRelative = prepared.files.map((file) => pathApi.relative(root, file))
  const pairs = new Set<string>()
  if (!prepared.files.length || prepared.files.length > MAX_FILES || prepared.paths.length !== prepared.files.length || prepared.config !== pathApi.join(root, ".host", "oxlint.json")) return refuse("invalid-projection")
  if (
    !prepared.rules.length ||
    prepared.rules.some((rule, index) => !rules.includes(rule as typeof rules[number]) || prepared.rules.indexOf(rule) !== index) ||
    prepared.rules.some((rule, index) => index + 1 < prepared.rules.length && rules.indexOf(rule as typeof rules[number]) > rules.indexOf(prepared.rules[index + 1] as typeof rules[number]))
  ) return refuse("invalid-projection")
  for (const [index, relative] of fileRelative.entries()) {
    const normalized = pathApi.sep === "\\" ? relative.split(pathApi.sep).join("/") : relative
    const mapping = prepared.paths[index]
    const contained = ReviewNativeFiles.containedPath(root, prepared.files[index])
    const key = pathApi.sep === "\\" ? normalized.toLowerCase() : normalized
    const extension = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"].some((value) => pathApi.basename(normalized).endsWith(value))
    const invalidName = invalidRelative(normalized, pathApi.sep === "\\")
    if (invalidName) return refuse(invalidName)
    if (
      !pathApi.isAbsolute(prepared.files[index]) || !contained || contained !== normalized ||
      prepared.files[index] !== pathApi.join(root, ...normalized.split("/")) ||
      mapping.file !== normalized || mapping.path !== normalized || !extension || pairs.has(key)
    ) return refuse("invalid-projection")
    pairs.add(key)
  }
  const names = prepared.rules.map((rule) => configNames[rules.indexOf(rule as typeof rules[number])])
  const args = [
    executable, "--config", prepared.config, "--disable-nested-config", "--no-ignore", "--allow", "all",
    ...names.flatMap((rule) => ["--deny", rule]), "--format", "sarif", "--", ...prepared.files,
  ]
  if (args.some((arg) => arg.includes("\0")) || args.reduce((sum, arg) => sum + Buffer.byteLength(arg) + 1, 0) > Probe.Limits.outputBytes) return refuse("argv-bound")
  return { status: "ok", argv: args }
}

export function environment(root: string, input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const base = ResearchProcess.environment(input)
  return {
    ...Object.fromEntries(Object.entries(base).filter(([key]) =>
      !/^(ZIZMOR|GH_|GITHUB_|RUST_|OXLINT|ESLINT|NODE_)/i.test(key) &&
      !["FORCE_COLOR", "CLICOLOR_FORCE"].includes(key.toUpperCase()) &&
      !ENVIRONMENT_OVERRIDES.has(key.toUpperCase()))),
    HOME: root,
    USERPROFILE: root,
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    XDG_CONFIG_HOME: path.join(root, ".config"),
    XDG_CACHE_HOME: path.join(root, ".cache"),
    NO_COLOR: "1",
  }
}

async function captureIdentity(root: string, file: string) {
  const pathApi = ReviewNativeFiles.flavor(root)
  const parents: { path: string; stat: { dev: number; ino: number } }[] = []
  let cursor = pathApi.parse(root).root
  const relative = pathApi.relative(cursor, root)
  for (const segment of [...relative.split(pathApi.sep), ...pathApi.relative(root, file).split(pathApi.sep).slice(0, -1)].filter(Boolean)) {
    cursor = pathApi.join(cursor, segment)
    const stat = await lstat(cursor)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("parent-not-directory")
    parents.push({ path: cursor, stat })
  }
  const leaf = await lstat(file)
  if (leaf.isSymbolicLink() || !leaf.isFile()) throw new Error("not-file")
  return { file: leaf, parents }
}

function sameIdentity(left: { dev: number; ino: number }, right: { dev: number; ino: number }) {
  return left.dev === right.dev && left.ino === right.ino
}

function safeAbsolute(value: string, pathApi: typeof path.posix) {
  if (!value || !pathApi.isAbsolute(value) || value.includes("\0")) return false
  const head = value.slice(0, 4).replaceAll("/", "\\")
  const segments = value.split(pathApi.sep === "\\" ? /[\\/]/ : /\//)
  return head !== "\\\\?\\" && head !== "\\\\.\\" && !segments.some((segment) => segment === ".." || segment === ".")
}

function invalidRelative(value: string, windows: boolean) {
  const segments = value.split("/")
  if (segments.some((segment) => segment.toLowerCase() === ".git") || segments[0]?.toLowerCase() === ".host") return "projection-metadata-path-unsupported"
  if (/[\%?#]/.test(value) || !windows && value.includes("\\")) return "native-uri-path-unsupported"
  if (!windows) return undefined
  if (segments.some((segment) => {
    const base = segment.split(".")[0].replace(/[ .]+$/g, "").toUpperCase()
    return segment.includes(":") || /[ .]$/.test(segment) || /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/.test(base)
  })) return "windows-device-path-unsupported"
  return undefined
}

function isRefusal(error: unknown): error is Refused {
  return !!error && typeof error === "object" && "reason" in error && typeof error.reason === "string" && "status" in error && (error.status === "not-run" || error.status === "unsupported")
}
