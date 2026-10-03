export * as MaestroArsenalTools from "./maestro-arsenal"

import { Effect } from "effect"
import { ToolFailure } from "@opencode-ai/llm"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { MaestroArsenal } from "@opencode-ai/core/tool/maestro-arsenal"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"
import { Tool } from "./tool"
import { Truncate } from "./truncate"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"

export interface Options {
  readonly observeGovernance?: (
    context: Tool.Context,
    operation: "audit" | "usage" | "status",
  ) => Effect.Effect<MaestroArsenal.GovernanceEvidence, ToolFailure>
  readonly beforeExecute?: (context: Tool.Context, name: string, args: unknown) => Effect.Effect<void, ToolFailure>
  readonly afterExecute?: (
    context: Tool.Context,
    name: string,
    args: unknown,
    result: unknown,
  ) => Effect.Effect<void, ToolFailure>
}

/** Invoke in the Instance registry producer before initializing the three tool definitions. */
export const prepare = Effect.gen(function* () {
  const instance = yield* InstanceState.context
  return yield* MaestroArsenal.prepareState(Global.Path.data, instance.project.id)
})

/** Resolve once per native tool set; all three tools share bounded describe receipts. */
export const make = (options: Options = {}) =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const fs = yield* FSUtil.Service
    const truncate = yield* Truncate.Service
    const state = yield* InstanceState.make((instance) =>
      Effect.succeed(
        MaestroArsenal.makeHandlers<Tool.Context>((context) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(context.agentID ?? context.agent)
            const directory = yield* fs
              .realPath(instance.directory)
              .pipe(Effect.mapError(() => new ToolFailure({ message: "Arsenal Instance directory is unavailable." })))
            const data = yield* fs
              .realPath(Global.Path.data)
              .pipe(Effect.map(FSUtil.normalizePath), Effect.mapError(() => new ToolFailure({ message: "Arsenal host data directory is unavailable." })))
            const stateDirectory = yield* MaestroArsenal.fence(
              fs,
              data,
              MaestroArsenal.stateDirectory(data, instance.project.id),
            )
            const ask = (action: string, resources: readonly string[]) =>
              context
                .ask({
                  permission: action,
                  patterns: [...resources],
                  always: [...resources],
                  metadata: { arsenal: true },
                })
                .pipe(Effect.mapError(() => new ToolFailure({ message: "Arsenal permission denied." })))
            const host = {
              directory,
              stateDirectory,
              projectID: instance.project.id,
              nativeMaestro: agent?.id === "maestro" && agent.native === true,
              ask,
            }
            const observe = options.observeGovernance
            const before = options.beforeExecute
            const after = options.afterExecute
            return {
              ...host,
              outputBudget: truncate.limits,
              ...(before ? { beforeExecute: (name: string, args: unknown) => before(context, name, args) } : {}),
              ...(after
                ? { afterExecute: (name: string, args: unknown, result: unknown) => after(context, name, args, result) }
                : {}),
              ...(observe
                ? { observeGovernance: (operation: "audit" | "usage" | "status") => observe(context, operation) }
                : {}),
              authorize: (input: MaestroArsenal.Authorization) =>
                Effect.gen(function* () {
                  yield* MaestroArsenal.authorize(fs, host, input)
                  yield* ArsenalBindings.guard(context, host, input).pipe(Effect.provideService(FSUtil.Service, fs))
                }),
            }
          }),
        ),
      ),
    )

    const catalog = yield* Tool.define(
      MaestroArsenal.names.catalog,
      Effect.succeed({
        description: MaestroArsenal.descriptions.catalog,
        parameters: MaestroArsenal.CatalogInput,
        strictParameters: { group: true, offset: true, limit: true },
        execute: (input: typeof MaestroArsenal.CatalogInput.Type, context) =>
          Effect.gen(function* () {
            const handlers = yield* InstanceState.get(state)
            return {
              title: "Maestro Arsenal catalog",
              metadata: { truncated: false },
              output: yield* handlers.catalog(input, { ...context, agent: context.agentID ?? context.agent }),
            }
          }).pipe(Effect.orDie),
      }),
    )
    const describe = yield* Tool.define(
      MaestroArsenal.names.describe,
      Effect.succeed({
        description: MaestroArsenal.descriptions.describe,
        parameters: MaestroArsenal.DescribeInput,
        strictParameters: { name: true },
        execute: (input: typeof MaestroArsenal.DescribeInput.Type, context) =>
          Effect.gen(function* () {
            const handlers = yield* InstanceState.get(state)
            // A complete bounded JSON descriptor must survive generic text truncation.
            return {
              title: `Arsenal descriptor: ${input.name}`,
              metadata: { truncated: false },
              output: yield* handlers.describe(input, { ...context, agent: context.agentID ?? context.agent }),
            }
          }).pipe(Effect.orDie),
      }),
    )
    const execute = yield* Tool.define(
      MaestroArsenal.names.execute,
      Effect.succeed({
        description: MaestroArsenal.descriptions.execute,
        parameters: MaestroArsenal.ExecuteInput,
        strictParameters: { name: true, arguments: true },
        execute: (input: typeof MaestroArsenal.ExecuteInput.Type, context) =>
          Effect.gen(function* () {
            const handlers = yield* InstanceState.get(state)
            const output = yield* handlers.execute(input, { ...context, agent: context.agentID ?? context.agent })
            const bounded = yield* truncate.output(output)
            return {
              title: `Arsenal: ${input.name}`,
              metadata: {
                truncated: bounded.truncated,
                ...(bounded.truncated ? { outputPath: bounded.outputPath } : {}),
              },
              output: bounded.truncated
                ? JSON.stringify({ truncated: true, outputPath: bounded.outputPath, preview: bounded.content })
                : output,
            }
          }).pipe(Effect.orDie),
      }),
    )
    return [catalog, describe, execute] as const
  })

export const tools = make()
