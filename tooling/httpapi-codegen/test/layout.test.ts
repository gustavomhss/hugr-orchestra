import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { compile, emitEffect, emitEffectImported, emitPromise, GenerationError, type Output } from "../src"

class LayoutFailure extends Schema.TaggedErrorClass<LayoutFailure>()("LayoutFailure", {}, { httpApiStatus: 400 }) {}

describe("split output layout", () => {
  test.each([
    { names: ["request", "errors", "types", "foo", "foo-types"] },
    { names: ["REQUEST", "ERRORS", "TYPES", "foo-types", "foo"] },
    { names: ["foo-types", "foo-2-types", "foo", "request", "request-3"] },
  ])(
    "reserves support and companion modules for groups %j",
    async (input) => {
      const names = input.names
      const groups = names.map((name) =>
        HttpApiGroup.make(name).add(
          HttpApiEndpoint.get("get", `/${name}`, { success: Schema.String, error: LayoutFailure }),
        ),
      )
      const contract = compile(HttpApi.make("layout").add(groups[0], ...groups.slice(1)))
      const splitGroups = new Set(names)
      const promise = emitPromise(contract, { splitGroups })
      const imported = emitEffectImported(contract, { module: "./api", api: "Api" }, { splitGroups })
      const effect = emitEffect(contract)
      ;[promise, imported, effect].forEach((output) => {
        const paths = output.files.map((file) => file.path.toLowerCase())
        expect(new Set(paths).size).toBe(paths.length)
        expect(output.operations.map((operation) => operation.group)).toEqual([...names])
      })
      expect(emitPromise(contract, { splitGroups: new Set() })).toEqual(emitPromise(contract))
      expect(emitEffectImported(contract, { module: "./api", api: "Api" }, { splitGroups: new Set() })).toEqual(
        emitEffectImported(contract, { module: "./api", api: "Api" }),
      )
      const declarations = names.map(
        (name) =>
          `HttpApiGroup.make(${JSON.stringify(name)}).add(HttpApiEndpoint.get("get", ${JSON.stringify(`/${name}`)}, { success: Schema.String, error: LayoutFailure }))`,
      )
      const authoritative = {
        path: "api.ts",
        content: `import { Schema } from "effect"\nimport { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"\nclass LayoutFailure extends Schema.TaggedErrorClass<LayoutFailure>()("LayoutFailure", {}, { httpApiStatus: 400 }) {}\nexport const Api = HttpApi.make("layout").add(${declarations.join(", ")})`,
      }
      const promiseProbe = [
        'import { expect } from "bun:test"',
        'import { Orchestra } from "./index"',
        'const client = Orchestra.make({ baseUrl: "https://layout.test", fetch: Object.assign(async (input: RequestInfo | URL) => Response.json(new URL(String(input)).pathname.slice(1)), { preconnect: fetch.preconnect }) })',
        ...names.map(
          (name, index) =>
            `const result${index}: string = await client[${JSON.stringify(name)}].get()\nexpect(result${index}).toBe(${JSON.stringify(name)})`,
        ),
      ].join("\n")
      await checkConsumer(promise, [{ path: "probe.ts", content: promiseProbe }])
      await checkConsumer(imported, [
        authoritative,
        {
          path: "probe.ts",
          content: `import { Effect } from "effect"\nimport { Orchestra } from "./index"\nexport const program = Orchestra.make().pipe(Effect.map(client => [${names.map((name) => `client[${JSON.stringify(name)}].get()`).join(", ")}]))`,
        },
      ])
    },
    30_000,
  )

  test.each(["Session.Info", "Session.Models.Info"])(
    "preserves supplied import root for qualified output %s",
    async (name) => {
      const contract = compile(
        HttpApi.make("qualified").add(
          HttpApiGroup.make("session").add(HttpApiEndpoint.get("get", "/session", { success: Schema.Unknown })),
        ),
      )
      const output = emitPromise(contract, {
        splitGroups: new Set(["session"]),
        outputTypes: {
          "session.get": { name, import: 'import type { Session } from "./wire"' },
        },
      })
      expect(output.files.find((file) => file.path === "session-types.ts")?.content).toContain(
        'import type { Session } from "./wire"',
      )
      await checkConsumer(output, [
        {
          path: "wire.ts",
          content:
            "export namespace Session { export type Info = { readonly id: string }; export namespace Models { export type Info = { readonly id: string } } }",
        },
        {
          path: "probe.ts",
          content: `import { expect } from "bun:test"\nimport { Orchestra, type SessionGetOutput } from "./index"\nimport type { Session } from "./wire"\nconst client = Orchestra.make({ baseUrl: "https://layout.test", fetch: Object.assign(async () => Response.json({ id: "session" }), { preconnect: fetch.preconnect }) })\nconst value: SessionGetOutput = await client.session.get()\nconst info: ${name} = value\nexpect(info).toEqual({ id: "session" })`,
        },
      ])
    },
    30_000,
  )

  test.each([new Set(["missing"]), new Set(["session", "missing"])])(
    "rejects unknown split groups explicitly: %j",
    (splitGroups) => {
      const contract = compile(
        HttpApi.make("unknown").add(
          HttpApiGroup.make("host.session").add(HttpApiEndpoint.get("get", "/session", { success: Schema.String })),
        ),
        { groupNames: { "host.session": "session" } },
      )
      const emitters = [
        () => emitPromise(contract, { splitGroups }),
        () => emitEffectImported(contract, { module: "./api", api: "Api" }, { splitGroups }),
      ]
      emitters.forEach((emit) => {
        expect(emit).toThrow(GenerationError)
        expect(emit).toThrow("Unknown split group: missing")
      })
      expect(() => emitPromise(contract, { splitGroups: new Set(["host.session"]) })).toThrow(
        "Unknown split group: host.session",
      )
      expect(() => emitPromise(contract, { splitGroups: new Set(["session"]) })).not.toThrow()
      expect(() =>
        emitEffectImported(contract, { module: "./api", api: "Api" }, { splitGroups: new Set(["session"]) }),
      ).not.toThrow()
    },
  )
})

async function checkConsumer(output: Output, files: ReadonlyArray<{ path: string; content: string }>) {
  const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".layout-consumer-"))
  return Promise.all(
    [
      ...output.files,
      ...files,
      { path: "tsconfig.json", content: JSON.stringify({ extends: "../../tsconfig.json", include: ["*.ts"] }) },
    ].map((file) => Bun.write(join(directory, file.path), file.content)),
  )
    .then(async () => {
      const check = Bun.spawn(["bun", "typecheck", "--project", join(directory, "tsconfig.json")], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        stdout: "pipe",
        stderr: "pipe",
        timeout: 20_000,
      })
      const [code, stdout, stderr] = await Promise.all([
        check.exited,
        new Response(check.stdout).text(),
        new Response(check.stderr).text(),
      ])
      if (code !== 0) throw new Error(`Generated layout consumer typecheck failed:\n${stdout}${stderr}`)
      await import(join(directory, "probe.ts"))
    })
    .finally(() => rm(directory, { recursive: true, force: true }))
}
