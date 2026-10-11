import path from "node:path"

if (process.env.GITHUB_ACTIONS !== "false" || !process.env.RUNNER_OS)
  throw new Error("Compiled CLI acceptance requires the Actions test-ci runner; local execution is forbidden")

// test-ci's warm dependency cache contains only host addons. Cross compilation needs the locked foreign addons too.
const child = Bun.spawn(
  [process.execPath, "install", "--frozen-lockfile", "--ignore-scripts", "--os=*", "--cpu=*"],
  { cwd: path.resolve(import.meta.dirname, "../../.."), stdout: "pipe", stderr: "pipe", timeout: 600_000 },
)
const [stdout, stderr, code] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
])
if (code !== 0) throw new Error(`Cross-target dependency setup failed (${code}):\n${stdout}\n${stderr}`)

await import("./build-runtime.test")
