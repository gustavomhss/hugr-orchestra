import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"

const root = path.resolve(import.meta.dir, "../../..")
const missingEdge = "SDK_BUILD_ORDER: @orchestra/plugin#build must depend on @orchestra/sdk#build"
type Graph = { tasks: { taskId: string; command: string; dependencies: string[]; outputs: string[] }[] }

test("real Turbo graph orders SDK before plugin and rejects the removed override", async () => {
  requireSDKBeforePlugin(await graph())
  const directory = await mkdtemp(path.join(tmpdir(), "sdk-build-order-"))
  try {
    const config = parse(await Bun.file(path.join(root, "turbo.json")).text()) as { tasks: Record<string, unknown> }
    expect(config.tasks["@orchestra/plugin#build"]).toBeDefined()
    delete config.tasks["@orchestra/plugin#build"]
    await Bun.write(path.join(directory, "turbo.json"), JSON.stringify(config))
    const mutant = await graph(path.join(directory, "turbo.json"))
    expect(() => requireSDKBeforePlugin(mutant)).toThrow(missingEdge)
    console.log(`Mutation control rejected: ${missingEdge}`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)

// Regeneration mutates source exports. Run this proof in scoped CI, outside the concurrent Turbo unit suite.
test.skipIf(process.env.PACKAGE !== "core")("real Turbo build generates SDK then compiles plugin", async () => {
  requireSDKBeforePlugin(await graph())
  const child = Bun.spawn([process.execPath, "turbo", "run", "build", "--filter=@orchestra/plugin", "--force"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    timeout: 350_000,
  })
  expect(await child.exited, "SDK generation and plugin compilation must both succeed").toBe(0)
  expect(child.signalCode).toBeNull()
}, 360_000)

async function graph(config?: string) {
  const child = Bun.spawn([
    process.execPath, "turbo", "run", "build", "--filter=@orchestra/plugin", "--dry=json",
    ...(config ? ["--root-turbo-json", config] : []),
  ], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 25_000 })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  expect(code, `Turbo graph must resolve without a cycle: ${stderr}`).toBe(0)
  const result = JSON.parse(stdout) as Graph
  expect(Array.isArray(result.tasks), "Turbo graph must contain tasks").toBe(true)
  expect(result.tasks.length, "Turbo graph must not be empty").toBeGreaterThan(0)
  return result
}

function requireSDKBeforePlugin(value: Graph) {
  const plugin = value.tasks.find((task) => task.taskId === "@orchestra/plugin#build")
  if (!plugin) throw new Error("SDK_BUILD_ORDER: plugin build task missing")
  if (!plugin.dependencies.includes("@orchestra/sdk#build")) throw new Error(missingEdge)
  const sdk = value.tasks.find((task) => task.taskId === "@orchestra/sdk#build")
  if (!sdk) throw new Error("SDK_BUILD_ORDER: SDK build task missing")
  expect(plugin.command).toBe("tsc")
  expect(sdk.command).toBe("bun ./script/build.ts")
  expect(plugin.outputs).toEqual(["dist/**"])
  console.log("Turbo graph: @orchestra/sdk#build -> @orchestra/plugin#build; outputs: dist/**")
}
