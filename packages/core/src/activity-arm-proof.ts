export * as ActivityArmProof from "./activity-arm-proof"

import { createHash } from "node:crypto"
import type { BigIntStats } from "node:fs"
import { lstat, opendir, readFile, readlink, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { ActivityObjectProof } from "./activity-object-proof"

const maxEntries = 10_000
const kernelThread = 0x00200000

// This observation expires at the boundary of the caller's decision. It does not reserve the object.
export async function inspect(input: { worktree: string; name: ".turbo" | "node_modules" }, signal?: AbortSignal) {
  const uid = process.geteuid?.()
  if (process.platform !== "linux" || uid === undefined || !path.isAbsolute(input.worktree)) return undefined
  try {
    signal?.throwIfAborted()
    const worktree = await realpath(input.worktree)
    if (worktree !== input.worktree) return undefined
    const object = path.join(worktree, input.name)
    const root = await lstat(worktree, { bigint: true })
    const tree = await captureTree(object, root, BigInt(uid), signal)
    if (!tree) return undefined
    const use = await captureUse(worktree, object, tree.inodes, signal)
    if (!use) return undefined
    if (!tree.matches(await lstat(worktree, { bigint: true }))) return undefined
    for (const [file, signature] of tree.entries) {
      signal?.throwIfAborted()
      if (identity(await lstat(file, { bigint: true })) !== signature) return undefined
    }
    signal?.throwIfAborted()
    const proof = ActivityObjectProof.evaluate({
      objectID: object,
      matched: true,
      claimant: use.claimant ? "present" : "absent",
      checks: [
        { objectID: object, method: "cwd", outcome: use.cwd ? "holder" : "clear" },
        { objectID: object, method: "git-c", outcome: use.git ? "holder" : "clear" },
        { objectID: object, method: "open-file", outcome: use.open ? "holder" : "clear" },
        { objectID: object, method: "live-lock", outcome: use.lock || tree.lock ? "holder" : "clear" },
      ],
    })
    return { fingerprint: tree.fingerprint, idle: proof.state === "idle" }
  } catch {
    return undefined
  }
}

async function captureTree(object: string, root: BigIntStats, uid: bigint, signal?: AbortSignal) {
  if (!root.isDirectory() || root.uid !== uid) return undefined
  const mountInfo = await readFile("/proc/self/mountinfo", "utf8")
  if (mountInfo.split("\n").some((line) => {
    const point = line.split(" ")[4]?.replace(/\\([0-7]{3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    return point && within(object, point)
  })) return undefined
  const entries = new Map<string, string>()
  const inodes = new Set<string>()
  const directories = [object]
  let lock = false
  while (directories.length) {
    signal?.throwIfAborted()
    const file = directories.pop()!
    const entry = await lstat(file, { bigint: true })
    if (entries.size === maxEntries || entry.uid !== uid || entry.dev !== root.dev ||
      (!entry.isDirectory() && !entry.isFile()) || (entry.isFile() && entry.nlink !== 1n) ||
      (file === object && !entry.isDirectory())) return undefined
    entries.set(file, identity(entry))
    inodes.add(inode(entry))
    if (entry.isDirectory()) {
      const directory = await opendir(file)
      for await (const item of directory) {
        if (directories.length + entries.size === maxEntries || item.name.includes("\uFFFD")) return undefined
        directories.push(path.join(file, item.name))
      }
    }
    // Unknown application lock formats cannot prove idleness. Kernel locks are checked separately.
    lock ||= /(^|[.\-_])(lock|lck)([.\-_]|$)/i.test(path.basename(file))
  }
  const rootIdentity = identity(root)
  const hash = createHash("sha256").update(rootIdentity)
  for (const [file, signature] of [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    hash.update(JSON.stringify([path.relative(object, file), signature]))
  return { fingerprint: hash.digest("hex"), entries, inodes, lock, matches: (current: BigIntStats) => identity(current) === rootIdentity }
}

async function captureUse(worktree: string, object: string, inodes: ReadonlySet<string>, signal?: AbortSignal) {
  const proc = (await readFile("/proc/self/mountinfo", "utf8")).split("\n")
    .find((line) => line.split(" ")[4] === "/proc")
  if (!proc || !proc.includes(" - proc ") || /\b(hidepid=[^0,\s]|subset=pid)/.test(proc)) return undefined
  const usage = { cwd: false, git: false, open: false, lock: false, claimant: false }
  const pids = await numbers("/proc")
  if (!pids.length || pids.length > 1024) return undefined
  let tasks = 0
  let descriptors = 0
  for (const pid of pids) {
    signal?.throwIfAborted()
    const base = `/proc/${pid}`
    const first = await processStat(base)
    if (first.state === "Z" || first.state === "X" || (first.flags & kernelThread) !== 0) continue
    const threads = await numbers(`${base}/task`)
    tasks += threads.length
    if (!threads.length || tasks > 4096) return undefined
    const [args, env, maps] = await Promise.all(["cmdline", "environ", "maps"].map((entry) =>
      readFile(`${base}/${entry}`, "utf8"),
    ))
    usage.claimant ||= env.split("\0").some((entry) => entry.includes(object))
    usage.open ||= maps.split("\n").filter(Boolean).some((line) => {
      const match = line.match(/^\S+\s+\S+\s+\S+\s+([0-9a-f]+):([0-9a-f]+)\s+(\d+)/i)
      if (!match) throw new Error("Unrecognized process mapping")
      return inodes.has(deviceInode(match))
    })
    for (const thread of threads) {
      signal?.throwIfAborted()
      const task = `${base}/task/${thread}`
      const cwd = await readlink(`${task}/cwd`)
      usage.cwd ||= within(worktree, cwd)
      usage.git ||= gitDirectory(args, cwd, worktree)
      const fds = await numbers(`${task}/fd`)
      descriptors += fds.length
      if (descriptors > 65_536) return undefined
      for (const fd of fds) {
        signal?.throwIfAborted()
        const reference = `${task}/fd/${fd}`
        const value = await readlink(reference).catch((error: NodeJS.ErrnoException) => {
          // Enumerating our own FD directory briefly publishes the enumeration's closed handle.
          if (Number(pid) === process.pid && error.code === "ENOENT") return undefined
          throw error
        })
        if (!value?.startsWith("/")) continue
        if (within(object, value.replace(/ \(deleted\)$/, ""))) usage.open = true
        if (inodes.has(inode(await stat(reference, { bigint: true })))) usage.open = true
      }
    }
    if ((await processStat(base)).birth !== first.birth || !sameIDs(threads, await numbers(`${base}/task`))) return undefined
  }
  if (!sameIDs(pids, await numbers("/proc"))) return undefined
  const locks = await readFile("/proc/locks", "utf8")
  usage.lock = locks.split("\n").filter(Boolean).some((line) => {
    const match = line.match(/\b([0-9a-f]+):([0-9a-f]+):(\d+)\b/i)
    if (!match) throw new Error("Unrecognized kernel lock")
    return inodes.has(deviceInode(match))
  })
  return usage
}

async function processStat(directory: string) {
  const content = await readFile(`${directory}/stat`, "utf8")
  const end = content.lastIndexOf(")")
  const fields = content.slice(end + 2).split(" ")
  if (end < 0 || !/^\d+$/.test(fields[6] ?? "") || !/^\d+$/.test(fields[19] ?? "")) throw new Error("Invalid process identity")
  return { state: fields[0], flags: Number(fields[6]), birth: fields[19] }
}

async function numbers(directory: string) {
  const result: string[] = []
  const entries = await opendir(directory)
  for await (const entry of entries) {
    if (result.length >= 65_536) throw new Error("Linux process inventory is too large")
    if (/^\d+$/.test(entry.name)) result.push(entry.name)
  }
  return result.sort()
}

function gitDirectory(cmdline: string, cwd: string, worktree: string) {
  const args = cmdline.split("\0")
  if (path.basename(args[0] ?? "") !== "git") return false
  let directory = cwd
  for (const [index, arg] of args.entries()) {
    if (arg !== "-C") continue
    const next = args[index + 1]
    if (!next) continue
    directory = path.resolve(directory, next)
    if (within(worktree, directory)) return true
  }
  return false
}

function within(root: string, file: string) {
  return file === root || file.startsWith(root + "/")
}

function sameIDs(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function inode(entry: BigIntStats) {
  return `${entry.dev}:${entry.ino}`
}

function identity(entry: BigIntStats) {
  return [entry.dev, entry.ino, entry.mode, entry.uid, entry.gid, entry.nlink, entry.size, entry.mtimeNs, entry.ctimeNs].join(":")
}

function deviceInode(fields: RegExpMatchArray) {
  const major = BigInt(`0x${fields[1]}`)
  const minor = BigInt(`0x${fields[2]}`)
  const device = ((major & 0xfffn) << 8n) | (minor & 0xffn) | ((minor & ~0xffn) << 12n) | ((major & ~0xfffn) << 32n)
  return `${device}:${fields[3]}`
}
