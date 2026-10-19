export * as AppDockRuntimeBackend from "./app-dock-runtime-backend"

import type { LinuxError } from "@orchestra/app/app-dock-linux"
import { readFile } from "node:fs/promises"
import { request } from "node:https"
import { join } from "node:path"
import type { NativeDockProtocol } from "./app-dock-native-protocol"

export class RuntimeError extends Error {
  constructor(readonly code: LinuxError) {
    super(code)
    this.name = "RuntimeError"
  }
}

// The durable metadata.json v1 record. dockerContext/endpoint are the backend locator; the
// on-disk shape is unchanged so existing workspaces keep their owner and pinned ID.
export type Metadata = {
  version: 1
  owner: string
  password: string
  dockerContext: string
  endpoint: string
  containerID?: string
}

export type Locator = Pick<Metadata, "dockerContext" | "endpoint">

// A workspace whose ownership, limits and sandbox were proven by the backend.
export type Workspace = {
  id: string
  image: string
  running: boolean
  startedAt: string
  // Host port of the viewer, present only when exactly one loopback binding exists.
  viewerPort?: string
}

// Verified sandbox policy the backend enforces. Opaque to the runtime.
export type Sandbox = { path: string; value: unknown }

export type User = "dock" | "root"

// A host process that runs argv inside the workspace with stdio attached.
export type Command = { file: string; args: string[]; env: Record<string, string | undefined> }

export type Session = {
  sessionID: string
  processIdentity: NativeDockProtocol.ProcessIdentity
  environment: Record<string, string>
}

export type Helper = {
  // Proven identity of the helper resource (the helper container ID in Docker).
  id: string
  client: NativeDockProtocol.Client
  channel: NativeDockProtocol.Channel
  payload: { files: Array<{ name: string; sha256: string; bytes: number }>; sha256: string }
  active: () => boolean
  // Removes the helper by its proven identity and proves it is gone; throws otherwise.
  reap: () => Promise<void>
}

export type Backend = {
  // A saved locator is re-verified, never rediscovered.
  locate: (saved?: Locator) => Promise<Locator>
  sandbox: () => Promise<Sandbox>
  // Undefined only when the owned workspace is absent; any ownership doubt throws.
  find: (metadata: Metadata) => Promise<Workspace | undefined>
  // Returns the image reference to create from.
  ensureImage: (metadata: Metadata, image?: string) => Promise<string>
  ensureHome: (metadata: Metadata) => Promise<void>
  // Returns the new immutable workspace ID.
  create: (metadata: Metadata, spec: { image: string; sandbox: Sandbox }) => Promise<string>
  start: (metadata: Metadata, workspace: Workspace) => Promise<void>
  stop: (metadata: Metadata, workspace: Workspace) => Promise<void>
  // Short command; rejects with an Error carrying `stderr` on a non-zero exit.
  exec: (
    metadata: Metadata,
    workspace: Workspace,
    input: { user: User; argv: string[]; timeout?: number },
  ) => Promise<{ stdout: string; stderr: string }>
  copy: (metadata: Metadata, workspace: Workspace, source: string, target: string, timeout?: number) => Promise<void>
  command: (endpoint: string, workspaceID: string, input: { user: User; argv: string[]; tty?: boolean }) => Command
  // Starts the accessibility helper process in the workspace with a stdio channel.
  helper: (input: {
    metadata: Metadata
    workspace: Workspace
    sandbox: Sandbox
    payload: string
    session: Session
    verifyWorkspace: () => Promise<void>
  }) => Promise<Helper>
  close: () => void
}

export function localEndpoint(endpoint: string) {
  if (process.platform === "win32" && /^npipe:\/\/\/\/\.\/pipe\/[\w.-]+$/.test(endpoint)) return true
  if (!endpoint.startsWith("unix:///")) return false
  const url = new URL(endpoint)
  return !url.hostname && !url.search && !url.hash && !url.username && !url.password
}

export function hasCode(error: unknown, code: string | number) {
  return error instanceof Error && "code" in error && error.code === code
}

export async function readMetadata(root: string) {
  const text = await readFile(join(root, "metadata.json"), "utf8").catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined
    throw new RuntimeError("failed")
  })
  if (text === undefined) return undefined
  const metadata = JSON.parse(text) as Metadata
  if (
    metadata.version !== 1 ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(metadata.owner) ||
    !/^[a-f0-9]{64}$/.test(metadata.password) ||
    typeof metadata.dockerContext !== "string" ||
    !metadata.dockerContext ||
    typeof metadata.endpoint !== "string" ||
    !localEndpoint(metadata.endpoint) ||
    (metadata.containerID !== undefined && !/^[a-f0-9]{64}$/.test(metadata.containerID))
  )
    throw new RuntimeError("failed")
  return metadata
}

export function verifyEndpoint(url: string, certificate: string) {
  return new Promise<void>((resolve, reject) => {
    const probe = request(url, { method: "HEAD", ca: certificate, agent: false, timeout: 3_000 }, (response) => {
      response.resume()
      if (response.statusCode !== 200) return reject(new RuntimeError("failed"))
      resolve()
    })
    probe.once("timeout", () => probe.destroy(new RuntimeError("failed")))
    probe.once("error", reject)
    probe.end()
  })
}
