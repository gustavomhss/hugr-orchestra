import { expect, test } from "bun:test"
import { setTimeout as sleep } from "node:timers/promises"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Effect, Exit, Layer } from "effect"
import { systemError } from "effect/PlatformError"
import { FSUtil } from "@orchestra/core/fs-util"
import { McpAuth } from "@orchestra/core/mcp/auth"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { randomBytes } from "node:crypto"

function authFile(initial = "") {
  let raw = initial
  const aside = new Map<string, string>()
  let activeWrites = 0
  let sawOverlap = false

  const fsLayer = Layer.effect(
    FSUtil.Service,
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service

      return FSUtil.Service.of({
        ...fs,
        readJson: (file) =>
          file.endsWith("mcp-auth.json")
            ? Effect.try({
                try: () => {
                  if (!raw) return undefined
                  return JSON.parse(raw)
                },
                catch: (cause) => new FSUtil.FileSystemError({ method: "readJson", cause }),
              }).pipe(
                Effect.flatMap((json) =>
                  json === undefined
                    ? Effect.fail(
                        systemError({ _tag: "NotFound", module: "FileSystem", method: "readJson", pathOrDescriptor: file }),
                      )
                    : Effect.succeed(json),
                ),
              )
            : fs.readJson(file),
        rename: (from, to) =>
          from.endsWith("mcp-auth.json")
            ? Effect.sync(() => {
                aside.set(to, raw)
                raw = ""
              })
            : fs.rename(from, to),
        writeJson: (file, value, mode) =>
          file.endsWith("mcp-auth.json")
            ? Effect.promise(async () => {
                activeWrites++
                sawOverlap = sawOverlap || activeWrites > 1
                raw = ""
                await sleep(10)
                const next = JSON.stringify(value, null, 2)
                raw = sawOverlap ? `${next}\n}` : next
                activeWrites--
              })
            : fs.writeJson(file, value, mode),
      })
    }),
  ).pipe(Layer.provide(AppNodeBuilder.build(FSUtil.node)))

  return { fsLayer, raw: () => raw, aside }
}

function authService(fsLayer: Layer.Layer<FSUtil.Service>) {
  return McpAuth.Service.use((auth) => Effect.succeed(auth)).pipe(
    Effect.provide(AppNodeBuilder.build(McpAuth.node, [[FSUtil.node, fsLayer]])),
  )
}

test("serializes concurrent auth file updates across service instances", async () => {
  const file = authFile()

  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* authService(file.fsLayer)
      const second = yield* authService(file.fsLayer)

      yield* Effect.all(
        [
          first.updateTokens("posthog", { accessToken: "access-token" }, "https://mcp.posthog.com/mcp"),
          second.updateClientInfo("posthog", { clientId: "client-id" }, "https://mcp.posthog.com/mcp"),
        ],
        { concurrency: "unbounded" },
      )

      const entry = yield* first.get("posthog")
      expect(entry?.tokens?.accessToken).toBe("access-token")
      expect(entry?.clientInfo?.clientId).toBe("client-id")
      expect(entry?.serverUrl).toBe("https://mcp.posthog.com/mcp")
      expect(() => JSON.parse(file.raw())).not.toThrow()
    }),
  )
})

test("seals the auth file and reads a plaintext file written before encryption", async () => {
  const file = authFile(JSON.stringify({ posthog: { tokens: { accessToken: "legacy-token" } } }))

  await Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* authService(file.fsLayer)

      expect((yield* auth.get("posthog"))?.tokens?.accessToken).toBe("legacy-token")
      expect(JSON.parse(file.raw())).toStartWith("enc:v1:")
      expect(file.raw()).not.toContain("legacy-token")

      yield* auth.updateTokens("posthog", { accessToken: "new-token" })
      expect(file.raw()).not.toContain("new-token")
      expect((yield* auth.get("posthog"))?.tokens?.accessToken).toBe("new-token")
    }),
  )
})

test("moves a corrupt auth file aside instead of overwriting it", async () => {
  const corrupt = '{"posthog": {"tokens": {"accessToken": "kept"'
  const file = authFile(corrupt)

  await Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* authService(file.fsLayer)

      expect(yield* auth.get("posthog")).toBeUndefined()
      yield* auth.updateTokens("linear", { accessToken: "fresh" })

      expect([...file.aside.values()]).toEqual([corrupt])
      expect([...file.aside.keys()][0]).toMatch(/mcp-auth\.json\.corrupt-\d+$/)
      expect((yield* auth.get("linear"))?.tokens?.accessToken).toBe("fresh")
    }),
  )
})

test("leaves an auth file sealed under a key it cannot load in place and never overwrites it", async () => {
  const sealed = JSON.stringify(
    CredentialCipher.seal(JSON.stringify({ posthog: { tokens: { accessToken: "kept" } } }), randomBytes(32)),
  )
  const file = authFile(sealed)

  await Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* authService(file.fsLayer)

      expect(yield* auth.all()).toEqual({})
      const write = yield* Effect.exit(auth.updateTokens("linear", { accessToken: "fresh" }))

      expect(Exit.isFailure(write)).toBe(true)
      expect(file.raw()).toBe(sealed)
      expect(file.aside.size).toBe(0)
    }),
  )
})
