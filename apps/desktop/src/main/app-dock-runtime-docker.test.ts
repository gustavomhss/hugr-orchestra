import { expect, test } from "bun:test"
import { resolve } from "node:path"
import type { Metadata } from "./app-dock-runtime-backend"
import { AppDockRuntimeDocker } from "./app-dock-runtime-docker"
import { rejection } from "./rejection.fixture"

const owner = "11dc45b7-3ed8-40ea-a56e-232a1c39f381"
const id = "a".repeat(64)
const label = "io.orchestra.app-dock"
const policy: unknown = await Bun.file(resolve("resources/linux-runtime/seccomp.json")).json()
const metadata: Metadata = {
  version: 1, owner, password: "b".repeat(64), dockerContext: "default", endpoint: "unix:///var/run/docker.sock", containerID: id,
}
const home = { Name: `orchestra-linux-${owner}-home`, Labels: { [label]: "workspace", [`${label}.owner`]: owner, [`${label}.kind`]: "home" } }

// Shape of a workspace container exactly as `docker create` in the backend produces it.
function container(): AppDockRuntimeDocker.Container {
  return {
    Id: id,
    Image: `sha256:${"c".repeat(64)}`,
    Name: `/orchestra-linux-${owner}`,
    Config: {
      Labels: { [label]: "workspace", [`${label}.owner`]: owner, [`${label}.kind`]: "workspace" },
      Env: [`APP_DOCK_RUNTIME_PASSWORD=${metadata.password}`, "PATH=/usr/bin"],
    },
    State: { Running: true, StartedAt: "2026-10-05T00:00:00.000000000Z" },
    Mounts: [{ Type: "volume", Name: home.Name, Destination: "/home/dock" }],
    NetworkSettings: { Ports: { "14500/tcp": [{ HostIp: "127.0.0.1", HostPort: "49153" }] } },
    HostConfig: {
      Memory: 2 * 1024 ** 3, NanoCpus: 2 * 10 ** 9, PidsLimit: 512, ShmSize: 128 * 1024 ** 2, Init: true,
      SecurityOpt: [`seccomp=${JSON.stringify(policy)}`], Privileged: false, CapAdd: null,
    },
  }
}

test("a container matching every ownership fact is proven as the workspace", async () => {
  expect(await AppDockRuntimeDocker.proveWorkspace(container(), metadata, async () => home)).toEqual({
    id, image: `sha256:${"c".repeat(64)}`, running: true, startedAt: "2026-10-05T00:00:00.000000000Z", viewerPort: "49153",
  })
})

const weakened: Array<[string, (found: AppDockRuntimeDocker.Container) => void]> = [
  ["foreign owner label", (found) => { found.Config.Labels = { ...found.Config.Labels, [`${label}.owner`]: "other" } }],
  ["wrong kind label", (found) => { found.Config.Labels = { ...found.Config.Labels, [`${label}.kind`]: "home" } }],
  ["missing labels", (found) => { found.Config.Labels = null }],
  ["non-hex ID", (found) => { found.Id = "A".repeat(64) }],
  ["replacement under the owner name", (found) => { found.Id = "d".repeat(64) }],
  ["different name", (found) => { found.Name = `/orchestra-linux-${owner}-copy` }],
  ["home mounted elsewhere", (found) => { found.Mounts = [{ ...found.Mounts[0]!, Destination: "/root" }] }],
  ["foreign volume at home", (found) => { found.Mounts = [{ ...found.Mounts[0]!, Name: "other-home" }] }],
  ["missing password", (found) => { found.Config.Env = ["PATH=/usr/bin"] }],
  ["memory limit", (found) => { found.HostConfig.Memory = 4 * 1024 ** 3 }],
  ["cpu limit", (found) => { found.HostConfig.NanoCpus = 4 * 10 ** 9 }],
  ["pids limit", (found) => { found.HostConfig.PidsLimit = 1024 }],
  ["shm size", (found) => { found.HostConfig.ShmSize = 64 * 1024 ** 2 }],
  ["no init", (found) => { found.HostConfig.Init = false }],
  ["privileged", (found) => { found.HostConfig.Privileged = true }],
  ["added capability", (found) => { found.HostConfig.CapAdd = ["SYS_ADMIN"] }],
  ["no seccomp", (found) => { found.HostConfig.SecurityOpt = [] }],
  ["other seccomp policy", (found) => { found.HostConfig.SecurityOpt = [`seccomp=${JSON.stringify({ defaultAction: "SCMP_ACT_ALLOW" })}`] }],
]

test.each(weakened)("refuses a workspace with %s", async (_name, weaken) => {
  const found = container()
  weaken(found)
  expect(await rejection(AppDockRuntimeDocker.proveWorkspace(found, metadata, async () => home))).toMatchObject({ code: "failed" })
})

test("refuses a workspace whose home volume is missing", async () => {
  expect(await rejection(AppDockRuntimeDocker.proveWorkspace(container(), metadata, async () => undefined))).toMatchObject({ code: "failed" })
})

test("an unpinned workspace is proven by owner name before the ID is recorded", async () => {
  const unpinned = { ...metadata, containerID: undefined }
  expect((await AppDockRuntimeDocker.proveWorkspace(container(), unpinned, async () => home)).id).toBe(id)
})

test.each([
  ["no binding", null],
  ["two bindings", [{ HostIp: "127.0.0.1", HostPort: "1" }, { HostIp: "127.0.0.1", HostPort: "2" }]],
  ["non-loopback binding", [{ HostIp: "0.0.0.0", HostPort: "49153" }]],
  ["non-numeric port", [{ HostIp: "127.0.0.1", HostPort: "49153/tcp" }]],
])("exposes no viewer port for %s", async (_name, ports) => {
  const found = container()
  found.NetworkSettings.Ports = { "14500/tcp": ports }
  expect((await AppDockRuntimeDocker.proveWorkspace(found, metadata, async () => home)).viewerPort).toBeUndefined()
})

test("a stopped container without port bindings is still proven", async () => {
  const found = container()
  found.State.Running = false
  found.NetworkSettings.Ports = null
  expect(await AppDockRuntimeDocker.proveWorkspace(found, metadata, async () => home)).toMatchObject({ running: false, viewerPort: undefined })
})

test("long-lived workspace processes target the immutable ID on the pinned endpoint", () => {
  const backend = AppDockRuntimeDocker.create({ context: resolve("resources/linux-runtime") })
  const command = backend.command(metadata.endpoint, id, { user: "dock", argv: ["python3", "/opt/orchestra/workspace-access.py", "terminal", "run"], tty: true })
  expect(command.file).toBe("docker")
  expect(command.args).toEqual([
    "--host", metadata.endpoint, "exec", "--interactive", "--tty", "--user", "dock", id,
    "python3", "/opt/orchestra/workspace-access.py", "terminal", "run",
  ])
  expect(backend.command(metadata.endpoint, id, { user: "dock", argv: ["true"] }).args).toEqual([
    "--host", metadata.endpoint, "exec", "--interactive", "--user", "dock", id, "true",
  ])
})
