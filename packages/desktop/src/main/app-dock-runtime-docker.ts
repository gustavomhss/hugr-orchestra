import type { LinuxError } from "@opencode-ai/app/app-dock-linux"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { request } from "node:https"
import { join } from "node:path"
import { DockerEngine } from "./docker-engine"

export const label = "io.orchestra.app-dock"

export class RuntimeError extends Error {
  constructor(readonly code: LinuxError) {
    super(code)
    this.name = "RuntimeError"
  }
}

export type Metadata = {
  version: 1
  owner: string
  password: string
  dockerContext: string
  endpoint: string
  containerID?: string
}

export type Container = {
  Id: string
  Image: string
  Name: string
  Config: { Labels: Record<string, string> | null; Env: string[] }
  State: { Running: boolean; StartedAt: string }
  Mounts: { Type: string; Name: string; Destination: string }[]
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[] | null> }
  HostConfig: {
    Memory: number
    NanoCpus: number
    PidsLimit: number
    ShmSize: number
    Init: boolean
    SecurityOpt: string[]
    Privileged: boolean
    CapAdd: string[] | null
  }
}

export type Volume = { Name: string; Labels: Record<string, string> | null }

export function requireLabels(labels: Record<string, string> | null, owner: string, kind: string) {
  if (labels?.[label] !== "workspace" || labels?.[`${label}.owner`] !== owner || labels?.[`${label}.kind`] !== kind) {
    throw new RuntimeError("failed")
  }
}

export function fingerprintPolicy(value: unknown) {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical)
    if (typeof item !== "object" || item === null) return item
    return Object.fromEntries(
      Object.entries(item)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
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

export function namedMissing(error: unknown, kind: "container" | "volume" | "image", name: string) {
  if (error instanceof DockerEngine.ResponseError && error.status === 404) {
    const body = JSON.parse(error.body) as { message?: string }
    if (kind === "container")
      return body.message === `No such container: ${name}` || body.message === `No such object: ${name}`
    if (kind === "volume") return body.message === `get ${name}: no such volume`
    return body.message === `No such image: ${name}`
  }
  if (!hasCode(error, 1) || !(error instanceof Error) || !("stderr" in error)) return false
  const message = String(error.stderr).trim()
  if (kind === "container")
    return (
      message === `Error response from daemon: No such container: ${name}` ||
      message === `Error: No such object: ${name}`
    )
  if (kind === "volume") return message === `Error response from daemon: get ${name}: no such volume`
  return message === `Error response from daemon: No such image: ${name}`
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
