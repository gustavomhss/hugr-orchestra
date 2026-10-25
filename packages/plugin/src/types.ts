import type { EventManifest } from "@orchestra/schema/event-manifest"
import type { Location } from "@orchestra/schema/location"
import type { Mcp } from "@orchestra/schema/mcp"
import type { Permission } from "@orchestra/schema/permission"
import type { Question } from "@orchestra/schema/question"
import type { Session } from "@orchestra/schema/session"
import type { SessionMessage } from "@orchestra/schema/session-message"
import type { SessionStatusEvent } from "@orchestra/schema/session-status-event"
import type { SessionTodo } from "@orchestra/schema/session-todo"

// Plugins receive and may mutate these values, so the readonly Encoded shapes are opened up.
export type Mutable<T> =
  T extends ReadonlyMap<infer K, infer V>
    ? Map<Mutable<K>, Mutable<V>>
    : T extends ReadonlySet<infer V>
      ? Set<Mutable<V>>
      : T extends string | number | boolean | bigint | symbol | Function | null | undefined
        ? T
        : T extends object
          ? { -readonly [K in keyof T]: Mutable<T[K]> }
          : T

export type SessionInfo = Mutable<typeof Session.Info.Encoded>
export type Message = Mutable<typeof SessionMessage.Message.Encoded>
export type UserMessage = Mutable<typeof SessionMessage.User.Encoded>
export type SessionStatus = Mutable<typeof SessionStatusEvent.Info.Encoded>
export type Todo = Mutable<typeof SessionTodo.Info.Encoded>
export type PermissionRequest = Mutable<typeof Permission.Request.Encoded>
export type QuestionRequest = Mutable<typeof Question.Request.Encoded>
export type McpStatus = Mutable<typeof Mcp.Status.Encoded>

export type LspStatus = {
  id: string
  name: string
  root: string
  status: "connected" | "error"
}

type ManifestEvent<Definition> = Definition extends {
  readonly type: infer Type extends string
  readonly data: infer Data extends { readonly Encoded: unknown }
}
  ? {
      id: string
      type: Type
      data: Mutable<Data["Encoded"]>
      metadata?: Record<string, unknown>
      durable?: { aggregateID: string; seq: number; version: number }
      location?: Mutable<typeof Location.Ref.Encoded>
    }
  : never

/** A V2 stream event: its payload travels as `data`. */
export type Event = ManifestEvent<(typeof EventManifest.Definitions)[number]>
