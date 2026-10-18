import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { format } from "prettier"
import { parsers } from "prettier/plugins/typescript"
import { compile, emitEffectImported, emitPromise } from "../src"
import { formatFile, splitPromiseTypes } from "../src/layout"

test("mapped Action groups preserve the public split client API", async () => {
  const names = [
    "actionsBindings",
    "actionsOperations",
    "actionsWorkflows",
    "actionsRuns",
    "actionsJobs",
    "actionsPipelines",
    "actionsResources",
    "actionsTransfers",
    "actionsSource",
    "research",
  ]
  const groups = names.map((name) =>
    HttpApiGroup.make(`server.${name}`).add(
      HttpApiEndpoint.get(`${name}.get`, `/${name}/:id`, {
        params: { id: Schema.String },
        success: Schema.Struct({ data: Schema.String }),
      }),
    ),
  )
  const contract = compile(HttpApi.make("layout").add(groups[0], ...groups.slice(1)), {
    groupNames: Object.fromEntries(names.map((name) => [`server.${name}`, name])),
    endpointNames: Object.fromEntries(names.map((name) => [`${name}.get`, "read"])),
  })
  const splitGroups = new Set(names)
  const promise = emitPromise(contract, { splitGroups })
  const effect = emitEffectImported(contract, { module: "./api", api: "Api" }, { splitGroups })
  expect(promise.operations).toEqual(emitPromise(contract).operations)
  expect(effect.operations).toEqual(promise.operations)
  const effectRoot = effect.files.find((file) => file.path === "client.ts")?.content
  names.forEach((name, index) => {
    expect(effectRoot).toContain(`"${name}": adaptGroup${index}(raw["server.${name}"])`)
    expect(effect.files.find((file) => file.path === `${name}.ts`)?.content).toContain('"read":')
  })
  const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".bounded-client-"))
  await Promise.all(promise.files.map(formatFile))
    .then(async (files) => {
      await Promise.all(files.flat().map((file) => Bun.write(join(directory, file.path), file.content)))
      const client = (await import(join(directory, "client.ts"))).make({
        baseUrl: "https://layout.test",
        fetch: Object.assign(
          async (input: RequestInfo | URL) => Response.json({ data: new URL(String(input)).pathname }),
          { preconnect: fetch.preconnect },
        ),
      })
      expect(Object.keys(client)).toEqual(names)
      await Promise.all(
        names.map(async (name) => {
          expect(Object.keys(client[name])).toEqual(["read"])
          expect(await client[name].read({ id: "a/b" })).toBe(`/${name}/a%2Fb`)
        }),
      )
    })
    .finally(() => rm(directory, { recursive: true, force: true }))
})

test("bounded parts preserve whole declarations, forward refs, and root JsonValue", async () => {
  const fields = Array.from({ length: 200 }, (_, index) => `readonly field${index}: string`).join("\n")
  const original = `import type { Wire } from "./wire"
export type JsonValue = null | string | ReadonlyArray<JsonValue>
export type AlphaInput = { ${fields}; readonly json: JsonValue }
export type AlphaOutput = { ${fields}; readonly input: AlphaInput; readonly wire: Wire.Info }
export type BetaOutput = { ${fields}; readonly output: AlphaOutput }
export type RootOutput = AlphaOutput`
  const split = splitPromiseTypes(original, ["AlphaInput", "AlphaOutput", "BetaOutput"], "alpha-types")
  expect(split.main).toContain('import type { AlphaOutput } from "./alpha-types"')
  const files = await formatFile({ path: "alpha-types.ts", content: split.split, boundedTypes: true })
  expect(files.length).toBe(4)
  files.forEach((file) => expect(file.content.trimEnd().split("\n").length).toBeLessThanOrEqual(400))
  const parts = files.filter((file) => file.path !== "alpha-types.ts")
  expect(parts.flatMap((file) => aliases(file.content))).toEqual(
    aliases(await format(split.split, { parser: "typescript", semi: false, printWidth: 120 })),
  )
  expect(parts[0].content).toContain('import type { JsonValue } from "./types"')
  expect(parts[1].content).toContain('import type { AlphaInput } from "./alpha-types-part-1"')
  expect(parts[1].content).toContain('import type { Wire } from "./wire"')
  expect(parts[2].content).toContain('import type { AlphaOutput } from "./alpha-types-part-2"')
  expect(parts.every((file) => !file.content.includes("export type JsonValue"))).toBe(true)
  expect(files[0].content).toContain('export type { AlphaOutput } from "./alpha-types-part-2"')
})

test("one declaration beyond the fixed bound is a named failure", async () => {
  const content = `export type HugeOutput = { ${Array.from({ length: 401 }, (_, index) => `readonly field${index}: string`).join("\n")} }`
  await expect(formatFile({ path: "huge-types.ts", content, boundedTypes: true })).rejects.toThrow(
    "Promise declaration exceeds 400 lines: huge-types.ts:HugeOutput",
  )
})

test("350-line target permits a whole declaration below the 400-line bound", async () => {
  const content = `export type LargeOutput = { ${Array.from({ length: 355 }, (_, index) => `readonly field${index}: string`).join("\n")} }
export type SmallOutput = { ${Array.from({ length: 80 }, (_, index) => `readonly field${index}: string`).join("\n")} }`
  const files = await formatFile({ path: "large-types.ts", content, boundedTypes: true })
  expect(files.length).toBe(3)
  expect(aliases(files[1].content)[0].name).toBe("LargeOutput")
  expect(files[1].content.trimEnd().split("\n").length).toBe(357)
})

test("unknown mapped split names fail both emitters", () => {
  const contract = compile(
    HttpApi.make("layout").add(
      HttpApiGroup.make("server.actionsRun").add(HttpApiEndpoint.get("get", "/runs", { success: Schema.String })),
    ),
    { groupNames: { "server.actionsRun": "actionsRuns" } },
  )
  const splitGroups = new Set(["actionsRuns", "server.actionsRun"])
  expect(() => emitPromise(contract, { splitGroups })).toThrow("Unknown split group: server.actionsRun")
  expect(() => emitEffectImported(contract, { module: "./api", api: "Api" }, { splitGroups })).toThrow(
    "Unknown split group: server.actionsRun",
  )
})

function aliases(content: string) {
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [content, {}])
  if (!node(ast) || !Array.isArray(ast.body)) throw new Error("Missing parsed declaration list")
  return ast.body.flatMap((value: unknown) => {
    if (!node(value) || !node(value.declaration) || value.declaration.type !== "TSTypeAliasDeclaration") return []
    if (!node(value.declaration.id) || !Array.isArray(value.range))
      throw new Error("Missing declaration identity/range")
    return [{ name: value.declaration.id.name, content: content.slice(Number(value.range[0]), Number(value.range[1])) }]
  })
}

function node(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
