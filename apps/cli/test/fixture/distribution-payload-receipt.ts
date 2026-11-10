import { mkdir } from "node:fs/promises"
import { join, resolve, sep } from "node:path"

export type PayloadIdentity = {
  version: string
  manifest: {
    version: string
    target: string
    files: Array<{ path: string; sha256: string }>
  }
  archive: { sha256: string; version: string; target: string; file?: string }
}

export type NpmIdentity = { name: string; version: string; integrity: string; shasum: string }

// The native temp directory is deleted in afterAll. Only distribution-logs is uploaded, so the
// payload identity has to be written there or the retained artifact cannot name the bytes that qualified.
export function payloadReceipt(input: {
  target: string
  channels: string[]
  payloads: PayloadIdentity[]
  npm?: NpmIdentity[]
  env?: NodeJS.ProcessEnv
}) {
  const env = input.env ?? process.env
  return {
    schema: "orchestra-native-payload-receipt-v1" as const,
    sourceSHA: env.GITHUB_SHA ?? null,
    runId: env.GITHUB_RUN_ID ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    job: env.GITHUB_JOB ?? null,
    target: input.target,
    channels: [...new Set(input.channels)].sort(),
    payloads: input.payloads.map((payload) => ({
      version: payload.version,
      archive: { sha256: payload.archive.sha256, version: payload.archive.version, target: payload.archive.target },
      manifest: {
        version: payload.manifest.version,
        target: payload.manifest.target,
        files: payload.manifest.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
      },
    })),
    npm: dedupe(input.npm ?? []),
  }
}

export async function retainPayloadReceipt(input: {
  target: string
  channels: string[]
  payloads: PayloadIdentity[]
  npm?: NpmIdentity[]
  env?: NodeJS.ProcessEnv
}) {
  const env = input.env ?? process.env
  const workspace = env.GITHUB_WORKSPACE
  if (!workspace) throw new Error("PAYLOAD_RECEIPT_WORKSPACE_REQUIRED")
  const root = resolve(workspace)
  const file = join(root, "distribution-logs", "payloads.json")
  if (!file.startsWith(root + sep)) throw new Error("PAYLOAD_RECEIPT_ESCAPED")
  const previous = await Bun.file(file).json().catch(() => undefined)
  const receipt = payloadReceipt({
    target: input.target,
    channels: [...(Array.isArray(previous?.channels) ? previous.channels : []), ...input.channels],
    payloads: input.payloads,
    npm: [...(Array.isArray(previous?.npm) ? previous.npm : []), ...(input.npm ?? [])],
    env,
  })
  await mkdir(join(root, "distribution-logs"), { recursive: true })
  await Bun.write(file, JSON.stringify(receipt, null, 2))
  return file
}

function dedupe(items: NpmIdentity[]) {
  const byKey = new Map(items.map((item) => [`${item.name}@${item.version}`, { name: item.name, version: item.version, integrity: item.integrity, shasum: item.shasum }]))
  return [...byKey.values()].sort(byName)
}

function byName(a: NpmIdentity, b: NpmIdentity) {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  if (a.version !== b.version) return a.version < b.version ? -1 : 1
  return 0
}
