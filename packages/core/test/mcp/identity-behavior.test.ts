// Existing APIs only: these must reproduce behavior even while identity.ts/registerMcp do not exist.
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { ApplyPatchTool } from "@orchestra/core/tool/apply-patch"
import { testEffect } from "../lib/effect"
import { document, graph, leaf, names, provided, remote, text, workspace } from "./identity-fixture"

const it = testEffect(Layer.empty)

it.live("MCP apply/patch cannot replace the native apply_patch registration", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const server = provided("apply", "authority-A", ["patch"], "MCP_SENTINEL")
    const g = yield* graph(f, { documents: () => [], provided: () => [server.server] })
    const native: string[] = []
    yield* g.tools.register({ [ApplyPatchTool.name]: leaf("NATIVE_SENTINEL", native) })
    yield* g.mcp.ready()
    const result = yield* text(g, ApplyPatchTool.name)
    expect(JSON.stringify(result)).toContain("NATIVE_SENTINEL")
    expect(native).toEqual(["NATIVE_SENTINEL"])
    expect(server.calls).toEqual([])
  }),
)

it.live("two real MCP servers with ambiguous raw pairs keep two independently routed tools", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const a = provided("a_b", "authority-A", ["c"], "SERVER_A")
    const b = provided("a", "authority-B", ["b_c"], "SERVER_B")
    const g = yield* graph(f, { documents: () => [], provided: () => [a.server, b.server] })
    yield* g.mcp.ready()
    const catalog = yield* names(g)
    expect(catalog).toHaveLength(2)
    const answers = yield* Effect.forEach(catalog, (name) => text(g, name))
    expect(
      answers.map((answer) => JSON.stringify(answer)).filter((answer) => answer.includes("SERVER_A")),
    ).toHaveLength(1)
    expect(
      answers.map((answer) => JSON.stringify(answer)).filter((answer) => answer.includes("SERVER_B")),
    ).toHaveLength(1)
    expect(a.calls).toEqual(["c"])
    expect(b.calls).toEqual(["b_c"])
  }),
)

it.live("a remembered exact MCP grant does not authorize another endpoint using the same config server name", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const a = yield* Effect.acquireRelease(
      Effect.sync(() => remote(["probe"], "SERVER_A")),
      (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
    )
    const b = yield* Effect.acquireRelease(
      Effect.sync(() => remote(["probe"], "SERVER_B")),
      (server) => Effect.promise(() => server[Symbol.asyncDispose]()),
    )
    const g = yield* graph(f, {
      rules: [],
      documents: () => [document(undefined, { same: { type: "remote", url: a.url, oauth: false } })],
    })
    yield* g.mcp.ready()
    const before = (yield* names(g))[0]
    expect(before).toBeString()
    yield* g.saved.add({ projectID: f.projectID, action: before, resources: ["*"] })
    expect(
      yield* g.permission.evaluate({ sessionID: g.sessionID, action: before, resources: ["*"], agent: g.agentID }),
    ).toBe("allow")
    yield* g.mcp.add("same", new ConfigMCP.Remote({ type: "remote", url: b.url, oauth: false }))
    const after = (yield* names(g))[0]
    expect(
      yield* g.permission.evaluate({ sessionID: g.sessionID, action: after, resources: ["*"], agent: g.agentID }),
    ).toBe("ask")
    expect(after).not.toBe(before)
    expect(b.calls.filter((call) => call.method === "tools/call")).toEqual([])
  }),
)
