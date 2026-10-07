export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@orchestra/schema/event"
import { EventManifest } from "@orchestra/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
