// Teeth for script/check-module-boundaries.ts: every rule fails on a planted defect and passes on the clean fixture,
// and every ledger mode behaves as its header says. The fixture workspace uses fake package and vendored names.
import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { check, run } from "../../../script/check-module-boundaries"
import { loadWorkspace, renderReadmeBlock, type Architecture } from "../../../script/module-architecture"

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
const entry = (rule: string, file: string, specifier: string) => ({ rule, file, specifier, reason: "fixture exception" })

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
      Object.assign(tree.architecture.packages.core.domains ?? {}, { twin: { kind: "platform", patterns: ["src/relay.ts", "src/gone/"] } })
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
    symlinkSync(decoy, path.join(root, "node_modules/@fx/schema"))
    expect(found(root).map((item) => `${item.rule} ${item.specifier}`)).toEqual(["R6b @fx/schema/decoy"])
  })
})
