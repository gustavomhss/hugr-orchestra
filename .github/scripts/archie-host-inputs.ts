import { mkdir, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

// Make the packet's declared model-visible references readable within the proposal-only scratch project.
export async function copyInputs(packet: string, project: string, repo: string) {
  const root = await realpath(packet)
  const { Schema } = (await import(createRequire(join(repo, "packages/orchestra/package.json")).resolve("effect"))) as typeof import("effect")
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({
    nativeAssignmentBoundary: Schema.Struct({ projectRoot: Schema.NonEmptyString }),
    modelExposure: Schema.Struct({ operativeIds: Schema.Array(Schema.NonEmptyString), excludedPrivateEvaluationFile: Schema.NonEmptyString }),
    artifacts: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, path: Schema.NonEmptyString, sha256: Schema.NonEmptyString, utf8ByteLength: Schema.Number })),
  })))(await Bun.file(join(root, "DOMAIN-SOURCE.json")).text())
  const declared = resolve(manifest.nativeAssignmentBoundary.projectRoot, "../..")
  const ids = manifest.modelExposure.operativeIds
  if (!ids.length || ids.length > 128 || new Set(ids).size !== ids.length) throw new Error("HOST_INPUT_IDS_INVALID")
  const inputs = await Promise.all(ids.map(async (id) => {
    const matches = manifest.artifacts.filter((artifact) => artifact.id === id)
    if (matches.length !== 1) throw new Error(`HOST_INPUT_NOT_UNIQUE: ${id}`)
    const artifact = matches[0]
    const path = relative(declared, artifact.path)
    if (!path || path === ".." || path.startsWith("../") || isAbsolute(path) || path === manifest.modelExposure.excludedPrivateEvaluationFile) throw new Error(`HOST_INPUT_PATH_INVALID: ${id}`)
    const source = await realpath(join(root, path))
    if (!source.startsWith(root + "/")) throw new Error(`HOST_INPUT_ESCAPED_PACKET: ${id}`)
    const bytes = await Bun.file(source).bytes()
    if (!Number.isSafeInteger(artifact.utf8ByteLength) || artifact.utf8ByteLength !== bytes.length || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error(`HOST_INPUT_DIGEST_MISMATCH: ${id}`)
    const target = path.startsWith("pilot/project/") ? path.slice("pilot/project/".length) : join("context", path)
    if (!target || target === "proposal.md") throw new Error(`HOST_INPUT_RESERVED_OUTPUT: ${id}`)
    if (path.startsWith("pilot/project/")) {
      if (createHash("sha256").update(await Bun.file(join(project, target)).bytes()).digest("hex") !== artifact.sha256) throw new Error(`HOST_PROJECT_COPY_DIGEST_MISMATCH: ${id}`)
    }
    if (!path.startsWith("pilot/project/")) {
      await mkdir(dirname(join(project, target)), { recursive: true })
      await Bun.write(join(project, target), bytes)
    }
    return { id, path: target, sha256: artifact.sha256, bytes: bytes.length }
  }))
  await Bun.write(join(project, "context/manifest.json"), JSON.stringify({ scope: "Read-only inputs, not approval or runtime evidence", inputs }, null, 2))
  return inputs
}
