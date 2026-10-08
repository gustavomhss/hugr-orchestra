import { describe, expect } from "bun:test"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import type { Tool } from "@orchestra/core/tool/tool"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { Context, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { it } from "./lib/effect"

function host(
  issuer: CapabilityInvocation.HostInput["issuer"] = "core",
  policy: "allow" | "deny" = "allow",
  workspaceID?: WorkspaceID,
) {
  return {
    issuer,
    owner: {
      projectID: Project.ID.make("invocation-project"),
      location: { directory: AbsolutePath.make("/invocation"), workspaceID },
      sessionID: SessionID.make("ses_invocation"),
      agentID: Agent.ID.make("backend"),
    },
    invocation: {
      sessionID: SessionID.make("ses_invocation"),
      agentID: Agent.ID.make("backend"),
      assistantMessageID: SessionMessage.ID.make("msg_invocation"),
      callID: "call-root",
    },
    rootToolName: "service_call",
    effectiveRules: [{ action: "service_call", resource: "*", effect: policy }],
    nativeDenyFloor: [{ action: "host_write", resource: "*", effect: "deny" as const }],
  }
}

const context: Tool.Context = {
  sessionID: host().invocation.sessionID,
  agent: host().invocation.agentID,
  assistantMessageID: host().invocation.assistantMessageID,
  toolCallID: host().invocation.callID,
}
const placement = { projectID: host().owner.projectID, location: host().owner.location }
const read = () => CapabilityInvocation.require(context, placement)

describe("capability invocation host binding", () => {
  it.effect("rejects missing binding and serialized authority claims with bounded typed wire failure", () =>
    Effect.gen(function* () {
      const missing = yield* read().pipe(Effect.flip)
      expect(missing).toBeInstanceOf(Capability.Failure)
      expect(missing.code).toBe("invocation_binding_missing")
      const raw = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(JSON.stringify(host()))
      const extra = { ...context, binding: raw }
      expect((yield* CapabilityInvocation.require(extra, placement).pipe(Effect.flip)).code).toBe(missing.code)
      // Even guessing the Effect key cannot supply the private in-memory frame identity.
      const guessed = Context.Reference<unknown>("@orchestra/core/CapabilityInvocation", {
        defaultValue: () => undefined,
      })
      const forged = yield* read().pipe(Effect.provideService(guessed, raw), Effect.flip)
      expect(forged.code).toBe("invocation_binding_mismatch")
      const wire = yield* Schema.encodeEffect(Capability.Failure)(forged)
      expect(Object.keys(wire).sort()).toEqual(["_tag", "code", "message"])
      expect(new TextEncoder().encode(JSON.stringify(wire)).byteLength).toBeLessThan(256)
      expect(yield* Schema.decodeUnknownEffect(Capability.Failure)(wire)).toBeInstanceOf(Capability.Failure)
    }),
  )

  it.effect("binds all trusted issuer modes without changing success, errors or required services", () =>
    Effect.gen(function* () {
      const Required = Context.Service<string>("invocation-test/Required")
      yield* Effect.forEach(["app", "core", "sdk"] as const, (issuer) =>
        CapabilityInvocation.withContext(host(issuer), read()).pipe(
          Effect.map((binding) => expect(binding).toMatchObject(host(issuer))),
        ),
      )
      const dependent: Effect.Effect<string, Capability.Failure, string> = CapabilityInvocation.withContext(
        host(),
        Required,
      )
      expect(yield* dependent.pipe(Effect.provideService(Required, "service-value"))).toBe("service-value")
      class SourceError extends Schema.TaggedErrorClass<SourceError>()("SourceError", {}) {}
      const source = new SourceError()
      const failed: Effect.Effect<never, SourceError | Capability.Failure> = CapabilityInvocation.withContext(
        host(),
        Effect.fail(source),
      )
      expect(yield* failed.pipe(Effect.flip)).toBe(source)
      expect((yield* read().pipe(Effect.flip)).code).toBe("invocation_binding_missing")
    }),
  )

  const mismatches = [
    ["session", { ...context, sessionID: SessionID.make("ses_other") }, placement],
    ["stable agent", { ...context, agent: Agent.ID.make("general") }, placement],
    ["assistant message", { ...context, assistantMessageID: SessionMessage.ID.make("msg_other") }, placement],
    ["root call", { ...context, toolCallID: "call-root:child:0" }, placement],
    ["project", context, { ...placement, projectID: Project.ID.make("other-project") }],
    ["directory", context, { ...placement, location: { directory: AbsolutePath.make("/other") } }],
    [
      "workspace",
      context,
      { ...placement, location: { ...placement.location, workspaceID: WorkspaceID.make("wrk_other") } },
    ],
  ] as const
  mismatches.forEach(([name, supplied, captured]) =>
    it.effect(`rejects mismatched ${name}`, () =>
      Effect.gen(function* () {
        const failure = yield* CapabilityInvocation.withContext(
          host(),
          CapabilityInvocation.require(supplied, captured),
        ).pipe(Effect.flip)
        expect(failure.code).toBe("invocation_binding_mismatch")
      }),
    ),
  )

  it.effect("rejects explicit workspace omission and change", () =>
    Effect.gen(function* () {
      const input = host()
      input.owner.location.workspaceID = WorkspaceID.make("wrk_issued")
      const ownPlacement = { projectID: input.owner.projectID, location: { ...input.owner.location } }
      expect(
        yield* CapabilityInvocation.withContext(input, CapabilityInvocation.require(context, ownPlacement)),
      ).toMatchObject(input)
      yield* Effect.forEach([undefined, WorkspaceID.make("wrk_other")], (workspaceID) =>
        CapabilityInvocation.withContext(
          input,
          CapabilityInvocation.require(context, {
            ...ownPlacement,
            location: { ...ownPlacement.location, workspaceID },
          }),
        ).pipe(
          Effect.flip,
          Effect.map((failure) => expect(failure.code).toBe("invocation_binding_mismatch")),
        ),
      )
    }),
  )

  it.effect("validates host owner consistency, issuer, root name, existing ID codecs and rules before entry", () =>
    Effect.gen(function* () {
      const invalid = [
        { ...host(), owner: { ...host().owner, sessionID: SessionID.make("ses_other") } },
        { ...host(), owner: { ...host().owner, agentID: Agent.ID.make("general") } },
        { ...host(), rootToolName: "" },
        host(),
        host(),
        host(),
        host(),
      ]
      Reflect.set(invalid[3], "issuer", "http")
      Reflect.set(invalid[4].invocation, "sessionID", "invalid-session")
      Reflect.set(invalid[5].invocation, "assistantMessageID", "invalid-message")
      Reflect.set(invalid[6].effectiveRules[0], "effect", "permit")
      yield* Effect.forEach(invalid, (input) =>
        CapabilityInvocation.withContext(input, Effect.die("invalid host entered body")).pipe(
          Effect.flip,
          Effect.map((failure) => expect(failure.code).toBe("invocation_binding_mismatch")),
        ),
      )
    }),
  )

  it.effect("freezes detached owner, invocation and policy snapshots against caller mutation after entry", () =>
    Effect.gen(function* () {
      const input = host()
      yield* CapabilityInvocation.withContext(
        input,
        Effect.gen(function* () {
          const before = yield* read()
          input.owner.location.directory = AbsolutePath.make("/changed")
          input.owner.projectID = Project.ID.make("changed-project")
          input.owner.agentID = Agent.ID.make("general")
          input.owner.sessionID = SessionID.make("ses_changed")
          input.invocation.callID = "changed-call"
          input.effectiveRules[0].effect = "deny"
          input.effectiveRules.push({ action: "*", resource: "*", effect: "allow" })
          input.nativeDenyFloor.length = 0
          const after = yield* read()
          expect(after).toBe(before)
          expect(after).toMatchObject(host())
          expect(
            [
              after,
              after.owner,
              after.owner.location,
              after.invocation,
              after.effectiveRules,
              after.effectiveRules[0],
              after.nativeDenyFloor,
              after.nativeDenyFloor[0],
            ].every(Object.isFrozen),
          ).toBe(true)
          expect(Reflect.set(after.effectiveRules[0], "effect", "deny")).toBe(false)
        }),
      )
    }),
  )

  it.effect("isolates overlapping same-Location opposite-policy fibers", () =>
    Effect.gen(function* () {
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const run = (input: CapabilityInvocation.HostInput, ready: Deferred.Deferred<void>) =>
        CapabilityInvocation.withContext(
          input,
          Effect.gen(function* () {
            const before = yield* read()
            yield* Deferred.succeed(ready, undefined)
            yield* Deferred.await(release)
            const after = yield* read()
            expect(after).toBe(before)
            return after.effectiveRules[0].effect
          }),
        )
      const a = yield* run(host("app", "allow"), first).pipe(Effect.forkChild)
      const b = yield* run(host("sdk", "deny"), second).pipe(Effect.forkChild)
      yield* Deferred.await(first)
      yield* Deferred.await(second)
      expect((yield* read().pipe(Effect.flip)).code).toBe("invocation_binding_missing")
      yield* Deferred.succeed(release, undefined)
      expect(yield* Fiber.join(a)).toBe("allow")
      expect(yield* Fiber.join(b)).toBe("deny")
    }),
  )

  it.effect("restores nested context after success, error, interruption and finalization", () =>
    Effect.gen(function* () {
      yield* CapabilityInvocation.withContext(
        host("app"),
        Effect.gen(function* () {
          const outer = yield* read()
          expect((yield* CapabilityInvocation.withContext(host("sdk"), read())).issuer).toBe("sdk")
          expect(yield* read()).toBe(outer)
          yield* CapabilityInvocation.withContext(host("sdk"), Effect.fail("nested-error")).pipe(Effect.flip)
          expect(yield* read()).toBe(outer)
          const entered = yield* Deferred.make<void>()
          const finalized = yield* Deferred.make<CapabilityInvocation.Binding>()
          const fiber = yield* CapabilityInvocation.withContext(
            host("sdk", "deny"),
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined)
              yield* Effect.never
            }).pipe(
              Effect.ensuring(
                read().pipe(
                  Effect.orDie,
                  Effect.flatMap((binding) => Deferred.succeed(finalized, binding)),
                ),
              ),
            ),
          ).pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          yield* Fiber.interrupt(fiber)
          expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true)
          expect((yield* Deferred.await(finalized)).issuer).toBe("sdk")
          expect(yield* read()).toBe(outer)
        }),
      )
      expect((yield* read().pipe(Effect.flip)).code).toBe("invocation_binding_missing")
    }),
  )
})
