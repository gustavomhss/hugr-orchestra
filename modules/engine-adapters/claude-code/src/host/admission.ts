export * as ClaudeHostAdmission from "./admission"

import type { SessionV1 } from "../compat/core-v1-session"
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { marker } from "@/continuity/alias"
import { ClaudeCodeTranscript } from "../transcript"

/**
 * The source of the synthetic text that hands one Relay work package to a workflow-bound Session (engine.ts). Its
 * message is no owner request, but a turn delivers it like one: Claude Code's system prompt is fixed for the query, so
 * the work package's instructions can only arrive as input.
 */
export const WORKFLOW_STEP = "workflow-step"

/** The work package key a part hands over, when it is a workflow step's text. */
export function workflowStep(part: SessionV1.Part) {
  const source = part.type === "text" ? part.metadata?.source : undefined
  return ClaudeCodeTranscript.record(source) && source.type === WORKFLOW_STEP && typeof source.key === "string" ? source.key : undefined
}

/** A message the host delivers like an owner request though it holds none: a Task's return or a workflow step. */
export function handover(part: SessionV1.Part) {
  return marker(part)?.type === "task-return" || workflowStep(part) !== undefined
}

/** A send identity survives control failure and reopening; submission is not acknowledgment. */
export type Input = {
  uuid: NonNullable<SDKUserMessage["uuid"]>
  status: "pending" | "submitted" | "received" | "consumed" | "uncertain"
  inseparable?: string[]
}

export function read(value: unknown): Record<string, Input> {
  return ClaudeCodeTranscript.record(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, input]) =>
          ClaudeCodeTranscript.record(input) &&
          typeof input.uuid === "string" &&
          ["pending", "submitted", "received", "consumed", "uncertain"].includes(String(input.status))
            ? [[id, input as Input]]
            : [],
        ),
      )
    : {}
}

export function remap(value: unknown, ids: ReadonlyMap<string, string>) {
  return Object.fromEntries(
    Object.entries(read(value)).flatMap(([id, input]) =>
      ids.has(id)
        ? [
            [
              ids.get(id)!,
              {
                ...input,
                ...(input.inseparable
                  ? { inseparable: input.inseparable.flatMap((member) => ids.get(member) ?? []) }
                  : {}),
              },
            ],
          ]
        : [],
    ),
  )
}

/** Consumption lists acknowledge a batch, but cannot invent native transcript entries between its users. */
export function acknowledge(
  inputs: Record<string, Input>,
  sends: ReadonlyMap<string, SessionV1.User>,
  receipts: readonly string[],
  echo?: string,
) {
  const batch = receipts.flatMap((uuid) => {
    const user = sends.get(uuid)
    return user && inputs[user.id]?.status !== "consumed" ? [user.id] : []
  })
  const inseparable = batch.length > 1 && batch.some((id) => inputs[id].status !== "received")
  return [...receipts, ...(echo ? [echo] : [])].flatMap((uuid) => {
    const user = sends.get(uuid)
    if (!user) return []
    const input = inputs[user.id]
    input.status = receipts.includes(uuid) || input.status === "consumed" ? "consumed" : "received"
    if (inseparable && batch.includes(user.id)) input.inseparable = batch
    return [user.id]
  })
}

/** One SDK input message. The uuid comes back on Claude Code's replies. */
export function userInput(prompt: string, priority?: "next"): SDKUserMessage {
  return {
    type: "user",
    message: { role: "user", content: prompt },
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    ...(priority ? { priority } : {}),
  }
}

/** The streaming input of one live session: open until the session is released. */
export function inbox(
  submit: (message: SDKUserMessage) => Promise<void> = async () => {},
  cancel: (message: SDKUserMessage) => Promise<void> = async () => {},
) {
  const queue: SDKUserMessage[] = []
  const state: { closed: boolean; wake?: () => void } = { closed: false }
  return {
    push: (message: SDKUserMessage) => {
      if (state.closed) return false
      queue.push(message)
      state.wake?.()
      return true
    },
    end: () => {
      queue.length = 0
      state.closed = true
      state.wake?.()
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
      while (true) {
        const next = queue.shift()
        if (next) {
          await submit(next).catch(async (error: unknown) => {
            await cancel(next)
            throw error
          })
          if (state.closed) {
            await cancel(next)
            return
          }
          yield next
          continue
        }
        if (state.closed) return
        await new Promise<void>((resolve) => {
          state.wake = resolve
        })
        state.wake = undefined
      }
    },
  }
}
