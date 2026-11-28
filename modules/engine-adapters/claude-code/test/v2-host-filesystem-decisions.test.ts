import path from "node:path"
import { expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { Project } from "@orchestra/core/project"
import { HostFilesystem } from "./fixture/host-filesystem"

const filesystem = HostFilesystem.make()

for (const order of ["hook-first", "sdk-first"] as const) {
  filesystem.it.live(`${order} uses one immutable target and one external then action ask per toolUseID`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup([
        ...filesystem.allow,
        { action: "external_directory", resource: "*", effect: "ask" },
        { action: "edit", resource: "*", effect: "ask" },
      ])
      const queue = yield* filesystem.requests
      const inputs = [
        Object.freeze(filesystem.fileInput("Write", filesystem.paths.outsideFile)),
        Object.freeze(filesystem.fileInput("Write", filesystem.paths.outsideSecond)),
      ]
      filesystem.state.during = async (options) => {
        for (const [index, args] of inputs.entries())
          await filesystem.gates(options, {
            tool: "Write",
            args,
            id: `ordered-${index}`,
            order,
            effect: filesystem.write(index === 0 ? filesystem.paths.outsideFile : filesystem.paths.outsideSecond),
          })
      }
      const running = yield* filesystem.run.pipe(Effect.forkScoped)
      const permission = yield* PermissionV2.Service
      const actions: string[] = []
      for (const [index, action] of ["external_directory", "edit", "external_directory", "edit"].entries()) {
        const request = yield* filesystem.nextRequest(queue, running)
        actions.push(request.action)
        expect(request.action).toBe(action)
        expect(request.metadata).toMatchObject({ tool: "Write", callID: `ordered-${Math.floor(index / 2)}` })
        expect(request.resources).toEqual([
          action === "external_directory"
            ? filesystem.externalResource
            : index < 2
              ? filesystem.paths.outsideFile.split(path.sep).join("/")
              : filesystem.paths.outsideSecond.split(path.sep).join("/"),
        ])
        yield* permission.reply({ requestID: request.id, reply: "once" })
      }
      yield* Fiber.join(running)
      expect(actions).toEqual(["external_directory", "edit", "external_directory", "edit"])
      expect(filesystem.state.inputs).toHaveLength(2)
      expect(filesystem.state.effects).toBe(2)
      const saved = yield* PermissionSaved.Service
      expect(yield* saved.list({ projectID: Project.ID.global })).toEqual([])
      expect(inputs).toEqual([
        filesystem.fileInput("Write", filesystem.paths.outsideFile),
        filesystem.fileInput("Write", filesystem.paths.outsideSecond),
      ])
    }),
  )
}
filesystem.it.live("an aborted hook decision is retryable with the same immutable target and toolUseID", () =>
  Effect.gen(function* () {
    yield* filesystem.setup([
      ...filesystem.allow,
      { action: "external_directory", resource: "*", effect: "ask" },
      { action: "edit", resource: "*", effect: "ask" },
    ])
    const queue = yield* filesystem.requests
    const cancelled = filesystem.controller()
    const input = Object.freeze(filesystem.fileInput("Write", filesystem.paths.outsideFile))
    filesystem.state.during = async (options) => {
      await filesystem.gates(options, { tool: "Write", args: input, id: "retry-id", signal: cancelled.signal })
      await filesystem.gates(options, {
        tool: "Write",
        args: input,
        id: "retry-id",
        order: "sdk-first",
        effect: filesystem.write(filesystem.paths.outsideFile),
      })
    }
    const running = yield* filesystem.run.pipe(Effect.forkScoped)
    const first = yield* filesystem.nextRequest(queue, running)
    expect(first.action).toBe("external_directory")
    cancelled.abort()
    const permission = yield* PermissionV2.Service
    const retry = yield* filesystem.nextRequest(queue, running)
    expect(retry.id).not.toBe(first.id)
    expect(retry.action).toBe("external_directory")
    expect(retry.metadata).toMatchObject({ callID: "retry-id" })
    yield* permission.reply({ requestID: retry.id, reply: "once" })
    const action = yield* filesystem.nextRequest(queue, running)
    expect(action.action).toBe("edit")
    yield* permission.reply({ requestID: action.id, reply: "once" })
    yield* Fiber.join(running)
    expect(filesystem.state.results.map((result) => result.allow)).toEqual([false, true])
    expect(filesystem.state.results[0].hook).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    })
    expect(filesystem.state.results[0].sdk).toMatchObject({ behavior: "deny" })
    expect(filesystem.state.effects).toBe(1)
    expect(yield* permission.get(first.id)).toBeUndefined()
    expect(input).toEqual(filesystem.fileInput("Write", filesystem.paths.outsideFile))
  }),
)
