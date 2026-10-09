import { expect } from "bun:test"
import { Context, Deferred, Duration, Effect, Layer, MutableHashMap, Option, Schema, Scope } from "effect"
import { TestClock } from "effect/testing"
import path from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { PermissionV2 } from "@orchestra/core/permission"
import { PluginV2 } from "@orchestra/core/plugin"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Reference } from "@orchestra/core/reference"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Agent } from "@/agent/agent"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const arsenalIDs = Object.values(MaestroArsenal.names).toSorted()
const identityDenied = "Maestro Arsenal requires native Maestro identity."
const plan = {
  items: [{ id: "AC-1", test: "The production V2 upstream binding uses both actual agent services." }],
  wps: [{ id: "WP-1", covers: ["AC-1"] }],
}
const Catalog = Schema.fromJsonString(
  Schema.Struct({
    capabilities: Schema.Array(Schema.Struct({ name: Schema.String, effects: Schema.Array(Schema.String) })),
    total: Schema.Number,
    next: Schema.NullOr(Schema.Number),
  }),
)

it.live(
  "production Instance lease survives real Location TTL while cached load retains native grants and revocation",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          permission: { "*": "allow" },
          agent: { walt: { mode: "primary", prompt: "unsafe configured fallback" } },
        },
      })
      await using control = await tmpdir({ git: true })
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const locations = yield* LocationServiceMap.Service
          yield* Effect.addFinalizer(() => instances.disposeDirectory(tmp.path))
          const host = yield* productionBinding(tmp.path)
          text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
          expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
          const revoked = yield* host.agents.transform((draft) =>
            draft.update(host.context.agent, (agent) => {
              agent.permissions.push({ action: MaestroArsenal.names.execute, resource: "plan-check", effect: "deny" })
            }),
          )
          const before = yield* host.agents.get(host.context.agent)
          if (!before) throw new Error("Actual upstream projection missing before TTL test")
          const held = locationEntry(locations, host.projected.location)
          const initialLeases = held.refCount
          const heldClosed = yield* Deferred.make<void>()
          yield* Scope.addFinalizer(held.scope, Deferred.succeed(heldClosed, undefined))
          const controlRef = Location.Ref.make({ directory: AbsolutePath.make(control.path), workspaceID: undefined })
          // This is another entry in the same actual production map, without an Instance bootstrap lease.
          yield* Effect.gen(function* () {
            const location = yield* Location.Service
            expect(location.project.id).not.toBe(host.session.projectID)
          }).pipe(Effect.provide(locations.get(controlRef)))
          const idle = locationEntry(locations, controlRef)
          expect(idle.refCount).toBe(0)
          expect(Duration.toMillis(idle.idleTimeToLive)).toBe(60 * 60 * 1000)
          const idleClosed = yield* Deferred.make<void>()
          yield* Scope.addFinalizer(idle.scope, Deferred.succeed(idleClosed, undefined))
          yield* TestClock.adjust("61 minutes")
          yield* Deferred.await(idleClosed).pipe(
            TestClock.withLive,
            Effect.timeoutOrElse({
              duration: "5 seconds",
              orElse: () => Effect.die("PRODUCTION_LOCATION_TTL_CONTROL_DID_NOT_EXPIRE"),
            }),
          )
          expect(idle.scope.state._tag).toBe("Closed")
          const map = locations.rcMap.state
          if (map._tag !== "Open") throw new Error("Actual production Location map closed unexpectedly")
          expect(MutableHashMap.has(map.map, controlRef)).toBe(false)
          // Assert only after the positive expiry control has run, so a missing lease fails on measured lifetime.
          expect(yield* Deferred.isDone(heldClosed)).toBe(false)
          expect(initialLeases).toBe(1)
          expect(locationEntry(locations, host.projected.location)).toBe(held)
          expect(held.refCount).toBe(1)
          expect(yield* instances.load({ directory: tmp.path })).toBe(host.instance)
          const reacquired = yield* Effect.gen(function* () {
            const agents = yield* AgentV2.Service
            const location = yield* Location.Service
            const current = yield* agents.get(host.context.agent)
            if (!current) throw new Error("CACHED_INSTANCE_LOST_UPSTREAM_PROJECTION")
            return { agents, location, current }
          }).pipe(Effect.provide(locations.get(host.projected.location)))
          expect(reacquired.agents).toBe(host.agents)
          expect(reacquired.location).toBe(host.location)
          expect(reacquired.current).toBe(before)
          expect(reacquired.current.system).toBe(host.native.prompt)
          expect(reacquired.current.mode).toBe("subagent")
          expect(reacquired.current.permissions).toEqual([
            ...host.native.permission.map((rule) => ({
              action: rule.permission,
              resource: rule.pattern,
              effect: rule.action,
            })),
            { action: MaestroArsenal.names.execute, resource: "plan-check", effect: "deny" },
          ])
          expectDenied(
            yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }),
            "Arsenal permission denied.",
          )
          yield* revoked.dispose
          expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
          yield* instances.disposeDirectory(tmp.path)
          // Disposal closes the Instance-owned lease; Core still owns the resource's separate idle TTL.
          expect(held.refCount).toBe(0)
        }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
      )
    }),
)

it.live(
  "actual Instance disposal releases its Location lease; reacquisition and reload retain later revocation ordering",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true })
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const locations = yield* LocationServiceMap.Service
          yield* Effect.addFinalizer(() => instances.disposeDirectory(tmp.path))
          const host = yield* productionBinding(tmp.path)
          const held = locationEntry(locations, host.projected.location)
          expect(held.refCount).toBe(1)
          text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
          const revoked = yield* host.agents.transform((draft) =>
            draft.update(host.context.agent, (agent) => {
              agent.permissions.push({ action: MaestroArsenal.names.execute, resource: "plan-check", effect: "deny" })
            }),
          )
          const before = yield* host.agents.get(host.context.agent)
          yield* instances.dispose(host.instance)
          expect(held.refCount).toBe(0)
          const reacquired = yield* instances.load({ directory: tmp.path })
          expect(reacquired).not.toBe(host.instance)
          expect(locationEntry(locations, host.projected.location)).toBe(held)
          expect(held.refCount).toBe(1)
          expect(yield* host.agents.get(host.context.agent)).toBe(before)
          expectDenied(
            yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }),
            "Arsenal permission denied.",
          )
          yield* instances.reload({ directory: tmp.path })
          expect(held.refCount).toBe(1)
          expect(yield* host.agents.get(host.context.agent)).toBe(before)
          yield* host.agents.reload()
          expect((yield* host.agents.get(host.context.agent))?.permissions.at(-1)?.effect).toBe("deny")
          expectDenied(
            yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }),
            "Arsenal permission denied.",
          )
          yield* revoked.dispose
          expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
          yield* instances.disposeDirectory(tmp.path)
          expect(held.refCount).toBe(0)
        }).pipe(Effect.scoped),
      )
    }),
)

it.live(
  "real Instance bootstrap projects native upstream configuration without accepting identity or permission overrides",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          permission: { "*": "allow" },
          agent: {
            walt: {
              name: "Renamed upstream",
              disable: true,
              mode: "primary",
              hidden: true,
              prompt: "forged upstream system",
              description: "forged upstream description",
              permission: { "*": "allow", maestro_arsenal_execute: "allow" },
              model: "requesty/xai/grok-4",
              variant: "native-configured",
              temperature: 0.23,
            },
          },
        },
      })
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const host = yield* productionBinding(tmp.path)
          expect(host.native).toMatchObject({ id: "walt", native: true, name: "Renamed upstream", mode: "subagent" })
          expect(host.actualAgentV2).toMatchObject({
            id: "walt",
            system: host.native.prompt,
            description: host.native.description,
            mode: "subagent",
            hidden: false,
            model: { id: "xai/grok-4", providerID: "requesty", variant: "native-configured" },
            request: { headers: {}, body: { temperature: 0.23 } },
          })
          expect(host.actualAgentV2.system).not.toBe("forged upstream system")
          expect(host.actualAgentV2.description).not.toBe("forged upstream description")
          expect(host.actualAgentV2.permissions).toEqual(
            host.native.permission.map((rule) => ({
              action: rule.permission,
              resource: rule.pattern,
              effect: rule.action,
            })),
          )
          expect(
            PermissionV2.evaluate(MaestroArsenal.names.execute, "profile", host.actualAgentV2.permissions).effect,
          ).toBe("deny")
          text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
          expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        }).pipe(Effect.scoped),
      )
    }),
)

it.live(
  "real first bootstrap without agent config populates upstream and reference placement does not reenter native state",
  () =>
    Effect.promise(async () => {
      await using plain = await tmpdir({ git: true })
      await using referenced = await tmpdir({
        git: true,
        config: { references: { docs: "./reference" } },
        init: (directory) => Bun.write(path.join(directory, "reference", "notes.md"), "actual local reference\n"),
      })
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const one = yield* productionBinding(plain.path)
          const two = yield* productionBinding(referenced.path).pipe(
            Effect.timeoutOrElse({
              duration: "15 seconds",
              orElse: () => Effect.die(new Error("UPSTREAM_REFERENCE_BOOT_DEADLOCK")),
            }),
          )
          expect(one.session.projectID).not.toBe(two.session.projectID)
          expect(one.location.workspaceID).toBeUndefined()
          expect(two.location.workspaceID).toBeUndefined()
          expect(one.actualAgentV2.mode).toBe("subagent")
          expect(two.actualAgentV2.permissions).toEqual(
            two.native.permission.map((rule) => ({
              action: rule.permission,
              resource: rule.pattern,
              effect: rule.action,
            })),
          )
          expect(yield* two.references.list()).toMatchObject([
            { name: "docs", path: path.join(referenced.path, "reference") },
          ])
          text(yield* one.invoke(MaestroArsenal.names.catalog, {}))
          text(yield* two.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
          expectPlan(yield* two.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        }).pipe(Effect.scoped),
      )
    }),
)

it.live(
  "real bootstrap/reload keeps the host transform ahead of later revocation and replay reads fresh native model settings",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            walt: {
              name: "Before reload",
              model: "requesty/xai/grok-4",
              variant: "before",
              temperature: 0.19,
            },
          },
        },
      })
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const host = yield* productionBinding(tmp.path)
          text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
          expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
          const revoked = yield* host.agents.transform((draft) =>
            draft.update(host.context.agent, (agent) => {
              agent.permissions.push({ action: MaestroArsenal.names.execute, resource: "plan-check", effect: "deny" })
            }),
          )
          const before = yield* host.agents.get(host.context.agent)
          const instances = yield* InstanceStore.Service
          expect(yield* instances.load({ directory: tmp.path })).toBe(host.instance)
          yield* instances.reload({ directory: tmp.path })
          expect(yield* host.agents.get(host.context.agent)).toBe(before)
          expectDenied(
            yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }),
            "Arsenal permission denied.",
          )
          yield* Effect.promise(() =>
            Bun.write(
              path.join(tmp.path, "orchestra.json"),
              JSON.stringify({
                agent: {
                  walt: {
                    name: "After reload",
                    model: "requesty/xai/grok-4",
                    variant: "after",
                    temperature: 0.44,
                    disable: true,
                    mode: "primary",
                    prompt: "forged after reload",
                    permission: { "*": "allow" },
                  },
                },
              }),
            ),
          )
          const reloaded = yield* instances.reload({ directory: tmp.path })
          expect(reloaded.directory).toBe(host.instance.directory)
          expect(yield* host.agents.get(host.context.agent)).toBe(before)
          yield* host.agents.reload()
          const nativeAgents = yield* Agent.Service
          const native = yield* nativeAgents.get("walt").pipe(Effect.provideService(InstanceRef, reloaded))
          expect(native.name).toBe("After reload")
          const current = yield* host.agents.get(host.context.agent)
          expect(current?.system).toBe(native.prompt)
          expect(current?.mode).toBe("subagent")
          expect(current?.model).toEqual({
            id: ModelV2.ID.make("xai/grok-4"),
            providerID: ProviderV2.ID.make("requesty"),
            variant: ModelV2.VariantID.make("after"),
          })
          expect(current?.request).toEqual({ headers: {}, body: { temperature: 0.44 } })
          expect(current?.permissions).toEqual([
            ...native.permission.map((rule) => ({
              action: rule.permission,
              resource: rule.pattern,
              effect: rule.action,
            })),
            { action: MaestroArsenal.names.execute, resource: "plan-check", effect: "deny" },
          ])
          expectDenied(
            yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }),
            "Arsenal permission denied.",
          )
          yield* revoked.dispose
          expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        }).pipe(Effect.scoped),
      )
    }),
)

it.live("production V2 walt catalogs exactly 13 pure operations and describes/executes plan-check", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { walt: { name: "Renamed upstream" } } } })
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const host = yield* productionBinding(tmp.path)
        expect(host.native).toMatchObject({ id: "walt", name: "Renamed upstream", native: true })
        expect(host.actualAgentV2.id).toBe(AgentV2.ID.make("walt"))
        expect(MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS).toHaveLength(13)
        expect(PermissionV2.evaluate(MaestroArsenal.names.catalog, "*", host.actualAgentV2.permissions).effect).toBe(
          "allow",
        )
        ;[MaestroArsenal.names.describe, MaestroArsenal.names.execute].forEach((action) => {
          expect(
            host.actualAgentV2.permissions
              .filter((rule) => rule.action === action && rule.effect === "allow")
              .map((rule) => rule.resource)
              .toSorted(),
          ).toEqual([...MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS].toSorted())
          expect(PermissionV2.evaluate(action, "profile", host.actualAgentV2.permissions).effect).toBe("deny")
        })
        const first = Schema.decodeUnknownSync(Catalog)(
          text(yield* host.invoke(MaestroArsenal.names.catalog, { limit: 10 })),
        )
        const second = Schema.decodeUnknownSync(Catalog)(
          text(yield* host.invoke(MaestroArsenal.names.catalog, { offset: 10, limit: 10 })),
        )
        expect(first.total).toBe(13)
        expect(first.next).toBe(10)
        expect(second.total).toBe(13)
        expect(second.next).toBeNull()
        const capabilities = [...first.capabilities, ...second.capabilities]
        expect(capabilities.map((item) => item.name).toSorted()).toEqual(
          [...MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS].toSorted(),
        )
        expect(capabilities.every((item) => item.effects.length === 0)).toBe(true)
        const undescribed = yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan })
        expect(undescribed.result.type).toBe("error")
        expect(undescribed.result.value).toContain("Describe this Arsenal capability in the current Session and agent")
        const descriptor = text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
        const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
        expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(descriptor)).toEqual(
          yield* Effect.promise(() => Arsenal.describe("plan-check")),
        )
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
      }).pipe(Effect.scoped),
    )
  }),
)

it.live("production V2 excluded operations fail under exact grants and under general permission allowance", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { permission: { "*": "allow" } } })
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const host = yield* productionBinding(tmp.path)
        text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        yield* Effect.forEach([MaestroArsenal.names.describe, MaestroArsenal.names.execute], (name) =>
          host
            .invoke(name, { name: "profile", arguments: { action: "get" } })
            .pipe(Effect.tap((result) => Effect.sync(() => expectDenied(result, "Arsenal permission denied.")))),
        )
        yield* host.agents.transform((draft) =>
          draft.update(host.context.agent, (agent) => {
            agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
          }),
        )
        const current = yield* host.agents.get(host.context.agent)
        expect(current?.permissions).toEqual([{ action: "*", resource: "*", effect: "allow" }])
        expect(
          Schema.decodeUnknownSync(Catalog)(text(yield* host.invoke(MaestroArsenal.names.catalog, {}))).total,
        ).toBe(13)
        yield* Effect.forEach([MaestroArsenal.names.describe, MaestroArsenal.names.execute], (name) =>
          host
            .invoke(name, { name: "profile", arguments: { action: "get" } })
            .pipe(
              Effect.tap((result) =>
                Effect.sync(() => expectDenied(result, "UPSTREAM_AUTHORING_OPERATION_DENIED: profile")),
              ),
            ),
        )
        expect(yield* host.permissions.list()).toEqual([])
      }).pipe(Effect.scoped),
    )
  }),
)

it.live("production V2 captured materialization rechecks current PermissionV2 after a describe receipt", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const host = yield* productionBinding(tmp.path)
        text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        const request = {
          sessionID: host.session.id,
          agent: host.context.agent,
          action: MaestroArsenal.names.execute,
          resources: ["plan-check"],
        }
        yield* host.permissions.assert(request)
        const revoked = yield* host.agents.transform((draft) =>
          draft.update(host.context.agent, (agent) => {
            agent.permissions.push({ action: MaestroArsenal.names.execute, resource: "plan-check", effect: "deny" })
          }),
        )
        expect(host.materialized.definition(MaestroArsenal.names.execute)?.name).toBe(MaestroArsenal.names.execute)
        expect(yield* host.permissions.assert(request).pipe(Effect.flip)).toBeInstanceOf(PermissionV2.BlockedError)
        expectDenied(
          yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }),
          "Arsenal permission denied.",
        )
        yield* revoked.dispose
        yield* host.permissions.assert(request)
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        expect(yield* host.permissions.list()).toEqual([])
      }).pipe(Effect.scoped),
    )
  }),
)

it.live("production V2 rejects custom label impostors and actual native:false records on all three surfaces", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({
      git: true,
      config: { permission: { "*": "allow" }, agent: { impostor: { name: "walt" } } },
    })
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const host = yield* productionBinding(tmp.path)
        text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        const impostor = yield* productionBinding(tmp.path, "impostor")
        expect(impostor.native).toMatchObject({ id: "impostor", name: "walt", native: false })
        expect(impostor.actualAgentV2.id).toBe(AgentV2.ID.make("impostor"))
        yield* denySurfaces(impostor)
        // Fault the actual Instance-scoped native record, not caller metadata or a replacement service.
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            host.native.native = false
          }),
          () =>
            Effect.sync(() => {
              host.native.native = true
            }),
        )
        yield* denySurfaces(host)
      }).pipe(Effect.scoped),
    )
  }),
)

it.live("production V2 requires native service walt ID even when actual V2 walt and receipt remain valid", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const host = yield* productionBinding(tmp.path)
        text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            host.native.id = "general"
          }),
          () =>
            Effect.sync(() => {
              host.native.id = "walt"
            }),
        )
        const nativeAgents = yield* Agent.Service
        expect(yield* nativeAgents.get("walt").pipe(Effect.provideService(InstanceRef, host.instance))).toMatchObject({
          id: "general",
          native: true,
        })
        expect((yield* host.agents.get(host.context.agent))?.id).toBe(AgentV2.ID.make("walt"))
        yield* host.permissions.assert({
          sessionID: host.session.id,
          agent: host.context.agent,
          action: MaestroArsenal.names.catalog,
          resources: ["*"],
        })
        yield* denySurfaces(host)
      }).pipe(Effect.scoped),
    )
  }),
)

it.live("production V2 requires actual V2 walt ID even when native walt and real permissions remain valid", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const host = yield* productionBinding(tmp.path)
        text(yield* host.invoke(MaestroArsenal.names.describe, { name: "plan-check" }))
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        // Draft.update pins IDs. This scoped fault injects an inconsistent stored result through the real transform.
        const wrong = yield* host.agents.transform((draft) => {
          const agent = draft.get(host.context.agent)
          if (!agent) throw new Error("Actual V2 walt disappeared before the fault")
          Object.assign(agent, { id: AgentV2.ID.make("general") })
        })
        expect((yield* host.agents.get(host.context.agent))?.id).toBe(AgentV2.ID.make("general"))
        expect(host.native).toMatchObject({ id: "walt", native: true })
        yield* host.permissions.assert({
          sessionID: host.session.id,
          agent: host.context.agent,
          action: MaestroArsenal.names.catalog,
          resources: ["*"],
        })
        yield* denySurfaces(host)
        yield* wrong.dispose
        expect((yield* host.agents.get(host.context.agent))?.id).toBe(AgentV2.ID.make("walt"))
        expectPlan(yield* host.invoke(MaestroArsenal.names.execute, { name: "plan-check", arguments: plan }))
        yield* host.agents.transform((draft) => draft.remove(host.context.agent))
        expect(yield* host.agents.get(host.context.agent)).toBeUndefined()
        yield* denySurfaces(host)
      }).pipe(Effect.scoped),
    )
  }),
)

it.live("production V2 keeps actual Location directory and Project mismatches fail closed", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await using other = await tmpdir({ git: true })
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const host = yield* productionBinding(tmp.path)
        const foreign = yield* productionBinding(other.path)
        expect(host.session.projectID).not.toBe(foreign.session.projectID)
        text(yield* host.invoke(MaestroArsenal.names.catalog, {}))
        // Corrupt only the actual cached Location data; preserve its production map and all service dependencies.
        yield* Effect.gen(function* () {
          yield* Effect.acquireRelease(
            Effect.sync(() => Object.assign(host.location, { directory: foreign.location.directory })),
            () => Effect.sync(() => Object.assign(host.location, { directory: host.projected.location.directory })),
          )
          yield* denySurfaces(host, "ARSENAL_SESSION_PLACEMENT_MISMATCH")
        }).pipe(Effect.scoped)
        text(yield* host.invoke(MaestroArsenal.names.catalog, {}))
        yield* Effect.gen(function* () {
          yield* Effect.acquireRelease(
            Effect.sync(() => Object.assign(host.location.project, { id: foreign.location.project.id })),
            () => Effect.sync(() => Object.assign(host.location.project, { id: host.session.projectID })),
          )
          yield* denySurfaces(host, "ARSENAL_SESSION_PLACEMENT_MISMATCH")
        }).pipe(Effect.scoped)
        text(yield* host.invoke(MaestroArsenal.names.catalog, {}))
      }).pipe(Effect.scoped),
    )
  }),
)

// Use the same full AppRuntime and LocationServiceMap as arsenal-bindings.test.ts, with no graph replacements.
const productionBinding = Effect.fn("UpstreamV2BindingTest.productionBinding")(function* (
  directory: string,
  id = "walt",
) {
  const instances = yield* InstanceStore.Service
  const instance = yield* instances.load({ directory })
  const nativeAgents = yield* Agent.Service
  const native = yield* nativeAgents.get(id).pipe(Effect.provideService(InstanceRef, instance))
  const sessions = yield* Session.Service
  const session = yield* sessions
    .create({ title: "production upstream V2 binding", agent: id })
    .pipe(Effect.provideService(InstanceRef, instance))
  const store = yield* SessionStore.Service
  const projected = yield* store.get(session.id)
  if (!projected) throw new Error("Actual upstream Session projection missing")
  const applications = yield* ApplicationTools.Service
  expect([...applications.entries().keys()].filter((name) => arsenalIDs.some((id) => id === name)).toSorted()).toEqual(
    arsenalIDs,
  )
  const locations = yield* LocationServiceMap.Service
  return yield* Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    yield* plugins.wait(PluginV2.ID.make("config-agent"))
    const agents = yield* AgentV2.Service
    const actualAgentV2 = yield* agents.get(AgentV2.ID.make(id))
    if (!actualAgentV2) throw new Error(`Actual V2 agent missing: ${id}`)
    const permissions = yield* PermissionV2.Service
    const references = yield* Reference.Service
    const location = yield* Location.Service
    const registry = yield* ToolRegistry.Service
    const materialized = yield* registry.materialize(actualAgentV2.permissions)
    expect(
      materialized.definitions
        .map((definition) => definition.name)
        .filter((name) => arsenalIDs.some((id) => id === name))
        .toSorted(),
    ).toEqual(arsenalIDs)
    const context = { sessionID: session.id, agent: actualAgentV2.id, assistantMessageID: SessionMessage.ID.create() }
    return {
      instance,
      native,
      session,
      projected,
      location,
      agents,
      actualAgentV2,
      permissions,
      references,
      materialized,
      context,
      invoke: (name: string, input: unknown) =>
        materialized
          .settle({
            ...context,
            call: { type: "tool-call", id: `upstream-v2-${name}`, name, input },
          })
          .pipe(Effect.provide(locations.get(projected.location))),
    }
  }).pipe(Effect.provide(locations.get(projected.location)))
})

const denySurfaces = Effect.fn("UpstreamV2BindingTest.denySurfaces")(function* (
  host: Effect.Success<ReturnType<typeof productionBinding>>,
  message = identityDenied,
) {
  yield* Effect.forEach(
    [
      { name: MaestroArsenal.names.catalog, input: {} },
      { name: MaestroArsenal.names.describe, input: { name: "plan-check" } },
      { name: MaestroArsenal.names.execute, input: { name: "plan-check", arguments: plan } },
    ],
    (call) =>
      host.invoke(call.name, call.input).pipe(Effect.tap((result) => Effect.sync(() => expectDenied(result, message)))),
  )
})

function expectDenied(settlement: ToolRegistry.Settlement, message: string) {
  expect(settlement.result).toEqual({ type: "error", value: message })
}

function text(settlement: ToolRegistry.Settlement) {
  expect(settlement.result.type).toBe("text")
  if (settlement.result.type !== "text")
    throw new Error(`Production Arsenal call failed: ${JSON.stringify(settlement.result)}`)
  expect(settlement.output?.structured).toBe(settlement.result.value)
  return settlement.result.value
}

function expectPlan(settlement: ToolRegistry.Settlement) {
  const envelope = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })) }),
    ),
  )(text(settlement))
  expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text)).toMatchObject({
    ok: true,
    ownership: { "AC-1": ["WP-1"] },
  })
}

function locationEntry(locations: Context.Service.Shape<typeof LocationServiceMap.Service>, ref: Location.Ref) {
  const state = locations.rcMap.state
  if (state._tag !== "Open") throw new Error("Actual production Location map is not open")
  const entry = MutableHashMap.get(state.map, ref)
  if (Option.isNone(entry)) throw new Error("Actual production Location entry missing")
  return entry.value
}
