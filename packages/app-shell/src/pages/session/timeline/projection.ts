import type { SessionMessageInfo } from "@/session-types"
import type { AssistantMessage, Message, Part, SessionStatus, SnapshotFileDiff, UserMessage } from "@/v2-wire"
import { renderable } from "@orchestra/session-ui/message-part"
import { createMemo, createRoot, mapArray, type Accessor } from "solid-js"
import { reuseTimelineRows } from "./row-reconciliation"
import { Timeline, TimelineRow } from "./rows"

export { reuseTimelineRows } from "./row-reconciliation"

/**
 * Projects the session into timeline rows one turn at a time. Each turn owns a memo, so a streamed token
 * reruns nothing but the checks of the part it landed in: a turn rebuilds only when a part appears or
 * disappears, or when a text part starts or stops being empty.
 */
export function createTimelineProjection(input: {
  messages: Accessor<Message[]>
  userMessages: Accessor<UserMessage[]>
  sessionMessages: Accessor<SessionMessageInfo[]>
  parts: (messageID: string) => Part[]
  status: Accessor<SessionStatus>
  showReasoningSummaries: Accessor<boolean>
  turnDiffs: (userMessageID: string) => SnapshotFileDiff[] | undefined
}) {
  const messageByID = createMemo(() => new Map(input.messages().map((message) => [message.id, message] as const)))
  const assistantMessagesByParent = createMemo(() => {
    const result = new Map<string, AssistantMessage[]>()
    input.messages().forEach((message) => {
      if (message.role !== "assistant") return
      const messages = result.get(message.parentID)
      if (messages) {
        messages.push(message)
        return
      }
      result.set(message.parentID, [message])
    })
    return result
  })
  const sourceByID = createMemo(() => new Map(input.sessionMessages().map((message) => [message.id, message] as const)))
  const turns = createMemo(() =>
    Timeline.constructTurns(
      input.sessionMessages(),
      (messageID) => messageByID().get(messageID) as UserMessage | AssistantMessage | undefined,
      input.userMessages(),
    ),
  )
  const turnByID = createMemo(() => new Map(turns().map((turn) => [turn.user.id, turn] as const)))
  const turnIDs = createMemo(() => turns().map((turn) => turn.user.id), [], { equals: sameItems })
  const activeMessageID = createMemo(() => turnIDs().at(-1))
  const probe = partProbe(input.showReasoningSummaries)
  const turnRows = mapArray(turnIDs, (userMessageID, index) => {
    // Rebuilt on every structural change of the session, so the derived values below compare by content: only a
    // turn whose own messages changed reruns.
    const turn = createMemo(() => turnByID().get(userMessageID), undefined, { equals: sameTurn })
    const sources = createMemo(() => turn()?.assistants.map((message) => sourceByID().get(message.id)) ?? [], [], {
      equals: sameItems,
    })
    const hasPrevious = createMemo(() => index() > 0)
    const active = createMemo(() => activeMessageID() === userMessageID)
    // Only the active turn depends on the status; every other turn builds the same rows under any status.
    const status = createMemo(() => (active() ? input.status().type : "idle"))
    return createMemo((previous: TimelineRow.TimelineRow[] | undefined) => {
      const current = turn()
      if (!current) return previous ?? []
      const orders = new Map(
        sources().flatMap((source) => {
          const order = source && Timeline.contentOrder(source)
          return source && order ? [[source.id, order] as const] : []
        }),
      )
      return reuseTimelineRows(
        previous,
        Timeline.constructMessageRows(
          current.user,
          (messageID) => Timeline.orderParts(input.parts(messageID), orders.get(messageID)),
          current.assistants,
          hasPrevious() ? 1 : 0,
          input.showReasoningSummaries(),
          status(),
          active(),
          input.turnDiffs(userMessageID),
          probe,
        ),
      )
    })
  })
  const rows = createMemo((previous: TimelineRow.TimelineRow[] | undefined) => {
    const next = turnRows().flatMap((turn) => turn())
    return previous?.length === next.length && previous.every((row, index) => row === next[index]) ? previous : next
  })
  const rowByKey = createMemo(() => new Map(rows().map((row) => [TimelineRow.key(row), row] as const)))
  const messageRowIndex = createMemo(() => {
    const result = new Map<string, number>()
    rows().forEach((row, index) => {
      if (!("userMessageID" in row) || result.has(row.userMessageID)) return
      result.set(row.userMessageID, index)
    })
    return result
  })
  const messageLastRowIndex = createMemo(() => {
    const result = new Map<string, number>()
    rows().forEach((row, index) => {
      if ("userMessageID" in row) result.set(row.userMessageID, index)
    })
    return result
  })
  const lastAssistantGroupKey = createMemo(() => {
    const result = new Map<string, string>()
    rows().forEach((row) => {
      if (row._tag === "AssistantPart") result.set(row.userMessageID, row.group.key)
    })
    return result
  })

  return {
    activeMessageID,
    assistantMessagesByParent,
    lastAssistantGroupKey,
    messageByID,
    messageRowIndex,
    messageLastRowIndex,
    rowByKey,
    rows,
  }
}

/**
 * Answers the rows' questions about a part. Text and reasoning change on every streamed token, so each answer lives
 * in a memo of its own: a token reruns that memo and nothing downstream unless the answer flips.
 */
function partProbe(showReasoning: Accessor<boolean>): Timeline.PartProbe {
  const renderables = new WeakMap<Part, Accessor<boolean>>()
  const headings = new WeakMap<Part, Accessor<string | undefined>>()
  return {
    renderable: (part) =>
      part.type === "text" || part.type === "reasoning"
        ? memoized(renderables, part, () => renderable(part, showReasoning()))
        : renderable(part, showReasoning()),
    reasoningHeading: (part) =>
      part.type === "reasoning" ? memoized(headings, part, () => Timeline.partHeading(part)) : undefined,
  }
}

function memoized<T>(cache: WeakMap<Part, Accessor<T>>, part: Part, compute: () => T) {
  const existing = cache.get(part)
  if (existing) return existing()
  // Rooted on its own: it belongs to the part, not to whichever turn first asked.
  const memo = createRoot(() => createMemo(compute))
  cache.set(part, memo)
  return memo()
}

function sameItems<T>(a: readonly T[], b: readonly T[]) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function sameTurn(a: Timeline.Turn | undefined, b: Timeline.Turn | undefined) {
  return a?.user === b?.user && sameItems(a?.assistants ?? [], b?.assistants ?? [])
}
