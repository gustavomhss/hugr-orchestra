import type { OpenCodeEvent } from "@/v2-legacy"
import type { ServerCurrentEvent } from "./server-sdk"

type NativeEvent = {
  id: string
  type: string
  metadata?: Record<string, unknown>
  location?: unknown
  durable?: unknown
  data: Record<string, unknown>
}

/**
 * Translates the Orchestra V2 `session.next.*` stream into the bundled client's session events, which the
 * timeline reducer consumes. Text and reasoning parts carry stable IDs on V2 but positional ordinals in the
 * bundled contract, so each part ID gets the next ordinal of its kind within its assistant message.
 * Tool success keeps its own decoder in `adaptServerEvent`; events with no bundled counterpart pass through.
 */
export function createNativeEventAdapter() {
  const ordinals = new Map<string, number>()
  const ordinal = (data: Record<string, unknown>, kind: "text" | "reasoning", id: unknown) => {
    const key = `${data.assistantMessageID}\n${kind}\n${id}`
    const known = ordinals.get(key)
    if (known !== undefined) return known
    const prefix = `${data.assistantMessageID}\n${kind}\n`
    const next = Array.from(ordinals.keys()).filter((item) => item.startsWith(prefix)).length
    ordinals.set(key, next)
    return next
  }
  // Parts never stream after their step settles, so a settled message's ordinals can go.
  const forget = (data: Record<string, unknown>) =>
    Array.from(ordinals.keys())
      .filter((item) => item.startsWith(`${data.assistantMessageID}\n`))
      .forEach((item) => ordinals.delete(item))

  return (input: { type: string }): OpenCodeEvent | undefined => {
    if (!input.type.startsWith("session.next.")) return
    const event = input as NativeEvent
    const data = event.data
    const base = { sessionID: data.sessionID }
    const step = { ...base, assistantMessageID: data.assistantMessageID }
    const tool = { ...step, callID: data.callID }
    const translated = (type: string, next: Record<string, unknown>) =>
      ({
        id: event.id,
        type,
        created: data.timestamp,
        metadata: event.metadata,
        location: event.location,
        durable: event.durable,
        data: next,
      }) as unknown as OpenCodeEvent
    const prompt = data.prompt as { text?: string; files?: unknown; agents?: unknown } | undefined

    switch (event.type) {
      case "session.next.agent.switched":
        return translated("session.agent.selected", { ...base, agent: data.agent })
      case "session.next.model.switched":
        return translated("session.model.selected", { ...base, model: data.model })
      case "session.next.moved":
        return translated("session.moved", { ...base, location: data.location, subpath: data.subdirectory })
      case "session.next.prompt.admitted":
        return translated("session.input.admitted", {
          ...base,
          inputID: data.messageID,
          input: {
            type: "user",
            data: { text: prompt?.text ?? "", files: prompt?.files, agents: prompt?.agents },
            delivery: data.delivery,
          },
        })
      // A prompt that skipped admission is hydrated from the message route by the reducer's missing-input path.
      case "session.next.prompted":
        return translated("session.input.promoted", { ...base, inputID: data.messageID })
      case "session.next.synthetic":
        return translated("session.synthetic", { ...base, text: data.text })
      case "session.next.shell.started":
        return translated("session.shell.started", {
          ...base,
          shell: { id: data.callID, status: "running", command: data.command },
        })
      case "session.next.shell.ended": {
        const output = String(data.output ?? "")
        return translated("session.shell.ended", {
          ...base,
          shell: { id: data.callID, status: "exited" },
          output: { output, cursor: output.length, size: output.length, truncated: false },
        })
      }
      case "session.next.step.started":
        return translated("session.step.started", {
          ...step,
          agent: data.agent,
          model: data.model,
          snapshot: data.snapshot,
        })
      case "session.next.step.ended":
        forget(data)
        return translated("session.step.ended", {
          ...step,
          finish: data.finish,
          cost: data.cost,
          tokens: data.tokens,
          snapshot: data.snapshot,
          files: data.files,
        })
      case "session.next.step.failed":
        forget(data)
        return translated("session.step.failed", { ...step, error: data.error })
      case "session.next.text.started":
        return translated("session.text.started", { ...step, ordinal: ordinal(data, "text", data.textID) })
      case "session.next.text.delta":
        return translated("session.text.delta", {
          ...step,
          ordinal: ordinal(data, "text", data.textID),
          delta: data.delta,
        })
      case "session.next.text.ended":
        return translated("session.text.ended", {
          ...step,
          ordinal: ordinal(data, "text", data.textID),
          text: data.text,
        })
      case "session.next.reasoning.started":
        return translated("session.reasoning.started", {
          ...step,
          ordinal: ordinal(data, "reasoning", data.reasoningID),
          state: data.providerMetadata,
        })
      case "session.next.reasoning.delta":
        return translated("session.reasoning.delta", {
          ...step,
          ordinal: ordinal(data, "reasoning", data.reasoningID),
          delta: data.delta,
        })
      case "session.next.reasoning.ended":
        return translated("session.reasoning.ended", {
          ...step,
          ordinal: ordinal(data, "reasoning", data.reasoningID),
          text: data.text,
          state: data.providerMetadata,
        })
      case "session.next.tool.input.started":
        return translated("session.tool.input.started", { ...tool, name: data.name })
      case "session.next.tool.input.delta":
        return translated("session.tool.input.delta", { ...tool, delta: data.delta })
      case "session.next.tool.input.ended":
        return translated("session.tool.input.ended", { ...tool, text: data.text })
      case "session.next.tool.called": {
        const provider = data.provider as { executed?: boolean; metadata?: unknown } | undefined
        return translated("session.tool.called", {
          ...tool,
          input: data.input,
          executed: provider?.executed ?? false,
          state: provider?.metadata,
        })
      }
      case "session.next.tool.progress":
        return translated("session.tool.progress", { ...tool, metadata: data.structured })
      case "session.next.tool.failed": {
        const provider = data.provider as { executed?: boolean; metadata?: unknown } | undefined
        return translated("session.tool.failed", {
          ...tool,
          error: data.error,
          executed: provider?.executed ?? false,
          resultState: provider?.metadata,
        })
      }
      // V2 retries are not tied to an assistant message; the empty ID keeps the reducer a no-op while the
      // status line still shows the retry.
      case "session.next.retried":
        return translated("session.retry.scheduled", {
          ...base,
          assistantMessageID: "",
          attempt: data.attempt,
          at: data.timestamp,
          error: data.error,
        })
      case "session.next.compaction.started":
        return translated("session.compaction.started", {
          ...base,
          reason: data.reason,
          recent: "",
          inputID: data.messageID,
        })
      case "session.next.compaction.delta":
        return translated("session.compaction.delta", { ...base, text: data.text })
      case "session.next.compaction.ended":
        return translated("session.compaction.ended", {
          ...base,
          reason: data.reason,
          text: data.text,
          recent: data.recent,
        })
      case "session.next.revert.staged":
        return translated("session.revert.staged", { ...base, revert: data.revert })
      case "session.next.revert.cleared":
        return translated("session.revert.cleared", base)
      case "session.next.revert.committed":
        return translated("session.revert.committed", { ...base, messageID: data.messageID })
      default:
        return
    }
  }
}

/**
 * Busy or idle from execution events, or from steps on the V2 server, which has no execution events: a step start
 * means busy, and a step that fails or settles without asking for tool results ends the drain.
 */
export function executionStatus(event: ServerCurrentEvent) {
  if (event.type === "session.execution.started" || event.type === "session.step.started") return "busy" as const
  if (
    event.type === "session.execution.succeeded" ||
    event.type === "session.execution.failed" ||
    event.type === "session.execution.interrupted" ||
    event.type === "session.step.failed" ||
    (event.type === "session.step.ended" && event.data.finish !== "tool-calls")
  )
    return "idle" as const
}

/** A session after the V2 server switched its agent or model, which it announces by event, not `session.updated`. */
export function sessionSelection<Info extends { agent?: string; model?: unknown; time: { updated: number } }>(
  info: Info,
  event: ServerCurrentEvent,
): Info | undefined {
  if (event.type === "session.model.selected")
    return { ...info, model: { ...event.data.model }, time: { ...info.time, updated: event.created } }
  if (event.type === "session.agent.selected")
    return { ...info, agent: event.data.agent, time: { ...info.time, updated: event.created } }
}

type Usage = {
  cost?: number
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
}

/**
 * A session's usage totals after an event: `session.usage.updated` carries them; the V2 server sends none, so each
 * settled step adds its own, as the server's projection does. Undefined for any other event.
 */
export function sessionUsage<Info extends Usage>(info: Info, event: ServerCurrentEvent): Info | undefined {
  if (event.type === "session.usage.updated") return { ...info, cost: event.data.cost, tokens: event.data.tokens }
  if (event.type !== "session.step.ended") return
  const step = event.data.tokens
  const tokens = info.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  return {
    ...info,
    cost: (info.cost ?? 0) + event.data.cost,
    tokens: {
      input: tokens.input + step.input,
      output: tokens.output + step.output,
      reasoning: tokens.reasoning + step.reasoning,
      cache: { read: tokens.cache.read + step.cache.read, write: tokens.cache.write + step.cache.write },
    },
  }
}
