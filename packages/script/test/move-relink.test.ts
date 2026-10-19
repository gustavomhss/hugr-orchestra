// Teeth for script/move-relink.ts on a fixture workspace: every import position is relinked across a package move, a
// card's own post-move edit is left alone, pins are listed, and every malformed input is a named failure. The script
// runs as the lead runs it, as a CLI, like build-preflight.test.ts runs the Nix scripts.
import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const roots: string[] = []
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n"
const spec = (layer: string, extra: Record<string, unknown> = {}) => ({
  layer,
  status: "canonical",
  owner: "fixture maintainer",
  summary: "A fixture package.",
  exportsPolicy: "none",
  ...extra,
})

const moves = [
  { from: "apps/app/src/feature/a.ts", to: "modules/dest/src/a.ts" },
  // A Windows separator in the map is normalized.
  { from: "apps\\app\\src\\feature\\b.ts", to: "modules/dest/src/b.ts" },
  { from: "apps/app/src/feature/c.ts", to: "modules/dest/src/c.ts" },
  { from: "apps/app/src/prompt/p.txt", to: "modules/dest/src/prompt/p.txt" },
  { from: "apps/app/src/tool/dir.ts", to: "packages/core/src/tool/dir.ts" },
  { from: "apps/app/src/kit/index.ts", to: "modules/dest/src/kit/index.ts" },
  { from: "apps/app/src/old/e.ts", to: "apps/app/src/new/e.ts" },
]

// A card's own edit, written for the post-move location.
const cardEdit = 'import { facade } from "./compat/facade"\nexport const c = facade\n'
const userSource = [
  'import { a } from "./feature/a"',
  'export type { B } from "@/feature/b"',
  'export const lazy = () => import("./feature/a")',
  'export type Mod = typeof import("./feature/b")',
  'export const required = require("./feature/b")',
  'import { log } from "@/util/log"',
  'export const fixture = "apps/app/src/feature/a.ts"',
  'import { e } from "@/old/e"',
  "export const all = [a, log, e]",
  "",
].join("\r\n")

const files: Record<string, string> = {
  ".gitignore": "node_modules/\n",
  "package.json": json({ name: "fixture", private: true, workspaces: ["apps/*", "packages/*", "modules/*"] }),
  "script/module-registry.json": json({
    format: 1,
    modules: [
      { alias: "app", kind: "bun", scope: ".", name: "app", path: "apps/app" },
      { alias: "core", kind: "bun", scope: ".", name: "@fx/core", path: "packages/core" },
      { alias: "dest", kind: "bun", scope: ".", name: "@fx/dest", path: "modules/dest" },
    ],
  }),
  "script/module-architecture.json": json({
    format: 1,
    layers: { app: ["app", "product", "foundation"], product: ["product", "foundation"], foundation: ["foundation"] },
    packages: { app: spec("app", { aliases: { "@/": "src/" } }), core: spec("foundation"), dest: spec("product") },
    legacy: [],
    productEdges: [],
    relayContainment: { package: "core", specifier: "@fx/core", domains: [] },
    logicalModules: [],
    assetModules: [],
    scaffoldReadmes: [],
  }),
  "script/moves/fixture.json": json({ moves }),
  "apps/app/package.json": json({ name: "app" }),
  "packages/core/package.json": json({ name: "@fx/core", exports: { "./thing": "./src/thing.ts", "./legacy/*": "./src/*.ts", "./*": "./src/*.ts" } }),
  "modules/dest/package.json": json({ name: "@fx/dest", exports: { "./*": "./src/*.ts" } }),
  "packages/core/src/thing.ts": "export const thing = 1\n",
  "packages/core/src/other.ts": "export const other = 1\n",
  "modules/dest/src/compat/facade.ts": "export const facade = 1\n",
  "apps/app/src/util/log.ts": "export const log = 1\n",
  "apps/app/src/prompt/p.txt": "prompt\n",
  "apps/app/src/feature/a.ts": [
    'import { b } from "./b"',
    'import { b as again } from "@/feature/b"',
    'import { thing } from "@fx/core/thing"',
    // Valid as written: a package specifier to a file that stays in another package is not respelled.
    'import { other } from "@fx/core/legacy/other"',
    'import PROMPT from "../prompt/p.txt"',
    "export const a = [b, again, thing, other, PROMPT]",
    "",
  ].join("\n"),
  "apps/app/src/feature/b.ts": "export const b = 2\nexport type B = number\n",
  "apps/app/src/feature/c.ts": cardEdit,
  "apps/app/src/tool/dir.ts": 'import { thing } from "@fx/core/thing"\nexport const dir = thing\n',
  "apps/app/src/tool/use.ts": 'import { dir } from "./dir"\nexport const use = dir\n',
  "apps/app/src/user.ts": userSource,
  "apps/app/test/user.test.ts": 'const source = "src/feature/b"\nexport const dir = "apps/app/src/feature/"\n',
  // A directory index's self-export through "." stays "." after the move.
  "apps/app/src/kit/index.ts": 'export * as Kit from "."\nexport const kit = 1\n',
  // Moves inside its package: its own alias import becomes relative, an unmoved importer keeps its alias.
  "apps/app/src/old/e.ts": 'import { log } from "@/util/log"\nexport const e = log\n',
  // No package owns this importer, so it stays relative; `.js` and a directory index keep their spelling.
  ".github/scripts/run.ts": [
    'import { b } from "../../apps/app/src/feature/b"',
    'import { a } from "../../apps/app/src/feature/a.js"',
    'import { kit } from "../../apps/app/src/kit"',
    "export const run = [a, b, kit]",
    "",
  ].join("\n"),
}

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "move-relink-")))
  roots.push(root)
  Object.entries(files).forEach(([file, text]) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), text)
  })
  expect(Bun.spawnSync(["git", "init", "-q"], { cwd: root }).exitCode).toBe(0)
  return root
}

function move(root: string) {
  moves.forEach((item) => {
    const from = item.from.replaceAll("\\", "/")
    mkdirSync(path.dirname(path.join(root, item.to)), { recursive: true })
    renameSync(path.join(root, from), path.join(root, item.to))
  })
}

const read = (root: string, file: string) => readFileSync(path.join(root, file), "utf8")
const map = "script/moves/fixture.json"
const script = path.resolve(import.meta.dir, "../../../script/move-relink.ts")

function relink(root: string, maps: string[], apply: boolean) {
  const child = Bun.spawnSync([process.execPath, "--no-install", script, "--root", root, apply ? "--apply" : "--check", ...maps], { stdout: "pipe", stderr: "pipe" })
  const lines = child.stdout.toString().split("\n")
  const pick = (prefix: string) => lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length))
  return {
    code: child.exitCode,
    error: child.stderr.toString(),
    rewrites: pick("REWRITE ").map((line) => line.slice(line.indexOf(" ") + 1)),
    pins: pick("PIN "),
    unresolved: lines.filter((line) => /^(UNRESOLVED|MISMATCH) /.test(line)),
  }
}

function fails(root: string, maps: string[], apply: boolean, code: string) {
  const result = relink(root, maps, apply)
  expect(result.code).not.toBe(0)
  expect(result.error).toContain(code)
}

describe("move-relink", () => {
  test("check lists every rewrite and pin before and after the moves, and changes nothing", () => {
    const root = fixture()
    const before = relink(root, [map], false)
    move(root)
    const after = relink(root, [map], false)
    expect(before.code).toBe(0)
    expect(after.code).toBe(0)
    expect(after.rewrites.toSorted()).toEqual(before.rewrites.toSorted())
    expect(after.rewrites.toSorted()).toEqual(
      [
        "../../apps/app/src/feature/b -> ../../modules/dest/src/b",
        "../../apps/app/src/feature/a.js -> ../../modules/dest/src/a.js",
        "../../apps/app/src/kit -> ../../modules/dest/src/kit",
        "./dir -> @fx/core/tool/dir",
        "./feature/a -> @fx/dest/a",
        "./feature/a -> @fx/dest/a",
        "./feature/b -> @fx/dest/b",
        "./feature/b -> @fx/dest/b",
        "../prompt/p.txt -> ./prompt/p.txt",
        "@/feature/b -> ./b",
        "@/feature/b -> @fx/dest/b",
        "@fx/core/thing -> ../thing",
        "@/util/log -> ../util/log",
        "@/old/e -> @/new/e",
      ].sort(),
    )
    expect(after.pins).toEqual([
      "apps/app/src/user.ts:7 apps/app/src/feature/a.ts",
      "apps/app/test/user.test.ts:1 src/feature/b",
      "apps/app/test/user.test.ts:2 apps/app/src/feature",
    ])
    expect(read(root, "apps/app/src/user.ts")).toBe(userSource)
  })

  test("apply rewrites every import position, keeps CRLF and is idempotent", () => {
    const root = fixture()
    move(root)
    expect(relink(root, [map], true).code).toBe(0)
    expect(read(root, "apps/app/src/user.ts").split("\r\n").slice(0, 6)).toEqual([
      'import { a } from "@fx/dest/a"',
      'export type { B } from "@fx/dest/b"',
      'export const lazy = () => import("@fx/dest/a")',
      'export type Mod = typeof import("@fx/dest/b")',
      'export const required = require("@fx/dest/b")',
      'import { log } from "@/util/log"',
    ])
    expect(read(root, "modules/dest/src/a.ts")).toContain('import { b as again } from "./b"')
    expect(read(root, "modules/dest/src/a.ts")).toContain('import PROMPT from "./prompt/p.txt"')
    expect(read(root, "modules/dest/src/c.ts")).toBe(cardEdit)
    expect(read(root, "packages/core/src/tool/dir.ts")).toContain('from "../thing"')
    expect(read(root, "modules/dest/src/a.ts")).toContain('from "@fx/core/legacy/other"')
    expect(read(root, "apps/app/src/new/e.ts")).toContain('from "../util/log"')
    expect(read(root, "apps/app/src/user.ts")).toContain('import { e } from "@/new/e"')
    expect(read(root, "apps/app/src/tool/use.ts")).toContain('from "@fx/core/tool/dir"')
    expect(read(root, ".github/scripts/run.ts").split("\n").slice(0, 3)).toEqual([
      'import { b } from "../../modules/dest/src/b"',
      'import { a } from "../../modules/dest/src/a.js"',
      'import { kit } from "../../modules/dest/src/kit"',
    ])
    const again = relink(root, [map], false)
    expect(again.rewrites).toEqual([])
    expect(again.pins).toHaveLength(3)
  })

  test("a target with no export key is flagged for explicit-exports", () => {
    const root = fixture()
    writeFileSync(path.join(root, "modules/dest/package.json"), json({ name: "@fx/dest", exports: { "./compat/facade": "./src/compat/facade.ts" } }))
    move(root)
    const result = relink(root, [map], false)
    expect(result.code).toBe(0)
    expect(result.rewrites).toContain("./feature/a -> @fx/dest/a [needs export key in @fx/dest]")
    expect(result.rewrites).toContain("./dir -> @fx/core/tool/dir")
  })

  test("a specifier in a moved file that resolves nowhere fails and apply writes nothing", () => {
    const root = fixture()
    writeFileSync(path.join(root, "apps/app/src/feature/c.ts"), 'import { gone } from "./missing"\nexport const c = gone\n')
    move(root)
    const result = relink(root, [map], true)
    expect(result.code).toBe(1)
    expect(result.unresolved).toEqual(["UNRESOLVED modules/dest/src/c.ts:1 ./missing"])
    expect(read(root, "apps/app/src/user.ts")).toBe(userSource)
  })

  test("malformed maps and unfinished moves are named failures", () => {
    const root = fixture()
    const write = (value: unknown) => writeFileSync(path.join(root, "script/moves/bad.json"), json(value))
    fails(root, [map], true, "MOVE_NOT_APPLIED")
    write({ moves: [{ from: "apps/app/src/nope.ts", to: "modules/dest/src/nope.ts" }] })
    fails(root, ["script/moves/bad.json"], false, "MOVE_SOURCE_MISSING")
    write({ moves: [] })
    fails(root, ["script/moves/bad.json"], false, "MOVE_MAP_EMPTY")
    write({ list: [] })
    fails(root, ["script/moves/bad.json"], false, "MOVE_MAP_INVALID")
    write({ moves: [moves[0]] })
    fails(root, [map, "script/moves/bad.json"], false, "MOVE_MAP_DUPLICATE")
    expect(relink(root, [], false).code).toBe(2)
  })
})
