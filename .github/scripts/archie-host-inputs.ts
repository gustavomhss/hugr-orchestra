import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

// Make the packet's declared model-visible references readable within the proposal-only scratch project.
export async function copyInputs(packet: string, project: string, repo: string) {
  const root = await realpath(packet)
  await requireComponents(root, "DOMAIN-SOURCE.json")
  const { Schema } = (await import(createRequire(join(repo, "packages/orchestra/package.json")).resolve("effect"))) as typeof import("../../packages/orchestra/script/archie-host-effect")
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({
    nativeAssignmentBoundary: Schema.Struct({ projectRoot: Schema.NonEmptyString }),
    modelExposure: Schema.Struct({ operativeIds: Schema.Array(Schema.NonEmptyString), excludedPrivateEvaluationFile: Schema.NonEmptyString }),
    artifacts: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, path: Schema.NonEmptyString, sha256: Schema.NonEmptyString, utf8ByteLength: Schema.Number })),
  })))(await Bun.file(join(root, "DOMAIN-SOURCE.json")).text())
  const declared = resolve(manifest.nativeAssignmentBoundary.projectRoot, "../..")
  const ids = manifest.modelExposure.operativeIds
  if (!ids.length || ids.length > 128 || new Set(ids).size !== ids.length) throw new Error("HOST_INPUT_IDS_INVALID")
  const targets = ids.map((id) => {
    const matches = manifest.artifacts.filter((artifact) => artifact.id === id)
    if (matches.length !== 1) throw new Error(`HOST_INPUT_NOT_UNIQUE: ${id}`)
    const artifact = matches[0]
    const path = relative(declared, artifact.path)
    if (!path || path === ".." || path.startsWith("../") || isAbsolute(path) || path === manifest.modelExposure.excludedPrivateEvaluationFile) throw new Error(`HOST_INPUT_PATH_INVALID: ${id}`)
    const target = path.startsWith("pilot/project/") ? path.slice("pilot/project/".length) : join("context", path)
    if (!target || target === "proposal.md" || target === "context/manifest.json" || "context/manifest.json".startsWith(target + "/") || target.startsWith("context/manifest.json/")) throw new Error(`HOST_INPUT_RESERVED_OUTPUT: ${id}`)
    return { artifact, path, target }
  })
  targets.forEach((item, index) => {
    if (targets.some((other, position) => position !== index && (other.target === item.target || other.target.startsWith(item.target + "/") || item.target.startsWith(other.target + "/")))) throw new Error(`HOST_INPUT_TARGET_COLLISION: ${item.target}`)
  })
  const copied = await inventory(project)
  const declaredProject = targets.filter((item) => item.path.startsWith("pilot/project/")).map((item) => item.target)
  const nodes = new Set(declaredProject.flatMap((path) => [path, ...path.split("/").slice(0, -1).map((_, index) => path.split("/").slice(0, index + 1).join("/") + "/")]))
  if (copied.length !== nodes.size || copied.some((path) => !nodes.has(path))) throw new Error("HOST_PROJECT_UNDECLARED_INPUT")
  if (isAbsolute(manifest.modelExposure.excludedPrivateEvaluationFile) || manifest.modelExposure.excludedPrivateEvaluationFile.split("/").includes("..")) throw new Error("HOST_PRIVATE_EXCLUSION_ESCAPED_PACKET")
  await requireComponents(root, manifest.modelExposure.excludedPrivateEvaluationFile)
  const excluded = await realpath(join(root, manifest.modelExposure.excludedPrivateEvaluationFile)).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return resolve(root, manifest.modelExposure.excludedPrivateEvaluationFile)
    throw error
  })
  if (!excluded.startsWith(root + "/")) throw new Error("HOST_PRIVATE_EXCLUSION_ESCAPED_PACKET")
  const inputs = await Promise.all(targets.map(async ({ artifact, path, target }) => {
    const id = artifact.id
    await requireComponents(root, path)
    const source = await realpath(join(root, path))
    if (!source.startsWith(root + "/") || source === excluded) throw new Error(`HOST_INPUT_ESCAPED_PACKET: ${id}`)
    const bytes = await Bun.file(source).bytes()
    if (!Number.isSafeInteger(artifact.utf8ByteLength) || artifact.utf8ByteLength !== bytes.length || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error(`HOST_INPUT_DIGEST_MISMATCH: ${id}`)
    await requireComponents(project, target)
    if (path.startsWith("pilot/project/")) {
      if (createHash("sha256").update(await Bun.file(join(project, target)).bytes()).digest("hex") !== artifact.sha256) throw new Error(`HOST_PROJECT_COPY_DIGEST_MISMATCH: ${id}`)
    }
    if (!path.startsWith("pilot/project/")) {
      await mkdir(dirname(join(project, target)), { recursive: true })
      await writeExclusive(project, target, bytes)
    }
    return { id, path: target, sha256: artifact.sha256, bytes: bytes.length }
  }))
  await requireComponents(project, "context/manifest.json")
  await mkdir(join(project, "context"), { recursive: true })
  await writeExclusive(project, "context/manifest.json", Buffer.from(JSON.stringify({ scope: "Read-only inputs, not approval or runtime evidence", inputs }, null, 2)))
  return inputs
}

async function writeExclusive(root: string, path: string, bytes: Uint8Array) {
  const file = await open(join(root, path), "wx", 0o400).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") throw new Error(`HOST_INPUT_TARGET_EXISTS: ${path}`)
    throw error
  })
  await file.writeFile(bytes).finally(() => file.close())
}

async function requireComponents(root: string, path: string) {
  const pieces = path.split("/")
  for (const index of pieces.keys()) {
    const target = join(root, ...pieces.slice(0, index + 1))
    const stat = await lstat(target).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    if (!stat) return
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || stat.isFile() && stat.nlink > 1) throw new Error(`HOST_INPUT_FORBIDDEN_NODE: ${path}`)
    if (index < pieces.length - 1 && !stat.isDirectory()) throw new Error(`HOST_INPUT_ANCESTOR_NOT_DIRECTORY: ${path}`)
  }
}

async function inventory(root: string, prefix = ""): Promise<string[]> {
  if (!prefix && ((await lstat(root)).isSymbolicLink() || !(await lstat(root)).isDirectory())) throw new Error("HOST_PROJECT_FORBIDDEN_ROOT")
  return (await Promise.all((await readdir(join(root, prefix), { withFileTypes: true })).map(async (entry) => {
    const path = join(prefix, entry.name)
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error(`HOST_PROJECT_FORBIDDEN_NODE: ${path}`)
    return entry.isDirectory() ? [path + "/", ...await inventory(root, path)] : [path]
  }))).flat()
}
