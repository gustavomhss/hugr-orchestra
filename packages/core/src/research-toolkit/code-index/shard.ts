export * as CodeIndexShard from "./shard"

import { createHash } from "node:crypto"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { parse } from "jsonc-parser"
import { Research } from "@orchestra/schema/research"
import { AppProcess } from "../../process"
import { ReviewGit } from "../../review-toolkit/git"
import type { Language } from "../index"

// J2.1 shard discovery, J2.2 shard keys and J2.14 git under a sanitized environment. Every path is repo-relative
// posix; a project at the repository root is ".".

export type Shard = {
  readonly id: string
  readonly language: Language
  readonly project: string
  /** The project's own source files at the commit: files under a nested project belong to that project. */
  readonly files: ReadonlyArray<string>
  /** The project config (tsconfig.json, pyproject.toml, go.mod, Cargo.toml), absent for an implicit Python root. */
  readonly config?: string
}

export type Indexer = { readonly id: string; readonly version: string }

/** One git invocation in the bound worktree; `stdin` feeds batch commands. */
export type Git = {
  readonly run: (args: ReadonlyArray<string>, stdin?: string) => Effect.Effect<Buffer, Research.Error>
}

export type Tree = {
  readonly commit: string
  /** Every tracked file at the commit with its blob id. */
  readonly blobs: ReadonlyMap<string, string>
  /** Regular files only. A link's blob is its target text, never the linked file's bytes. */
  readonly regular?: ReadonlySet<string>
}

const EXTENSIONS: Record<string, Language> = {
  ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts", ".js": "ts", ".jsx": "ts", ".mjs": "ts", ".cjs": "ts",
  ".py": "py", ".go": "go", ".rs": "rust",
}
const MARKERS: Record<string, Language> = {
  "tsconfig.json": "ts", "pyproject.toml": "py", "setup.cfg": "py", "setup.py": "py", "go.mod": "go", "Cargo.toml": "rust",
}
const LOCKFILES = [
  "bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "uv.lock", "poetry.lock", "Pipfile.lock", "requirements.txt", "go.sum", "Cargo.lock",
]

/** The language a source file is indexed as, or undefined when no shard kind covers it. */
export const language = (file: string): Language | undefined => EXTENSIONS[path.posix.extname(file)]

/** Git in the worktree with no caller GIT_*, NODE_OPTIONS or NODE_PATH and no global or system config (J2.14). */
export const live = (root: string) =>
  Effect.gen(function* () {
    const proc = yield* AppProcess.Service
    const env = environment()
    return {
      run: (args, stdin) =>
        // No output caps: an uncapped, all-pipe command is collected natively by omni (OmniSpawner.collectable).
        proc.run(ChildProcess.make("git", [...args], { cwd: root, env, extendEnv: false }), { stdin, timeout: "60 seconds" }).pipe(
          Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: `git ${args[0]} could not run` })),
          Effect.flatMap((result) => result.exitCode !== 0 || result.stdoutTruncated
            ? Effect.fail(new Research.Error({ code: "source_unavailable", message: `git ${args[0]} failed: ${result.stderr.toString("utf8").trim().slice(0, 500)}` }))
            : Effect.succeed(result.stdout)),
        ),
    } satisfies Git
  })

const COMMIT_ID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/
const CAPTURED_COMMANDS = new Set(["rev-parse", "ls-tree", "cat-file", "status"])
const CAPTURED_OUTPUT_CAP = 16 * 1024 * 1024

/** Immutable committed-tree view: real git at `commit`, never the live worktree or a replacement object. */
export const captured = (root: string, commit: string): Effect.Effect<Git, Research.Error, AppProcess.Service> =>
  Effect.gen(function* () {
    if (!COMMIT_ID.test(commit))
      return yield* new Research.Error({ code: "source_unavailable", message: "commit must be a full lowercase hex id" })
    const git = yield* immutable(root)
    const resolved = yield* git.run(["rev-parse", "--verify", `${commit}^{commit}`])
    if (resolved.toString("utf8").trim() !== commit)
      return yield* new Research.Error({ code: "source_unavailable", message: "commit did not resolve to the given id" })
    return {
      run: (args, stdin) => git.run(args.map((arg) => arg === "HEAD^{commit}" ? `${commit}^{commit}` : arg), stdin),
    } satisfies Git
  })

/** A host-owned object may identify a commit or a tree; this returns its actual tree, never a semantic commit. */
export const resolveTree = (root: string, revision: string) => Effect.gen(function* () {
  if (!COMMIT_ID.test(revision))
    return yield* new Research.Error({ code: "source_unavailable", message: "tree revision must be a full lowercase hex id" })
  const git = yield* immutable(root)
  const tree = (yield* git.run(["rev-parse", "--verify", "--end-of-options", `${revision}^{tree}`])).toString("utf8").trim()
  if (!COMMIT_ID.test(tree) || (yield* git.run(["cat-file", "-t", tree])).toString("utf8").trim() !== "tree")
    return yield* new Research.Error({ code: "source_unavailable", message: "revision did not resolve to a tree" })
  return { git, tree }
})

/** No replace refs, lazy object fetches, writes or caller-controlled Git configuration. */
const immutable = (root: string) => Effect.gen(function* () {
  const proc = yield* AppProcess.Service
  const env = { ...environment(), ...ReviewGit.environment }
  return {
    run: (args, stdin) => {
      const command = args[0]
      if (!CAPTURED_COMMANDS.has(command ?? ""))
        return Effect.fail(new Research.Error({ code: "source_unavailable", message: `git ${command ?? ""} is not allowed` }))
      if (command === "status") return Effect.succeed(Buffer.alloc(0))
      return proc.run(ChildProcess.make("git", [...args], { cwd: root, env, extendEnv: false }), {
        stdin, timeout: "60 seconds", maxOutputBytes: CAPTURED_OUTPUT_CAP, maxErrorBytes: CAPTURED_OUTPUT_CAP,
      }).pipe(
        Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: `git ${command} could not run` })),
        Effect.flatMap((result) => result.exitCode !== 0 || result.stdoutTruncated || result.outputTruncated
          ? Effect.fail(new Research.Error({ code: "source_unavailable", message: `git ${command} failed: ${result.stderr.toString("utf8").trim().slice(0, 500)}` }))
          : Effect.succeed(result.stdout)),
      )
    },
  } satisfies Git
})

/** As modules/maestro/arsenal/src/engine/process.ts: the caller environment minus anything that redirects git. */
export function environment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined &&
      !entry[0].toUpperCase().startsWith("GIT_") && !["NODE_OPTIONS", "NODE_PATH"].includes(entry[0].toUpperCase()))),
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0",
  }
}

export const head = (git: Git) =>
  git.run(["rev-parse", "--verify", "HEAD^{commit}"]).pipe(Effect.map((out) => out.toString("utf8").trim()))

/** The absolute git common dir, shared by every worktree of the repository (J2.3 repoKey). */
export const commonDir = (git: Git) =>
  git.run(["rev-parse", "--path-format=absolute", "--git-common-dir"]).pipe(Effect.map((out) => out.toString("utf8").trim()))

export const tree = (git: Git, commit: string) =>
  git.run(["ls-tree", "-r", "-z", "--full-tree", commit]).pipe(Effect.map((out): Tree => ({
    commit,
    // `<mode> <type> <oid>\t<path>`; submodules (commit entries) carry no indexable files.
    blobs: new Map(out.toString("utf8").split("\0").flatMap((entry) => {
      const tab = entry.indexOf("\t")
      const fields = entry.slice(0, tab).split(" ")
      return tab > 0 && fields[1] === "blob" ? [[entry.slice(tab + 1), fields[2]!] as const] : []
    })),
    regular: new Set(out.toString("utf8").split("\0").flatMap((entry) => {
      const tab = entry.indexOf("\t")
      const fields = entry.slice(0, tab).split(" ")
      return tab > 0 && /^(100644|100755)$/.test(fields[0] ?? "") && fields[1] === "blob" ? [entry.slice(tab + 1)] : []
    })),
  })))

/** Paths that differ from HEAD in the worktree: modified, added, deleted and untracked (J2.8). */
export const dirty = (git: Git) =>
  git.run(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"]).pipe(Effect.map((out) =>
    out.toString("utf8").split("\0").filter((entry) => entry.length > 3).map((entry) => ({
      path: entry.slice(3),
      deleted: entry[0] === "D" || entry[1] === "D",
    }))))

/** Files changed between two commits, for `changed-since-index` (J2.11). */
export const changed = (git: Git, from: string, to: string) =>
  git.run(["diff", "--name-only", "-z", "--no-renames", from, to]).pipe(
    Effect.map((out) => out.toString("utf8").split("\0").filter(Boolean)))

/** Raw captured blobs, with exact batch framing. Hashes must be computed before any UTF-8 conversion. */
export const bytes = (git: Git, tree: Tree, files: ReadonlyArray<string>) => Effect.gen(function* () {
  if (files.length === 0) return new Map<string, Buffer>()
  const ids = files.map((file) => tree.blobs.get(file))
  if (ids.some((id) => id === undefined || !COMMIT_ID.test(id)))
    return yield* new Research.Error({ code: "source_unavailable", message: "captured blob path is unavailable" })
  const out = yield* git.run(["cat-file", "--batch"], ids.join("\n") + "\n")
  const result = new Map<string, Buffer>()
  const position = { offset: 0 }
  for (const [index, file] of files.entries()) {
    const newline = out.indexOf(10, position.offset)
    const header = /^(\S+) blob (\d+)$/.exec(out.subarray(position.offset, newline).toString("utf8"))
    const size = Number(header?.[2])
    const end = newline + 1 + size
    if (newline < position.offset || header?.[1] !== ids[index] || !Number.isSafeInteger(size) || size < 0 ||
      end >= out.length || out[end] !== 10)
      return yield* new Research.Error({ code: "source_unavailable", message: "captured blob batch is incomplete or invalid" })
    result.set(file, out.subarray(newline + 1, end))
    position.offset = end + 1
  }
  if (position.offset !== out.length)
    return yield* new Research.Error({ code: "source_unavailable", message: "captured blob batch has unexpected bytes" })
  return result
})

/** Blob text for configuration/discovery callers; raw-source consumers use `bytes`. */
export const contents = (git: Git, tree: Tree, files: ReadonlyArray<string>) =>
  bytes(git, tree, files).pipe(Effect.map((found) => new Map([...found].map(([file, buffer]) => [file, buffer.toString("utf8")]))))

/** The config files discovery and keys read: project markers and every tsconfig in the tree. */
export const configFiles = (tree: Tree) =>
  [...tree.blobs.keys()].filter((file) => {
    const base = path.posix.basename(file)
    return base in MARKERS || /^tsconfig.*\.json$/.test(base)
  })

/**
 * J2.1: TypeScript/JavaScript per tsconfig.json that is more than an `extends` and owns files; Python per
 * pyproject.toml, setup.cfg or setup.py, else the root; Go per go.mod; Rust per Cargo.toml. A file belongs to its
 * nearest project of its language. Files with no project are `orphans`, reported as skipped, never dropped silently.
 */
export function discover(tree: Tree, configs: ReadonlyMap<string, string>) {
  const files = [...tree.blobs.keys()].sort()
  const projects = files.flatMap((file) => {
    const kind = MARKERS[path.posix.basename(file)]
    if (!kind) return []
    if (kind === "ts" && !ownsSources(configs.get(file))) return []
    return [{ language: kind, project: path.posix.dirname(file), config: file }]
  })
  const byLanguage = Map.groupBy(projects, (project) => project.language)
  const owned = files.flatMap((file) => {
    const kind = language(file)
    if (!kind) return []
    const candidates = byLanguage.get(kind) ?? (kind === "py" ? [{ language: kind, project: ".", config: undefined }] : [])
    const owner = candidates
      .filter((project) => project.project === "." || file.startsWith(project.project + "/"))
      .sort((a, b) => b.project.length - a.project.length)[0]
    return [{ file, owner, kind }]
  })
  const groups = Map.groupBy(owned.filter((entry) => entry.owner), (entry) => `${entry.kind}:${entry.owner!.project}`)
  const shards = [...groups.entries()].map(([id, entries]): Shard => ({
    id,
    language: entries[0]!.kind,
    project: entries[0]!.owner!.project,
    files: entries.map((entry) => entry.file),
    config: entries[0]!.owner!.config,
  }))
  return { shards, orphans: owned.filter((entry) => !entry.owner).map((entry) => entry.file) }
}

// A tsconfig that is only `extends`, or a solution file with `files: []` and no include, owns no sources.
function ownsSources(text: string | undefined) {
  const config = text === undefined ? undefined : parse(text)
  if (!config || typeof config !== "object") return false
  if (Object.keys(config).every((key) => key === "extends")) return false
  return !(Array.isArray(config.files) && config.files.length === 0 && config.include === undefined)
}

/**
 * J2.2: sha256 over the indexer, its version, the project's content, the lockfiles and the config chain. The content
 * is the blob ids of the shard's own files, which is the project's tree hash without its nested projects: a root
 * project then does not rebuild when only a nested package changes (JE-AC-X8).
 */
export function key(shard: Shard, indexer: Indexer, tree: Tree, configs: ReadonlyMap<string, string>) {
  const blob = (file: string) => [file, tree.blobs.get(file)] as const
  const lockfiles = [...new Set([".", shard.project])].flatMap((dir) =>
    LOCKFILES.map((name) => path.posix.join(dir, name)).filter((file) => tree.blobs.has(file)))
  return createHash("sha256")
    .update(JSON.stringify([
      indexer.id, indexer.version, shard.id,
      shard.files.map(blob), lockfiles.map(blob), chain(shard.config, configs).map(blob),
    ]))
    .digest("hex")
}

// The config and its relative `extends` chain; package extends are pinned by the lockfiles.
function chain(config: string | undefined, configs: ReadonlyMap<string, string>, seen: ReadonlyArray<string> = []): string[] {
  if (config === undefined || seen.includes(config) || seen.length > 16) return []
  const text = configs.get(config)
  if (text === undefined || !config.endsWith(".json")) return [config]
  const parsed = parse(text)
  const extended = parsed && typeof parsed === "object" ? [parsed.extends].flat() : []
  return [config, ...extended
    .filter((entry): entry is string => typeof entry === "string" && entry.startsWith("."))
    .map((entry) => path.posix.normalize(path.posix.join(path.posix.dirname(config), entry.endsWith(".json") ? entry : `${entry}.json`)))
    .flatMap((next) => chain(next, configs, [...seen, config]))]
}
