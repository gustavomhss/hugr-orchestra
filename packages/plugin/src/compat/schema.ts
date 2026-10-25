import type { EventManifest } from "@orchestra/schema/event-manifest"
import type { Mcp } from "@orchestra/schema/mcp"
import type { PermissionV1 } from "@orchestra/schema/permission-v1"
import type { QuestionV1 } from "@orchestra/schema/question-v1"
import type { SessionStatusEvent } from "@orchestra/schema/session-status-event"
import type { SessionTodo } from "@orchestra/schema/session-todo"
import type { SessionV1 } from "@orchestra/schema/session-v1"

// Plugins receive and may mutate these values, so the readonly Encoded shapes are opened up.
type Mutable<T> =
  T extends ReadonlyMap<infer K, infer V>
    ? Map<Mutable<K>, Mutable<V>>
    : T extends ReadonlySet<infer V>
      ? Set<Mutable<V>>
      : T extends string | number | boolean | bigint | symbol | Function | null | undefined
        ? T
        : T extends object
          ? { -readonly [K in keyof T]: Mutable<T[K]> }
          : T

export type UserMessage = Mutable<typeof SessionV1.User.Encoded>
export type Message = Mutable<typeof SessionV1.Info.Encoded>
export type Part = Mutable<typeof SessionV1.Part.Encoded>
export type TextPart = Mutable<typeof SessionV1.TextPart.Encoded>
export type FilePart = Mutable<typeof SessionV1.FilePart.Encoded>
export type AgentPart = Mutable<typeof SessionV1.AgentPart.Encoded>
export type Session = Mutable<typeof SessionV1.SessionInfo.Encoded>
export type SessionStatus = Mutable<typeof SessionStatusEvent.Info.Encoded>
export type Todo = Mutable<typeof SessionTodo.Info.Encoded>
export type PermissionRequest = Mutable<typeof PermissionV1.Request.Encoded>
export type QuestionRequest = Mutable<typeof QuestionV1.Request.Encoded>
export type McpStatus = Mutable<typeof Mcp.Status.Encoded>

export type LspStatus = {
  id: string
  name: string
  root: string
  status: "connected" | "error"
}

// The bus delivers every manifest event in the V1 envelope: its data travels as `properties`.
type BusEvent<Definition> = Definition extends {
  readonly type: infer Type extends string
  readonly data: infer Data extends { readonly Encoded: unknown }
}
  ? { id: string; type: Type; properties: Mutable<Data["Encoded"]> }
  : never

export type Event = BusEvent<(typeof EventManifest.Definitions)[number]>
