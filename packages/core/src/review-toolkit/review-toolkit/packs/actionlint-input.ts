export * as ReviewActionlintInput from "./actionlint-input"

import { constants } from "node:fs"
import { lstat, mkdtemp, mkdir, open, realpath, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Context, Effect, Scope } from "effect"
import { Probe } from "../../research-toolkit/probe/types"
import { ResearchProcess } from "../../research-toolkit/process"
import { ReviewNativeFiles } from "../native-files"
import { ReviewActionlintYaml } from "./actionlint-yaml"

export type Prepared = { status: "ok"; root: string; files: readonly string[]; paths: readonly { file: string; path: string }[]; config: string }
export const Copied = Context.Reference<(input: { root: string; index: number; file: string }) => Effect.Effect<void>>("@orchestra/ReviewActionlintInput/Copied", { defaultValue: () => () => Effect.void })
export const BeforeRead = Context.Reference<(input: { root: string; file: string }) => Effect.Effect<void>>("@orchestra/ReviewActionlintInput/BeforeRead", { defaultValue: () => () => Effect.void })

const MAX_BYTES = 4 * 1024 * 1024
const MAX_FILES = 10_000
const refusal = (reason: string) => ({ status: "not-run" as const, reason })

export const prepare = (input: { root: string; files: readonly string[]; scratch: string }): Effect.Effect<Prepared | { status: "not-run" | "unsupported"; reason: string }, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    if (!input.files.length) return refusal("no-input")
    if (input.files.length > MAX_FILES) return refusal("too-many-inputs")
    const root = yield* Effect.tryPromise({ try: () => realpath(input.root), catch: () => refusal("root-missing") })
    const scratch = yield* Effect.tryPromise({ try: () => realpath(input.scratch), catch: () => refusal("scratch-missing") })
    const nativePath = ReviewNativeFiles.flavor(root)
    const rel = nativePath.relative(root, scratch)
    const back = nativePath.relative(scratch, root)
    const overlaps = (value: string) => value === "" || value === ".." || (!nativePath.isAbsolute(value) && !value.startsWith(`..${nativePath.sep}`))
    if (overlaps(rel) || overlaps(back)) return refusal("scratch-overlaps-source")
    const requested = input.files.map((file) => ({ file, relative: ReviewNativeFiles.containedPath(root, file) }))
    if (requested.some((item) => !item.relative)) return refusal("path-outside")
    if (requested.some((item) => !/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(item.relative!))) return refusal("invalid-workflow-path")
    const selected = yield* ReviewNativeFiles.select({ root, files: requested.map((item) => item.relative!), extensions: [".yml", ".yaml"] })
    if (selected.status !== "ok") return selected
    const originals = selected.files.map((file) => ReviewNativeFiles.containedPath(root, file)!)
    const contents: Buffer[] = []
    let total = 0
    for (const file of selected.files) {
      const remaining = MAX_BYTES - total
      if (!constants.O_NOFOLLOW) return refusal("no-follow-unavailable")
      const identity = yield* Effect.tryPromise({ try: () => captureIdentity(root, file), catch: () => refusal("workflow-path-replaced") }).pipe(Effect.uninterruptible)
      const beforeRead = yield* BeforeRead
      yield* beforeRead({ root, file })
      const bytes = yield* Effect.tryPromise({
        try: async () => {
          const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
          try {
            const opened = await handle.stat()
            if (!sameIdentity(identity.file, opened) || !opened.isFile()) throw new Error("workflow-leaf-replaced")
            for (const parent of identity.parents) {
              const current = await lstat(parent.path)
              if (current.isSymbolicLink() || !current.isDirectory() || !sameIdentity(parent.stat, current)) throw new Error("workflow-parent-replaced")
            }
            const chunks: Buffer[] = []
            let offset = 0
            while (offset <= remaining) {
              const chunk = Buffer.alloc(Math.min(64 * 1024, remaining + 1 - offset))
              const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset)
              if (bytesRead === 0) break
              chunks.push(chunk.subarray(0, bytesRead))
              offset += bytesRead
            }
            return Buffer.concat(chunks, offset)
          } finally { await handle.close() }
        },
        catch: () => refusal("workflow-read-or-path-replaced"),
      }).pipe(Effect.uninterruptible)
      if (bytes.length > remaining) return refusal("workflow-too-large")
      let text: string
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes) }
      catch { return refusal("workflow-not-utf8") }
      const valid = ReviewActionlintYaml.validateWorkflow(text)
      if (valid.status !== "ok") return valid
      contents.push(bytes)
      total += bytes.length
    }
    const dir = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => mkdtemp(path.join(scratch, "actionlint-")), catch: () => refusal("projection-create-failed") }),
      (value) => Effect.tryPromise({ try: () => rm(value, { recursive: true, force: true }), catch: () => new Error("projection-cleanup-failed") }).pipe(Effect.orDie),
    )
    yield* Effect.tryPromise({ try: async () => { await mkdir(path.join(dir, ".github", "workflows"), { recursive: true }); await mkdir(path.join(dir, ".git")) }, catch: () => refusal("projection-create-failed") }).pipe(Effect.uninterruptible)
    const projected = contents.map((_, i) => path.join(dir, ".github", "workflows", `input-${i}.yaml`))
    const copied = yield* Copied
    for (let index = 0; index < projected.length; index++) {
      yield* Effect.tryPromise({ try: () => writeFile(projected[index], contents[index]), catch: () => refusal("projection-copy-failed") }).pipe(Effect.uninterruptible)
      yield* copied({ root: dir, index, file: projected[index] })
    }
    const config = path.join(dir, ".github", "actionlint.yaml")
    yield* Effect.tryPromise({ try: () => writeFile(config, "{}\n"), catch: () => refusal("projection-config-failed") }).pipe(Effect.uninterruptible)
    const projectionPath = ReviewNativeFiles.flavor(dir)
    return { status: "ok" as const, root: dir, files: projected, paths: projected.map((file, i) => ({ file: canonicalRelative(projectionPath.relative(dir, file), projectionPath.sep === "\\"), path: originals[i] })), config }
  }).pipe(Effect.catch((error) => Effect.succeed(isRefusal(error) ? error : refusal("filesystem-error"))))

export function argv(executable: string, prepared: Prepared) {
  if (typeof prepared.root !== "string" || !prepared.root || prepared.root.includes("\0")) return refusal("invalid-projection")
  const pathApi = ReviewNativeFiles.flavor(prepared.root)
  if (!pathApi.isAbsolute(prepared.root)) return refusal("invalid-projection")
  const root = pathApi.resolve(prepared.root)
  const relative = (file: string) => pathApi.relative(root, file)
  const forward = (value: string) => canonicalRelative(value, pathApi.sep === "\\")
  const validInside = (file: string) => !!file && !file.includes("\0") && !pathApi.isAbsolute(relative(file)) && relative(file) !== ".." && !relative(file).startsWith(`..${pathApi.sep}`)
  if (!executable || !pathApi.isAbsolute(executable) || executable.includes("\0")) return refusal("invalid-executable")
  if (!prepared.files.length || prepared.files.length > MAX_FILES || prepared.paths.length !== prepared.files.length) return refusal("invalid-projection")
  if (prepared.config !== pathApi.join(root, ".github", "actionlint.yaml") || !validInside(prepared.config)) return refusal("invalid-projection")
  const pairs = new Set<string>()
  const sources = new Set<string>()
  for (const [index, file] of prepared.files.entries()) {
    const mapping = prepared.paths[index]
    if (!pathApi.isAbsolute(file) || !validInside(file) || file !== pathApi.join(root, ".github", "workflows", `input-${index}.yaml`)) return refusal("invalid-projection")
    const mappedFile = forward(mapping.file)
    const mappedSource = pathApi.sep === "\\" ? mapping.path.toLowerCase() : mapping.path
    if ((pathApi.sep === "\\" && mapping.file !== mappedFile) || mappedFile !== forward(relative(file)) || !/^\.github\/workflows\/input-\d+\.yaml$/.test(mappedFile) || ReviewNativeFiles.containedPath(root, mapping.path) !== mapping.path || !/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(mapping.path)) return refusal("invalid-projection")
    if (pairs.has(mappedFile) || sources.has(mappedSource) || prepared.files.filter((candidate) => candidate === file).length !== 1) return refusal("invalid-projection")
    pairs.add(mappedFile)
    sources.add(mappedSource)
  }
  const argv = [executable, "-no-color", "-shellcheck=", "-pyflakes=", "-config-file", prepared.config, "-format", "{{json .}}", "--", ...prepared.files]
  if (argv.some((arg) => arg.includes("\0")) || argv.reduce((sum, arg) => sum + Buffer.byteLength(arg) + 1, 0) > Probe.Limits.outputBytes) return refusal("argv-bound")
  return { status: "ok" as const, argv }
}

function canonicalRelative(value: string, windows: boolean) {
  return windows ? value.replaceAll("\\", "/") : value
}

async function captureIdentity(root: string, file: string) {
  const pathApi = ReviewNativeFiles.flavor(root)
  const relative = pathApi.relative(root, file)
  const parents: { path: string; stat: { dev: number; ino: number } }[] = []
  const pathRoot = pathApi.parse(root).root
  let cursor = pathRoot
  for (const segment of [...pathApi.relative(pathRoot, root).split(pathApi.sep), ...relative.split(pathApi.sep).slice(0, -1)].filter(Boolean)) {
    cursor = pathApi.join(cursor, segment)
    const stat = await lstat(cursor)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("workflow-parent-replaced")
    parents.push({ path: cursor, stat })
  }
  const leaf = await lstat(file)
  if (leaf.isSymbolicLink() || !leaf.isFile()) throw new Error("workflow-leaf-replaced")
  return { file: leaf, parents }
}

function sameIdentity(left: { dev: number; ino: number }, right: { dev: number; ino: number }) {
  return left.dev === right.dev && left.ino === right.ino
}

function isRefusal(error: unknown): error is { status: "not-run" | "unsupported"; reason: string } {
  return !!error && typeof error === "object" && "reason" in error && typeof error.reason === "string" && "status" in error && (error.status === "not-run" || error.status === "unsupported")
}

export function environment(root: string, input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const base = ResearchProcess.environment(input)
  return { ...Object.fromEntries(Object.entries(base).filter(([key]) => !/^(ACTIONLINT|SHELLCHECK|PYFLAKES|GO)/i.test(key))), HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: path.join(root, ".config"), XDG_CACHE_HOME: path.join(root, ".cache"), TMPDIR: root, TMP: root, TEMP: root, NO_COLOR: "1" }
}
