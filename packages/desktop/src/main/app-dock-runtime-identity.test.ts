import { plugin } from "bun"
import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { rejection } from "./rejection.fixture"

const exec = promisify(execFile)
const enabled = process.env.APP_DOCK_RUNTIME_INTEGRATION === "1"
const source = process.env.APP_DOCK_RUNTIME_TEST_SOURCE ?? resolve(import.meta.dir, "app-dock-runtime.ts")
const mutation = process.env.APP_DOCK_RUNTIME_IDENTITY_MUTATION
const image = process.env.APP_DOCK_RUNTIME_TEST_IMAGE ?? "orchestra-linux-eb889345-092c-462a-a613-5121e03dd16e:xpra-6.5.4-html5-21"
const label = "io.orchestra.app-dock"
const buildContext = resolve("resources/linux-runtime")

// Optional in-memory mutations prove the assertions fail without modifying the lead's source.
if (enabled && mutation) {
  if (!source || (mutation !== "context" && mutation !== "cache")) throw new Error("Invalid identity mutation configuration")
  plugin({
    name: "app-dock-runtime-identity-mutation",
    setup(build) {
      // The Docker CLI routing lives in the backend beside the runtime; the metadata cache in the runtime.
      build.onLoad({ filter: /app-dock-runtime(?:-docker)?\.ts$/ }, async (args) => {
        const target = mutation === "context" ? join(dirname(resolve(source)), "app-dock-runtime-docker.ts") : resolve(source)
        if (resolve(args.path) !== target) return
        const text = await Bun.file(args.path).text()
        const before = mutation === "context"
          ? 'command(["--host", metadata.endpoint, ...args], timeout, extraEnv)'
          : "  const load = async () => {\n"
        const after = mutation === "context"
          ? 'command(["--context", metadata.dockerContext, ...args], timeout, extraEnv)'
          : "  const load = async () => {\n    if (current.metadata) return current.metadata\n"
        expect(text.split(before)).toHaveLength(2)
        return { contents: text.replace(before, after), loader: "ts" }
      })
    },
  })
}

type Metadata = {
  version: number
  owner: string
  password: string
  dockerContext: string
  endpoint: string
  containerID?: string
}

type Container = {
  Id: string
  Name: string
  Config: { Labels: Record<string, string>; Env: string[] }
  State: { Running: boolean }
  Mounts: { Type: string; Name: string; Destination: string }[]
  HostConfig: { Memory: number; NanoCpus: number }
}

test.skipIf(!enabled)("pins the local endpoint and reloads identity before stopping a replacement", async () => {
  if (!source) throw new Error("Set APP_DOCK_RUNTIME_TEST_SOURCE to the actual runtime implementation")
  const { AppDockRuntime } = await import(resolve(source))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ![
    "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION",
  ].includes(key)))
  const command = (args: string[], timeout = 20_000, extraEnv: Record<string, string> = {}) => exec("docker", args, {
    env: { ...environment, ...extraEnv }, timeout, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024,
  })
  const active = process.env.DOCKER_CONTEXT || (await command(["context", "show"])).stdout.trim()
  const endpoint = (JSON.parse((await command(["context", "inspect", active])).stdout) as {
    Endpoints: { docker: { Host: string } }
  }[])[0].Endpoints.docker.Host
  expect(endpoint).toMatch(/^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/)
  const docker = (args: string[], extraEnv?: Record<string, string>) => command(["--host", endpoint, ...args], 20_000, extraEnv)
  expect((await docker(["info", "--format", "{{.OSType}}"])).stdout.trim()).toBe("linux")
  expect((await docker(["image", "inspect", "--format", "{{.Os}}", image])).stdout.trim()).toBe("linux")

  const root = await mkdtemp(join(process.env.APP_DOCK_RUNTIME_TEST_TMP ?? join(tmpdir(), "orchestra"), "orchestra-runtime-identity-"))
  const privateContext = `orchestra-runtime-identity-${randomUUID()}`
  const previous = { context: process.env.DOCKER_CONTEXT, host: process.env.DOCKER_HOST }
  const cleanup = { context: false, owner: "" }
  const metadata = async () => JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as Metadata
  const container = async (id: string) => JSON.parse((await docker(["container", "inspect", "--format", "{{json .}}", id])).stdout) as Container
  const removeContainer = async (id: string) => {
    const found = await container(id)
    expect(found.Id).toMatch(/^[a-f0-9]{64}$/)
    expect(found.Name).toBe(`/orchestra-linux-${cleanup.owner}`)
    expect(found.Config.Labels[`${label}.owner`]).toBe(cleanup.owner)
    await docker(["rm", "--force", found.Id])
    expect(await rejection(docker(["container", "inspect", found.Id]))).toMatchObject({
      code: 1, stderr: `Error response from daemon: No such container: ${found.Id}\n`,
    })
  }

  try {
    await command(["context", "create", privateContext, "--docker", `host=${endpoint}`])
    cleanup.context = true
    process.env.DOCKER_CONTEXT = privateContext
    delete process.env.DOCKER_HOST

    // A failed startup leaves B holding ID-less metadata before A creates the workspace.
    const b = AppDockRuntime.create({ root, context: buildContext, image: `orchestra-runtime-missing-${randomUUID()}:identity` })
    expect(await rejection(b.start())).toMatchObject({ code: "unavailable" })
    const initial = await metadata()
    cleanup.owner = initial.owner
    expect(initial.owner).toMatch(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
    expect(initial.containerID).toBeUndefined()
    expect(initial.dockerContext).toBe(privateContext)
    expect(initial.endpoint).toBe(endpoint)

    const a = AppDockRuntime.create({ root, context: buildContext, image })
    const started = await a.start()
    const saved = await metadata()
    expect(saved.owner).toBe(initial.owner)
    expect(saved.containerID).toMatch(/^[a-f0-9]{64}$/)
    if (!saved.containerID) throw new Error("Startup did not persist a container ID")
    const original = await container(saved.containerID)
    expect(original.State.Running).toBe(true)

    await command(["context", "update", privateContext, "--docker", "host=ssh://invalid"])
    expect((JSON.parse((await command(["context", "inspect", privateContext])).stdout) as {
      Endpoints: { docker: { Host: string } }
    }[])[0].Endpoints.docker.Host).toBe("ssh://invalid")
    // Positive control: commands really routed through this context now fail over SSH.
    expect(await rejection(command(["--context", privateContext, "info"], 8_000))).toMatchObject({
      code: 1, killed: false,
    })

    expect(await a.start()).toEqual(started)
    expect(await AppDockRuntime.create({ root, context: buildContext, image }).start()).toEqual(started)
    expect((await a.state()).phase).toBe("ready")
    expect((await metadata()).containerID).toBe(saved.containerID)
    await a.stop()
    expect((await container(saved.containerID)).State.Running).toBe(false)
    await removeContainer(saved.containerID)

    const home = `orchestra-linux-${saved.owner}-home`
    const replacementID = (await docker(["create", "--init", "--name", `orchestra-linux-${saved.owner}`,
      "--label", `${label}=workspace`, "--label", `${label}.owner=${saved.owner}`, "--label", `${label}.kind=workspace`,
      "--cpus", "2", "--memory", "2g", "--pids-limit", "512", "--shm-size", "128m", "--restart", "no",
      "--security-opt", `seccomp=${join(buildContext, "seccomp.json")}`,
      "--publish", "127.0.0.1::14500", "--mount", `type=volume,source=${home},target=/home/dock`,
      "--env", "APP_DOCK_RUNTIME_PASSWORD", "--entrypoint", "sleep", image, "infinity"], {
      APP_DOCK_RUNTIME_PASSWORD: saved.password,
    })).stdout.trim()
    expect(replacementID).toMatch(/^[a-f0-9]{64}$/)
    expect(replacementID).not.toBe(saved.containerID)
    await docker(["start", replacementID])
    const replacement = await container(replacementID)
    expect(replacement.State.Running).toBe(true)
    expect(replacement.Name).toBe(original.Name)
    expect(replacement.Config.Labels).toEqual(original.Config.Labels)
    expect(replacement.Config.Env).toContain(`APP_DOCK_RUNTIME_PASSWORD=${saved.password}`)
    expect(replacement.HostConfig.Memory).toBe(original.HostConfig.Memory)
    expect(replacement.HostConfig.NanoCpus).toBe(original.HostConfig.NanoCpus)
    expect(replacement.Mounts.filter((mount) => mount.Destination === "/home/dock")).toEqual(
      original.Mounts.filter((mount) => mount.Destination === "/home/dock"),
    )

    expect(await rejection(b.stop())).toMatchObject({ code: "failed" })
    expect((await container(replacementID)).State.Running).toBe(true)
    expect((await metadata()).containerID).toBe(saved.containerID)

    // Only the durable ID changes: accepting this pin proves no label/mount guard masked the rejection.
    await writeFile(join(root, "metadata.json"), JSON.stringify({ ...saved, containerID: replacementID }), { mode: 0o600 })
    await b.stop()
    expect((await container(replacementID)).State.Running).toBe(false)
  } finally {
    if (previous.context === undefined) delete process.env.DOCKER_CONTEXT
    if (previous.context !== undefined) process.env.DOCKER_CONTEXT = previous.context
    if (previous.host === undefined) delete process.env.DOCKER_HOST
    if (previous.host !== undefined) process.env.DOCKER_HOST = previous.host
    try {
      if (cleanup.owner) {
        const name = `orchestra-linux-${cleanup.owner}`
        const found = await container(name).catch((error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === 1 && "stderr" in error &&
            String(error.stderr).trim() === `Error response from daemon: No such container: ${name}`) return undefined
          throw error
        })
        if (found) await removeContainer(found.Id)
        const home = `${name}-home`
        const volume = await docker(["volume", "inspect", "--format", "{{json .}}", home]).catch((error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === 1 && "stderr" in error &&
            String(error.stderr).trim() === `Error response from daemon: get ${home}: no such volume`) return undefined
          throw error
        })
        if (volume) {
          const inspected = JSON.parse(volume.stdout) as { Name: string; Labels: Record<string, string> }
          expect(inspected.Name).toBe(home)
          expect(inspected.Labels[`${label}.owner`]).toBe(cleanup.owner)
          await docker(["volume", "rm", home])
          expect(await rejection(docker(["volume", "inspect", home]))).toMatchObject({
            code: 1, stderr: `Error response from daemon: get ${home}: no such volume\n`,
          })
        }
      }
    } finally {
      if (cleanup.context) {
        await command(["context", "update", privateContext, "--docker", `host=${endpoint}`])
        await command(["context", "rm", privateContext])
        expect(await rejection(command(["context", "inspect", privateContext]))).toMatchObject({ code: 1 })
      }
      await rm(root, { recursive: true })
    }
  }
}, 150_000)
