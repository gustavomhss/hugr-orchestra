import { afterAll, beforeAll, expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { requireTreeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"

const root = path.resolve(import.meta.dirname, "..")
const native = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
const executable = `orchestra${process.platform === "win32" ? ".exe" : ""}`
const bin = path.join(root, `dist/cli-${native}/bin`)
let home: string
let env: Record<string, string | undefined>

// One host build of the CLI, as the release lanes and the Desktop stage it.
beforeAll(async () => {
  if (process.env.GITHUB_ACTIONS !== "false" || !process.env.RUNNER_OS)
    throw new Error("Compiled CLI acceptance requires the Actions test-ci runner; local execution is forbidden")
  home = await mkdtemp(path.join(tmpdir(), "orchestra-cli-tree-sitter-"))
  await Bun.write(path.join(home, "models.json"), "{}")
  await Bun.write(
    path.join(home, "sample.ts"),
    'import { readFile } from "node:fs/promises"\nexport interface Shape { area(): number }\nexport class Square implements Shape { area() { return 4 } }\nexport function load(file: string) { return readFile(file, "utf8") }\n',
  )
  await Bun.write(path.join(home, "sample.py"), "from os import path\n\ndef join(a, b):\n    return path.join(a, b)\n")
  env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/^(ORCHESTRA_|XDG_|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$)/.test(key)),
    ),
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    XDG_DATA_HOME: path.join(home, "data"),
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_CACHE_HOME: path.join(home, "cache"),
    XDG_STATE_HOME: path.join(home, "state"),
    ORCHESTRA_VERSION: "1.18.27-tree-sitter-test",
    ORCHESTRA_CHANNEL: "dev",
    ORCHESTRA_PURE: "1",
    ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    // This build ships no omni pair; extraction runs in process either way.
    ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0",
    MODELS_DEV_API_JSON: path.join(home, "models.json"),
  }
  const build = await run([process.execPath, "script/build.ts", "--skip-install", "--single", "--target", native], 900_000)
  if (build.code !== 0) throw new Error(`Builder failed (${build.code}):\n${build.stdout}\n${build.stderr}`)
}, 900_000)

afterAll(async () => {
  if (home) await rm(home, { recursive: true, force: true })
})

async function run(argv: string[], timeout = 120_000, cwd = root) {
  const child = Bun.spawn(argv, { cwd, env, stdout: "pipe", stderr: "pipe", timeout })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout: stdout.trim(), stderr: stderr.trim(), code }
}

async function symbols(binary: string, file: string) {
  // Outside the checkout, so nothing but the shipped copies can satisfy a lookup.
  const result = await run([binary, "debug", "symbols", path.join(home, file)], 120_000, home)
  expect(result.code, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}

test("the compiled CLI ships tree-sitter beside its binary and extracts real symbols with it", async () => {
  requireTreeSitterBundle(path.join(bin, "tree-sitter"), { os: process.platform, arch: process.arch })
  const ts = await symbols(path.join(bin, executable), "sample.ts")
  expect(ts.coverage).toMatchObject({ complete: true })
  expect(ts.symbols.map((symbol: { name: string; kind: string }) => `${symbol.kind} ${symbol.name}`)).toEqual([
    "interface Shape",
    "class Square",
    "function load",
  ])
  expect(ts.imports).toEqual([{ from: "node:fs/promises", names: ["readFile"] }])
  const py = await symbols(path.join(bin, executable), "sample.py")
  expect(py.coverage).toMatchObject({ complete: true })
  expect(py.symbols.map((symbol: { name: string }) => symbol.name)).toEqual(["join"])
}, 120_000)

test("the same binary without its tree-sitter reports parser-unavailable and names where it looked", async () => {
  const bare = path.join(home, "bare")
  await mkdir(bare)
  await copyFile(path.join(bin, executable), path.join(bare, executable))
  const result = await symbols(path.join(bare, executable), "sample.ts")
  expect(result).toMatchObject({ symbols: [], imports: [], coverage: { complete: false, reason: "parser-unavailable" } })
  expect(result.coverage.detail).toStartWith("native symbol extraction unavailable: ")
  expect(result.coverage.detail).toContain(path.join("bare", "tree-sitter", "tree-sitter"))
  // A compiled binary has no parser-worker asset, so none is tried.
  expect(result.coverage.detail).not.toContain("parser-worker")
}, 120_000)
