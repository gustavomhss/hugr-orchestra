import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit, Predicate, Schema, SchemaAST } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { Capability } from "../../schema/src/capability"
import { compile, emitEffect, emitEffectImported, emitPromise } from "../src"

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
            _tag: "Failure",
            code: "outcome_unknown",
            message: "Uncertain",
            detail,
          } satisfies Capability.Failure
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
            expect(yield* client.capability.read()).toEqual(failure)
            expect(yield* client.capability.failed().pipe(Effect.flip)).toEqual(failure)
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
    // Promise declared errors require a Schema error class; Failure remains a plain wire record.
    expect(() => emitPromise(contract)).toThrow("Promise error must have a literal discriminator: capability.failed")
    const promise = emitPromise(compile(Api, { omitEndpoints: new Set(["failed"]) }))
    const types = promise.files.find((file) => file.path === "types.ts")?.content
    expect(types).toContain('readonly "detail"?: JsonValue')
    expect(types).toContain("export type JsonValue = null | boolean | number | string")
    expect(types).toContain('readonly "_tag": "Failure"')
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
})
