// Teeth for script/check-module-boundaries.ts: every rule fails on a planted defect and passes on the clean fixture,
// and every ledger mode behaves as its header says. The fixture workspace uses fake package and vendored names.
import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { check, run } from "../../../script/check-module-boundaries"
import { isTestFile, loadWorkspace, renderReadmeBlock, type Architecture } from "../../../script/module-architecture"

type Tree = { files: Record<string, string>; architecture: Architecture; ledger: Record<string, string>[] }

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
const headings = [
  "Purpose and ownership",
  "Public entry points and consumers",
  "Dependencies and boundaries",
  "Assets, schemas and generated files",
  "Persistence, identity and lifetime",
  "Commands",
  "Contracts and verification limits",
]

function base(): Tree {
  const modules = [
    { alias: "schema", name: "@fx/schema", path: "packages/schema" },
    { alias: "core", name: "@fx/core", path: "packages/core" },
    { alias: "relay", name: "@fx/relay", path: "modules/relay" },
    { alias: "sdk", name: "@fx/sdk", path: "packages/sdk" },
    { alias: "ui", name: "@fx/ui", path: "packages/ui" },
    { alias: "app", name: "fx-app", path: "apps/app" },
    { alias: "unused", name: "@fx/unused", path: "packages/unused" },
  ].map((entry) => ({ ...entry, kind: "bun", scope: "." }))
  const files = {
    ".gitignore": "node_modules/\n",
    "package.json": json({ name: "fixture-root", private: true, workspaces: ["packages/*", "apps/*", "modules/relay"] }),
    "script/module-registry.json": json({ format: 1, modules }),
    "packages/schema/package.json": json({ name: "@fx/schema", exports: { ".": "./src/index.ts", "./thing": "./src/thing.ts" } }),
    "packages/schema/src/index.ts": "export const a = 1\n",
    "packages/schema/src/thing.ts": "export const thing = 1\n",
    "packages/core/package.json": json({
      name: "@fx/core",
      exports: { "./util/path": "./src/util/path.ts", "./session": "./src/session.ts", "./session/inner": "./src/session/inner.ts" },
      dependencies: { "@fx/schema": "workspace:*", "@fx/relay": "workspace:*", "@fx/sdk": "workspace:*" },
    }),
    "packages/core/src/util/path.ts": "export const join = (value: string) => value\n",
    "packages/core/src/session.ts": 'import { a } from "@fx/schema"\nexport const session = a\n',
    "packages/core/src/session/inner.ts": "export const inner = 1\n",
    "packages/core/src/session/README.md": ["# Session", ...headings.map((heading) => `## ${heading}`), "Entry `packages/core/src/session.ts`.", ""].join("\n"),
    "packages/core/src/relay.ts": 'import { relay } from "@fx/relay"\nexport const bound = relay\n',
    "modules/relay/package.json": json({ name: "@fx/relay", exports: { ".": "./src/index.ts" }, dependencies: { "@fx/schema": "workspace:*" } }),
    "modules/relay/src/index.ts": 'import { a } from "@fx/schema"\nexport const relay = a\n',
    "packages/sdk/package.json": json({ name: "@fx/sdk", exports: { ".": "./src/index.ts" } }),
    "packages/sdk/src/index.ts": "export type Client = { id: string }\n",
    "packages/ui/package.json": json({
      name: "@fx/ui",
      exports: { ".": "./src/index.ts", "./fonts/*": "./src/fonts/*" },
      dependencies: { "@fx/core": "workspace:*", "@fx/sdk": "workspace:*", "@vendor/client": "file:vendor/client.tgz" },
    }),
    "packages/ui/src/index.ts": 'import { join } from "@fx/core/util/path"\nimport type { Client } from "./compat/sdk"\nexport const ui: Client = { id: join("x") }\n',
    "packages/ui/src/compat/sdk.ts": 'export type * from "@fx/sdk"\n',
    "packages/ui/src/compat/vendored-client.ts": 'export * from "@vendor/client"\n',
    // An Effect-style service tag: a string that looks like a specifier but is not an import.
    "packages/ui/src/tag.ts": 'const Service = (name: string) => name\nexport const Tag = Service("@fx/sdk")\n',
    "apps/app/package.json": json({ name: "fx-app", dependencies: { "@fx/core": "workspace:*", "@fx/unused": "workspace:*", "@fx/schema": "workspace:*" } }),
    "apps/app/src/index.ts": 'import { session } from "@fx/core/session"\nimport "./maestro/a"\nexport const app = session\n',
    "apps/app/src/maestro/a.ts": 'import { b } from "../continuity/b"\nexport const a = b\n',
    "apps/app/src/continuity/b.ts": "export const b = 1\n",
    "apps/app/src/session/x.ts": "export const x = 1\n",
    "packages/unused/package.json": json({ name: "@fx/unused", exports: { ".": "./src/index.ts" } }),
    "packages/unused/src/index.ts": "export const unused = 1\n",
  }
  const architecture = {
    format: 1,
    layers: {
      foundation: [],
      client: ["foundation"],
      library: ["foundation"],
      module: ["foundation", "library"],
      platform: ["foundation", "library", "module:platformLibrary"],
      ui: ["foundation", "client", "ui", "platform:browserSafe"],
      app: ["foundation", "client", "library", "module", "platform", "ui"],
    },
    packages: {
      schema: spec("foundation", { exportsPolicy: "full" }),
      core: spec("platform", {
        browserSafe: ["src/util/path.ts"],
        modules: [{ path: "src/session", kind: "cohesive", entries: ["src/session.ts"] }],
        domains: {
          session: { kind: "platform", patterns: ["src/session/", "src/session.ts"] },
          util: { kind: "platform", patterns: ["src/util/"] },
          relay: { kind: "platform", patterns: ["src/relay.ts"] },
        },
      }),
      relay: spec("module", { platformLibrary: true }),
      sdk: spec("client", { status: "legacy", successor: "packages/schema" }),
      ui: spec("ui", { assetWildcards: ["./fonts/*"] }),
      app: spec("app", {
        status: "legacy",
        aliases: { "@/": "src/" },
        domains: {
          composition: { kind: "composition", patterns: ["src/index.ts"] },
          maestro: { kind: "product", patterns: ["src/maestro/"] },
          continuity: { kind: "product", patterns: ["src/continuity/"] },
          session: { kind: "platform-legacy", patterns: ["src/session/"] },
        },
      }),
      unused: spec("library", { status: "unused" }),
    },
    legacy: [
      { path: "packages/sdk", specifier: "@fx/sdk", status: "legacy", reason: "fixture legacy SDK", decision: "D14", compat: { ".": "sdk" } },
      { specifier: "@vendor/client", label: "the fixture vendored client", status: "legacy", reason: "fixture vendored client", decision: "D14", compat: { ".": "vendored-client" } },
      { path: "apps/app", status: "legacy", reason: "fixture legacy app", decision: "D14" },
    ],
    productEdges: [["maestro", "continuity"]],
    relayContainment: { package: "core", specifier: "@fx/relay", domains: ["relay"] },
    logicalModules: [],
    assetModules: [],
    scaffoldReadmes: ["packages/core/src/session/README.md"],
  } as Architecture
  return { files, architecture, ledger: [] }
}

function fixture(edit: (tree: Tree) => void = () => {}) {
  const tree = base()
  edit(tree)
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "module-boundaries-")))
  roots.push(root)
  const files = { ...tree.files, "script/module-architecture.json": json(tree.architecture), "script/boundary-ledger.json": json({ entries: tree.ledger }) }
  Object.entries(files).forEach(([file, content]) => put(root, file, content))
  expect(Bun.spawnSync(["git", "init", "-q"], { cwd: root }).exitCode).toBe(0)
  const workspace = loadWorkspace(root)
  workspace.members.forEach((member) => put(root, `${member.path}/README.md`, `# ${member.name}\n\n${renderReadmeBlock(workspace, member.alias)}\n`))
  return root
}

function put(root: string, file: string, content: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), content)
}

const found = (root: string) => check(loadWorkspace(root), () => true).violations
const gate = (root: string, ...args: string[]) => run({ root, args, minFiles: 1, minEdges: 1 })
const rules = (root: string, file: string) => found(root).filter((item) => item.file === file).map((item) => item.rule)
const decisions: Record<string, string> = { R1: "D13", R3: "D13", R4: "D7", R6a: "D10", R12: "D0" }
const entry = (rule: string, file: string, specifier: string, reason = `${decisions[rule]}: fixture exception`) => ({ rule, file, specifier, reason })
const commit = (root: string) => {
  const git = (args: string[]) => expect(Bun.spawnSync(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: root }).exitCode).toBe(0)
  git(["add", "-A"])
  git(["commit", "-qm", "base"])
}

describe("module-boundary gate", () => {
  test("the clean fixture has no violation and passes strict mode", () => {
    const root = fixture()
    expect(found(root)).toEqual([])
    const result = gate(root)
    expect(result.err).toEqual([])
    expect(result.code).toBe(0)
  })

  test("R0 fails when the two registries disagree or a registry path is missing", () => {
    const root = fixture((tree) => {
      delete tree.architecture.packages.unused
      tree.architecture.legacy.push({ path: "packages/gone", status: "legacy", reason: "x", decision: "D14" })
    })
    expect(found(root).filter((item) => item.rule === "R0").map((item) => item.message)).toEqual([
      "packages/gone does not exist",
      "registered in module-registry.json but not described",
    ])
    expect(gate(root).code).toBe(1)
  })

  test("R1 counts a type-only edge and lets a platformLibrary module through", () => {
    const root = fixture((tree) => {
      tree.files["packages/core/src/session/sdk.ts"] = 'import type { Client } from "@fx/sdk"\nexport type C = Client\n'
    })
    expect(rules(root, "packages/core/src/session/sdk.ts")).toContain("R1")
    expect(found(root).find((item) => item.rule === "R1")?.message).toContain("type-only edges included")
    expect(rules(root, "packages/core/src/relay.ts")).toEqual([])
  })

  test("R2 fails when a browserSafe file imports anything", () => {
    const root = fixture((tree) => {
      tree.files["packages/core/src/util/path.ts"] = 'import { a } from "@fx/schema"\nexport const join = (value: string) => value + a\n'
    })
    expect(rules(root, "packages/core/src/util/path.ts")).toEqual(["R2"])
  })

  test("R3 fails on legacy and vendored imports outside src/compat/ only", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/direct.ts"] = 'import type { Client } from "@fx/sdk"\nexport * from "@vendor/client"\nexport type C = Client\n'
    })
    expect(found(root).filter((item) => item.rule === "R3").map((item) => `${item.file} ${item.specifier}`)).toEqual([
      "packages/ui/src/direct.ts @fx/sdk",
      "packages/ui/src/direct.ts @vendor/client",
    ])
  })

  test("R4 fails on an undeclared workspace package", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/schema.ts"] = 'export { a } from "@fx/schema"\n'
    })
    expect(rules(root, "packages/ui/src/schema.ts")).toEqual(["R4"])
  })

  test("R5 fails on a relative escape, including an import.meta.glob pattern", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/escape.ts"] = 'export { join } from "../../core/src/util/path"\n'
      tree.files["packages/ui/src/glob.ts"] = 'export const all = import.meta.glob("../../schema/src/*.ts")\n'
      tree.files["packages/ui/src/inside.ts"] = 'export { ui } from "./index"\n'
    })
    expect(rules(root, "packages/ui/src/escape.ts")).toEqual(["R5"])
    expect(rules(root, "packages/ui/src/glob.ts")).toEqual(["R5"])
    expect(rules(root, "packages/ui/src/inside.ts")).toEqual([])
  })

  test("R6a fails on a code wildcard and keeps a registered asset wildcard", () => {
    const root = fixture((tree) => {
      tree.files["packages/schema/package.json"] = json({ name: "@fx/schema", exports: { ".": "./src/index.ts", "./*": "./src/*.ts" } })
    })
    expect(found(root).map((item) => `${item.rule} ${item.file} ${item.specifier}`)).toEqual(["R6a packages/schema/package.json ./*"])
  })

  test("R6b fails when a subpath has no exports key", () => {
    const root = fixture((tree) => {
      tree.files["apps/app/src/session/missing.ts"] = 'export { thing } from "@fx/schema/missing"\nexport { a } from "@fx/schema"\n'
    })
    expect(found(root).map((item) => `${item.rule} ${item.specifier}`)).toEqual(["R6b @fx/schema/missing"])
  })

  test("R7 fails on a deep import into a cohesive module and passes on its entry", () => {
    const root = fixture((tree) => {
      tree.files["apps/app/src/session/deep.ts"] = 'export { inner } from "@fx/core/session/inner"\n'
    })
    expect(rules(root, "apps/app/src/session/deep.ts")).toEqual(["R7"])
    expect(rules(root, "apps/app/src/index.ts")).toEqual([])
  })

  test("R8 fails on a drifted block, a missing heading and a missing backticked path", () => {
    const root = fixture()
    const readme = path.join(root, "packages/schema/README.md")
    writeFileSync(readme, readFileSync(readme, "utf8").replace("Owner: fixture maintainer", "Owner: someone"))
    put(root, "packages/core/src/session/README.md", ["# Session", ...headings.slice(1).map((heading) => `## ${heading}`), "See `packages/core/src/gone.ts`.", ""].join("\n"))
    const messages = found(root).filter((item) => item.rule === "R8").map((item) => `${item.file}: ${item.message}`)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain("packages/core/src/session/README.md: scaffold headings missing or out of order")
    expect(messages[0]).toContain("names missing path packages/core/src/gone.ts")
    expect(messages[1]).toBe("packages/schema/README.md: module-contract block differs from script/module-readme.ts output")
  })

  test("R9 fails when an unused package gains an importer", () => {
    const root = fixture((tree) => {
      tree.files["apps/app/src/session/unused.ts"] = 'export { unused } from "@fx/unused"\n'
    })
    expect(rules(root, "apps/app/src/session/unused.ts")).toEqual(["R9"])
  })

  test("R10 confines the relay import to its domains", () => {
    const root = fixture((tree) => {
      tree.files["packages/core/src/session/relay.ts"] = 'export { relay } from "@fx/relay"\n'
    })
    expect(rules(root, "packages/core/src/session/relay.ts")).toEqual(["R10"])
  })

  test("R11 fails on platform-legacy to product and on an undeclared product edge", () => {
    const root = fixture((tree) => {
      tree.files["apps/app/src/session/product.ts"] = 'export { a } from "@/maestro/a"\n'
      tree.files["apps/app/src/continuity/back.ts"] = 'export { a } from "../maestro/a"\n'
    })
    expect(rules(root, "apps/app/src/session/product.ts")).toEqual(["R11"])
    expect(rules(root, "apps/app/src/continuity/back.ts")).toEqual(["R11"])
    expect(rules(root, "apps/app/src/maestro/a.ts")).toEqual([])
  })

  test("R12 fails on an uncovered file, an ambiguous file and a stale pattern", () => {
    const root = fixture((tree) => {
      tree.files["packages/core/src/orphan.ts"] = "export const orphan = 1\n"
      Object.assign(tree.architecture.packages.core?.domains ?? {}, { twin: { kind: "platform", patterns: ["src/relay.ts", "src/gone/"] } })
    })
    expect(found(root).filter((item) => item.rule === "R12").map((item) => `${item.file} ${item.message}`)).toEqual([
      "packages/core/src/orphan.ts no domain owns this file",
      "packages/core/src/relay.ts owned by relay and twin at equal precedence",
      "script/module-architecture.json stale pattern matches no file",
    ])
  })

  test("a ledgered violation passes; a stale entry fails strict mode and passes --no-stale", () => {
    const wildcard = (tree: Tree) => {
      tree.files["packages/schema/package.json"] = json({ name: "@fx/schema", exports: { ".": "./src/index.ts", "./*": "./src/*.ts" } })
    }
    const ledgered = fixture((tree) => {
      wildcard(tree)
      tree.ledger.push(entry("R6a", "packages/schema/package.json", "./*"))
    })
    expect(gate(ledgered).code).toBe(0)
    const stale = fixture((tree) => tree.ledger.push(entry("R6a", "packages/schema/package.json", "./*")))
    const strict = gate(stale)
    expect(strict.code).toBe(1)
    expect(strict.err).toEqual(["STALE R6a packages/schema/package.json ./*: no longer occurs; remove it from script/boundary-ledger.json"])
    expect(gate(stale, "--no-stale").code).toBe(0)
    const unledgerable = fixture((tree) => tree.ledger.push(entry("R12", "packages/core/src/relay.ts", "ownership")))
    expect(gate(unledgerable).err[0]).toContain("every entry needs a ledgerable rule")
  })

  test("--prune removes stale entries, never adds, and still fails on a new violation", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/schema.ts"] = 'export { a } from "@fx/schema"\n'
      tree.ledger.push(entry("R6a", "packages/schema/package.json", "./*"))
    })
    const result = gate(root, "--prune")
    expect(result.code).toBe(1)
    expect(result.report.new.map((item) => item.rule)).toEqual(["R4"])
    expect(JSON.parse(readFileSync(path.join(root, "script/boundary-ledger.json"), "utf8"))).toEqual({ entries: [] })
  })

  test("--seed writes the ledger only when it is absent", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/schema.ts"] = 'export { a } from "@fx/schema"\n'
    })
    const refused = gate(root, "--seed")
    expect(refused.code).toBe(1)
    expect(refused.err[0]).toContain("LEDGER_EXISTS")
    rmSync(path.join(root, "script/boundary-ledger.json"))
    expect(gate(root).err[0]).toContain("LEDGER_MISSING")
    expect(gate(root, "--seed").code).toBe(0)
    const seeded = JSON.parse(readFileSync(path.join(root, "script/boundary-ledger.json"), "utf8")).entries
    expect(seeded.map((item: { rule: string; file: string }) => `${item.rule} ${item.file}`)).toEqual(["R4 packages/ui/src/schema.ts"])
    expect(seeded[0].reason).toStartWith("D7:")
    expect(gate(root).code).toBe(0)
  })

  test("--scope reports stale entries only for in-scope files and refuses an empty scope", () => {
    const root = fixture((tree) => {
      tree.ledger.push(entry("R4", "packages/ui/src/gone.ts", "@fx/schema"), entry("R4", "apps/app/src/gone.ts", "@fx/sdk"))
    })
    const scoped = gate(root, "--scope", "packages/ui", "--json")
    expect(scoped.report.stale.map((item) => item.file)).toEqual(["packages/ui/src/gone.ts"])
    expect(gate(root).report.stale).toHaveLength(2)
    expect(gate(root, "--scope", "packages/nowhere").err[0]).toContain("SCOPE_EMPTY")
  })

  test("a service-tag string is not an import", () => {
    const root = fixture()
    expect(rules(root, "packages/ui/src/tag.ts")).toEqual([])
    put(root, "packages/ui/src/tag.ts", 'import type { Client } from "@fx/sdk"\nexport type T = Client\n')
    expect(rules(root, "packages/ui/src/tag.ts")).toEqual(["R3"])
  })

  test("an empty or thin scan fails instead of passing", () => {
    const root = fixture()
    expect(run({ root, args: [] }).err[0]).toContain("a scan that read almost nothing proves nothing")
    expect(run({ root, args: [], minFiles: 1, minEdges: 10_000 }).err[0]).toContain("the resolver is not seeing the workspace")
  })

  test("workspace specifiers resolve through the fixture's own exports, never node_modules", () => {
    const decoy = realpathSync(mkdtempSync(path.join(tmpdir(), "module-boundaries-decoy-")))
    roots.push(decoy)
    put(decoy, "package.json", json({ name: "@fx/schema", exports: { "./decoy": "./decoy.ts", "./thing": null } }))
    put(decoy, "decoy.ts", "export const decoy = 1\n")
    const root = fixture((tree) => {
      tree.files["packages/core/src/session/linked.ts"] = 'export { thing } from "@fx/schema/thing"\nexport { decoy } from "@fx/schema/decoy"\n'
    })
    mkdirSync(path.join(root, "node_modules/@fx"), { recursive: true })
    symlinkSync(decoy, path.join(root, "node_modules/@fx/schema"), process.platform === "win32" ? "junction" : "dir")
    expect(found(root).map((item) => `${item.rule} ${item.specifier}`)).toEqual(["R6b @fx/schema/decoy"])
  })

  test("--base fails when the ledger gains a key or raises a count, and passes when it does not", () => {
    const root = fixture()
    commit(root)
    expect(gate(root, "--base", "HEAD").code).toBe(0)
    put(root, "packages/core/src/session/sdk.ts", 'import type { Client } from "@fx/sdk"\nexport type C = Client\n')
    put(root, "script/boundary-ledger.json", json({ entries: [entry("R1", "packages/core/src/session/sdk.ts", "@fx/sdk"), entry("R3", "packages/core/src/session/sdk.ts", "@fx/sdk")] }))
    // Without a base the hand-added rows hide the new violations; that is the hole --base closes.
    expect(gate(root).code).toBe(0)
    const grown = gate(root, "--base", "HEAD")
    expect(grown.code).toBe(1)
    expect(grown.report.growth).toEqual([
      "LEDGER_GROWTH R1 packages/core/src/session/sdk.ts @fx/sdk: not in the ledger at HEAD; the ledger only shrinks",
      "LEDGER_GROWTH R3 packages/core/src/session/sdk.ts @fx/sdk: not in the ledger at HEAD; the ledger only shrinks",
      "LEDGER_COUNT_RAISED R1: 1 entries, 0 at HEAD",
      "LEDGER_COUNT_RAISED R3: 1 entries, 0 at HEAD",
    ])
    commit(root)
    expect(gate(root, "--base", "HEAD").code).toBe(0)
    expect(gate(root, "--base", "no-such-ref").err[0]).toContain("BASE_UNRESOLVED")
  })

  test("--base passes with a note when the base has no ledger yet", () => {
    const root = fixture()
    rmSync(path.join(root, "script/boundary-ledger.json"))
    commit(root)
    put(root, "script/boundary-ledger.json", json({ entries: [] }))
    const result = gate(root, "--base", "HEAD")
    expect(result.code).toBe(0)
    expect(result.out[0]).toContain("there is no earlier ledger to compare")
  })

  test("a ledger reason must start with the decision id of its rule", () => {
    const violation = (tree: Tree) => {
      tree.files["packages/ui/src/direct.ts"] = 'import type { Client } from "@fx/sdk"\nexport type C = Client\n'
    }
    const vague = fixture((tree) => {
      violation(tree)
      tree.ledger.push(entry("R3", "packages/ui/src/direct.ts", "@fx/sdk", "x"))
    })
    expect(gate(vague).err[0]).toContain('the reason must start with "D13: "')
    const wrong = fixture((tree) => {
      violation(tree)
      tree.ledger.push(entry("R3", "packages/ui/src/direct.ts", "@fx/sdk", "D7: wrong decision"))
    })
    expect(gate(wrong).code).toBe(1)
    const justified = fixture((tree) => {
      violation(tree)
      tree.ledger.push(entry("R3", "packages/ui/src/direct.ts", "@fx/sdk"))
    })
    expect(gate(justified).code).toBe(0)
  })

  test("R0 fails on a root workspaces member that is not registered, and on a registered package outside workspaces", () => {
    const extra = fixture((tree) => {
      tree.files["packages/extra/package.json"] = json({ name: "@fx/extra" })
      tree.files["packages/extra/src/index.ts"] = 'export * from "@fx/sdk"\n'
    })
    expect(found(extra).map((item) => `${item.rule} ${item.specifier}: ${item.message}`)).toEqual([
      "R0 packages/extra: root workspaces member is not in module-registry.json, so nothing under it is scanned",
    ])
    const outside = fixture((tree) => {
      tree.files["package.json"] = json({ name: "fixture-root", private: true, workspaces: ["packages/*", "apps/*"] })
    })
    expect(found(outside).map((item) => `${item.rule} ${item.specifier}`)).toEqual(["R0 modules/relay"])
  })

  test("support folders count as tests only directly under the package root; *.suite.ts stays a test file", () => {
    expect(isTestFile("test/a.ts")).toBe(true)
    expect(isTestFile("example/a.ts")).toBe(true)
    expect(isTestFile("src/example/a.ts")).toBe(false)
    expect(isTestFile("src/test/a.ts")).toBe(false)
    expect(isTestFile("src/a.suite.ts")).toBe(true)
    expect(isTestFile("src/a.test.tsx")).toBe(true)
    const root = fixture((tree) => {
      tree.files["packages/ui/src/example/zz.ts"] = 'export * from "@fx/sdk"\n'
      tree.files["packages/ui/example/zz.ts"] = 'export * from "@fx/sdk"\n'
      tree.files["packages/ui/src/shared.suite.ts"] = 'export * from "@fx/sdk"\n'
    })
    expect(rules(root, "packages/ui/src/example/zz.ts")).toEqual(["R3"])
    expect(rules(root, "packages/ui/example/zz.ts")).toEqual([])
    expect(rules(root, "packages/ui/src/shared.suite.ts")).toEqual([])
  })

  test("R11 sees through a .js suffix and the @/ alias, also for a product file owned by an exact pattern", () => {
    const root = fixture((tree) => {
      // A product file inside a platform-legacy folder: only resolving `.js` to `.ts` reaches its exact pattern.
      tree.files["apps/app/src/session/compact.ts"] = "export const compact = 1\n"
      tree.architecture.packages.app?.domains?.continuity?.patterns.push("src/session/compact.ts")
      tree.files["apps/app/src/session/suffix.ts"] = 'export { compact } from "./compact.js"\n'
      tree.files["apps/app/src/session/alias.ts"] = 'export { compact } from "@/session/compact.js"\n'
      tree.files["apps/app/src/session/folder.ts"] = 'export { a } from "../maestro/a.js"\n'
      tree.files["apps/app/src/composed.ts"] = 'export { compact } from "./session/compact.js"\n'
      tree.architecture.packages.app?.domains?.composition?.patterns.push("src/composed.ts")
    })
    expect(rules(root, "apps/app/src/session/suffix.ts")).toEqual(["R11"])
    expect(rules(root, "apps/app/src/session/alias.ts")).toEqual(["R11"])
    expect(rules(root, "apps/app/src/session/folder.ts")).toEqual(["R11"])
    expect(rules(root, "apps/app/src/composed.ts")).toEqual([])
  })

  test("only a package's own top-level dist/ is skipped", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/dist/zz.ts"] = 'export * from "@fx/sdk"\n'
      tree.files["packages/ui/dist/zz.ts"] = 'export * from "@fx/sdk"\n'
    })
    expect(rules(root, "packages/ui/src/dist/zz.ts")).toEqual(["R3"])
    expect(rules(root, "packages/ui/dist/zz.ts")).toEqual([])
  })

  test("reference directives, the jsx pragma and resolution calls are scanned", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/reference.ts"] = '/// <reference path="../../core/src/util/path.ts" />\n/// <reference types="@fx/schema" />\nexport {}\n'
      tree.files["packages/ui/src/pragma.tsx"] = "/** @jsxImportSource @fx/schema */\nexport const view = 1\n"
      tree.files["packages/ui/src/create-require.ts"] = 'import { createRequire } from "node:module"\nexport const a = createRequire(import.meta.url)("@fx/schema")\n'
      tree.files["packages/ui/src/require-resolve.ts"] = 'export const b = require.resolve("@fx/schema")\n'
      tree.files["packages/ui/src/meta-resolve.ts"] = 'export const c = import.meta.resolve("@fx/schema")\n'
      tree.files["packages/ui/src/declared.ts"] = 'export const d = require.resolve("@fx/core/util/path")\n'
    })
    expect(found(root).filter((item) => item.file.startsWith("packages/ui/src/")).map((item) => `${item.rule} ${item.file} ${item.specifier}`)).toEqual([
      "R4 packages/ui/src/create-require.ts @fx/schema",
      "R4 packages/ui/src/meta-resolve.ts @fx/schema",
      "R4 packages/ui/src/pragma.tsx @fx/schema",
      "R4 packages/ui/src/reference.ts @fx/schema",
      "R4 packages/ui/src/require-resolve.ts @fx/schema",
      "R5 packages/ui/src/reference.ts ../../core/src/util/path.ts",
    ])
  })

  test("a file with a syntax error fails instead of being skipped", () => {
    const root = fixture((tree) => {
      tree.files["packages/ui/src/broken.ts"] = "export const = 1\n"
    })
    expect(found(root).map((item) => `${item.rule} ${item.file}`)).toEqual(["R13 packages/ui/src/broken.ts"])
    expect(gate(root).code).toBe(1)
  })

  test("R14 keeps a package to its importAllow prefixes for sources, # imports and runtime dependencies", () => {
    const root = fixture((tree) => {
      Object.assign(tree.architecture.packages.relay, { importAllow: ["@fx/schema", "bun:", "node:"] })
      tree.files["modules/relay/package.json"] = json({
        name: "@fx/relay",
        exports: { ".": "./src/index.ts" },
        imports: { "#store": { bun: "./src/store.ts" }, "#escape": "../../packages/core/src/session.ts" },
        dependencies: { "@fx/schema": "workspace:*", "left-pad": "1.0.0" },
      })
      tree.files["modules/relay/src/store.ts"] = 'import { test } from "bun:test"\nexport const store = test\n'
      tree.files["modules/relay/src/extra.ts"] = 'import { z } from "zod"\nimport { join } from "node:path"\nimport "#store"\nimport "#escape"\nimport "#missing"\nexport const e = [z, join]\n'
    })
    expect(found(root).filter((item) => item.rule === "R14").map((item) => `${item.file} ${item.specifier}`)).toEqual([
      "modules/relay/package.json left-pad",
      "modules/relay/src/extra.ts #escape",
      "modules/relay/src/extra.ts #missing",
      "modules/relay/src/extra.ts zod",
    ])
    expect(rules(root, "modules/relay/src/index.ts")).toEqual([])
    expect(rules(root, "modules/relay/src/store.ts")).toEqual([])
  })

  test("R15 follows value imports from a bundle entry and fails where a forbidden package is reached", () => {
    const planted = fixture((tree) => {
      tree.architecture.bundleBoundaries = [{ entry: "@fx/relay", forbid: ["@fx/schema"] }]
    })
    expect(found(planted).filter((item) => item.rule === "R15").map((item) => `${item.file} ${item.specifier}`)).toEqual([
      "modules/relay/src/index.ts @fx/schema",
    ])
    const clean = fixture((tree) => {
      tree.architecture.bundleBoundaries = [{ entry: "@fx/relay", forbid: ["@fx/unused"] }]
    })
    expect(found(clean).filter((item) => item.rule === "R15")).toEqual([])
    // A type-only import is erased from a bundle, so it does not reach the package.
    const typed = fixture((tree) => {
      tree.architecture.bundleBoundaries = [{ entry: "@fx/relay", forbid: ["@fx/sdk"] }]
      tree.files["modules/relay/src/index.ts"] = 'import { a } from "@fx/schema"\nimport type { Client } from "@fx/sdk"\nexport const relay: Client | typeof a = a\n'
    })
    expect(found(typed).filter((item) => item.rule === "R15")).toEqual([])
  })
})
