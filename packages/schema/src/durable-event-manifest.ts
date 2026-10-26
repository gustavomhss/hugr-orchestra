export * as DurableEventManifest from "./durable-event-manifest"

import { Event } from "./event"
import { MaestroEvent } from "./maestro-event"
import { RelayHook } from "./relay-hook"
import { ResearchEvent } from "./research-event"
import { SessionEvent } from "./session-event"

export const SessionDurable = {
  definitions: Event.durable(SessionEvent.DurableDefinitions),
  schema: SessionEvent.Durable,
} as const

export const Durable = Event.durable([
  ...SessionEvent.DurableDefinitions,
  ...MaestroEvent.Definitions,
  ...MaestroEvent.DurableOnlyDefinitions,
  ...RelayHook.Definitions,
  ...ResearchEvent.Definitions,
])
