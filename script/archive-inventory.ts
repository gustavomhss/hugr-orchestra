import path from "node:path"

export type Scope = { path: string; disposition: "retain-recovery" | "retain-runtime" | "review-history"; owner: string; readers: string[]; uncertainty?: string }

type Entry = { path: string; mode: string; blob: string; bytes: number }

export async function archiveInventory(directory: string, revision = "HEAD", scopes?: Scope[]) {
  const input = scopes ?? await Bun.file(new URL("./archive-scopes.json", import.meta.url)).json() as Scope[]
  if (!Array.isArray(input)) throw new Error("ARCHIVE_SCOPES_EMPTY")
  const selected = Array.from(input)
  validateScopes(selected)
  const commit = await git(directory, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`])
  const tree = await git(directory, ["rev-parse", "--verify", `${commit}^{tree}`])
  const captured = await Promise.all(selected.map(async (scope) => {
    const listing = await gitBytes(directory, ["ls-tree", "-r", "-l", "-z", commit, "--", `:(literal)${scope.path}`])
    const records = new TextDecoder("utf-8", { fatal: true }).decode(listing).split("\0").filter(Boolean)
    const files = await Promise.all(records.map(async (record): Promise<Entry> => {
      const separator = record.indexOf("\t")
      if (separator < 0) throw new Error(`ARCHIVE_LISTING_INVALID:${scope.path}`)
      const [mode, kind, blob, size] = record.slice(0, separator).trim().split(/\s+/)
      const file = record.slice(separator + 1)
      if (kind !== "blob" || !["100644", "100755"].includes(mode ?? "") || !blob || !file.startsWith(`${scope.path}/`)) {
        throw new Error(`ARCHIVE_ENTRY_UNSUPPORTED:${scope.path}:${file}`)
      }
      if (!mode) throw new Error(`ARCHIVE_ENTRY_UNSUPPORTED:${scope.path}:${file}`)
      if (!size || !/^\d+$/.test(size) || !Number.isSafeInteger(Number(size))) throw new Error(`ARCHIVE_ENTRY_SIZE_INVALID:${scope.path}:${file}`)
      return { path: file, mode, blob, bytes: Number(size) }
    }))
    if (!files.length) throw new Error(`ARCHIVE_SCOPE_EMPTY:${scope.path}`)
    return { ...scope, files }
  }))
  return { format: 1 as const, source: { revision: commit, tree }, scopes: captured }
}

function validateScopes(scopes: Scope[]) {
  if (!Array.isArray(scopes) || !scopes.length) throw new Error("ARCHIVE_SCOPES_EMPTY")
  scopes.forEach((scope) => {
    if (!scope || typeof scope.path !== "string" || !scope.path || path.posix.isAbsolute(scope.path) || path.win32.isAbsolute(scope.path) || scope.path.includes("\\") || path.posix.normalize(scope.path) !== scope.path || scope.path.split("/").some((part) => !part || part === "." || part === "..") || /[\0-\x1f\x7f]/.test(scope.path)) throw new Error(`ARCHIVE_SCOPE_PATH_INVALID:${scope?.path}`)
    if (!["retain-recovery", "retain-runtime", "review-history"].includes(scope.disposition) || typeof scope.owner !== "string" || !scope.owner.trim() || !Array.isArray(scope.readers) || !scope.readers.length || Array.from(scope.readers).some((reader) => typeof reader !== "string" || !reader.trim())) throw new Error(`ARCHIVE_SCOPE_INVALID:${scope.path}`)
    if (scope.uncertainty !== undefined && (typeof scope.uncertainty !== "string" || !scope.uncertainty.trim()))
      throw new Error(`ARCHIVE_SCOPE_INVALID:${scope.path}`)
  })
  const duplicate = scopes.find((scope, index) => scopes.some((other, otherIndex) => otherIndex !== index && (scope.path === other.path || scope.path.startsWith(`${other.path}/`) || other.path.startsWith(`${scope.path}/`))))
  if (duplicate) throw new Error(`ARCHIVE_SCOPE_OVERLAP:${duplicate.path}`)
}

async function git(directory: string, args: string[]) {
  return (await gitBytes(directory, args)).toString().trim()
}

async function gitBytes(directory: string, args: string[]) {
  const process = Bun.spawn(["git", "--no-replace-objects", "-C", directory, ...args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).arrayBuffer(), new Response(process.stderr).text(), process.exited])
  if (exitCode !== 0) throw new Error(`ARCHIVE_GIT_FAILED:${args[0]}:${stderr.trim()}`)
  return Buffer.from(stdout)
}

if (import.meta.main) {
  const [directory, revision] = Bun.argv.slice(2)
  if (!directory) throw new Error("Usage: bun script/archive-inventory.ts <repository> [revision]")
  console.log(JSON.stringify(await archiveInventory(directory, revision)))
}
