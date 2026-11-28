import path from "node:path"
import fs from "node:fs/promises"
import { expect } from "bun:test"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Config } from "@orchestra/core/config"
import { McpAuth } from "@orchestra/core/mcp/auth"
import { PermissionV2 } from "@orchestra/core/permission"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { ApplyPatchTool } from "@orchestra/core/tool/apply-patch"
import { Context, Deferred, Effect, Fiber, Layer, Logger, Schema } from "effect"
import { testEffect } from "../lib/effect"
import { signIn, storage } from "./oauth-authority-fixture"
import { document, graph, identity, leaf, names, provided, remote, text, workspace } from "./identity-fixture"

const it = testEffect(Layer.empty)

it.live(
  "real MCP connect/list_changed preserves native routing, binds published ID to permission/save and revokes stale materializations",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const server = provided("apply", "key-A", ["patch"], "MCP_ONLY")
      const publication: { next?: ReturnType<typeof Promise.withResolvers<string>> } = {}
      const g = yield* graph(f, {
        documents: () => [],
        provided: () => [server.server],
        rules: [],
        replacements: [[h.McpIdentity.node, h.layer]],
        registered: (id) => publication.next?.resolve(id),
      })
      yield* g.tools.register({ [ApplyPatchTool.name]: leaf("NATIVE_ONLY") })
      yield* g.saved.add({ projectID: f.projectID, action: ApplyPatchTool.name, resources: ["*"] })
      yield* g.saved.add({ projectID: f.projectID, action: "apply_*", resources: ["*"] })
      yield* g.mcp.ready()
      const id = (yield* names(g)).find((name) => name !== ApplyPatchTool.name)!
      expect(id).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
      expect(JSON.stringify(yield* text(g, ApplyPatchTool.name))).toContain("NATIVE_ONLY")
      expect(
        yield* g.permission.evaluate({ sessionID: g.sessionID, agent: g.agentID, action: id, resources: ["*"] }),
      ).toBe("ask")
      const events = Context.get(g.context, EventV2.Service)
      const asked = yield* Deferred.make<PermissionV2.Request>()
      const actions: string[] = []
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== PermissionV2.Event.Asked.type) return Effect.void
        const request = Schema.decodeUnknownSync(PermissionV2.Request)(event.data)
        actions.push(request.action)
        return Deferred.succeed(asked, request).pipe(Effect.asVoid)
      })
      yield* Effect.addFinalizer(() => unsubscribe)
      const calling = yield* text(g, id).pipe(Effect.forkScoped)
      const request = yield* Deferred.await(asked)
      expect(request.action).toBe(id)
      expect(request.save).toEqual(["*"])
      expect(request.metadata).toMatchObject({ server: "apply", tool: "patch" })
      yield* g.permission.reply({ requestID: request.id, reply: "always" })
      expect(JSON.stringify(yield* Fiber.join(calling))).toContain("MCP_ONLY")
      expect((yield* g.saved.list({ projectID: f.projectID })).map((rule) => rule.action)).toContain(id)
      const old = yield* g.registry.materialize()
      publication.next = Promise.withResolvers<string>()
      yield* Effect.promise(() => server.changed(["patch"]))
      expect(yield* Effect.promise(() => publication.next!.promise)).toBe(id)
      expect((yield* old.settle(g.input(id))).result.type).toBe("error")
      expect(JSON.stringify(yield* text(g, id))).toContain("MCP_ONLY")
      expect(actions).toEqual([id])
      expect(server.calls).toEqual(["patch", "patch"])
      expect(JSON.stringify(yield* text(g, ApplyPatchTool.name))).toContain("NATIVE_ONLY")
    }),
  20_000,
)

it.live(
  "old remote Client retains captured authority on list_changed; reconnect to new source/endpoint cannot reuse its exact grant",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const a = yield* Effect.acquireRelease(
        Effect.sync(() => remote(["probe"], "A")),
        (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
      )
      const b = yield* Effect.acquireRelease(
        Effect.sync(() => remote(["probe"], "B")),
        (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
      )
      const state = {
        docs: [
          document(path.join(f.global.config, "orchestra.json"), {
            same: { type: "remote", url: a.url, headers: { Authorization: "PRIVATE_LABEL_HEADER" }, oauth: false },
          }),
        ],
        next: undefined as ReturnType<typeof Promise.withResolvers<string>> | undefined,
      }
      const g = yield* graph(f, {
        documents: () => state.docs,
        rules: [],
        replacements: [[h.McpIdentity.node, h.layer]],
        registered: (id) => state.next?.resolve(id),
      })
      yield* g.mcp.ready()
      const first = (yield* names(g))[0]
      const description = (yield* g.registry.materialize()).definition(first)!.description
      expect(description).toContain(JSON.stringify("same"))
      expect(description).toContain(JSON.stringify("probe"))
      expect(description).not.toContain("PRIVATE_LABEL_HEADER")
      expect(description).not.toContain(a.url)
      yield* g.saved.add({ projectID: f.projectID, action: first, resources: ["*"] })
      state.docs = [
        document(path.join(f.directory, "project.json"), { same: { type: "remote", url: b.url, oauth: false } }),
      ]
      state.next = Promise.withResolvers<string>()
      yield* Effect.promise(() => a.changed(["probe"]))
      expect(yield* Effect.promise(() => state.next!.promise)).toBe(first)
      expect((yield* names(g))[0]).toBe(first)
      yield* g.mcp.connect("same")
      const next = (yield* names(g))[0]
      expect(next).not.toBe(first)
      expect(
        yield* g.permission.evaluate({ sessionID: g.sessionID, agent: g.agentID, action: next, resources: ["*"] }),
      ).toBe("ask")
      expect(b.calls.some((call) => call.method === "initialize")).toBe(true)
    }),
  20_000,
)

it.live(
  "Mcp.add uses the writer's real decoded document so source/env syntax/omissions stay identical after reopening",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => remote(["probe"], "SAME")),
        (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
      )
      const file = path.join(f.directory, ".orchestra", "orchestra.jsonc")
      yield* Effect.promise(() => fs.mkdir(path.dirname(file), { recursive: true }))
      yield* Effect.promise(() => Bun.write(file, '{ // identity fixture\n"mcp": {} }'))
      const first = yield* graph(f, { replacements: [[h.McpIdentity.node, h.layer]] })
      yield* first.mcp.add(
        "same",
        new ConfigMCP.Remote({
          type: "remote",
          url: server.url,
          headers: { Authorization: "{env:IDENTITY_FIXTURE_TOKEN}" },
          oauth: false,
        }),
      )
      const before = (yield* names(first))[0]
      const loaded = yield* Config.readDocument(file).pipe(Effect.provide(AppNodeBuilder.build(FSUtil.node)))
      const expected = yield* h.service.identify(
        {
          kind: "configured",
          source: file,
          name: "same",
          directory: f.directory,
          server: loaded!.info.mcp!.servers!.same,
        },
        "probe",
      )
      expect(before).toBe(expected.id)
      const raw = yield* Effect.promise(() => Bun.file(file).text())
      expect(raw).toContain("{env:IDENTITY_FIXTURE_TOKEN}")
      const second = yield* graph(f, { replacements: [[h.McpIdentity.node, h.layer]] })
      expect(first.mcp).not.toBe(second.mcp)
      yield* second.mcp.ready()
      expect(yield* names(second)).toEqual([before])
      expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(raw)
    }),
)

it.live(
  "untrusted project override, pathless user source and equal provided keys have explicit authority boundaries",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const a = yield* Effect.acquireRelease(
        Effect.sync(() => remote(["probe"], "A")),
        (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
      )
      const b = yield* Effect.acquireRelease(
        Effect.sync(() => remote(["probe"], "B")),
        (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
      )
      const user = document(path.join(f.global.config, "orchestra.json"), {
        same: { type: "remote", url: a.url, oauth: false },
      })
      const globalOnly = yield* graph(f, { documents: () => [user], replacements: [[h.McpIdentity.node, h.layer]] })
      yield* globalOnly.mcp.ready()
      const original = (yield* names(globalOnly))[0]
      const overlaid = yield* graph(f, {
        documents: () => [
          user,
          document(path.join(f.directory, "project.json"), { same: { type: "remote", url: b.url, oauth: false } }),
        ],
        replacements: [[h.McpIdentity.node, h.layer]],
      })
      yield* overlaid.mcp.ready()
      expect((yield* overlaid.mcp.list())[0].status.status).toBe("connected")
      expect((yield* names(overlaid))[0]).not.toBe(original)
      const pathless = yield* graph(f, {
        documents: () => [document(undefined, { same: { type: "remote", url: a.url, oauth: false } })],
        replacements: [[h.McpIdentity.node, h.layer]],
      })
      yield* pathless.mcp.ready()
      expect((yield* names(pathless))[0]).not.toBe(original)
      const otherGlobal = { ...f, global: { ...f.global, config: path.join(f.directory, "other-user-global") } }
      const another = yield* graph(otherGlobal, {
        documents: () => [document(undefined, { same: { type: "remote", url: a.url, oauth: false } })],
        replacements: [[h.McpIdentity.node, h.layer]],
      })
      yield* another.mcp.ready()
      expect((yield* names(another))[0]).not.toBe((yield* names(pathless))[0])
      const keyA = provided("same", "key-A", ["probe"], "A")
      const keyB = provided("same", "key-B", ["probe"], "B")
      const state = { server: keyA.server }
      const supplied = yield* graph(f, {
        documents: () => [],
        provided: () => [state.server],
        replacements: [[h.McpIdentity.node, h.layer]],
      })
      yield* supplied.mcp.ready()
      const suppliedA = (yield* names(supplied))[0]
      yield* supplied.mcp.ready()
      expect((yield* names(supplied))[0]).toBe(suppliedA)
      state.server = keyB.server
      yield* supplied.mcp.ready()
      expect((yield* names(supplied))[0]).not.toBe(suppliedA)
      expect((yield* names(supplied))[0]).not.toBe(original)
    }),
)

it.live(
  "real OAuth token refresh changes stored credentials while the configured MCP tool identity remains stable",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const tokens = yield* storage
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => remote(["probe"], "AUTHENTICATED", { oauth: true })),
        (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
      )
      const signed = yield* Effect.promise(() =>
        signIn({ auth: tokens.first, url: server.url, metadata: server.metadata }),
      )
      const g = yield* graph(f, {
        documents: () => [
          document(path.join(f.global.config, "orchestra.json"), {
            remote: { type: "remote", url: server.url, oauth: {} },
          }),
        ],
        replacements: [
          [h.McpIdentity.node, h.layer],
          [McpAuth.node, Layer.succeed(McpAuth.Service, tokens.first)],
        ],
      })
      yield* g.mcp.ready()
      const before = (yield* names(g))[0]
      expect((yield* tokens.second.get("remote"))?.tokens?.accessToken).toBe("IDENTITY_ACCESS_1")
      expect(
        yield* Effect.promise(() =>
          auth(signed.provider, { serverUrl: server.url, resourceMetadataUrl: server.metadata }),
        ),
      ).toBe("AUTHORIZED")
      expect(
        server.authCalls.filter((call) => call.path === "/token" && call.body.includes("grant_type=refresh_token")),
      ).toHaveLength(1)
      expect((yield* tokens.second.get("remote"))?.tokens?.accessToken).toBe("IDENTITY_ACCESS_2")
      yield* g.mcp.connect("remote")
      expect(yield* names(g)).toEqual([before])
      expect(before).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
      expect(JSON.stringify((yield* g.registry.materialize()).definitions)).not.toMatch(
        /IDENTITY_ACCESS_|IDENTITY_REFRESH|FICTITIOUS_DYNAMIC_SECRET/,
      )
    }),
)

for (const action of ["*", "mcp_*", "same_*", "same_probe"]) {
  it.live(`permission glob ${action} retains literal matching against the newly registered MCP ID`, () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const server = provided("same", "key", ["probe"], "MCP")
      const g = yield* graph(f, {
        documents: () => [],
        provided: () => [server.server],
        rules: [{ action, resource: "*", effect: "allow" }],
        replacements: [[h.McpIdentity.node, h.layer]],
      })
      yield* g.mcp.ready()
      const id = (yield* names(g))[0]
      expect(id).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
      expect(
        yield* g.permission.evaluate({ sessionID: g.sessionID, agent: g.agentID, action: id, resources: ["*"] }),
      ).toBe(action === "*" || action === "mcp_*" ? "allow" : "ask")
    }),
  )
}

it.live(
  "partial catalog refusal keeps accepted tools connected and emits exactly one bounded generic warning per update",
  () => {
    const warnings: unknown[] = []
    const next: { warning?: ReturnType<typeof Promise.withResolvers<void>> } = {}
    const logger = Logger.make((entry) => {
      if (entry.logLevel !== "Warn") return
      warnings.push(entry.message)
      next.warning?.resolve()
    })
    return Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f, {
        digest: (canonical) => (canonical.includes("accepted-tool") ? "B" : "A").repeat(43),
      })
      const a = provided("first", "PRIVATE_KEY_A", ["probe"], "A")
      const raw = "PRIVATE_RAW_TOOL_".repeat(700)
      const accepted = "accepted-tool-" + "y".repeat(180)
      const b = provided("second-" + "x".repeat(180), "PRIVATE_KEY_B", [accepted, raw, "refused-two"], "B")
      const state = { servers: [a.server] }
      const g = yield* graph(f, {
        documents: () => [],
        provided: () => state.servers,
        replacements: [[h.McpIdentity.node, h.layer]],
      })
      yield* g.mcp.ready()
      state.servers = [a.server, b.server]
      yield* g.mcp.ready()
      expect((yield* g.mcp.list()).find((entry) => entry.name === b.server.name)?.status.status).toBe("connected")
      expect((yield* g.mcp.tools())[b.server.name]).toEqual([accepted])
      expect(yield* names(g)).toHaveLength(2)
      const description = (yield* g.registry.materialize()).definitions.find((tool) =>
        tool.description.includes("accepted-tool"),
      )!.description
      expect(description).toContain(JSON.stringify(b.server.name.slice(0, 128)))
      expect(description).toContain(JSON.stringify(accepted.slice(0, 128)))
      expect(description).toContain("truncated")
      expect(description).not.toContain(b.server.name)
      expect(description).not.toContain(accepted)
      expect(description).not.toContain("PRIVATE_KEY_B")
      expect(warnings).toEqual([["MCP tool registration refused", { server: b.server.name.slice(0, 128), refused: 2 }]])
      expect(JSON.stringify(warnings)).not.toMatch(/PRIVATE_|refused-two/)
      next.warning = Promise.withResolvers<void>()
      yield* Effect.promise(() => b.changed([accepted, raw, "refused-two"]))
      yield* Effect.promise(() => next.warning!.promise)
      expect(warnings).toHaveLength(2)
      expect(warnings[1]).toEqual([
        "MCP tool registration refused",
        { server: b.server.name.slice(0, 128), refused: 2 },
      ])
      expect((yield* g.mcp.tools())[b.server.name]).toEqual([accepted])
      expect(JSON.stringify(warnings)).not.toMatch(/PRIVATE_|refused-two/)
    }).pipe(Effect.provide(Logger.layer([logger])))
  },
  20_000,
)
