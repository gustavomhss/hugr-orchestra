export * as SessionNativeTools from "./native-tools"

import { Effect } from "effect"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { Plugin } from "@/plugin"
import { Permission } from "@/permission"
import { ToolRegistry } from "@/tool/registry"
import { MCP } from "@/mcp"
import { Truncate } from "@/tool/truncate"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionTools } from "./tools"

/** Resolve with the captured Session services, then install the single native evidence owner. */
export const resolve = Effect.fn("SessionNativeTools.resolve")(function* (
  input: Omit<Parameters<typeof SessionTools.resolve>[0], "bypassAgentCheck" | "promptOps">,
  services: {
    plugin: Parameters<typeof Plugin.Service.of>[0]
    permission: Parameters<typeof Permission.Service.of>[0]
    registry: Parameters<typeof ToolRegistry.Service.of>[0]
    mcp: Parameters<typeof MCP.Service.of>[0]
    truncate: Parameters<typeof Truncate.Service.of>[0]
    flags: Parameters<typeof RuntimeFlags.Service.of>[0]
    nativeHost: Effect.Success<typeof ArsenalBindings.make>
    promptOps: () => Effect.Effect<Parameters<typeof SessionTools.resolve>[0]["promptOps"]>
  },
) {
  const lastUserMsg = input.messages.findLast((message) => message.info.role === "user")
  const bypassAgentCheck = lastUserMsg?.parts.some((part) => part.type === "agent") ?? false
  const promptOps = yield* services.promptOps()
  const resolved = yield* SessionTools.resolve({ ...input, bypassAgentCheck, promptOps }).pipe(
    Effect.provideService(Plugin.Service, services.plugin),
    Effect.provideService(Permission.Service, services.permission),
    Effect.provideService(ToolRegistry.Service, {
      ...services.registry,
      tools: (request) => services.registry.tools({ ...request, durableSafety: false }),
    }),
    Effect.provideService(MCP.Service, services.mcp),
    Effect.provideService(Truncate.Service, services.truncate),
    Effect.provideService(RuntimeFlags.Service, services.flags),
  )
  return yield* services.nativeHost.wrapTools({
    sessionID: input.session.id,
    assistantMessageID: input.processor.message.id,
    agent: input.agent.id ?? input.agent.name,
    directory: input.session.directory,
    projectID: input.session.projectID,
  }, resolved)
})
