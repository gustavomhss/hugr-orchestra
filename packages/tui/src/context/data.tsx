import type {
  AgentV2Info,
  CommandV2Info,
  IntegrationInfo,
  LocationRef,
  ModelV2Info,
  PermissionSavedInfo,
  PermissionV2Request,
  ProviderV2Info,
  QuestionV2Request,
  ReferenceInfo,
  SessionMessage,
  SessionV2Info,
  SkillV2Info,
  V2Event,
} from "../compat/schema"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { useSDK } from "./sdk"
import { useEvent } from "./event"
import { applyEvent } from "./session-history"
import { createSignal, onCleanup, onMount } from "solid-js"

type LocationData = {
  agent?: AgentV2Info[]
  command?: CommandV2Info[]
  integration?: IntegrationInfo[]
  model?: ModelV2Info[]
  provider?: ProviderV2Info[]
  reference?: ReferenceInfo[]
  skill?: SkillV2Info[]
}

type Data = {
  session: {
    info: Record<string, SessionV2Info>
    message: Record<string, SessionMessage[]>
    permission: Record<string, PermissionV2Request[]>
    question: Record<string, QuestionV2Request[]>
  }
  project: {
    permission: Record<string, PermissionSavedInfo[]>
  }
  location: Record<string, LocationData>
}

function locationKey(location: LocationRef) {
  return JSON.stringify([location.directory, location.workspaceID])
}

function locationQuery(ref?: LocationRef) {
  return ref ? { directory: ref.directory, workspace: ref.workspaceID } : undefined
}

export const { use: useData, provider: DataProvider } = createSimpleContext({
  name: "Data",
  init: () => {
    const [store, setStore] = createStore<Data>({
      session: {
        info: {},
        message: {},
        permission: {},
        question: {},
      },
      project: {
        permission: {},
      },
      location: {},
    })

    const sdk = useSDK()
    const events = useEvent()
    const [defaultLocation, setDefaultLocation] = createSignal<LocationRef>({
      directory: sdk.directory ?? process.cwd(),
    })

    const message = {
      update(sessionID: string, fn: (messages: SessionMessage[]) => void) {
        setStore(
          "session",
          "message",
          produce((draft) => {
            fn((draft[sessionID] ??= []))
          }),
        )
      },
    }

    function handleEvent(event: V2Event) {
      if (event.type.startsWith("session.next.") && "sessionID" in event.data)
        message.update(event.data.sessionID, (draft) => applyEvent(draft, event))
      switch (event.type) {
        case "catalog.updated":
          void Promise.all([
            result.location.model.refresh(event.location),
            result.location.provider.refresh(event.location),
          ])
          break
        case "reference.updated":
          void result.location.reference.refresh()
          break
        case "integration.updated":
          void Promise.all([
            result.location.integration.refresh(event.location),
            result.location.model.refresh(event.location),
            result.location.provider.refresh(event.location),
          ])
          break
      }
    }

    onMount(() => {
      const unsub = events.subscribe((event, metadata) => {
        handleEvent({
          ...event,
          data: event.properties,
          location: { directory: metadata.directory, workspaceID: metadata.workspace },
        } as V2Event)
      })
      onCleanup(unsub)
    })

    const result = {
      session: {
        get(sessionID: string) {
          return store.session.info[sessionID]
        },
        async refresh(sessionID: string) {
          setStore("session", "info", sessionID, (await sdk.api.sessions.get({ sessionID })) as SessionV2Info)
        },
        message: {
          list(sessionID: string) {
            return store.session.message[sessionID]
          },
          async refresh(sessionID: string) {
            const result = await sdk.api.messages.list({ sessionID })
            setStore("session", "message", sessionID, result.data as SessionMessage[])
          },
        },
        permission: {
          list(sessionID: string) {
            return store.session.permission[sessionID]
          },
          async refresh(sessionID: string) {
            const result = await sdk.api.permissions.list({ sessionID })
            setStore("session", "permission", sessionID, result.data as PermissionV2Request[])
          },
        },
        question: {
          list(sessionID: string) {
            return store.session.question[sessionID]
          },
          async refresh(sessionID: string) {
            const result = await sdk.api.questions.list({ sessionID })
            setStore("session", "question", sessionID, result.data as QuestionV2Request[])
          },
        },
      },
      project: {
        permission: {
          list(projectID: string) {
            return store.project.permission[projectID]
          },
          async refresh(projectID: string) {
            const result = await sdk.api.permissions.listSaved({ projectID })
            setStore("project", "permission", projectID, result.data as PermissionSavedInfo[])
          },
        },
      },
      location: {
        default() {
          return defaultLocation()
        },
        async refresh(ref?: LocationRef) {
          const location = await sdk.api.location.get({ location: locationQuery(ref) })
          const key = locationKey(location)
          if (!store.location[key]) setStore("location", key, {})
          if (!ref) setDefaultLocation({ directory: location.directory, workspaceID: location.workspaceID })
        },
        agent: {
          list(location?: LocationRef) {
            return store.location[locationKey(location ?? defaultLocation())]?.agent
          },
          async refresh(ref?: LocationRef) {
            const result = await sdk.api.agents.list({ location: locationQuery(ref) })
            setStore("location", locationKey(result.location), "agent", result.data as AgentV2Info[])
          },
        },
        command: {
          list(location?: LocationRef) {
            return store.location[locationKey(location ?? defaultLocation())]?.command
          },
          async refresh(ref?: LocationRef) {
            const result = await sdk.api.commands.list({ location: locationQuery(ref) })
            setStore("location", locationKey(result.location), "command", result.data as CommandV2Info[])
          },
        },
        integration: {
          list(location?: LocationRef) {
            return store.location[locationKey(location ?? defaultLocation())]?.integration
          },
          async refresh(ref?: LocationRef) {
            const result = await sdk.api.integrations.list({ location: locationQuery(ref) })
            setStore("location", locationKey(result.location), "integration", result.data as IntegrationInfo[])
          },
        },
        model: {
          list(location?: LocationRef) {
            return store.location[locationKey(location ?? defaultLocation())]?.model
          },
          async refresh(ref?: LocationRef) {
            const result = await sdk.api.models.list({ location: locationQuery(ref) })
            setStore("location", locationKey(result.location), "model", result.data as ModelV2Info[])
          },
        },
        provider: {
          list(location?: LocationRef) {
            return store.location[locationKey(location ?? defaultLocation())]?.provider
          },
          async refresh(ref?: LocationRef) {
            const result = await sdk.api.providers.list({ location: locationQuery(ref) })
            setStore("location", locationKey(result.location), "provider", result.data as ProviderV2Info[])
          },
        },
        reference: {
          list(location?: LocationRef) {
            return store.location[locationKey(location ?? defaultLocation())]?.reference
          },
          async refresh(ref?: LocationRef) {
            const result = await sdk.api.references.list({ location: locationQuery(ref) })
            setStore("location", locationKey(result.location), "reference", result.data as ReferenceInfo[])
          },
        },
        skill: {
          list(location?: LocationRef) {
            return store.location[locationKey(location ?? defaultLocation())]?.skill
          },
          async refresh(ref?: LocationRef) {
            const result = await sdk.api.skills.list({ location: locationQuery(ref) })
            setStore("location", locationKey(result.location), "skill", result.data as SkillV2Info[])
          },
        },
      },
    }

    onMount(() => {
      void Promise.allSettled([
        result.location.refresh(),
        result.location.agent.refresh(),
        result.location.integration.refresh(),
        result.location.model.refresh(),
        result.location.provider.refresh(),
        result.location.reference.refresh(),
        result.location.command.refresh(),
        result.location.skill.refresh(),
      ]).then((settled) => {
        for (const failure of settled.filter((item) => item.status === "rejected"))
          console.error("Failed to refresh default location data", failure.reason)
      })
    })

    return result
  },
})
