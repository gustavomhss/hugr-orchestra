import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit, Predicate, Schema, SchemaAST } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { Capability } from "../../schema/src/capability"
import { compile, emitEffect, emitEffectImported, emitPromise, GenerationError } from "../src"

const authoritativeSchema = Capability.Failure
export const Api = HttpApi.make("capability-contract").add(
  HttpApiGroup.make("capability")
    .add(HttpApiEndpoint.get("read", "/read", { success: authoritativeSchema }))
    .add(
      HttpApiEndpoint.get("failed", "/failed", {
        success: Schema.String,
        error: authoritativeSchema.pipe(HttpApiSchema.status(409)),
      }),
    ),
)

// Called by the temporary generated consumer, so assertions exercise emitted code.
export async function verify(
  make: (options: { readonly baseUrl: string }) => Effect.Effect<
    {
      capability: {
        read: () => Effect.Effect<Capability.Failure, unknown>
        failed: () => Effect.Effect<string, unknown>
      }
    },
    never,
    HttpClient.HttpClient
  >,
) {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.forEach(["é".repeat(2047), "é".repeat(2048)], (detail) =>
        Effect.gen(function* () {
          const failure = {
            _tag: "Capability.Failure",
            code: "outcome_unknown",
            message: "Uncertain",
            detail,
          } satisfies typeof Capability.Failure.Encoded
          const client = yield* make({ baseUrl: "https://capability.test" }).pipe(
            Effect.provideService(
              HttpClient.HttpClient,
              HttpClient.make((request) =>
                Effect.succeed(
                  HttpClientResponse.fromWeb(
                    request,
                    Response.json(failure, { status: request.url.endsWith("/failed") ? 409 : 200 }),
                  ),
                ),
              ),
            ),
          )
          if (detail.length === 2047) {
            const result = yield* client.capability.read()
            expect(result).toBeInstanceOf(Capability.Failure)
            expect(Schema.encodeSync(Capability.Failure)(result)).toEqual(failure)
            const error = yield* client.capability.failed().pipe(Effect.flip)
            expect(error).toBeInstanceOf(Capability.Failure)
            if (!(error instanceof Capability.Failure)) throw new Error("Expected authoritative failure class")
            expect(Schema.encodeSync(Capability.Failure)(error)).toEqual(failure)
            return
          }
          yield* Effect.forEach(
            [
              { effect: client.capability.read().pipe(Effect.asVoid), kind: "success" },
              { effect: client.capability.failed().pipe(Effect.asVoid), kind: "error" },
            ],
            (operation) =>
              Effect.gen(function* () {
                const exit = yield* operation.effect.pipe(Effect.exit)
                expect(Exit.isFailure(exit)).toBe(true)
                if (!Exit.isFailure(exit)) throw new Error("Expected oversized response rejection")
                const errors = exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)
                expect(errors.length).toBeGreaterThan(0)
                errors.forEach((error) => expect(error).toMatchObject({ _tag: "ClientError" }))
                const causes = errors.flatMap((error) => (Predicate.hasProperty(error, "cause") ? [error.cause] : []))
                // The installed HttpApiClient maps failed declared-error decoding to an HTTP status error.
                if (operation.kind === "error") {
                  expect(causes.some(HttpClientError.isHttpClientError)).toBe(true)
                  return
                }
                const schemaErrors = causes.filter(Schema.isSchemaError)
                expect(schemaErrors).toHaveLength(1)
                expect(String(schemaErrors[0])).toContain("Failure detail must not exceed 4096 UTF-8 JSON bytes")
              }),
          )
        }),
      )
    }),
  )
}

describe("capability contract portability", () => {
  test("compiles JSON wire shapes but requires authoritative Effect imports", () => {
    const contract = compile(Api)
    expect(contract.groups[0].endpoints.map((endpoint) => endpoint.effectPortable)).toEqual([false, false])
    expect(contract.groups[0].endpoints[0].successes[0]).toBe(
      Array.from(Api.groups.capability.endpoints.read.success)[0],
    )
    expect(contract.groups[0].endpoints[1].errors[0].schema).toBe(
      Array.from(Api.groups.capability.endpoints.failed.error)[0],
    )
    expect(SchemaAST.resolveIdentifier(authoritativeSchema.ast)).toBe("Capability.Failure")
    expect(SchemaAST.resolveIdentifier(Capability.FailureDetail.ast)).toBe("Capability.FailureDetail")
    const promise = emitPromise(contract)
    const types = promise.files.find((file) => file.path === "types.ts")?.content
    expect(types).toContain('readonly "detail"?: JsonValue')
    expect(types).toContain("export type JsonValue = null | boolean | number | string")
    expect(types).toContain('readonly "_tag": "Capability.Failure"')
    expect(types).toContain('"_tag" in value && value["_tag"] === "Capability.Failure"')
    expect(promise.operations.map((operation) => operation.name)).toEqual(["read", "failed"])
    expect(promise.operations[1].errors).toContain("Capability.Failure")
    expect(promise.files.find((file) => file.path === "client.ts")?.content).toContain("declaredStatuses: [409]")
    expect(() => emitEffect(contract)).toThrow("Effect schema requires authoritative import: capability.read")
    const imported = emitEffectImported(contract, { module: "../capability-contract.test", api: "Api" })
    expect(imported.files.map((file) => file.path)).toEqual(["client-error.ts", "client.ts", "index.ts"])
    expect(imported.files.find((file) => file.path === "client.ts")?.content).toContain(
      'import { Api } from "../capability-contract.test"',
    )
    const transpiler = new Bun.Transpiler({ loader: "ts" })
    ;[...promise.files, ...imported.files].forEach((file) =>
      expect(() => transpiler.transformSync(file.content)).not.toThrow(),
    )
  })

  test("actual imported generated client retains detail decoding for success and error", async () => {
    // Under test/ so emitted bare Effect imports resolve the package's dependencies on both OSes.
    const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".capability-client-"))
    const output = emitEffectImported(compile(Api), { module: "../capability-contract.test", api: "Api" })
    await Promise.all(output.files.map((file) => Bun.write(join(directory, file.path), file.content)))
      .then(() =>
        Bun.write(
          join(directory, "probe.ts"),
          [
            'import { Orchestra } from "./index"',
            'import { verify } from "../capability-contract.test"',
            "await verify(Orchestra.make)",
          ].join("\n"),
        ),
      )
      .then(() => import(join(directory, "probe.ts")))
      .finally(() => rm(directory, { recursive: true, force: true }))
  })

  test.each(["failure", "string"])("typechecks and executes full Promise files with %s success", async (success) => {
    const source = HttpApi.make("promise-capability").add(
      HttpApiGroup.make("capability")
        .add(
          HttpApiEndpoint.get("read", "/read", {
            success: success === "failure" ? authoritativeSchema : Schema.String,
          }),
        )
        .add(
          HttpApiEndpoint.get("failed", "/failed", {
            success: Schema.String,
            error: authoritativeSchema.pipe(HttpApiSchema.status(409)),
          }),
        )
        .add(
          HttpApiEndpoint.get("again", "/again", {
            success: Schema.String,
            error: authoritativeSchema.pipe(HttpApiSchema.status(410)),
          }),
        ),
    )
    const output = emitPromise(compile(source))
    const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".capability-promise-"))
    await Promise.all(output.files.map((file) => Bun.write(join(directory, file.path), file.content)))
      .then(() =>
        Bun.write(
          join(directory, "probe.ts"),
          [
            'import { expect } from "bun:test"',
            'import { Orchestra, isCapabilityFailure, type CapabilityFailure, type JsonValue } from "./index"',
            'const detail: JsonValue = { nested: [null, true, 2, "é"] }',
            'const failure: CapabilityFailure = { _tag: "Capability.Failure", code: "outcome_unknown", message: "Uncertain", detail }',
            'const client = Orchestra.make({ baseUrl: "https://capability.test", fetch: Object.assign(async (input: RequestInfo | URL) => {',
            "  const url = String(input)",
            `  if (url.endsWith("/read")) return Response.json(${success === "failure" ? "failure" : '"ready"'})`,
            '  return Response.json(failure, { status: url.endsWith("/again") ? 410 : 409 })',
            "}, { preconnect: fetch.preconnect }) })",
            `const result: ${success === "failure" ? "CapabilityFailure" : "string"} = await client.capability.read()`,
            `expect(result).toEqual(${success === "failure" ? "failure" : '"ready"'})`,
            "for (const request of [client.capability.failed, client.capability.again]) {",
            "  const error: unknown = await request().catch((cause: unknown) => cause)",
            "  expect(error).toEqual(failure)",
            "  expect(isCapabilityFailure(error)).toBe(true)",
            '  if (!isCapabilityFailure(error)) throw new Error("Expected qualified wire guard")',
            "  const declared: CapabilityFailure = error",
            "  expect(declared.detail).toEqual(detail)",
            "}",
            'expect(isCapabilityFailure({ ...failure, _tag: "CapabilityFailure" })).toBe(false)',
            "expect(isCapabilityFailure(null)).toBe(false)",
          ].join("\n"),
        ),
      )
      .then(() =>
        Bun.write(
          join(directory, "tsconfig.json"),
          JSON.stringify({ extends: "../../tsconfig.json", include: ["*.ts"] }),
        ),
      )
      .then(async () => {
        const check = Bun.spawn(["bun", "typecheck", "--project", join(directory, "tsconfig.json")], {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          stdout: "pipe",
          stderr: "pipe",
        })
        const [stdout, stderr, code] = await Promise.all([
          new Response(check.stdout).text(),
          new Response(check.stderr).text(),
          check.exited,
        ])
        if (code !== 0) throw new Error(`Generated Promise consumer typecheck failed:\n${stdout}${stderr}`)
      })
      .then(() => import(join(directory, "probe.ts")))
      .finally(() => rm(directory, { recursive: true, force: true }))
  })

  test.each([
    ["Missing", "Missing"],
    ["123.Failure", "Error123Failure"],
    ["default", "Default"],
    ["string", "String"],
    ["échec", "Chec"],
    ["故障", "Error"],
    ["domain/failure", "DomainFailure"],
    ["domain\\failure", "DomainFailure"],
    ["snake_case", "SnakeCase"],
    ["cash$Failure", "CashFailure"],
    ["", "Error"],
    ["../..", "Error"],
  ])("emits usable declared error symbols for %s", async (identifier, symbol) => {
    class NamingError extends Schema.TaggedErrorClass<NamingError>(identifier)(`wire.${identifier}`, {
      message: Schema.String,
    }) {}
    const contract = compile(
      HttpApi.make("naming").add(
        HttpApiGroup.make("naming").add(
          HttpApiEndpoint.get("read", "/read", { success: Schema.String, error: NamingError }),
        ),
      ),
    )
    expect(contract.groups[0].endpoints[0].operation.errors).toContain(identifier)
    const output = emitPromise(contract)
    const transpiler = new Bun.Transpiler({ loader: "ts" })
    output.files.forEach((file) => expect(() => transpiler.transformSync(file.content)).not.toThrow())
    const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".error-naming-"))
    await Promise.all(output.files.map((file) => Bun.write(join(directory, file.path), file.content)))
      .then(() => import(join(directory, "index.ts")))
      .then((generated) => {
        expect(generated[`is${symbol}`]({ _tag: `wire.${identifier}`, message: "failed" })).toBe(true)
        expect(generated[`is${symbol}`]({ _tag: symbol, message: "failed" })).toBe(false)
      })
      .finally(() => rm(directory, { recursive: true, force: true }))
  })

  test.each(["CapabilityFailure", "Capability.Failure"])(
    "rejects normalized error symbol collisions even with shared wire tag %s",
    (tag) => {
      class CollidingFailure extends Schema.TaggedErrorClass<CollidingFailure>("CapabilityFailure")(tag, {}) {}
      const contract = compile(
        HttpApi.make("collision").add(
          HttpApiGroup.make("capability").add(
            HttpApiEndpoint.get("failed", "/failed", {
              success: Schema.String,
              error: [authoritativeSchema, CollidingFailure],
            }),
          ),
        ),
      )
      expect(() => emitPromise(contract)).toThrow(GenerationError)
      expect(() => emitPromise(contract)).toThrow(
        "Promise error name collision: Capability.Failure and CapabilityFailure normalize to CapabilityFailure",
      )
    },
  )

  test.each([
    ["Session.GetInput", "SessionGetInput"],
    ["Session.GetOutput", "SessionGetOutput"],
    ["Json.Value", "JsonValue"],
    ["Readonly.Array", "ReadonlyArray"],
    ["Wire.Result", "WireResult"],
    ["Namespace.Failure", "NamespaceFailure"],
    ["Client.Error", "ClientError"],
    ["Client.ErrorReason", "ClientErrorReason"],
    ["Orchestra", "Orchestra"],
  ])("rejects occupied public error symbol %s with a real TypeScript consumer", async (identifier, symbol) => {
    class Failure extends Schema.TaggedErrorClass<Failure>("Valid.Failure")("wire.failure", {
      message: Schema.String,
      detail: Schema.Json,
      values: Schema.Array(Schema.String),
    }) {}
    const source = (error: Schema.Top) =>
      HttpApi.make("symbols").add(
        HttpApiGroup.make("session").add(
          HttpApiEndpoint.get("get", "/get/:id", {
            params: { id: Schema.String },
            success: Schema.Json,
            error,
          }),
        ),
      )
    const options =
      identifier === "Wire.Result"
        ? { outputTypes: { "session.get": { name: "WireResult", import: 'import type { WireResult } from "./wire"' } } }
        : identifier === "Namespace.Failure"
          ? {
              outputTypes: {
                "session.get": {
                  name: "isNamespaceFailure",
                  import: 'import { isNamespaceFailure } from "./wire"',
                },
              },
            }
          : undefined
    const output = emitPromise(compile(source(Failure)), options)
    expect((await checkConsumer(output, "ValidFailure")).code).toBe(0)
    // Seed the reported binding fault into real emitted files; the TS compiler is the negative oracle.
    const invalid = await checkConsumer(
      {
        ...output,
        files: output.files.map((file) => ({
          ...file,
          content: file.content.replaceAll("ValidFailure", symbol),
        })),
      },
      symbol,
    )
    expect(invalid.code).not.toBe(0)
    expect(invalid.diagnostics).toContain("error TS")
    expect(() => emitPromise(compile(source(Failure.annotate({ identifier }))), options)).toThrow(GenerationError)
    expect(() => emitPromise(compile(source(Failure.annotate({ identifier }))), options)).toThrow(
      `Promise error symbol collision: ${identifier === "Namespace.Failure" ? "isNamespaceFailure" : symbol}`,
    )
  })

  test.each([
    ["Namespace.Failure", "NamespaceFailure"],
    ["Session.GetInput", "SessionGetInput"],
    ["Json.Value", "JsonValue"],
    ["Readonly.Array", "ReadonlyArray"],
    ["Wire.Result", "WireResult"],
  ])("allows namespace error %s when its symbol is unoccupied", async (identifier, symbol) => {
    class Failure extends Schema.TaggedErrorClass<Failure>(identifier)("wire.failure", { message: Schema.String }) {}
    const output = emitPromise(
      compile(
        HttpApi.make("symbols").add(
          HttpApiGroup.make("session").add(
            HttpApiEndpoint.get("get", "/get", { success: Schema.String, error: Failure }),
          ),
        ),
      ),
    )
    expect((await checkConsumer(output, symbol)).code).toBe(0)
  })

  test("rejects normalized error barrel collisions across groups", () => {
    class First extends Schema.TaggedErrorClass<First>()("Namespace.Failure", {}) {}
    class Second extends Schema.TaggedErrorClass<Second>()("NamespaceFailure", {}) {}
    const contract = compile(
      HttpApi.make("symbols")
        .add(
          HttpApiGroup.make("first").add(
            HttpApiEndpoint.get("get", "/first", { success: Schema.String, error: First }),
          ),
        )
        .add(
          HttpApiGroup.make("second").add(
            HttpApiEndpoint.get("get", "/second", { success: Schema.String, error: Second }),
          ),
        ),
    )
    expect(() => emitPromise(contract)).toThrow(GenerationError)
    expect(() => emitPromise(contract)).toThrow("normalize to NamespaceFailure")
  })

  test.each(["same class", "distinct classes"])(
    "uses canonical error declaration identity with a shared Struct: %s",
    async (identity) => {
      const fields = Schema.Struct({ _tag: Schema.Literal("Shared.Failure"), message: Schema.String })
      class First extends Schema.ErrorClass<First>("Shared.Failure")(fields) {}
      class Second extends Schema.ErrorClass<Second>("Shared.Failure")(fields) {}
      expect(First.ast.typeParameters[0]).toBe(Second.ast.typeParameters[0])
      expect(First.ast).not.toBe(Second.ast)
      const contract = compile(
        HttpApi.make("identity")
          .add(
            HttpApiGroup.make("first")
              .add(
                HttpApiEndpoint.get("get", "/first", {
                  success: Schema.String,
                  error: First.pipe(HttpApiSchema.status(400)),
                }),
              )
              .add(
                HttpApiEndpoint.get("again", "/again", {
                  success: Schema.String,
                  error: First.pipe(HttpApiSchema.status(409)),
                }),
              ),
          )
          .add(
            HttpApiGroup.make("second").add(
              HttpApiEndpoint.get("get", "/second", {
                success: Schema.String,
                error: (identity === "same class" ? First : Second).pipe(HttpApiSchema.status(410)),
              }),
            ),
          ),
      )
      expect(contract.groups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.operation.errors))).toEqual([
        ["Shared.Failure", "ClientError"],
        ["Shared.Failure", "ClientError"],
        ["Shared.Failure", "ClientError"],
      ])
      if (identity === "distinct classes") {
        expect(() => emitPromise(contract)).toThrow(GenerationError)
        expect(() => emitPromise(contract)).toThrow("Shared.Failure and Shared.Failure normalize to SharedFailure")
        return
      }
      expect(
        (
          await checkConsumer(emitPromise(contract), "SharedFailure", {
            _tag: "Shared.Failure",
            message: "lost",
          })
        ).code,
      ).toBe(0)
    },
  )
})

async function checkConsumer(
  output: ReturnType<typeof emitPromise>,
  symbol: string,
  value: unknown = { _tag: "wire.failure", message: "lost", detail: null, values: [] },
) {
  const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".symbols-consumer-"))
  return Promise.all(
    [
      ...output.files,
      {
        path: "probe.ts",
        content: `import { is${symbol}, type ${symbol} } from "./index"\nconst value: unknown = ${JSON.stringify(value)}\nif (!is${symbol}(value)) throw new Error("Wire guard mismatch")\nexport const failure: ${symbol} = value`,
      },
      {
        path: "wire.ts",
        content: "export type WireResult = ReadonlyArray<string>\nexport class isNamespaceFailure {}",
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify({ extends: "../../tsconfig.json", include: ["*.ts"] }),
      },
    ].map((file) => Bun.write(join(directory, file.path), file.content)),
  )
    .then(async () => {
      const check = Bun.spawn(["bun", "typecheck", "--project", join(directory, "tsconfig.json")], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [code, stdout, stderr] = await Promise.all([
        check.exited,
        new Response(check.stdout).text(),
        new Response(check.stderr).text(),
      ])
      if (code === 0) expect((await import(join(directory, "probe.ts"))).failure).toEqual(value)
      return { code, diagnostics: stdout + stderr }
    })
    .finally(() => rm(directory, { recursive: true, force: true }))
}
