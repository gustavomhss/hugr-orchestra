import type { ServerApi } from "./server"
import type { SessionCommandInput, SessionCompactInput, SessionPromptInput } from "@/server-api"
import type { SessionCommandOutput, SessionCompactOutput, SessionPromptOutput, SessionShellInput, SessionShellOutput } from "@/v2-wire"

type RequestOptions = NonNullable<Parameters<ServerApi["session"]["prompt"]>[1]>
export type CompatibleSessionApi = Omit<
  ServerApi["session"],
  "prompt" | "command" | "shell" | "compact" | "rename" | "remove" | "move"
> & {
  prompt: (input: SessionPromptInput & PromptExtras, options?: RequestOptions) => Promise<SessionPromptOutput>
  command: (input: SessionCommandInput, options?: RequestOptions) => Promise<SessionCommandOutput>
  shell: (input: SessionShellInput & PromptExtras, options?: RequestOptions) => Promise<SessionShellOutput>
  compact: (input: SessionCompactInput & { model?: PromptExtras["model"] }) => Promise<SessionCompactOutput>
  rename: (input: { sessionID: string; title: string } & DirectoryHint) => ReturnType<ServerApi["session"]["rename"]>
  remove: (input: { sessionID: string } & DirectoryHint) => ReturnType<ServerApi["session"]["remove"]>
  move: (input: { sessionID: string; directory?: string } & DirectoryHint) => ReturnType<ServerApi["session"]["move"]>
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
type PromptExtras = {
  agent?: string
  model?: { providerID: string; modelID: string }
  variant?: string
  // Per-message system instructions the draft carries; the prompt route does not forward them.
  system?: string
}
type DirectoryHint = { directory?: string }
type CompatibleInput = {
  current: ServerApi
  directory?: string
}

export function createCompatibleApi(input: CompatibleInput): CompatibleApi {
  // The server has no project lookup route; its location answer carries the resolved project.
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
