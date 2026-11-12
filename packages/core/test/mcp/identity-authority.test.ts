import path from "node:path"
import { expect } from "bun:test"
import { Effect, Layer, Redacted, Schema } from "effect"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Config } from "@orchestra/core/config"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { testEffect } from "../lib/effect"
import { graph, identity, workspace } from "./identity-fixture"

const it = testEffect(Layer.empty)

it.live("canonical authority encoding is order independent, omits undefined and excludes disabled/timeouts", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const h = yield* identity(f)
    const authority = {
      kind: "configured" as const,
      source: path.join(f.directory, "orchestra.json"),
      name: "same",
      directory: f.directory,
      server: new ConfigMCP.Remote({
        type: "remote",
        url: "https://same.invalid/mcp",
        headers: { Z: "PRIVATE_Z", A: "PRIVATE_A" },
        oauth: new ConfigMCP.OAuth({ client_id: "client", client_secret: "PRIVATE_SECRET" }),
      }),
    }
    const first = yield* h.service.identify(authority, "probe")
    const same = yield* h.service.identify(
      {
        ...authority,
        server: new ConfigMCP.Remote({
          type: "remote",
          url: authority.server.url,
          headers: { A: "PRIVATE_A", Z: "PRIVATE_Z" },
          oauth: new ConfigMCP.OAuth({ client_secret: "PRIVATE_SECRET", client_id: "client", scope: undefined }),
          disabled: true,
          timeout: new ConfigMCP.Timeout({ startup: 111, request: 222 }),
        }),
      },
      "probe",
    )
    expect(same.id).toBe(first.id)
    expect(Redacted.value(same.origin)).toBe(Redacted.value(first.origin))
    expect(JSON.stringify(first)).not.toMatch(/PRIVATE_|same\.invalid|orchestra\.json/)
    expect(first.id).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
    const fresh = yield* identity(f)
    expect((yield* fresh.service.identify(authority, "probe")).id).toBe(first.id)
    const other = yield* workspace
    const unrelated = yield* identity(other)
    expect((yield* unrelated.service.identify(authority, "probe")).id).not.toBe(first.id)
  }),
)

it.live(
  "source, server name, URL, headers, configured OAuth ID/secret and provided key all bind distinct authority",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const base = {
        kind: "configured" as const,
        source: path.join(f.directory, "first.json"),
        name: "same",
        directory: f.directory,
        server: new ConfigMCP.Remote({
          type: "remote",
          url: "https://same.invalid/mcp",
          headers: { Authorization: "PRIVATE_A" },
          oauth: new ConfigMCP.OAuth({ client_id: "A", client_secret: "PRIVATE_SECRET_A" }),
        }),
      }
      const values = [
        base,
        { ...base, source: path.join(f.directory, "second.json") },
        { ...base, name: "other" },
        { ...base, server: new ConfigMCP.Remote({ ...base.server, url: "https://other.invalid/mcp" }) },
        { ...base, server: new ConfigMCP.Remote({ ...base.server, headers: { Authorization: "PRIVATE_B" } }) },
        {
          ...base,
          server: new ConfigMCP.Remote({
            ...base.server,
            oauth: new ConfigMCP.OAuth({ client_id: "B", client_secret: "PRIVATE_SECRET_A" }),
          }),
        },
        {
          ...base,
          server: new ConfigMCP.Remote({
            ...base.server,
            oauth: new ConfigMCP.OAuth({ client_id: "A", client_secret: "PRIVATE_SECRET_B" }),
          }),
        },
        { kind: "provided" as const, name: "same", key: "A" },
        { kind: "provided" as const, name: "same", key: "B" },
        { kind: "provided" as const, name: "other", key: "A" },
      ]
      const ids = yield* Effect.forEach(values, (value) => h.service.identify(value, "probe"))
      expect(new Set(ids.map((value) => value.id)).size).toBe(values.length)
      expect(JSON.stringify(ids)).not.toMatch(/PRIVATE_|first\.json|same\.invalid/)
    }),
)

it.live("raw punctuation, Unicode, long names and ambiguous separator pairs produce distinct valid bounded IDs", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const h = yield* identity(f)
    const pairs = [
      ["a.b", "x"],
      ["a_b", "x"],
      ["a_b", "c"],
      ["a", "b_c"],
      ["same", "x.y"],
      ["same", "x_y"],
      ["日本語", "ferramenta🧪"],
      ["server".repeat(80), "tool".repeat(90)],
      ["123", "_starts"],
    ]
    const ids = yield* Effect.forEach(pairs, ([name, raw]) =>
      h.service.identify({ kind: "provided", name, key: "stable" }, raw),
    )
    expect(new Set(ids.map((value) => value.id)).size).toBe(pairs.length)
    for (const value of ids) {
      expect(value.id).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
      expect(value.id).toHaveLength(47)
    }
  }),
)

it.live(
  "local configured environment and resolved cwd are canonical while command argument order remains significant",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const authority = {
        kind: "configured" as const,
        source: path.join(f.directory, "local.json"),
        name: "local",
        directory: f.directory,
        server: new ConfigMCP.Local({
          type: "local",
          command: ["fixture-command", "one", "two"],
          cwd: "sub",
          environment: { Z: "PRIVATE_Z", A: "PRIVATE_A" },
        }),
      }
      const original = yield* h.service.identify(authority, "probe")
      expect(
        (yield* h.service.identify(
          {
            ...authority,
            server: new ConfigMCP.Local({
              ...authority.server,
              cwd: path.join(f.directory, "sub"),
              environment: { A: "PRIVATE_A", Z: "PRIVATE_Z" },
            }),
          },
          "probe",
        )).id,
      ).toBe(original.id)
      for (const server of [
        new ConfigMCP.Local({ ...authority.server, command: ["fixture-command", "two", "one"] }),
        new ConfigMCP.Local({ ...authority.server, cwd: "other" }),
        new ConfigMCP.Local({ ...authority.server, environment: { A: "DIFFERENT" } }),
      ])
        expect((yield* h.service.identify({ ...authority, server }, "probe")).id).not.toBe(original.id)
      const omitted = { ...authority, server: new ConfigMCP.Local({ type: "local", command: ["fixture-command"] }) }
      expect((yield* h.service.identify(omitted, "probe")).id).toBe(
        (yield* h.service.identify(
          { ...omitted, server: new ConfigMCP.Local({ ...omitted.server, cwd: f.directory }) },
          "probe",
        )).id,
      )
    }),
)

it.live(
  "unsupported canonical array values fail with a generic typed identity error rather than coercing authority",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      for (const value of [undefined, NaN, () => "PRIVATE_CALLBACK"]) {
        const authority = {
          kind: "configured" as const,
          source: path.join(f.directory, "invalid.json"),
          name: "PRIVATE_NAME",
          directory: f.directory,
          server: { type: "local" as const, command: ["command", value] as unknown as readonly string[] },
        }
        const result = yield* h.service.identify(authority, "probe").pipe(Effect.result)
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          expect(result.failure).toBeInstanceOf(h.McpIdentity.IdentityError)
          expect(JSON.stringify(result.failure)).not.toMatch(/PRIVATE_|invalid\.json/)
        }
      }
    }),
)

it.live(
  "Config.readDocument preserves the real loader's legacy/V2 decoding, omissions, env syntax and typed refusal",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const file = path.join(f.directory, "orchestra.jsonc")
      const text =
        '{ // retained fixture\n"mcp":{"same":{"type":"remote","url":"https://same.invalid/mcp","headers":{"Authorization":"{env:IDENTITY_TEST_TOKEN}"},"oauth":false,"timeout":{"request":123}}}}'
      yield* Effect.promise(() => Bun.write(file, text))
      const loaded = yield* Config.readDocument(file).pipe(Effect.provide(AppNodeBuilder.build(FSUtil.node)))
      const fresh = yield* graph(f)
      const admitted = (yield* fresh.config.entries()).find(
        (entry): entry is Config.Document => entry.type === "document" && entry.path === file,
      )
      expect(loaded).toEqual(admitted)
      expect(loaded?.info.mcp?.servers?.same).toMatchObject({
        type: "remote",
        headers: { Authorization: "{env:IDENTITY_TEST_TOKEN}" },
        oauth: false,
        timeout: { request: 123 },
      })
      expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(text)
      for (const invalid of ['{"mcp":', '{"instructions":["https://untrusted.invalid/instructions"]}']) {
        yield* Effect.promise(() => Bun.write(file, invalid))
        const result = yield* Config.readDocument(file).pipe(
          Effect.provide(AppNodeBuilder.build(FSUtil.node)),
          Effect.result,
        )
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(Config.InvalidError)
      }
      expect(
        yield* Config.readDocument(path.join(f.directory, "absent.json")).pipe(
          Effect.provide(AppNodeBuilder.build(FSUtil.node)),
        ),
      ).toBeUndefined()
    }),
)
