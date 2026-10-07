import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { child } from "./app-dock-linux-live-child.fixture"
import { cases, docker, label, type Metadata } from "./app-dock-linux-live.fixture"

// Run from packages/desktop with APP_DOCK_LINUX_INTEGRATION=1 and
// APP_DOCK_RUNTIME_TEST_IMAGE=<existing image>. No image build or pull is allowed.
// Optional MAIN_ROOT/COORDINATOR overrides resolve relative imports against an
// in-flight integration tree; the landed test uses its adjacent implementations.
const flag = "--app-dock-linux-live-child"

// Parent owns cleanup even when Electron fails or is killed. Exact ID, context,
// owner/kind labels and mounted volume are checked before any object is removed.
async function cleanup(root: string) {
  const metadata = await readFile(join(root, "runtime/metadata.json"), "utf8")
    .then((text) => JSON.parse(text) as Metadata)
    .catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
  if (!metadata) return
  assert.match(metadata.owner, /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  const home = `orchestra-linux-${metadata.owner}-home`
  const container = await docker(metadata.dockerContext, ["container", "inspect", `orchestra-linux-${metadata.owner}`])
    .then((result) => JSON.parse(result.stdout)[0])
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        "stderr" in error &&
        String(error.stderr).trim() ===
          `Error response from daemon: No such container: orchestra-linux-${metadata.owner}`
      )
        return undefined
      throw error
    })
  if (container) {
    if (metadata.containerID) assert.equal(container.Id, metadata.containerID)
    assert.equal(container.Name, `/orchestra-linux-${metadata.owner}`)
    assert.equal(container.Config.Labels[label], "workspace")
    assert.equal(container.Config.Labels[`${label}.owner`], metadata.owner)
    assert.equal(container.Config.Labels[`${label}.kind`], "workspace")
    assert(
      container.Mounts.some(
        (mount: { Type: string; Name: string; Destination: string }) =>
          mount.Type === "volume" && mount.Name === home && mount.Destination === "/home/dock",
      ),
    )
    await docker(metadata.dockerContext, ["rm", "--force", container.Id])
    await assert.rejects(docker(metadata.dockerContext, ["container", "inspect", container.Id]), {
      stderr: `Error response from daemon: No such container: ${container.Id}\n`,
    })
  }
  const volume = await docker(metadata.dockerContext, ["volume", "inspect", home])
    .then((result) => JSON.parse(result.stdout)[0])
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        "stderr" in error &&
        String(error.stderr).trim() === `Error response from daemon: get ${home}: no such volume`
      )
        return undefined
      throw error
    })
  if (!volume) return
  assert.equal(volume.Name, home)
  assert.equal(volume.Labels[label], "workspace")
  assert.equal(volume.Labels[`${label}.owner`], metadata.owner)
  assert.equal(volume.Labels[`${label}.kind`], "home")
  await docker(metadata.dockerContext, ["volume", "rm", home])
  await assert.rejects(docker(metadata.dockerContext, ["volume", "inspect", home]), {
    stderr: `Error response from daemon: get ${home}: no such volume\n`,
  })
}

async function parent() {
  assert(process.env.APP_DOCK_RUNTIME_TEST_IMAGE, "Set APP_DOCK_RUNTIME_TEST_IMAGE to an existing runtime image")
  const temporary = process.env.APP_DOCK_RUNTIME_TEST_TMP ?? join(tmpdir(), "opencode")
  await mkdir(temporary, { recursive: true })
  const root = await mkdtemp(join(temporary, "orchestra-dock-linux-flow-"))
  console.log(`Linux App Dock evidence and ownership metadata: ${root}`)
  try {
    const result = await Bun.build({
      entrypoints: [import.meta.path],
      outdir: root,
      naming: "linux-flow.cjs",
      target: "node",
      format: "cjs",
      external: ["electron", "bun:test"],
      write: true,
      plugins: [
        {
          name: "linux-flow-integration-sources",
          setup(build) {
            const mutation = process.env.APP_DOCK_LINUX_TEST_MUTATION
            if (mutation) {
              if (mutation === "callback-delivery") {
                build.onLoad({ filter: /app-dock-runtime\.ts$/ }, async args => {
                  const text = await Bun.file(args.path).text()
                  const before = 'await bridgeCommand(metadata, container, "callback", { url })'
                  assert.equal(text.split(before).length, 2)
                  return { contents: text.replace(before, "undefined"), loader: "ts" }
                })
              }
              if (mutation === "callback-frame") {
                build.onLoad({ filter: /app-dock\.ts$/ }, async args => {
                  const text = await Bun.file(args.path).text()
                  const before = 'listen("will-frame-navigate", details => {\n      if (externalURL(details.url)) details.preventDefault()\n    })'
                  assert.equal(text.split(before).length, 2)
                  return { contents: text.replace(before, "undefined"), loader: "ts" }
                })
              }
              const before =
                mutation === "close"
                  ? "if (intents.get(senderID) === view.intent) invalidate(senderID)"
                 : mutation === "popup"
                   ? "options.notify(senderID, event)"
                 : mutation === "owner-visibility"
                   ? "const displayed = visible && view.win.isVisible() && !view.win.isMinimized()"
                  : mutation === "paint-suspension"
                    ? "delay: 60000, max_delay: 60000, timeout_delay: 60000"
                  : mutation === "reconnect"
                    ? 'url.pathname === "/index.html" &&'
                  : mutation === "owner-resize"
                    ? 'win.on("resize", resize)'
                  : mutation === "window-focus"
                    ? "win.set_maximized(true);win.focus();return client.focused_wid===win.wid;"
                  : mutation === "callback-delivery" || mutation === "callback-frame"
                    ? "return true;"
                    : undefined
              assert(before, "Unknown Linux integration mutation")
              build.onLoad({ filter: /app-dock-linux\.ts$/ }, async (args) => {
                if (mutation === "callback-delivery" || mutation === "callback-frame") return undefined
                const text = await Bun.file(args.path).text()
                assert.equal(text.split(before).length, mutation === "popup" ? 3 : 2, "Mutation source shape changed")
                return {
                  contents: text.replace(before, mutation === "close" ? "invalidate(senderID)" : mutation === "owner-visibility" ? "const displayed = visible" : mutation === "paint-suspension" ? "delay: 1000, max_delay: 1000, timeout_delay: 1000" : mutation === "window-focus" ? "return true;" : mutation === "reconnect" || mutation === "owner-resize" ? "" : "undefined"),
                  loader: "ts",
                }
              })
            }
            build.onResolve({ filter: /^\.\/app-dock(?:-linux|-runtime)?$/ }, (args) => {
              if (args.path === "./app-dock-linux" && process.env.APP_DOCK_LINUX_TEST_COORDINATOR)
                return { path: resolve(process.env.APP_DOCK_LINUX_TEST_COORDINATOR) }
              if (process.env.APP_DOCK_LINUX_TEST_MAIN_ROOT)
                return { path: resolve(process.env.APP_DOCK_LINUX_TEST_MAIN_ROOT, `${args.path}.ts`) }
              return undefined
            })
          },
        },
      ],
    })
    assert(result.success && result.outputs[0], `Electron child bundle failed: ${result.logs.join("\n")}`)
    const compiled = await result.outputs[0].text()
    assert(compiled.length > 1_000, "Electron child compiler emitted an empty artifact")
    await writeFile(join(root, "linux-flow.cjs"), compiled)
    const electron = process.env.APP_DOCK_ELECTRON ?? (createRequire(resolve("package.json"))("electron") as string)
    const env: NodeJS.ProcessEnv = { ...process.env, APP_DOCK_LINUX_TEST_ROOT: root }
    delete env.ELECTRON_RUN_AS_NODE
    const processChild = spawn(electron, [result.outputs[0].path, flag], { env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    processChild.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    processChild.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    const watchdog = setTimeout(() => processChild.kill("SIGKILL"), 540_000)
    const code = await new Promise<number | null>((resolve, reject) => {
      processChild.once("error", reject)
      processChild.once("exit", resolve)
    }).finally(() => clearTimeout(watchdog))
    const text = await readFile(join(root, "evidence.json"), "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    if (text) console.log(JSON.stringify(JSON.parse(text)))
    assert.equal(code, 0, `Electron Linux flow failed; diagnostics retained at ${root}\n${stdout}\n${stderr}`)
    assert(text, "Electron child did not emit JSON evidence")
    const report = JSON.parse(text)
    assert.equal(report.version, 1)
    assert.equal(report.status, "pass")
    assert.deepEqual(Object.keys(report.cases), cases)
  } finally {
    await cleanup(root)
  }
}

if (process.argv.includes(flag)) {
  void child().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
} else {
  void import("bun:test").then(({ test }) => {
    test.skipIf(process.env.APP_DOCK_LINUX_INTEGRATION !== "1")(
      "[integration: APP_DOCK_LINUX_INTEGRATION=1; actual Electron + Docker] Linux App Dock lifecycle",
      parent,
      600_000,
    )
  })
}
