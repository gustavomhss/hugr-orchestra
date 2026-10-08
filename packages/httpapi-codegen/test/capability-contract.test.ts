import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { Capability } from "../../schema/src/capability"
import { compile, emitPromise, GenerationError } from "../src"

describe("capability contract portability", () => {
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
    const Failure = Capability.Failure
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
    expect((await checkConsumer(output, "CapabilityFailure")).code).toBe(0)
    // Seed the reported binding fault into real emitted files; the TS compiler is the negative oracle.
    const invalid = await checkConsumer(
      {
        ...output,
        files: output.files.map((file) => ({
          ...file,
          content: file.content.replaceAll("CapabilityFailure", symbol),
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
  value: unknown = { _tag: "Capability.Failure", code: "outcome_unknown", message: "lost", detail: null },
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
