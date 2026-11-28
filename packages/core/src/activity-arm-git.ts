export * as ActivityArmGit from "./activity-arm-git"

import { createHash } from "node:crypto"
import { constants, type BigIntStats } from "node:fs"
import { lstat, open, readlink, realpath, type FileHandle } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { AppProcess } from "./process"

type Checkout = { root: string; directory: string; name: ".turbo" | "node_modules" }
const readFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const decoder = new TextDecoder("utf8", { fatal: true, ignoreBOM: true })
const maxFiles = 4096
const maxTrackedBytes = 64 * 1024 * 1024

export function make(processService: AppProcess.Interface) {
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))),
    GIT_ALLOW_PROTOCOL: "",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_TERMINAL_PROMPT: "0",
  }
  const git = (cwd: string, args: readonly string[]) => processService.run(ChildProcess.make("git", [
    "--no-pager", "--no-optional-locks", "-c", "core.fsmonitor=false", ...args,
  ], { cwd, env, extendEnv: false, stdin: "ignore" }), {
    timeout: "2 seconds", maxOutputBytes: 1024 * 1024, maxErrorBytes: 4 * 1024,
  }).pipe(Effect.map((result) => result.stdoutTruncated || result.stderr.length > 0 || result.stderrTruncated ? undefined : result),
    Effect.orElseSucceed(() => undefined))

  const placement = Effect.fnUntraced(function* (input: Checkout) {
    const root = yield* git(input.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    const common = root?.exitCode === 0 ? decode(root.stdout)?.match(/^([^\n]+)\n$/)?.[1] : undefined
    if (!common || !path.isAbsolute(common)) return undefined

    const registered = yield* git(input.root, ["worktree", "list", "--porcelain", "-z"])
    const entries = registered?.exitCode === 0 ? decode(registered.stdout)?.split("\0\0") : undefined
    if (!entries || (!worktreeEntry(entries, input.root) && input.root !== common)) return undefined
    const entry = worktreeEntry(entries, input.directory)
    const head = entry?.split("\0").find((field) => /^HEAD (?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(field))?.slice(5)
    if (!entry || !head) return undefined

    const placed = yield* git(input.directory, [
      "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir", "--absolute-git-dir", "HEAD",
    ])
    const fields = placed?.exitCode === 0 ? decode(placed.stdout)?.split("\n") : undefined
    const admin = fields?.[2]
    if (!admin || fields?.length !== 5 || fields[0] !== input.directory || fields[1] !== common ||
      fields[3] !== head || fields[4] !== "" || path.dirname(admin) !== path.join(common, "worktrees")) return undefined
    const links = yield* Effect.tryPromise(() => reciprocalLinks(input, common, admin)).pipe(Effect.orElseSucceed(() => undefined))
    if (!links) return undefined
    return { head, admin, fingerprint: JSON.stringify([entry, common, admin, links]) }
  })

  return Effect.fnUntraced(function* (input: Checkout) {
    const bound = yield* placement(input)
    if (!bound) return undefined
    const index = path.join(bound.admin, "index")
    const indexIdentity = () => Effect.tryPromise(async () => {
      const info = await lstat(index, { bigint: true })
      return info.isFile() ? identity(info) : undefined
    }).pipe(Effect.orElseSucceed(() => undefined))
    const indexBefore = yield* indexIdentity()
    if (!indexBefore) return undefined
    const indexFiles = () => git(input.directory, ["ls-files", "--stage", "-v", "-z"])
    const listed = yield* indexFiles()
    if (listed?.exitCode !== 0) return undefined
    const ignored = () => git(input.directory, ["check-ignore", "--no-index", "--", input.name + "/"])
    const rule = yield* ignored()
    if (rule?.exitCode !== 0) return rule?.exitCode === 1 ? { state: "refused" as const } : undefined

    // Cached diff and index listing never convert a working file. Read the tracked bytes ourselves.
    const staged = yield* git(input.directory, [
      "diff-index", "--cached", "--quiet", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", bound.head, "--",
    ])
    if (staged?.exitCode !== 0) return staged?.exitCode === 1 ? { state: "dirty" as const } : undefined
    const tracked = yield* Effect.tryPromise((signal) => trackedFiles(input, listed.stdout, bound.head, signal))
      .pipe(Effect.orElseSucceed(() => undefined))
    if (tracked?.state !== "clean") return tracked
    return {
      state: "clean" as const,
      fingerprint: bound.fingerprint,
      isCurrent: () => Effect.gen(function* () {
        const files = yield* indexFiles()
        if (files?.exitCode !== 0 || !files.stdout.equals(listed.stdout)) return false
        const rule = yield* ignored()
        if (rule?.exitCode !== 0 || (yield* indexIdentity()) !== indexBefore) return false
        const current = yield* placement(input)
        if (current?.fingerprint !== bound.fingerprint || (yield* indexIdentity()) !== indexBefore) return false
        return yield* Effect.tryPromise((signal) => tracked.isCurrent(signal)).pipe(Effect.orElseSucceed(() => false))
      }),
    }
  })
}

function worktreeEntry(entries: readonly string[], directory: string) {
  const matches = entries.filter((record) => record.startsWith(`worktree ${directory}\0`))
  const entry = matches.length === 1 ? matches[0] : undefined
  return entry && !entry.split("\0").some((field) => /^prunable( |$)/.test(field)) ? entry : undefined
}

async function reciprocalLinks(input: Checkout, common: string, admin: string) {
  const directories = await Promise.all([input.root, input.directory, common, admin].map(async (file) => {
    if (await realpath(file) !== file) return undefined
    const info = await lstat(file, { bigint: true })
    return info.isDirectory() ? inode(info) : undefined
  }))
  if (directories.some((entry) => !entry)) return undefined

  const dotGit = path.join(input.directory, ".git")
  const outward = await marker(dotGit)
  const inward = await marker(path.join(admin, "gitdir"))
  const gitdir = outward?.text.match(/^gitdir: ([^\r\n]+)$/)?.[1]
  if (!outward || !gitdir || path.resolve(input.directory, gitdir) !== admin || !inward ||
    /[\r\n]/.test(inward.text) || path.resolve(admin, inward.text) !== dotGit) return undefined
  return [directories, outward.signature, inward.signature]
}

async function marker(file: string) {
  const handle = await open(file, readFlags)
  try {
    const first = await handle.stat({ bigint: true })
    if (!first.isFile() || first.size < 1n || first.size > 4096n) return undefined
    const bytes = Buffer.alloc(Number(first.size) + 1)
    const length = await readInto(handle, bytes)
    const signature = identity(first)
    if (length !== Number(first.size) || identity(await handle.stat({ bigint: true })) !== signature ||
      identity(await lstat(file, { bigint: true })) !== signature) return undefined
    const text = decode(bytes.subarray(0, length))?.replace(/[\r\n]+$/, "")
    return text && !text.includes("\0") ? { text, signature } : undefined
  } finally {
    await handle.close()
  }
}

async function trackedFiles(input: Checkout, output: Buffer, head: string, signal: AbortSignal) {
  const text = decode(output)
  if (text === undefined || (text && !text.endsWith("\0"))) return undefined
  const records = text.split("\0").slice(0, -1)
  if (records.length > maxFiles) return undefined

  const signatures = new Map<string, string>()
  const root = await open(input.directory, readFlags | constants.O_DIRECTORY)
  const folders: Array<{ name: string; handle: FileHandle }> = []
  const buffer = Buffer.allocUnsafe(64 * 1024)
  const algorithm = head.length === 40 ? "sha1" : "sha256"
  let read = 0
  try {
    const rootInfo = await root.stat({ bigint: true })
    if (identity(rootInfo) !== identity(await lstat(input.directory, { bigint: true }))) return undefined
    signatures.set(input.directory, identity(rootInfo))
    for (const record of records) {
      signal.throwIfAborted()
      const entry = /^H (100644|100755|120000) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(record)
      if (!entry || entry[2]!.length !== head.length) return undefined
      const relative = entry[3]!
      const parts = relative.split("/")
      if (parts[0] === input.name) return { state: "refused" as const }
      if (parts.length > 24 || parts.some((part) => !part || part === "." || part === ".." || part === ".git")) return undefined
      const file = path.join(input.directory, relative)
      if (signatures.has(file)) return undefined

      const name = parts.pop()!
      const shared = folders.findIndex((folder, index) => folder.name !== parts[index])
      if (shared !== -1) for (const folder of folders.splice(shared).reverse()) await folder.handle.close()
      for (const part of parts.slice(folders.length)) {
        const parent = folders.at(-1)?.handle ?? root
        const handle = await open(`/proc/self/fd/${parent.fd}/${part}`, readFlags | constants.O_DIRECTORY)
        folders.push({ name: part, handle })
        const info = await handle.stat({ bigint: true })
        const directory = path.join(input.directory, ...folders.map((folder) => folder.name))
        if (info.dev !== rootInfo.dev || (signatures.has(directory) && signatures.get(directory) !== identity(info))) return undefined
        signatures.set(directory, identity(info))
      }
      const parent = folders.at(-1)?.handle ?? root
      const reference = `/proc/self/fd/${parent.fd}/${name}`
      const info = await lstat(reference, { bigint: true })
      if (info.dev !== rootInfo.dev || info.size > BigInt(maxTrackedBytes - read)) return undefined
      const size = Number(info.size)
      const hash = createHash(algorithm).update(`blob ${size}\0`)
      if (entry[1] === "120000") {
        if (!info.isSymbolicLink()) return { state: "dirty" as const }
        const target = await readlink(reference, { encoding: "buffer" })
        if (target.length !== size) return undefined
        hash.update(target)
      } else {
        if (!info.isFile() || ((info.mode & 0o100n) !== 0n) !== (entry[1] === "100755")) return { state: "dirty" as const }
        const handle = await open(reference, readFlags)
        try {
          if (identity(await handle.stat({ bigint: true })) !== identity(info)) return undefined
          for (let remaining = size; remaining > 0;) {
            signal.throwIfAborted()
            const { bytesRead } = await handle.read(buffer, 0, Math.min(remaining, buffer.length), null)
            if (!bytesRead) return undefined
            hash.update(buffer.subarray(0, bytesRead))
            remaining -= bytesRead
          }
          if (identity(await handle.stat({ bigint: true })) !== identity(info)) return undefined
        } finally {
          await handle.close()
        }
      }
      if (hash.digest("hex") !== entry[2]) return { state: "dirty" as const }
      read += size
      signatures.set(file, identity(info))
    }
    return {
      state: "clean" as const,
      async isCurrent(currentSignal: AbortSignal) {
        for (const [file, signature] of signatures) {
          currentSignal.throwIfAborted()
          if (identity(await lstat(file, { bigint: true })) !== signature) return false
        }
        return true
      },
    }
  } finally {
    await Promise.all([...folders.map((folder) => folder.handle.close()), root.close()])
  }
}

async function readInto(handle: FileHandle, buffer: Buffer) {
  let length = 0
  while (length < buffer.length) {
    const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null)
    if (!bytesRead) break
    length += bytesRead
  }
  return length
}

function decode(bytes: Buffer) {
  try {
    return decoder.decode(bytes)
  } catch {
    return undefined
  }
}

function inode(info: BigIntStats) {
  return `${info.dev}:${info.ino}`
}

function identity(info: BigIntStats) {
  return [inode(info), info.mode, info.size, info.mtimeNs, info.ctimeNs].join(":")
}
