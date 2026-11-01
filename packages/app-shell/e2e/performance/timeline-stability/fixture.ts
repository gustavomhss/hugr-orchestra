import { base64Encode } from "@orchestra/core/util/encode"
import { Event } from "@orchestra/schema/event"
import { SessionStatusEvent } from "@orchestra/schema/session-status-event"
import type { AssistantMessage, Message, Part, Session, ToolPart, ToolState, UserMessage } from "@/v2-wire"

import { expect, type Page } from "@playwright/test"
import { Schema } from "effect"
import { mockOrchestraServer } from "../../utils/mock-server"
import { installSseTransport } from "../../utils/sse-transport"
import { expectSessionTitle } from "../../utils/waits"

export const directory = "C:/Orchestra/TimelineStability"
export const projectID = "proj_timeline_stability"
export const sessionID = "ses_timeline_stability"
export const userID = "msg_1000_timeline_user"
export const assistantID = "msg_1001_timeline_assistant"
export const title = "Timeline visual stability"
export const model = { providerID: "opencode", modelID: "claude-opus-4-6", variant: "max" }

// V2 history carries no text/reasoning part ids; the app derives them per message, type and ordinal.
export function loadedPartID(messageID: string, type: "text" | "reasoning", ordinal = 0) {
  return `${messageID}:${type}:${ordinal}`
}

// The app consumes the bundled V2 session events; the fixture names their ordinals and call IDs explicitly.
const nativeTypes = [
  "session.step.started",
  "session.step.ended",
  "session.step.failed",
  "session.retry.scheduled",
  "session.text.started",
  "session.text.delta",
  "session.text.ended",
  "session.reasoning.started",
  "session.reasoning.ended",
  "session.tool.input.started",
  "session.tool.called",
  "session.tool.progress",
  "session.tool.success",
  "session.tool.failed",
] as const
type NativePayload = { id: string; type: (typeof nativeTypes)[number]; properties: Record<string, unknown> }

type DeepReadonly<Value> = Value extends readonly unknown[]
  ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value

export type TimelineEvent = DeepReadonly<{
  directory: string
  project?: string
  workspace?: string
  payload: NativePayload
}>
export type EventPayload = TimelineEvent
export type ToolStatus = ToolState["status"]
export type TimelineMessage = { info: UserMessage; parts: Part[] } | { info: AssistantMessage; parts: Part[] }

type UserPart = Extract<Part, { type: "text" | "file" | "agent" | "subtask" }>
type AssistantPart = Exclude<Part, { type: "agent" | "subtask" }>
type OwnedPart<Owner extends Message["role"]> = Owner extends "user" ? UserPart : AssistantPart
export type PartSeed<Owner extends Message["role"]> =
  OwnedPart<Owner> extends infer Candidate
    ? Candidate extends Part
      ? Omit<Candidate, "sessionID" | "messageID">
      : never
    : never

type ToolOptions<State extends ToolStatus> = State extends "pending"
  ? { output?: never; title?: never; metadata?: never; error?: never }
  : State extends "running"
    ? { title?: string; metadata?: Record<string, unknown>; output?: never; error?: never }
    : State extends "error"
      ? { error?: string; metadata?: Record<string, unknown>; output?: never; title?: never }
      : { output?: string; title?: string; metadata?: Record<string, unknown>; error?: never }

const decodeOptions = { errors: "all", onExcessProperty: "error" } as const
const decodeStatus = Schema.decodeUnknownSync(SessionStatusEvent.Info)
const decodeEvent = Schema.decodeUnknownSync(
  Schema.Struct({
    directory: Schema.String,
    payload: Schema.Struct({
      id: Event.ID,
      type: Schema.Literals(nativeTypes),
      properties: Schema.Record(Schema.String, Schema.Unknown),
    }),
  }),
)
let eventSequence = 0
// What the app already holds, so a part snapshot becomes only the V2 events that move it forward.
// V2 addresses text and reasoning by per-message ordinal and tools by call ID; tool call IDs are the part IDs,
// matching the history the mock server serves.
const live = {
  parts: new Map<string, { messageID: string; type: "text" | "reasoning"; ordinal: number }>(),
  ordinals: new Map<string, number>(),
  tools: new Map<string, { status: ToolStatus; input: string; state: string }>(),
}

export async function setupTimeline(
  page: Page,
  input: {
    messages?: TimelineMessage[]
    settings?: Record<string, boolean>
    sessions?: Session[]
    cpuRate?: number
    viewport?: { width: number; height: number }
    eventRetry?: number
    reducedMotion?: boolean
    locale?: string
    deviceScaleFactor?: number
    seedHistory?: boolean
    // Reasoning levels the fixture model offers; none by default, so the composer shows no reasoning select.
    variants?: string[]
    onPrompt?: (input: { sessionID: string; body: unknown }) => void
  } = {},
) {
  const sessions = input.sessions ?? [session()]
  const messages = validateTimelineMessages([
    ...(input.seedHistory ? historyMessages(18) : []),
    ...(input.messages ?? [userMessage(), assistantMessage()]),
  ])
  seedLive(messages)
  const active = messages.findLast((message) => message.info.role === "assistant")
  const initialStatus = decodeStatus(
    active?.info.role === "assistant" && active.info.time.completed === undefined ? { type: "busy" } : { type: "idle" },
    decodeOptions,
  )
  const transport = await installSseTransport<EventPayload>(page, {
    server: `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`,
    retry: input.eventRetry ?? 20,
  })
  await mockOrchestraServer(page, {
    directory,
    project: project(),
    provider: provider(input.variants ?? []),
    sessions,
    sessionStatus: { [sessionID]: initialStatus },
    pageMessages: () => ({
      items: messages,
    }),
    // The fixtures keep a turn's diffs on the user summary; the server serves them per turn.
    diffs: (_, messageID) =>
      messages
        .flatMap((message) => (message.info.role === "user" && message.info.id === messageID ? [message.info] : []))
        .flatMap((info) => info.summary?.diffs ?? [])
        .map((diff) => ({
          path: diff.file,
          status: diff.status ?? "modified",
          additions: diff.additions,
          deletions: diff.deletions,
          patch: diff.patch ?? "",
        })),
    onPrompt: input.onPrompt,
  })
  await page.addInitScript((settings) => {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({
        general: {
          editToolPartsExpanded: false,
          shellToolPartsExpanded: false,
          showReasoningSummaries: false,
          showSessionProgressBar: true,
          ...settings,
        },
      }),
    )
  }, input.settings ?? {})
  if (input.locale) {
    await page.addInitScript((locale) => {
      localStorage.setItem("orchestra.global.dat:language", JSON.stringify({ locale }))
    }, input.locale)
  }
  if (input.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize(input.viewport ?? { width: 1400, height: 900 })
  if (input.deviceScaleFactor) {
    const devtools = await page.context().newCDPSession(page)
    const viewport = input.viewport ?? { width: 1400, height: 900 }
    await devtools.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: input.deviceScaleFactor,
      mobile: false,
    })
  }
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await transport.waitForConnection()
  await expectSessionTitle(page, title)
  if (input.cpuRate && input.cpuRate > 1) {
    const devtools = await page.context().newCDPSession(page)
    await devtools.send("Emulation.setCPUThrottlingRate", { rate: input.cpuRate })
  }

  return {
    transport,
    async send(event: TimelineEvent | readonly TimelineEvent[], delay = 0) {
      for (const item of [event].flat()) {
        const valid = validateTimelineEvent(item)
        await transport.send(valid, { marker: describeEvent(valid) })
      }
      if (delay) await page.waitForTimeout(delay)
    },
    async sendAll(sequence: { event: TimelineEvent | readonly TimelineEvent[]; delay: number }[]) {
      for (const item of sequence) {
        for (const event of [item.event].flat()) {
          const valid = validateTimelineEvent(event)
          await transport.send(valid, { marker: describeEvent(valid) })
        }
        await page.waitForTimeout(item.delay)
      }
    },
    async settle(frames = 3) {
      await page.evaluate(
        (frames) =>
          new Promise<void>((resolve) => {
            let remaining = frames
            const tick = () => {
              remaining--
              if (remaining <= 0) return resolve()
              requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          }),
        frames,
      )
    },
    async waitForPart(partID: string) {
      const part = page.locator(`[data-timeline-part-id="${partID}"]`)
      await expect(part).toHaveCount(1)
      await expect(part).toBeVisible()
    },
  }
}

function describeEvent(event: EventPayload) {
  const properties = event.payload.properties
  if (event.payload.type === "session.retry.scheduled") return `${event.payload.type}:${properties.attempt}`
  if (typeof properties.callID === "string") return `${event.payload.type}:${properties.callID}`
  if (typeof properties.ordinal === "number") return `${event.payload.type}:${properties.ordinal}`
  return event.payload.type
}

function nativeEvent(type: NativePayload["type"], properties: Record<string, unknown>): TimelineEvent {
  return validateTimelineEvent({
    directory,
    payload: { id: `evt_timeline_${String(++eventSequence).padStart(4, "0")}`, type, properties },
  })
}

export function validateTimelineEvent(input: unknown): TimelineEvent {
  return decodeEvent(input, decodeOptions)
}

export function validateTimelineMessages(input: readonly TimelineMessage[]): TimelineMessage[] {
  const messages = [...input]
  const messageIDs = new Set<string>()
  const partIDs = new Set<string>()
  const users = new Set(messages.filter((message) => message.info.role === "user").map((message) => message.info.id))

  messages.forEach((message) => {
    if (messageIDs.has(message.info.id))
      throw new Error(`Timeline fixture has duplicate message ID: ${message.info.id}`)
    messageIDs.add(message.info.id)
    if (message.info.role === "assistant" && !users.has(message.info.parentID))
      throw new Error(`Timeline assistant ${message.info.id} must reference a parent user in the fixture`)
    message.parts.forEach((part) => {
      if (part.sessionID !== message.info.sessionID || part.messageID !== message.info.id)
        throw new Error(`Timeline part ${part.id} ownership does not match message ${message.info.id}`)
      if (message.info.role === "user" && !["text", "file", "agent", "subtask"].includes(part.type))
        throw new Error(`Timeline user message ${message.info.id} cannot own ${part.type} part ${part.id}`)
      if (message.info.role === "assistant" && ["agent", "subtask"].includes(part.type))
        throw new Error(`Timeline assistant message ${message.info.id} cannot own ${part.type} part ${part.id}`)
      if (partIDs.has(part.id)) throw new Error(`Timeline fixture has duplicate part ID: ${part.id}`)
      partIDs.add(part.id)
    })
  })
  return messages
}

export async function waitForVisualSettle(page: Page, selectors: string[], stableFrames = 3) {
  await page.waitForFunction(
    ({ selectors, stableFrames }) => {
      const elements = selectors.map((selector) => document.querySelector<HTMLElement>(selector))
      if (elements.some((element) => !element)) return false
      return new Promise<boolean>((resolve) => {
        let stable = 0
        let previous = ""
        const sample = () => {
          const signature = JSON.stringify(
            elements.map((element) => {
              const rect = element!.getBoundingClientRect()
              return [Math.round(rect.top * 10), Math.round(rect.bottom * 10), Math.round(rect.height * 10)]
            }),
          )
          stable = signature === previous ? stable + 1 : 0
          previous = signature
          const ordered = elements
            .slice(1)
            .every(
              (element, index) =>
                elements[index]!.getBoundingClientRect().bottom <= element!.getBoundingClientRect().top + 0.5,
            )
          if (stable >= stableFrames && ordered) return resolve(true)
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
    },
    { selectors, stableFrames },
  )
}

export function historyMessages(count: number): TimelineMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const value = String(index).padStart(4, "0")
    const historyUserID = `msg_0${value}_history_a_user`
    return [
      userMessage(undefined, { id: historyUserID, created: 1690000000000 + index * 10_000 }),
      assistantMessage(
        [
          {
            id: `prt_0${value}_history_text`,
            type: "text",
            text: `Historical response ${index}. ${"Existing session content keeps the virtual timeline realistic. ".repeat(5)}`,
          },
        ],
        {
          id: `msg_0${value}_history_b_assistant`,
          parentID: historyUserID,
          created: 1690000001000 + index * 10_000,
        },
      ),
    ]
  }).flat()
}

// V2 never sends part snapshots. A snapshot becomes the events that bring the app's copy to it: a new text or
// reasoning part starts at the next ordinal of its message, and a tool walks streaming, running, then a terminal
// state. A running tool's title has no V2 event.
export function partUpdated(part: Part | PartSeed<"assistant">): TimelineEvent[] {
  const messageID = "messageID" in part ? part.messageID : assistantID
  const base = { sessionID, assistantMessageID: messageID }
  if (part.type === "text" || part.type === "reasoning") {
    const known = live.parts.get(part.id)
    const ordinal = known?.ordinal ?? registerPart(part.id, messageID, part.type)
    return [
      ...(known ? [] : [nativeEvent(`session.${part.type}.started`, { ...base, ordinal })]),
      nativeEvent(`session.${part.type}.ended`, { ...base, ordinal, text: part.text }),
    ]
  }
  if (part.type !== "tool") throw new Error(`Timeline fixture cannot stream a ${part.type} part`)
  const previous = live.tools.get(part.id)
  const callID = part.id
  const next = toolEntry(part.state)
  live.tools.set(part.id, next)
  const started = previous ? [] : [nativeEvent("session.tool.input.started", { ...base, callID, name: part.tool })]
  if (part.state.status === "pending") return started
  const terminal = previous?.status === "completed" || previous?.status === "error"
  // A settled tool ignores later results; repeating the same settled state is a no-op, as it is in the reducer.
  if (terminal && previous?.state === next.state) return []
  // tool.called applies in any state: it carries changed running arguments and reruns a settled call in place.
  const called =
    previous === undefined || previous.status === "pending" || terminal || previous.input !== next.input
      ? [nativeEvent("session.tool.called", { ...base, callID, input: part.state.input, executed: false })]
      : []
  if (part.state.status === "running")
    return [
      ...started,
      ...called,
      ...(part.state.metadata && Object.keys(part.state.metadata).length > 0
        ? [nativeEvent("session.tool.progress", { ...base, callID, metadata: part.state.metadata })]
        : []),
    ]
  if (part.state.status === "error")
    return [
      ...started,
      ...called,
      nativeEvent("session.tool.failed", {
        ...base,
        callID,
        error: { type: "ToolError", message: part.state.error },
        metadata: part.state.metadata ?? {},
        executed: false,
      }),
    ]
  return [
    ...started,
    ...called,
    nativeEvent("session.tool.success", {
      ...base,
      callID,
      content: [{ type: "text", text: part.state.output }],
      metadata: part.state.metadata,
      executed: false,
    }),
  ]
}

// V2 text deltas address the assistant message and the text ordinal, not a part ID.
export function partDelta(partID: string, delta: string, messageID = assistantID) {
  const known = live.parts.get(partID)
  if (!known) throw new Error(`Timeline fixture has no streamed text part ${partID}`)
  return nativeEvent("session.text.delta", { sessionID, assistantMessageID: messageID, ordinal: known.ordinal, delta })
}

// The V2 server never sends part snapshots: tool and text progress arrives as native events that rebuild the message.
export function toolCalled(callID: string, input: Record<string, unknown>, messageID = assistantID) {
  return nativeEvent("session.tool.called", {
    sessionID,
    assistantMessageID: messageID,
    callID,
    input,
    executed: false,
  })
}

export function toolSucceeded(
  callID: string,
  output: string,
  metadata: Record<string, unknown> = {},
  messageID = assistantID,
) {
  return nativeEvent("session.tool.success", {
    sessionID,
    assistantMessageID: messageID,
    callID,
    executed: false,
    metadata,
    content: [{ type: "text", text: output }],
  })
}

export function textEnded(text: string, ordinal = 0, messageID = assistantID) {
  return nativeEvent("session.text.ended", { sessionID, assistantMessageID: messageID, ordinal, text })
}

// An assistant snapshot becomes the step event that leads to it: failed with its error, ended once completed, or
// started while it is still open.
export function messageUpdated(info: AssistantMessage) {
  const base = { sessionID, assistantMessageID: info.id }
  if (info.error)
    return nativeEvent("session.step.failed", {
      ...base,
      error: {
        type: info.error.name,
        message: "message" in info.error.data ? info.error.data.message : info.error.name,
      },
    })
  if (info.time.completed !== undefined)
    return nativeEvent("session.step.ended", { ...base, finish: "stop", cost: info.cost, tokens: info.tokens })
  return nativeEvent("session.step.started", {
    ...base,
    agent: info.agent,
    model: { id: info.modelID, providerID: info.providerID },
  })
}

export function status(type: "busy" | "idle" | "retry", attempt = 1, message = "Rate limited") {
  if (type === "busy")
    return nativeEvent("session.step.started", {
      sessionID,
      assistantMessageID: assistantID,
      agent: "build",
      model: { id: "model", providerID: "provider" },
    })
  if (type === "idle")
    return nativeEvent("session.step.ended", {
      sessionID,
      assistantMessageID: assistantID,
      finish: "stop",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    })
  return nativeEvent("session.retry.scheduled", {
    sessionID,
    assistantMessageID: assistantID,
    attempt,
    at: 1700000010000,
    error: { type: "retry", message },
  })
}

export function userMessage(
  parts?: PartSeed<"user">[],
  input: { id?: string; summary?: UserMessage["summary"]; created?: number } = {},
): Extract<TimelineMessage, { info: { role: "user" } }> {
  const id = input.id ?? userID
  const seeds = parts ?? [userText("Build the timeline stability matrix.", { id: `prt_${id}_text` })]
  const message = {
    info: {
      id,
      sessionID,
      role: "user",
      time: { created: input.created ?? 1700000000000 },
      summary: input.summary ?? { diffs: [] },
      agent: "build",
      model,
    },
    parts: seeds.map((part) => ({
      ...part,
      sessionID,
      messageID: id,
    })),
  } satisfies Extract<TimelineMessage, { info: { role: "user" } }>
  return message
}

export function assistantMessage(
  parts: PartSeed<"assistant">[] = [],
  input: {
    id?: string
    parentID?: string
    completed?: boolean
    error?: AssistantMessage["error"]
    created?: number
  } = {},
): Extract<TimelineMessage, { info: { role: "assistant" } }> {
  const id = input.id ?? assistantID
  const message = {
    info: {
      id,
      sessionID,
      role: "assistant",
      time: {
        created: input.created ?? 1700000001000,
        ...(input.completed === false ? {} : { completed: (input.created ?? 1700000001000) + 1_000 }),
      },
      parentID: input.parentID ?? userID,
      modelID: model.modelID,
      providerID: model.providerID,
      mode: "build",
      agent: "build",
      path: { cwd: directory, root: directory },
      cost: 0.01,
      tokens: { input: 100, output: 200, reasoning: 0, cache: { read: 0, write: 0 } },
      variant: "max",
      ...(input.error ? { error: input.error } : {}),
    },
    parts: parts.map((part) => ({ ...part, sessionID, messageID: id })),
  } satisfies Extract<TimelineMessage, { info: { role: "assistant" } }>
  return message
}

export function userText(
  text: string,
  input: Partial<Omit<Extract<PartSeed<"user">, { type: "text" }>, "type" | "text">> = {},
): Extract<PartSeed<"user">, { type: "text" }> {
  return { id: "prt_user_text", type: "text", text, ...input }
}

export function textPart(id: string, text: string): Extract<PartSeed<"assistant">, { type: "text" }> {
  return { id, type: "text", text }
}

export function reasoningPart(id: string, text: string): Extract<PartSeed<"assistant">, { type: "reasoning" }> {
  return { id, type: "reasoning", text, time: { start: 1700000001000 } }
}

export function toolPart(
  id: string,
  tool: string,
  state: "pending",
  input: Record<string, unknown>,
  options?: ToolOptions<"pending">,
): Omit<ToolPart, "sessionID" | "messageID">
export function toolPart(
  id: string,
  tool: string,
  state: "running",
  input: Record<string, unknown>,
  options?: ToolOptions<"running">,
): Omit<ToolPart, "sessionID" | "messageID">
export function toolPart(
  id: string,
  tool: string,
  state: "completed",
  input: Record<string, unknown>,
  options?: ToolOptions<"completed">,
): Omit<ToolPart, "sessionID" | "messageID">
export function toolPart(
  id: string,
  tool: string,
  state: "error",
  input: Record<string, unknown>,
  options?: ToolOptions<"error">,
): Omit<ToolPart, "sessionID" | "messageID">
export function toolPart(
  id: string,
  tool: string,
  state: ToolStatus,
  input: Record<string, unknown>,
  options: ToolOptions<ToolStatus> = {},
): Omit<ToolPart, "sessionID" | "messageID"> {
  const base = { id, type: "tool" as const, callID: `call_${id}`, tool }
  if (state === "pending") return { ...base, state: { status: state, input, raw: "" } }
  if (state === "running")
    return {
      ...base,
      state: {
        status: state,
        input,
        title: options.title,
        metadata: options.metadata ?? {},
        time: { start: 1700000001000 },
      },
    }
  if (state === "error")
    return {
      ...base,
      state: {
        status: state,
        input,
        error: options.error ?? "Tool failed",
        metadata: options.metadata ?? {},
        time: { start: 1700000001000, end: 1700000002000 },
      },
    }
  return {
    ...base,
    state: {
      status: state,
      input,
      output: options.output ?? "Completed",
      title: options.title ?? tool,
      metadata: options.metadata ?? {},
      time: { start: 1700000001000, end: 1700000002000 },
    },
  }
}

export function shell(
  id: string,
  state: ToolStatus,
  output = "",
  command = `echo ${id}`,
): Omit<ToolPart, "sessionID" | "messageID"> {
  if (state === "pending") return toolPart(id, "bash", state, { command })
  if (state === "running")
    return toolPart(id, "bash", state, { command }, { title: command, metadata: { command, output } })
  if (state === "error")
    return toolPart(id, "bash", state, { command }, { error: output || undefined, metadata: { command, output } })
  return toolPart(id, "bash", state, { command }, { title: command, output, metadata: { command, output } })
}

export function completedAssistantInfo(info: AssistantMessage): AssistantMessage {
  return { ...info, time: { ...info.time, completed: 1700000003000 } }
}

export function project() {
  return {
    id: projectID,
    worktree: directory,
    vcs: "git",
    name: "timeline-stability",
    time: { created: 1700000000000, updated: 1700000000000 },
    sandboxes: [],
  }
}

export function session(input: Partial<Session> = {}): Session {
  return {
    id: sessionID,
    slug: "timeline-stability",
    projectID,
    directory,
    title,
    version: "dev",
    time: { created: 1700000000000, updated: 1700000000000 },
    ...input,
  }
}

function seedLive(messages: readonly TimelineMessage[]) {
  live.parts.clear()
  live.ordinals.clear()
  live.tools.clear()
  messages
    .filter((message) => message.info.role === "assistant")
    .flatMap((message) => message.parts)
    .forEach((part) => {
      if (part.type === "text" || part.type === "reasoning") registerPart(part.id, part.messageID, part.type)
      if (part.type === "tool") live.tools.set(part.id, toolEntry(part.state))
    })
}

function toolEntry(state: ToolState) {
  return { status: state.status, input: JSON.stringify(state.input), state: JSON.stringify(state) }
}

function registerPart(partID: string, messageID: string, type: "text" | "reasoning") {
  const key = `${messageID}:${type}`
  const ordinal = live.ordinals.get(key) ?? 0
  live.ordinals.set(key, ordinal + 1)
  live.parts.set(partID, { messageID, type, ordinal })
  return ordinal
}

function provider(variants: string[]) {
  return {
    all: [
      {
        id: "opencode",
        name: "Orchestra",
        models: {
          "claude-opus-4-6": {
            id: "claude-opus-4-6",
            name: "Claude Opus 4.6",
            limit: { context: 200_000 },
            variants: Object.fromEntries(variants.map((variant) => [variant, {}])),
          },
        },
      },
    ],
    connected: ["opencode"],
    default: { providerID: "opencode", modelID: "claude-opus-4-6" },
  }
}
