import { afterEach, expect, test } from "bun:test"
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { NATIVE_MACHINES, lockfileNodeGyp, nativeMachines, prepareTreeSitterPrebuilds } from "./tree-sitter-prebuilds"

const root = path.resolve(import.meta.dir, "../../..")
const host = `${process.platform}-${process.arch}`
const fixtures: string[] = []

afterEach(() => fixtures.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

test("the installed linux-arm64 typescript and javascript grammars are x86-64 and the guard refuses them", () => {
  const failure = (() => {
    try {
      prepareTreeSitterPrebuilds({ root, os: "linux", arch: "arm64", rebuild: false })
    } catch (error) {
      return String(error)
    }
  })()
  expect(failure).toContain("TREE_SITTER_PREBUILD_ARCH_MISMATCH")
  expect(failure).toMatch(/tree-sitter-typescript[\\/]prebuilds[\\/]linux-arm64[\\/]tree-sitter-typescript\.node/)
  expect(failure).toMatch(/tree-sitter-javascript[\\/]prebuilds[\\/]linux-arm64[\\/]tree-sitter-javascript\.node/)
  expect(failure).not.toContain("tree-sitter-python.node")
})

test.each(["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64", "win32-arm64"])(
  "%s prebuilds all match",
  (target) => {
    const [platform, arch] = target.split("-")
    const result = prepareTreeSitterPrebuilds({ root, os: platform!, arch: arch!, rebuild: false })
    expect(result.rebuilt).toEqual([])
    expect(result.checked.map((file) => path.basename(file)).sort()).toEqual(
      expect.arrayContaining(["tree-sitter-javascript.node", "tree-sitter-python.node", "tree-sitter-typescript.node"]),
    )
    result.checked.forEach((file) => expect(nativeMachines(file)).toEqual([NATIVE_MACHINES[target]!]))
  },
)

test("an install without the grammars is a named failure, not a pass", () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-empty-"))
  fixtures.push(empty)
  expect(() => prepareTreeSitterPrebuilds({ root: empty, os: "linux", arch: "x64" })).toThrow(
    "TREE_SITTER_PREBUILDS_MISSING: linux-x64: tree-sitter-javascript, tree-sitter-python, tree-sitter-typescript",
  )
})

test("a mislabeled host prebuild is rebuilt from source and loads", () => {
  const fixture = mislabeledHostFixture()
  const file = path.join(fixture, "node_modules", "tree-sitter-python", "prebuilds", host, "tree-sitter-python.node")
  expect(nativeMachines(file)).not.toContain(NATIVE_MACHINES[host])
  expect(() =>
    prepareTreeSitterPrebuilds({ root: fixture, os: process.platform, arch: process.arch, rebuild: false }),
  ).toThrow("TREE_SITTER_PREBUILD_ARCH_MISMATCH")

  const result = prepareTreeSitterPrebuilds({ root: fixture, os: process.platform, arch: process.arch })

  expect(result.rebuilt).toEqual(["tree-sitter-python"])
  expect(nativeMachines(file)).toEqual([NATIVE_MACHINES[host]!])
  expect(existsSync(path.join(fixture, "node_modules", "tree-sitter-python", "build"))).toBe(false)
  // A child loads it: the grammar's real consumer is a Node worker, and a DLL loaded here would pin the fixture on Windows.
  const load = Bun.spawnSync(["node", "-e", `console.log(Object.keys(require(${JSON.stringify(file)})).join())`])
  expect({ exit: load.exitCode, stdout: load.stdout.toString().trim() }, load.stderr.toString()).toEqual({
    exit: 0,
    stdout: "language",
  })
}, 600_000)

// A real tree-sitter-python whose host prebuild is another CPU's file, beside host-CPU javascript/typescript stubs.
function mislabeledHostFixture() {
  // gyp computes relative paths from the real cwd; macOS tmpdir is behind the /var -> /private/var link.
  const fixture = realpathSync(mkdtempSync(path.join(os.tmpdir(), "tree-sitter-rebuild-")))
  fixtures.push(fixture)
  const modules = path.join(fixture, "node_modules")
  const resolve = createRequire(path.join(root, "packages", "maestro-arsenal", "package.json")).resolve
  const python = path.resolve(path.dirname(resolve("tree-sitter-python/package.json")))
  const gyp = lockfileNodeGyp(root)!
  mkdirSync(modules)
  cpSync(realpathSync(python), path.join(modules, "tree-sitter-python"), { recursive: true, dereference: true })
  // gyp cannot reach a dependency .gyp outside the tree it builds, so node-addon-api is copied, not linked.
  const addonApi = createRequire(path.join(python, "package.json")).resolve("node-addon-api/package.json")
  cpSync(realpathSync(path.dirname(addonApi)), path.join(modules, "node-addon-api"), {
    recursive: true,
  })
  symlinkSync(path.dirname(path.dirname(gyp)), path.join(modules, "node-gyp"), "junction")
  const foreign = readdirSync(path.join(python, "prebuilds")).find(
    (dir) =>
      !nativeMachines(path.join(python, "prebuilds", dir, "tree-sitter-python.node")).includes(NATIVE_MACHINES[host]!),
  )!
  const prebuild = path.join(modules, "tree-sitter-python", "prebuilds", host, "tree-sitter-python.node")
  rmSync(prebuild)
  copyFileSync(path.join(python, "prebuilds", foreign, "tree-sitter-python.node"), prebuild)
  // The stubs only need host-CPU bytes. Python's host prebuild has them everywhere, including linux-arm64.
  ;["tree-sitter-typescript", "tree-sitter-javascript"].forEach((name) => {
    mkdirSync(path.join(modules, name, "prebuilds", host), { recursive: true })
    writeFileSync(path.join(modules, name, "package.json"), JSON.stringify({ name }))
    copyFileSync(
      path.join(python, "prebuilds", host, "tree-sitter-python.node"),
      path.join(modules, name, "prebuilds", host, `${name}.node`),
    )
  })
  return fixture
}
