export * as ActivityArmProof from "./activity-arm-proof"

import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, readdir, readFile, readlink, realpath } from "node:fs/promises"
import path from "node:path"

// A bounded observation, not an OS lease. The caller must revalidate before an effect.
export async function inspect(input: { worktree: string; name: ".turbo" | "node_modules" }, signal?: AbortSignal) {
  if (process.platform !== "linux" || !path.isAbsolute(input.worktree)) return undefined
  try {
    signal?.throwIfAborted()
    const worktree = await realpath(input.worktree)
    if (worktree !== input.worktree || ![".turbo", "node_modules"].includes(input.name)) return undefined
    const target = path.join(worktree, input.name)
    const root = await lstat(target, { bigint: true })
    if (!root.isDirectory() || root.isSymbolicLink()) return undefined
    const hash = createHash("sha256")
    const inodes = new Set<string>()
    const paths: string[] = []
    const signatures = new Map<string, string>()
    let bytes = 0
    const walk = async (file: string): Promise<void> => {
      signal?.throwIfAborted()
      if (paths.length >= 10000) throw new Error("object too large")
      const before = await lstat(file, { bigint: true })
      if (before.dev !== root.dev || (!before.isDirectory() && !before.isFile()) || (before.isFile() && before.nlink !== 1n)) throw new Error("unsafe object")
      paths.push(file)
      signatures.set(file, [before.dev, before.ino, before.mode, before.nlink, before.size, before.mtimeNs, before.ctimeNs].join(":"))
      inodes.add(`${before.dev}:${before.ino}`)
      hash.update(JSON.stringify([path.relative(target, file), String(before.dev), String(before.ino), String(before.mode), String(before.nlink), String(before.size), String(before.mtimeNs), String(before.ctimeNs)]))
      if (before.isDirectory()) {
        const entries = (await readdir(file)).sort()
        for (const entry of entries) await walk(path.join(file, entry))
      } else {
        bytes += Number(before.size)
        if (bytes > 64 * 1024 * 1024) throw new Error("object too large")
        const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        try {
          const opened = await handle.stat({ bigint: true })
          if (opened.dev !== before.dev || opened.ino !== before.ino || !opened.isFile()) throw new Error("object changed")
          hash.update(await handle.readFile())
        } finally {
          await handle.close()
        }
      }
      const after = await lstat(file, { bigint: true })
      if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.nlink !== after.nlink || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("object changed")
    }
    await walk(target)
    // Unknown application lock formats are held rather than interpreted as stale.
    const applicationLock = paths.some((file) => /(^|[.\-_])(lock|lck)([.\-_]|$)/i.test(path.basename(file)))
    const heldPath = (value: string) => value === worktree || value.startsWith(worktree + "/")
    const pids = (await readdir("/proc")).filter((value) => /^\d+$/.test(value)).sort()
    let held = applicationLock
    for (const pid of pids) {
      signal?.throwIfAborted()
      const proc = `/proc/${pid}`
      const stat = await readFile(`${proc}/stat`, "utf8")
      const end = stat.lastIndexOf(")")
      if (end < 0) throw new Error("invalid process stat")
      const fields = stat.slice(end + 2).split(" ")
      if (fields[0] === "Z" || fields[0] === "X") continue
      const cmdline = await readFile(`${proc}/cmdline`, "utf8")
      // Kernel threads have no address space and cannot own a userspace cwd or fd.
      if (!cmdline && fields[1] === "2") continue
      const cwd = await readlink(`${proc}/cwd`)
      const environment = await readFile(`${proc}/environ`, "utf8")
      const maps = await readFile(`${proc}/maps`, "utf8")
      const args = cmdline.split("\0")
      if (heldPath(cwd) || environment.split("\0").some((entry) => entry.includes(worktree))) held = true
      for (const line of maps.split("\n")) {
        if (!line) continue
        const match = line.match(/^[0-9a-f]+-[0-9a-f]+\s+\S+\s+\S+\s+([0-9a-f]+):([0-9a-f]+)\s+(\d+)/i)
        if (!match) throw new Error("unrecognized map")
        const major = BigInt(`0x${match[1]}`)
        const minor = BigInt(`0x${match[2]}`)
        const dev = ((major & 0xfffn) << 8n) | (minor & 0xffn) | ((minor & ~0xffn) << 12n) | ((major & ~0xfffn) << 32n)
        if (inodes.has(`${dev}:${match[3]}`)) held = true
      }
      if (args.some((arg, index) => (arg === "-C" && args[index + 1] && heldPath(path.resolve(cwd, args[index + 1]))) || (arg.startsWith("-C") && arg.length > 2 && heldPath(path.resolve(cwd, arg.slice(2)))))) held = true
      for (const fd of await readdir(`${proc}/fd`)) {
        const link = await readlink(`${proc}/fd/${fd}`)
        if (heldPath(link.replace(/ \(deleted\)$/, ""))) held = true
      }
      const after = await readFile(`${proc}/stat`, "utf8")
      const afterEnd = after.lastIndexOf(")")
      if (afterEnd < 0 || fields[19] !== after.slice(afterEnd + 2).split(" ")[19]) throw new Error("process changed")
    }
    if (JSON.stringify(pids) !== JSON.stringify((await readdir("/proc")).filter((value) => /^\d+$/.test(value)).sort())) return undefined
    // /proc/locks uses hexadecimal major:minor and decimal inode.
    const locks = await readFile("/proc/locks", "utf8")
    for (const line of locks.split("\n")) {
      if (!line) continue
      const match = line.match(/\b([0-9a-f]+):([0-9a-f]+):(\d+)\b/i)
      if (!match) throw new Error("unrecognized lock")
      const major = BigInt(`0x${match[1]}`)
      const minor = BigInt(`0x${match[2]}`)
      const dev = ((major & 0xfffn) << 8n) | (minor & 0xffn) | ((minor & ~0xffn) << 12n) | ((major & ~0xfffn) << 32n)
      if (inodes.has(`${dev}:${match[3]}`)) held = true
    }
    for (const file of paths) {
      const current = await lstat(file, { bigint: true })
      if (signatures.get(file) !== [current.dev, current.ino, current.mode, current.nlink, current.size, current.mtimeNs, current.ctimeNs].join(":")) return undefined
    }
    signal?.throwIfAborted()
    return { fingerprint: hash.digest("hex"), idle: !held }
  } catch {
    return undefined
  }
}
