import type { SessionV1 } from "@orchestra/schema/session-v1"
import type { SessionStatusEvent } from "@orchestra/schema/session-status-event"
import type { Provider } from "../types"
import { createSimpleContext } from "@orchestra/ui/context"
import type { Capability } from "@orchestra/schema/capability"

type Session = typeof SessionV1.SessionInfo.Encoded
type Message = typeof SessionV1.Info.Encoded
type Part = typeof SessionV1.Part.Encoded
type SessionStatus = typeof SessionStatusEvent.Info.Encoded

export type NormalizedProviderListResponse = {
  all: Map<string, Provider>
  defaultModel?: {
    providerID: string
    modelID: string
  } | null
  default: {
    [key: string]: string
  }
  connected: Array<string>
}

type Data = {
  agent?: {
    id?: string
    name: string
    color?: string
  }[]
  provider?: NormalizedProviderListResponse
  session: Session[]
  session_status: {
    [sessionID: string]: SessionStatus
  }
  message: {
    [sessionID: string]: Message[]
  }
  part: {
    [messageID: string]: Part[]
  }
  part_text_accum_delta?: {
    [partID: string]: string
  }
}

export type NavigateToSessionFn = (sessionID: string) => void

export type SessionHrefFn = (sessionID: string) => string

export const { use: useData, provider: DataProvider } = createSimpleContext({
  name: "Data",
  init: (props: {
    data: Data
    directory: string
    sessionID?: string
    onNavigateToSession?: NavigateToSessionFn
    onSessionHref?: SessionHrefFn
    onReadResearchArtifact?: (
      sessionID: string,
      artifact: Capability.ArtifactRef,
      cursor?: string,
      signal?: AbortSignal,
    ) => Promise<unknown>
  }) => {
    return {
      get store() {
        return props.data
      },
      get directory() {
        return props.directory
      },
      get sessionID() {
        return props.sessionID
      },
      navigateToSession: props.onNavigateToSession,
      sessionHref: props.onSessionHref,
      readResearchArtifact: props.onReadResearchArtifact,
    }
  },
})
