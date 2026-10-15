export * as AppDockRuntimeDocker from "./app-dock-runtime-docker"

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import {
  hasCode,
  localEndpoint,
  RuntimeError,
  type Backend,
  type Metadata,
  type Workspace,
} from "./app-dock-runtime-backend"
import { DockerEngine } from "./docker-engine"
import { DesktopOmni } from "./omni-process"

export const label = "io.orchestra.app-dock"

const exec = promisify(execFile)
const sandboxFingerprint = "ba7ed925345f1b6839c40dfe341404ca0cb94f4a2a438b79c058793106713daa"

export type Container = {
  Id: string
  Image: string
  Name: string
  Config: { Labels: Record<string, string> | null; Env: string[] }
  State: { Running: boolean; StartedAt: string }
  Mounts: { Type: string; Name: string; Destination: string }[]
  NetworkSettings: { Ports: Record<string, { HostIp: string; HostPort: string }[] | null> | null }
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

export function create(options: { context: string }): Backend {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION"].includes(key),
    ),
  )
  const current = { engine: undefined as { endpoint: string; client: ReturnType<typeof DockerEngine.create> } | undefined }
  // Behind ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER the docker CLI runs through omni, with execFile's result and errors.
  const command = (args: string[], timeout = 20_000, extraEnv = {}) =>
    (DesktopOmni.enabled() ? DesktopOmni.execFile : exec)("docker", args, {
      env: { ...env, ...extraEnv },
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 2 * 1024 * 1024,
    })
  const docker = (metadata: Metadata, args: string[], timeout?: number, extraEnv?: Record<string, string>) =>
    command(["--host", metadata.endpoint, ...args], timeout, extraEnv)
  const engine = (endpoint: string) => {
    if (current.engine?.endpoint === endpoint) return current.engine.client
    current.engine?.client.close()
    current.engine = { endpoint, client: DockerEngine.create(endpoint) }
    return current.engine.client
  }
  const inspect = async <T>(metadata: Metadata, kind: "container" | "volume" | "image", name: string) => {
    return engine(metadata.endpoint)
      .get<T>(`/${kind}s/${encodeURIComponent(name)}${kind === "volume" ? "" : "/json"}`)
      .catch((error: unknown) => {
        if (namedMissing(error, kind, name)) return undefined
        throw new RuntimeError("unavailable")
      })
  }
  const volume = async (metadata: Metadata) => {
    const found = await inspect<Volume>(metadata, "volume", `orchestra-linux-${metadata.owner}-home`)
    if (found) requireLabels(found.Labels, metadata.owner, "home")
    return found
  }
  const reap = async (endpoint: string, owner: string, containerID: string) => {
    const client = engine(endpoint)
    const path = `/containers/${containerID}`
    const present = () => client.get<Container>(`${path}/json`, 4000).catch((error: unknown) => {
      if (namedMissing(error, "container", containerID)) return undefined
      throw new NativeDockProtocol.NativeError("helper-termination-failed", "Native helper cleanup failed", "unknown")
    })
    const found = await present()
    if (!found) return
    requireLabels(found.Config.Labels, owner, "accessibility")
    await client.delete(`${path}?force=true`, 4000).catch(() => undefined)
    if (await present())
      throw new NativeDockProtocol.NativeError("helper-termination-failed", "Native helper cleanup failed", "unknown")
  }

  return {
    locate: async (saved) => {
      if (saved) {
        if (!localEndpoint(saved.endpoint)) throw new RuntimeError("unavailable")
        const info = await engine(saved.endpoint).get<{ OSType: string }>("/info")
        if (info.OSType !== "linux") throw new RuntimeError("unavailable")
        return { dockerContext: saved.dockerContext, endpoint: saved.endpoint }
      }
      const context = process.env.DOCKER_CONTEXT || (await command(["context", "show"])).stdout.trim()
      const inspected = JSON.parse((await command(["context", "inspect", context])).stdout) as {
        Endpoints: { docker?: { Host: string } }
      }[]
      const endpoint = inspected[0]?.Endpoints.docker?.Host
      if (!endpoint || !localEndpoint(endpoint)) throw new RuntimeError("unavailable")
      if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== endpoint) throw new RuntimeError("unavailable")
      const info = await engine(endpoint).get<{ OSType: string }>("/info")
      if (info.OSType !== "linux") throw new RuntimeError("unavailable")
      return { dockerContext: context, endpoint }
    },
    sandbox: async () => {
      const path = resolve(options.context, "seccomp.json")
      const policy: unknown = JSON.parse(await readFile(path, "utf8"))
      if (fingerprintPolicy(policy) !== sandboxFingerprint) throw new RuntimeError("unavailable")
      return { path, value: policy }
    },
    find: async (metadata) => {
      const found = await inspect<Container>(metadata, "container", `orchestra-linux-${metadata.owner}`)
      if (!found) return undefined
      return proveWorkspace(found, metadata, () => volume(metadata))
    },
    ensureImage: async (metadata, custom) => {
      const image = custom ?? `orchestra-linux-${metadata.owner}:xpra-6.5.4-html5-21`
      const existing = await inspect<{ Os: string; Config: { Labels: Record<string, string> | null } }>(
        metadata,
        "image",
        image,
      )
      if (existing && !custom) requireLabels(existing.Config.Labels, metadata.owner, "image")
      if (existing && existing.Os !== "linux") throw new RuntimeError("unavailable")
      if (existing) return image
      if (custom || !(await stat(options.context)).isDirectory()) throw new RuntimeError("unavailable")
      await docker(
        metadata,
        [
          "build",
          "--tag",
          image,
          "--label",
          `${label}=workspace`,
          "--label",
          `${label}.owner=${metadata.owner}`,
          "--label",
          `${label}.kind=image`,
          resolve(options.context),
        ],
        480_000,
      )
      return image
    },
    ensureHome: async (metadata) => {
      if (await volume(metadata)) return
      await docker(metadata, [
        "volume",
        "create",
        "--label",
        `${label}=workspace`,
        "--label",
        `${label}.owner=${metadata.owner}`,
        "--label",
        `${label}.kind=home`,
        `orchestra-linux-${metadata.owner}-home`,
      ])
    },
    create: async (metadata, spec) => {
      const created = await docker(
        metadata,
        [
          "create",
          "--init",
          "--name",
          `orchestra-linux-${metadata.owner}`,
          "--label",
          `${label}=workspace`,
          "--label",
          `${label}.owner=${metadata.owner}`,
          "--label",
          `${label}.kind=workspace`,
          "--cpus",
          "2",
          "--memory",
          "2g",
          "--pids-limit",
          "512",
          "--shm-size",
          "128m",
          "--restart",
          "no",
          "--security-opt",
          `seccomp=${spec.sandbox.path}`,
          "--publish",
          "127.0.0.1::14500",
          "--mount",
          `type=volume,source=orchestra-linux-${metadata.owner}-home,target=/home/dock`,
          "--env",
          "APP_DOCK_RUNTIME_PASSWORD",
          spec.image,
        ],
        20_000,
        { APP_DOCK_RUNTIME_PASSWORD: metadata.password },
      )
      return created.stdout.trim()
    },
    start: async (metadata, workspace) => {
      await docker(metadata, ["start", workspace.id])
    },
    stop: async (metadata, workspace) => {
      await docker(metadata, ["stop", "--time", "10", workspace.id], 25_000)
    },
    exec: (metadata, workspace, input) =>
      docker(metadata, ["exec", "--user", input.user, workspace.id, ...input.argv], input.timeout),
    copy: async (metadata, workspace, source, target, timeout) => {
      await docker(metadata, ["cp", "--", source, `${workspace.id}:${target}`], timeout)
    },
    command: (endpoint, workspaceID, input) => ({
      file: "docker",
      args: [
        "--host",
        endpoint,
        "exec",
        "--interactive",
        ...(input.tty ? ["--tty"] : []),
        "--user",
        input.user,
        workspaceID,
        ...input.argv,
      ],
      env,
    }),
    // The helper is a second container joining the workspace PID and network namespaces.
    helper: async (input) => {
      const { AppDockNativeRuntime } = await import("./app-dock-native-runtime")
      const created = await AppDockNativeRuntime.create({
        endpoint: input.metadata.endpoint, owner: input.metadata.owner, workspaceID: input.workspace.id,
        workspaceStartedAt: input.workspace.startedAt, imageID: input.workspace.image,
        homeVolume: `orchestra-linux-${input.metadata.owner}-home`, securityPolicy: input.sandbox.value,
        payloadDirectory: input.payload, session: input.session, verifyWorkspace: input.verifyWorkspace,
      })
      return {
        id: created.containerID, client: created.client, channel: created.channel, payload: created.payload, active: created.active,
        reap: () => reap(input.metadata.endpoint, input.metadata.owner, created.containerID),
      }
    },
    close: () => {
      current.engine?.client.close()
      current.engine = undefined
    },
  }
}

// Every field below is part of the ownership proof; a workspace that fails any of them is never used.
export async function proveWorkspace(
  found: Container,
  metadata: Metadata,
  home: () => Promise<Volume | undefined>,
): Promise<Workspace> {
  requireLabels(found.Config.Labels, metadata.owner, "workspace")
  if (
    !/^[a-f0-9]{64}$/.test(found.Id) ||
    found.Name !== `/orchestra-linux-${metadata.owner}` ||
    (metadata.containerID && found.Id !== metadata.containerID)
  )
    throw new RuntimeError("failed")
  const volume = await home()
  if (
    !volume ||
    !found.Mounts.some(
      (mount) => mount.Type === "volume" && mount.Name === volume.Name && mount.Destination === "/home/dock",
    )
  ) {
    throw new RuntimeError("failed")
  }
  if (
    !found.Config.Env.includes(`APP_DOCK_RUNTIME_PASSWORD=${metadata.password}`) ||
    found.HostConfig.Memory !== 2 * 1024 ** 3 ||
    found.HostConfig.NanoCpus !== 2 * 10 ** 9 ||
    found.HostConfig.PidsLimit !== 512 ||
    found.HostConfig.ShmSize !== 128 * 1024 ** 2 ||
    !found.HostConfig.Init
  )
    throw new RuntimeError("failed")
  if (
    found.HostConfig.Privileged ||
    found.HostConfig.CapAdd?.length ||
    !found.HostConfig.SecurityOpt.some(
      (option) =>
        option.startsWith("seccomp=") &&
        fingerprintPolicy(JSON.parse(option.slice("seccomp=".length))) === sandboxFingerprint,
    )
  ) {
    throw new RuntimeError("failed")
  }
  const ports = found.NetworkSettings.Ports?.["14500/tcp"]
  return {
    id: found.Id,
    image: found.Image,
    running: found.State.Running,
    startedAt: found.State.StartedAt,
    viewerPort:
      ports?.length === 1 && ports[0].HostIp === "127.0.0.1" && /^\d+$/.test(ports[0].HostPort)
        ? ports[0].HostPort
        : undefined,
  }
}

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
