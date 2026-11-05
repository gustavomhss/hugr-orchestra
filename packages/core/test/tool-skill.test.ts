import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionV2 } from "@orchestra/core/permission"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillTool } from "@orchestra/core/tool/skill"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"
import { toolIdentity, executeTool, settleTool, toolDefinitions } from "./lib/tool"

const sessionID = SessionV2.ID.make("ses_skill_tool_test")

describe("SkillTool", () => {
  it.live("lists available skills, authorizes the selected name, and loads model-facing content", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const directory = path.join(tmp.path, "effect")
          const location = path.join(directory, "SKILL.md")
          const reference = path.join(directory, "reference.md")
          yield* Effect.promise(() => fs.mkdir(directory, { recursive: true }))
          yield* Effect.promise(() =>
            Promise.all([fs.writeFile(location, "unused"), fs.writeFile(reference, "reference")]),
          )

          const info: SkillV2.Info = {
            name: "effect",
            description: "Use Effect",
            location: AbsolutePath.make(location),
            content: "# Effect\n\nGuidance",
          }
          let current = [info]
          const assertions: PermissionV2.AssertInput[] = []
          const evaluations: PermissionV2.AssertInput[] = []
          let deny = false
          const permission = Layer.succeed(
            PermissionV2.Service,
            PermissionV2.Service.of({
              evaluate: (input) => Effect.sync(() => {
                evaluations.push(input)
                return PermissionV2.evaluate(input.action, input.resources[0], [
                  { action: "skill", resource: "*", effect: "allow" },
                ]).effect
              }),
              authorize: () => Effect.die("unused permission authorization"),
              askExplicit: () => Effect.die("Native askExplicit is unavailable in this normal-path fixture"),
              assert: (input) =>
                Effect.sync(() => assertions.push(input)).pipe(
                  Effect.andThen(deny ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
                ),
              ask: () => Effect.die("unused"),
              reply: () => Effect.die("unused"),
              cancelSession: () => Effect.void,
              get: () => Effect.die("unused"),
              forSession: () => Effect.die("unused"),
              list: () => Effect.die("unused"),
            }),
          )
          const skills = Layer.succeed(
            SkillV2.Service,
            SkillV2.Service.of({
              transform: (_transform) => Effect.die("unused"),
              reload: () => Effect.die("unused"),
              sources: () => Effect.die("unused"),
              list: () => Effect.succeed(current),
              save: () => Effect.die("unused"),
              remove: () => Effect.die("unused"),
            }),
          )
          const skillToolLayer = AppNodeBuilder.build(
            LayerNode.group([ToolRegistry.node, ToolRegistry.toolsNode, SkillTool.node]),
            [
              [PermissionV2.node, permission],
              [SkillV2.node, skills],
              [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
            ],
          )

          return yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            expect((yield* toolDefinitions(registry))[0]).toMatchObject({
              name: "skill",
              description: SkillTool.description,
            })
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-skill", name: "skill", input: { name: "effect" } },
              }),
            ).toEqual({
              type: "text",
              value: SkillTool.toModelOutput(info, [reference]),
            })
            expect(SkillTool.toModelOutput(info, [reference])).toContain(`Base directory for this skill: ${directory}`)
            expect(
              yield* settleTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-skill-overflow", name: "skill", input: { name: "effect" } },
              }),
            ).toMatchObject({
              result: { type: "text", value: SkillTool.toModelOutput(info, [reference]) },
              output: { structured: { name: "effect" } },
            })
            expect(assertions).toMatchObject([
              { sessionID, action: "skill", resources: ["effect"], save: ["effect"] },
              { sessionID, action: "skill", resources: ["effect"], save: ["effect"] },
            ])
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-missing-skill", name: "skill", input: { name: "missing" } },
              }),
            ).toEqual({ type: "error", value: "Unable to load skill missing: not found. Available skills: effect" })
            expect(evaluations).toEqual([
              { sessionID, agent: toolIdentity.agent, action: "skill", resources: ["effect"] },
            ])
            expect(assertions).toHaveLength(2)
            deny = true
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-denied-skill", name: "skill", input: { name: "effect" } },
              }),
            ).toMatchObject({
              type: "error",
              value: expect.stringMatching(/^Unable to load skill effect: PermissionV2\.BlockedError/),
            })
            deny = false
            const flat = SkillV2.Info.make({
              name: "public",
              description: "Public guidance",
              location: AbsolutePath.make(path.join(tmp.path, "public.md")),
              content: "Public",
            })
            yield* Effect.promise(() =>
              Promise.all([
                fs.writeFile(flat.location, "public"),
                fs.writeFile(path.join(tmp.path, "secret.md"), "secret"),
              ]),
            )
            current = [flat]
            expect(
              yield* executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call", id: "call-flat-skill", name: "skill", input: { name: "public" } },
              }),
            ).toEqual({ type: "text", value: SkillTool.toModelOutput(flat, []) })
          }).pipe(Effect.provide(skillToolLayer))
        }),
      ),
    ),
  )
})

const skillInfo = (name: string, location = path.resolve("skills", name, "SKILL.md")) => SkillV2.Info.make({
  name, description: name, location: AbsolutePath.make(location), content: name,
})

// Only the service boundary is substituted: suggestions use the real rule engine and registry settlement.
const missFixture = (input: {
  skills: SkillV2.Info[]
  rules: PermissionV2.Ruleset
  failure?: string
}) => {
  const evaluations: PermissionV2.AssertInput[] = []
  const sideEffects: string[] = []
  const unexpected = (operation: string) => Effect.sync(() => void sideEffects.push(operation)).pipe(
    Effect.andThen(Effect.die(`Suggestions must not call ${operation}`)),
  )
  return {
    evaluations,
    sideEffects,
    layer: AppNodeBuilder.build(
      LayerNode.group([ToolRegistry.node, ToolRegistry.toolsNode, SkillTool.node]),
      [
        [PermissionV2.node, Layer.succeed(PermissionV2.Service, PermissionV2.Service.of({
          evaluate: (called) => Effect.gen(function* () {
            evaluations.push(called)
            if (called.resources[0] === input.failure)
              return yield* new SessionV2.NotFoundError({ sessionID: called.sessionID })
            return PermissionV2.evaluate(called.action, called.resources[0], input.rules).effect
          }),
          assert: () => unexpected("assert"),
          authorize: () => unexpected("authorize"),
          ask: () => unexpected("ask"),
          askExplicit: () => unexpected("askExplicit"),
          reply: () => unexpected("reply"),
          cancelSession: () => unexpected("cancelSession"),
          get: () => Effect.die("unused permission get"),
          forSession: () => Effect.die("unused permission forSession"),
          list: () => Effect.die("unused permission list"),
        }))],
        [SkillV2.node, Layer.succeed(SkillV2.Service, SkillV2.Service.of({
          list: () => Effect.succeed(input.skills),
          transform: () => Effect.die("unused skill transform"),
          reload: () => Effect.die("unused skill reload"),
          sources: () => Effect.die("unused skill sources"),
          save: () => unexpected("skill.save"),
          remove: () => unexpected("skill.remove"),
        }))],
        [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      ],
    ),
  }
}

const miss = (registry: ToolRegistry.Interface, name = "missing") => executeTool(registry, {
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call", id: `call-missing-${name}`, name: "skill", input: { name } },
})

describe("SkillTool miss policy", () => {
  it.effect("suggests allow and ask roots without authorizing, and rechecks current policy", () => {
    const policy = {
      skills: [skillInfo("allowed"), skillInfo("askable"), skillInfo("denied")],
      rules: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "allowed", effect: "allow" },
        { action: "skill", resource: "askable", effect: "ask" },
      ] satisfies PermissionV2.Ruleset,
    }
    const fixture = missFixture(policy)
    return Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect(yield* miss(registry)).toEqual({
        type: "error", value: "Unable to load skill missing: not found. Available skills: allowed, askable",
      })
      expect(fixture.evaluations).toEqual(policy.skills.map((skill) => ({
        action: "skill", resources: [skill.name], sessionID, agent: toolIdentity.agent,
      })))
      policy.rules.push({ action: "skill", resource: "askable", effect: "deny" })
      expect(yield* miss(registry)).toEqual({
        type: "error", value: "Unable to load skill missing: not found. Available skills: allowed",
      })
      expect(fixture.evaluations).toHaveLength(6)
      expect(fixture.sideEffects).toEqual([])
    }).pipe(Effect.provide(fixture.layer))
  })

  it.effect("uses the visible count for the list threshold even when the full catalog exceeds twenty", () => {
    const fixture = missFixture({
      skills: [skillInfo("visible"), ...Array.from({ length: 25 }, (_, index) => skillInfo(`denied-${index}`))],
      rules: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "visible", effect: "allow" },
      ],
    })
    return Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect(yield* miss(registry)).toEqual({
        type: "error", value: "Unable to load skill missing: not found. Available skills: visible",
      })
      expect(fixture.evaluations).toHaveLength(26)
      expect(fixture.sideEffects).toEqual([])
    }).pipe(Effect.provide(fixture.layer))
  })

  it.effect("excludes denied names from closest ranking and its available count", () => {
    const fixture = missFixture({
      skills: [skillInfo("needle-secret"), skillInfo("needle"),
        ...Array.from({ length: 20 }, (_, index) => skillInfo(`visible-${String(index).padStart(2, "0")}`))],
      rules: [
        { action: "skill", resource: "*", effect: "allow" },
        { action: "skill", resource: "needle-secret", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const result = yield* miss(registry, "needle-secre")
      expect(result).toMatchObject({ type: "error" })
      expect(String(result.value)).toStartWith("Unable to load skill needle-secre: not found. Closest of 21 available skills: needle")
      expect(String(result.value)).not.toContain("needle-secret")
      expect(String(result.value).split(": ").at(-1)?.split(", ")).toHaveLength(5)
      expect(fixture.evaluations).toHaveLength(22)
      expect(fixture.sideEffects).toEqual([])
    }).pipe(Effect.provide(fixture.layer))
  })

  it.effect("reports no available skills when every root is denied", () => {
    const fixture = missFixture({
      skills: [skillInfo("private-alpha"), skillInfo("private-beta")],
      rules: [{ action: "skill", resource: "*", effect: "deny" }],
    })
    return Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect(yield* miss(registry)).toEqual({
        type: "error", value: "Unable to load skill missing: not found, and no skills are available",
      })
      expect(fixture.evaluations).toHaveLength(2)
      expect(fixture.sideEffects).toEqual([])
    }).pipe(Effect.provide(fixture.layer))
  })

  it.effect("does not promote an allowed child when its root is denied", () => {
    const fixture = missFixture({
      skills: [skillInfo("denied-root"), skillInfo("allowed-child", path.resolve("skills", "denied-root", "child", "SKILL.md")), skillInfo("public")],
      rules: [
        { action: "skill", resource: "*", effect: "allow" },
        { action: "skill", resource: "denied-root", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect(yield* miss(registry)).toEqual({
        type: "error", value: "Unable to load skill missing: not found. Available skills: public",
      })
      expect(fixture.evaluations.map((input) => input.resources)).toEqual([["denied-root"], ["public"]])
      expect(fixture.sideEffects).toEqual([])
    }).pipe(Effect.provide(fixture.layer))
  })

  it.effect("fails closed with a typed tool failure when policy evaluation fails", () => {
    const fixture = missFixture({
      skills: [skillInfo("visible-before-failure"), skillInfo("policy-fails"), skillInfo("secret-after-failure")],
      rules: [{ action: "skill", resource: "*", effect: "allow" }],
      failure: "policy-fails",
    })
    return Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const result = yield* miss(registry)
      const value = Schema.decodeUnknownSync(Schema.String)(result.value)
      expect(result.type).toBe("error")
      expect(value).toStartWith("Unable to load skill missing: ")
      expect(value).toContain("Session.NotFoundError")
      expect(value).not.toContain("Available skills:")
      expect(value).not.toContain("visible-before-failure")
      expect(value).not.toContain("secret-after-failure")
      expect(fixture.evaluations.map((input) => input.resources)).toEqual([["visible-before-failure"], ["policy-fails"]])
      expect(fixture.sideEffects).toEqual([])
    }).pipe(Effect.provide(fixture.layer))
  })
})
