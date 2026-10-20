import type { OrchestraEvent } from "@orchestra/protocol/groups/event"
import type { Stream } from "effect"

export type EventMap = {
  [Item in OrchestraEvent as Item["type"]]: Item
}

export interface Event {
  subscribe<Type extends keyof EventMap>(type: Type): Stream.Stream<EventMap[Type]>
}
