import { plugin } from "bun"
import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"

const enabled = process.env.APP_DOCK_RUNTIME_INTEGRATION === "1"
const mutation = process.env.APP_DOCK_RUNTIME_PERFORMANCE_MUTATION
const source = resolve(import.meta.dir, "app-dock-runtime.ts")
const image = process.env.APP_DOCK_RUNTIME_TEST_IMAGE

// Instrument the actual child process boundary; responses still come from Docker
// and the bundled Gio helper. No fake engine or catalogue can satisfy this test.
if (enabled) plugin({
  name: "runtime-performance-actual-command-count",
  setup(build) {
    build.onLoad({ filter: /(?:app-dock-runtime|docker-engine)\.ts$/ }, async args => {
      if (resolve(args.path) === resolve(import.meta.dir, "docker-engine.ts")) {
        const text = await Bun.file(args.path).text()
        expect(text.split("    async get<T>(path: string) {")).toHaveLength(2)
        return {
          contents: (text + "\nexport const requestPaths: string[] = []\n")
            .replace("    async get<T>(path: string) {", "    async get<T>(path: string) {\n      requestPaths.push(path)"),
          loader: "ts",
        }
      }
      if (resolve(args.path) !== source) return
      const text = await Bun.file(source).text()
      const instrumented = text.replace("const exec = promisify(execFile)", `
const execute = promisify(execFile)
export const commandCalls: string[] = []
const exec: typeof execute = (...input) => {
  const args = input[1] as string[]
  if (args.includes("exec")) commandCalls.push(args.at(-1)!)
  return execute(...input)
}`)
      expect(text.split("const exec = promisify(execFile)")).toHaveLength(2)
      if (!mutation) return { contents: instrumented, loader: "ts" }
      const needle = mutation === "reads"
        ? "current.reading && current.reading.barrier === queues.get(root)"
        : mutation === "expiry" ? "current.catalogue.expires > performance.now()"
        : mutation === "ownership" ? "found.HostConfig.PidsLimit !== 512 ||" : undefined
      if (!needle) throw new Error("Invalid runtime-performance mutation")
      expect(instrumented.split(needle)).toHaveLength(2)
      return { contents: instrumented.replace(needle, mutation === "ownership" ? "" : mutation === "expiry" ? "true" : "false"), loader: "ts" }
    })
  },
})

test.skipIf(!enabled)("coalesces actual reads, bounds catalogue caching, and preserves live ownership checks", async () => {
  if (!image) throw new Error("Set APP_DOCK_RUNTIME_TEST_IMAGE; this test must not build or pull an image")
  const module = await import(source) as typeof import("./app-dock-runtime") & { commandCalls: string[] }
  const engine = await import("./docker-engine") as typeof import("./docker-engine") & { requestPaths: string[] }
  const exec = promisify(execFile)
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ![
    "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION",
  ].includes(key)))
  const context = process.env.DOCKER_CONTEXT || (await exec("docker", ["context", "show"])).stdout.trim()
  const endpoint = JSON.parse((await exec("docker", ["context", "inspect", context])).stdout)[0].Endpoints.docker.Host as string
  const docker = (args: string[]) => exec("docker", ["--host", endpoint, ...args], {
    env: environment, timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024,
  })
  expect((await docker(["image", "inspect", "--format", "{{.Os}}", image])).stdout.trim()).toBe("linux")
  const root = await mkdtemp(join(tmpdir(), "opencode/orchestra-runtime-performance-"))
  const runtime = module.AppDockRuntime.create({ root, context: resolve("resources/linux-runtime"), image })
  const cleanup = { id: "", owner: "" }
  try {
    await runtime.start()
    const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as {
      owner: string; containerID: string; password: string
    }
    cleanup.id = metadata.containerID
    cleanup.owner = metadata.owner
    expect(metadata.containerID).toMatch(/^[a-f0-9]{64}$/)
    expect(module.commandCalls.includes("list")).toBe(true)

    const before = module.commandCalls.filter(call => call === "list").length
    const requests = engine.requestPaths.length
    const warm = await Promise.all(Array.from({ length: 4 }, () => runtime.state()))
    expect(warm.every(state => state.phase === "ready")).toBe(true)
    expect(module.commandCalls.filter(call => call === "list").length).toBe(before)
    expect(engine.requestPaths.length - requests).toBe(2)
    expect(warm[0]).not.toBe(warm[1])
    expect(warm[0]!.apps).not.toBe(warm[1]!.apps)
    const control = warm[1]!.apps.map(app => app.id)
    warm[0]!.apps.splice(0)
    expect(warm[1]!.apps.map(app => app.id)).toEqual(control)

    // A queued mutation is a read-join barrier even before it starts executing.
    const first = runtime.state()
    const failedInstall = runtime.install(join(root, "missing.deb")).catch(error => error)
    const afterMutation = runtime.state()
    await first
    expect(await failedInstall).toMatchObject({ code: "invalid-package" })
    expect((await afterMutation).phase).toBe("ready")
    expect(module.commandCalls.filter(call => call === "list").length).toBeGreaterThan(before)

    const appID = `orchestra-performance-${randomUUID()}.desktop`
    await docker(["exec", "--user", "dock", cleanup.id, "python3", "-c", `
from pathlib import Path
directory=Path('/home/dock/.local/share/applications')
directory.mkdir(parents=True,exist_ok=True)
(directory/${JSON.stringify(appID)}).write_text('[Desktop Entry]\\nType=Application\\nName=Runtime cache control\\nExec=/usr/bin/true\\nTerminal=false\\n')
`])
    // The real registry is the oracle; an empty or unobserved fixture fails.
    const actual = JSON.parse((await docker(["exec", "--user", "dock", cleanup.id, "python3", "/opt/orchestra/workspace.py", "list"])).stdout) as Array<{ id: string }>
    expect(actual.some(app => app.id === appID)).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 5_100))
    const expired = module.commandCalls.filter(call => call === "list").length
    const refreshed = await Promise.all(Array.from({ length: 4 }, () => runtime.state()))
    expect(refreshed.every(state => state.phase === "ready" && state.apps.some(app => app.id === appID))).toBe(true)
    expect(module.commandCalls.filter(call => call === "list").length - expired).toBe(1)

    await docker(["update", "--pids-limit", "1024", cleanup.id])
    expect((await runtime.state()).phase).toBe("error")
    expect((await docker(["inspect", "--format", "{{.State.Running}}", cleanup.id])).stdout.trim()).toBe("true")
    await docker(["update", "--pids-limit", "512", cleanup.id])
    expect((await runtime.state()).phase).toBe("ready")

    await writeFile(join(root, "metadata.json"), JSON.stringify({ ...metadata, containerID: "0".repeat(64) }), { mode: 0o600 })
    expect((await runtime.state()).phase).toBe("error")
    await expect(runtime.stop()).rejects.toMatchObject({ code: "failed" })
    expect((await docker(["inspect", "--format", "{{.State.Running}}", cleanup.id])).stdout.trim()).toBe("true")
    await writeFile(join(root, "metadata.json"), JSON.stringify(metadata), { mode: 0o600 })
    await runtime.stop()
  } finally {
    if (!cleanup.id) {
      const metadata = await Bun.file(join(root, "metadata.json")).json()
      cleanup.id = metadata.containerID
      cleanup.owner = metadata.owner
    }
    const owned = JSON.parse((await docker(["container", "inspect", cleanup.id])).stdout)[0]
    expect(owned.Id).toBe(cleanup.id)
    expect(owned.Config.Labels["io.orchestra.app-dock.owner"]).toBe(cleanup.owner)
    await docker(["rm", "--force", cleanup.id])
    const home = `orchestra-linux-${cleanup.owner}-home`
    const volume = JSON.parse((await docker(["volume", "inspect", home])).stdout)[0]
    expect(volume.Labels["io.orchestra.app-dock.owner"]).toBe(cleanup.owner)
    await docker(["volume", "rm", home])
  }
}, 150_000)
