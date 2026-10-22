import type { ServerApi } from "./server"
import type { ServerProtocol } from "./server-protocol"
import type { AgentPartInput, FilePartInput, TextPartInput } from "@/v2-types"

import type { SessionCommandInput, SessionCompactInput, SessionPromptInput } from "@/server-api"
import type { SessionCommandOutput, SessionCompactOutput, SessionPromptOutput, SessionShellInput, SessionShellOutput } from "@/v2-wire"

type RequestOptions = NonNullable<Parameters<ServerApi["session"]["prompt"]>[1]>
export type CompatibleSessionApi = Omit<
  ServerApi["session"],
  "prompt" | "command" | "shell" | "compact" | "rename" | "remove" | "move"
> & {
  prompt: (input: SessionPromptInput & LegacyPrompt, options?: RequestOptions) => Promise<SessionPromptOutput>
  command: (input: SessionCommandInput, options?: RequestOptions) => Promise<SessionCommandOutput>
  shell: (input: SessionShellInput & LegacyPrompt, options?: RequestOptions) => Promise<SessionShellOutput>
  compact: (input: SessionCompactInput & { model?: LegacyPrompt["model"] }) => Promise<SessionCompactOutput>
  rename: (input: { sessionID: string; title: string } & LegacyLocation) => ReturnType<ServerApi["session"]["rename"]>
  remove: (input: { sessionID: string } & LegacyLocation) => ReturnType<ServerApi["session"]["remove"]>
  move: (input: { sessionID: string; directory?: string } & LegacyLocation) => ReturnType<ServerApi["session"]["move"]>
}
type CompatiblePermissionApi = Omit<ServerApi["permission"], "reply"> & {
  reply: (
    input: Parameters<ServerApi["permission"]["reply"]>[0] & { location?: { directory?: string } },
  ) => ReturnType<ServerApi["permission"]["reply"]>
}
export type CompatibleApi = Omit<ServerApi, "session" | "permission"> & {
  readonly session: CompatibleSessionApi
  readonly permission: CompatiblePermissionApi
}
type LegacyPrompt = {
  agent?: string
  model?: { providerID: string; modelID: string }
  variant?: string
  // Per-message system instructions; only the V1 prompt contract accepts them.
  system?: string
  legacyParts?: (TextPartInput | FilePartInput | AgentPartInput)[]
}
type LegacyLocation = { directory?: string }
type CompatibleInput = {
  protocol?: Promise<ServerProtocol>
  current: ServerApi
  directory?: string
}

export function createCompatibleApi(input: CompatibleInput): CompatibleApi {
  // The Orchestra V2 server has no project lookup route; its location answer carries the resolved project. A
  // server that answers the lookup keeps it; the first failure switches this API to the location route.
  const fromLocation: ServerApi["project"]["current"] = (value, options) =>
    input.current.location.get(value, options).then((info) => info.project)
  const current: ServerApi = {
    ...input.current,
    project: {
      ...input.current.project,
      current: fromLocation,
    },
  }
  return {
    ...current,
    session: {
      ...current.session,
      move: (input: { sessionID: string; directory?: string }, options?: RequestOptions) =>
        current.session.move({ sessionID: input.sessionID, location: { directory: input.directory ?? "" } }, options),
    },
  } as unknown as CompatibleApi
}
