import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { cli, snapshot } from "./distribution-native"

export async function markProviderEvidence(directory: string, owner: string) {
  if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw new Error("PROVIDER_EVIDENCE_ROOT_NOT_CANONICAL")
  await writeFile(join(directory, ".owner"), owner, { flag: "wx", mode: 0o600 })
  await Bun.write(join(directory, "setup.json"), JSON.stringify({ owner, status: "starting" }))
}

// Workflow uploads distribution-logs, not /tmp. Verify both owned namespaces,
// snapshot real file bytes/types (no links), and export even after setup/cleanup
// errors. Never copy daemon password/database/HOME fixture directories.
export async function exportProviderEvidence(directory: string, owner: string) {
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error("PROVIDER_EVIDENCE_ROOT_CHANGED")
  const marker = await lstat(join(directory, ".owner"))
  if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1 || await readFile(join(directory, ".owner"), "utf8") !== owner)
    throw new Error("PROVIDER_EVIDENCE_OWNERSHIP_CHANGED")
  const files = await snapshot(directory)
  if (!files || !files.files.has("setup.json")) throw new Error("PROVIDER_SETUP_RECEIPT_MISSING")
  const logs = resolve(cli, "../../distribution-logs")
  await mkdir(logs, { recursive: true })
  if (!(await lstat(logs)).isDirectory() || (await lstat(logs)).isSymbolicLink() || await realpath(logs) !== logs)
    throw new Error("PROVIDER_UPLOAD_ROOT_NOT_CANONICAL")
  const destination = join(logs, `provider-${owner}`)
  const created = await mkdir(destination).then(() => true, (error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") return false
    throw error
  })
  if (created) await writeFile(join(destination, ".owner"), owner, { flag: "wx", mode: 0o600 })
  if (!(await lstat(destination)).isDirectory() || await realpath(destination) !== destination ||
      !destination.startsWith(logs + sep) || await readFile(join(destination, ".owner"), "utf8") !== owner)
    throw new Error("PROVIDER_UPLOAD_NAMESPACE_NOT_OWNED")
  await snapshot(destination) // Reject links/special files before writes into an existing export.
  for (const name of files.directories) await mkdir(join(destination, name), { recursive: true })
  for (const [name, file] of files.files) {
    if (name === ".owner") continue
    await Bun.write(join(destination, name), file.bytes)
  }
  const exported = await snapshot(destination)
  if (!exported || exported.directories.join() !== files.directories.join() || exported.files.size !== files.files.size ||
      [...files.files].some(([name, file]) => !exported.files.get(name)?.bytes.equals(file.bytes)))
    throw new Error("PROVIDER_EVIDENCE_EXPORT_INCOMPLETE")
  console.error(`DISTRIBUTION_PROVIDER_UPLOADED ${destination}`)
  return destination
}
