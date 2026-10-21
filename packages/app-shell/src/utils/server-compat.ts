import type { ServerApi } from "./server"
import type { ServerProtocol } from "./server-protocol"
import type { AgentPartInput, FilePartInput, Session, TextPartInput } from "@/v2-types"
import type {
  Project,
  ProjectCurrent,
  SessionApi,
  SessionCommandInput,
  SessionCommandOutput,
  SessionCompactInput,
  SessionCompactOutput,
  SessionInfo,
  SessionPromptInput,
  SessionPromptOutput,
  SessionShellInput,
  SessionShellOutput,
} from "../compat/vendored-client-promise"

type LegacyFor = (directory?: string) => unknown
type RequestOptions = NonNullable<Parameters<SessionApi["prompt"]>[1]>
type CompatibleSessionApi = Omit<
  SessionApi,
  "prompt" | "command" | "shell" | "compact" | "rename" | "archive" | "remove"
> & {
  prompt: (input: SessionPromptInput & LegacyPrompt, options?: RequestOptions) => Promise<SessionPromptOutput>
  command: (input: SessionCommandInput, options?: RequestOptions) => Promise<SessionCommandOutput>
  shell: (input: SessionShellInput & LegacyPrompt, options?: RequestOptions) => Promise<SessionShellOutput>
  compact: (input: SessionCompactInput & { model?: LegacyPrompt["model"] }) => Promise<SessionCompactOutput>
  rename: (input: Parameters<SessionApi["rename"]>[0] & LegacyLocation) => ReturnType<SessionApi["rename"]>
  // archive: (input: Parameters<SessionApi["archive"]>[0] & LegacyLocation) => ReturnType<SessionApi["archive"]>
  remove: (input: Parameters<SessionApi["remove"]>[0] & LegacyLocation) => ReturnType<SessionApi["remove"]>
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
  legacy?: (directory?: string) => unknown
  directory?: string
}

function mime(uri: string) {
  const match = /^data:([^;,]+)/.exec(uri)
  return match?.[1] ?? "application/octet-stream"
}

function sessionInfo(session: Session): SessionInfo & Pick<Session, "metadata"> & { costAvailable: boolean } {
  return {
    id: session.id,
    parentID: session.parentID,
    projectID: session.projectID,
    agent: session.agent,
    model: session.model && {
      id: session.model.id,
      providerID: session.model.providerID,
      variant: session.model.variant,
    },
    cost: session.cost ?? 0,
    costAvailable: session.cost !== undefined,
    ...(session.metadata === undefined ? {} : { metadata: session.metadata }),
    tokens: session.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: session.time,
    title: session.title,
    location: { directory: session.directory, workspaceID: session.workspaceID },
    subpath: session.path,
    revert: session.revert && {
      messageID: session.revert.messageID,
      partID: session.revert.partID,
      snapshot: session.revert.snapshot,
    },
  }
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
        (current.session.move as (value: unknown, requestOptions?: RequestOptions) => Promise<void>)(
          { sessionID: input.sessionID, location: { directory: input.directory ?? "" } },
          options,
        ),
    },
  } as unknown as CompatibleApi
}

function isMissingRoute(error: unknown) {
  const status =
    error instanceof Error && "cause" in error ? (error.cause as { status?: unknown } | null)?.status : undefined
  return status === 404 || status === 405
}
