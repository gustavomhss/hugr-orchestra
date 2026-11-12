import { expect } from "bun:test"
import { Effect, Exit, Layer, Schema, Scope } from "effect"
import { ApplyPatchTool } from "@orchestra/core/tool/apply-patch"
import { Tool } from "@orchestra/core/tool/tool"
import { testEffect } from "../lib/effect"
import { graph, identity, leaf, names, text, workspace } from "./identity-fixture"

const it = testEffect(Layer.empty)

for (const placement of ["applications", "tools", "registry"] as const) {
  it.live(`ordinary ${placement} registration rejects a reserved mixed batch atomically`, () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const g = yield* graph(f, { documents: () => [] })
      yield* g.tools.register({ [ApplyPatchTool.name]: leaf("NATIVE") })
      const before = yield* names(g)
      const result = yield* g[placement]
        .register({ harmless: leaf("UNPUBLISHED"), mcp_reserved: leaf("FORGED") })
        .pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(Tool.RegistrationError)
      expect(yield* names(g)).toEqual(before)
      expect(JSON.stringify(yield* text(g, ApplyPatchTool.name))).toContain("NATIVE")
    }),
  )
}

it.live("native overrides keep scoped restoration and Location precedence over global ApplicationTools", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const g = yield* graph(f, { documents: () => [] })
    const base = yield* Scope.make()
    const newer = yield* Scope.make()
    yield* g.applications.register({ [ApplyPatchTool.name]: leaf("APPLICATION") })
    yield* g.tools.register({ [ApplyPatchTool.name]: leaf("BASE") }).pipe(Scope.provide(base))
    yield* g.tools.register({ [ApplyPatchTool.name]: leaf("NEWER") }).pipe(Scope.provide(newer))
    expect(JSON.stringify(yield* text(g, ApplyPatchTool.name))).toContain("NEWER")
    yield* Scope.close(base, Exit.void)
    expect(JSON.stringify(yield* text(g, ApplyPatchTool.name))).toContain("NEWER")
    yield* Scope.close(newer, Exit.void)
    expect(JSON.stringify(yield* text(g, ApplyPatchTool.name))).toContain("APPLICATION")
  }),
)

it.live("registerMcp derives before factory publication and its advertised ID is the real permission action", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const h = yield* identity(f)
    const g = yield* graph(f, { documents: () => [], replacements: [[h.McpIdentity.node, h.layer]] })
    const actions: string[] = []
    const id = yield* g.tools.registerMcp({ kind: "provided", name: "factory", key: "A" }, "probe", (derived) => {
      expect(g.registry.currentRegistrationIdentity(derived)).toBeUndefined()
      return Tool.make({
        description: "bound identity",
        input: Schema.Struct({}),
        output: Schema.String,
        execute: (_, context) =>
          Effect.gen(function* () {
            actions.push(derived)
            yield* g.permission.assert({
              sessionID: context.sessionID,
              agent: context.agent,
              action: derived,
              resources: ["*"],
              save: ["*"],
              source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
            })
            return "BOUND"
          }).pipe(Effect.mapError((error) => new Tool.Failure({ message: error.message }))),
      })
    })
    expect(id).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
    expect(id).toHaveLength(47)
    expect(yield* names(g)).toEqual([id])
    expect(JSON.stringify(yield* text(g, id))).toContain("BOUND")
    expect(actions).toEqual([id])
    expect(yield* g.permission.list()).toEqual([])
  }),
)

it.live(
  "same-authority refresh rotates liveness token, stale calls are refused and an old scope cannot remove its replacement",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const g = yield* graph(f, { documents: () => [], replacements: [[h.McpIdentity.node, h.layer]] })
      const oldScope = yield* Scope.make()
      const newScope = yield* Scope.make()
      const authority = { kind: "provided" as const, name: "refresh", key: "A" }
      const id = yield* g.registry.registerMcp(authority, "probe", () => leaf("OLD")).pipe(Scope.provide(oldScope))
      const old = yield* g.registry.materialize()
      const firstToken = old.registrationIdentity(id)
      const refreshed = yield* g.tools.registerMcp(authority, "probe", () => leaf("NEW")).pipe(Scope.provide(newScope))
      expect(refreshed).toBe(id)
      expect(g.registry.currentRegistrationIdentity(id)).not.toBe(firstToken)
      expect((yield* old.settle(g.input(id))).result).toMatchObject({ type: "error" })
      yield* Scope.close(oldScope, Exit.void)
      expect(JSON.stringify(yield* text(g, id))).toContain("NEW")
      yield* Scope.close(newScope, Exit.void)
      expect(yield* names(g)).toEqual([])
    }),
)

it.live(
  "forced digest collision refuses another active origin without calling its factory or exposing private data",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f, { digest: () => "A".repeat(43) })
      const g = yield* graph(f, { documents: () => [], replacements: [[h.McpIdentity.node, h.layer]] })
      const authority = {
        kind: "configured" as const,
        source: `${f.directory}/first.json`,
        name: "secret-source-A",
        directory: f.directory,
        server: {
          type: "remote" as const,
          url: "https://first.invalid/mcp",
          headers: { Authorization: "PRIVATE_HEADER_A" },
          oauth: { client_id: "A", client_secret: "PRIVATE_SECRET_A" },
        },
      }
      const oldScope = yield* Scope.make()
      const newScope = yield* Scope.make()
      const id = yield* g.tools.registerMcp(authority, "probe", () => leaf("A")).pipe(Scope.provide(oldScope))
      yield* g.tools.registerMcp(authority, "probe", () => leaf("REFRESH_A")).pipe(Scope.provide(newScope))
      const before = g.registry.currentRegistrationIdentity(id)
      const made: string[] = []
      const denied = () =>
        g.registry
          .registerMcp(
            {
              ...authority,
              source: `${f.directory}/second.json`,
              name: "secret-source-B",
              server: { ...authority.server, headers: { Authorization: "PRIVATE_HEADER_B" } },
            },
            "probe",
            () => {
              made.push("B")
              return leaf("B")
            },
          )
          .pipe(Effect.result)
      for (const phase of ["both-active", "older-still-active"] as const) {
        if (phase === "older-still-active") yield* Scope.close(newScope, Exit.void)
        const result = yield* denied()
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") {
          expect(result.failure).toBeInstanceOf(Tool.RegistrationError)
          expect(JSON.stringify(result.failure)).not.toMatch(/PRIVATE_|secret-source|first\.invalid|second\.json/)
        }
        expect(made).toEqual([])
        expect(yield* names(g)).toEqual([id])
      }
      expect(before).toBeDefined()
      expect(JSON.stringify(yield* text(g, id))).toContain("A")
      yield* Scope.close(oldScope, Exit.void)
      // The active guard deliberately ends here; there is no durable tuple catalog claim.
      const accepted = yield* g.tools.registerMcp({ kind: "provided", name: "B", key: "B" }, "probe", () => leaf("B"))
      expect(accepted).toBe(id)
    }),
)
