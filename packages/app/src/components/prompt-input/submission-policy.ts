import { batch, createComputed, createMemo, onCleanup } from "solid-js"
import { pendingSnapshot } from "../draft-subagent-models"
import { sameModelPolicy, type ModelRule, type SubagentModelPolicy } from "../subagent-model-rules"
import type { SessionManagement } from "@/utils/session-management"
import { SessionManagementUnsupported } from "@/utils/session-management-errors"
import type { ServerProtocol } from "@/utils/server-protocol"
import { Worktree } from "@/utils/worktree"
import type { ServerScope } from "@/utils/server-scope"
import type { Message } from "@orchestra/sdk/v2/client"
import type { ImageAttachmentPart } from "@/context/prompt"
import { Identifier } from "@/utils/id"
import { blobDataUrl } from "@/utils/draft-store"
import { buildRequestParts } from "./build-request-parts"
import type { FollowupSendInput } from "./submit"

/** Departure permanently invalidates an attempt, even when its owner later returns. */
export function createSubmissionOwner<T extends Record<string, unknown>>(read: () => T) {
  const identity = createMemo(read, undefined, {
    equals: (left, right) => !!left && Object.keys(right).every((key) => left[key] === right[key]),
  })
  const state = { generation: 0, disposed: false, handoff: undefined as ((next: T) => boolean) | undefined }
  createComputed(() => {
    const next = identity()
    if (!state.handoff?.(next)) state.generation++
    state.handoff = undefined
  })
  onCleanup(() => { state.disposed = true; state.generation++; state.handoff = undefined })
  return {
    capture() {
      const generation = state.generation
      return {
        current: () => !state.disposed && state.generation === generation,
        handoff: (accept?: (next: T) => boolean) => { state.handoff = accept },
      }
    },
    disposed: () => state.disposed,
  }
}

/** Each revision, including same-policy and inheritance ABA, needs its own receipt. */
export async function acknowledgeDraftPolicy(input: {
  key: string
  current: () => boolean
  write: (policy: SubagentModelPolicy) => Promise<SubagentModelPolicy>
  wait: () => Promise<unknown>
  written: () => boolean
  markWritten: () => void
  failedMessage: string
  beforeWrite?: () => Promise<unknown>
}) {
  while (input.current()) {
    const snapshot = pendingSnapshot(input.key)
    await (input.beforeWrite?.() ?? input.wait())
    if (!input.current()) return
    if (pendingSnapshot(input.key).revision !== snapshot.revision) continue
    if (snapshot.revision > 0 || input.written()) {
      input.markWritten()
      const acknowledged = await input.write(snapshot.policy)
      if (!sameModelPolicy(acknowledged, snapshot.policy)) throw new Error(input.failedMessage)
    }
    await input.wait()
    if (!input.current()) return
    if (pendingSnapshot(input.key).revision !== snapshot.revision) continue
    return snapshot
  }
}

/** The actual SDK barrier retains failed writes and follows writes queued behind them. */
export function createSubmissionPolicy(input: {
  key: string
  sessionID: string
  protocol: Promise<ServerProtocol>
  management: Pick<SessionManagement, "setSubagentModels" | "readSubagentModels"> & {
    waitSubagentModels?: (id: string) => Promise<void>
  }
  legacyWrite: (permission: ModelRule[]) => Promise<unknown>
  admission: { policyWritten?: boolean; legacyOverrideAcknowledged?: boolean; acknowledgedPolicy?: SubagentModelPolicy; failedWrite?: { cause: unknown } }
  current: () => boolean
  initialPolicy?: SubagentModelPolicy
  failedMessage: string
}) {
  const expected = { policy: input.admission.acknowledgedPolicy ?? input.initialPolicy }
  const failedWrite = input.admission.failedWrite
  const wait = async (signal: AbortSignal) => {
    if (!input.current() || signal.aborted) return false
    if ((await waitForSubmission(input.protocol, signal)) === "v2") {
      if (!input.management.waitSubagentModels) throw new SessionManagementUnsupported()
      await waitForSubmission(input.management.waitSubagentModels(input.sessionID), signal)
      if (expected.policy) {
        const canonical = await waitForSubmission(input.management.readSubagentModels(input.sessionID), signal)
        if (!sameModelPolicy(canonical.policy, expected.policy)) throw new Error(input.failedMessage)
      }
    }
    return input.current() && !signal.aborted
  }
  return {
    wait,
    acknowledge: (signal: AbortSignal) => acknowledgeDraftPolicy({
      key: input.key,
      current: () => input.current() && !signal.aborted,
      written: () => input.admission.policyWritten === true,
      markWritten: () => { input.admission.policyWritten = true },
      failedMessage: input.failedMessage,
      wait: () => wait(signal),
      beforeWrite: () => wait(signal).catch(async (cause: unknown) => {
        if (!failedWrite || failedWrite.cause !== cause || !input.current() || signal.aborted) throw cause
        const canonical = await waitForSubmission(input.management.readSubagentModels(input.sessionID), signal)
        if (expected.policy && !sameModelPolicy(canonical.policy, expected.policy)) throw new Error(input.failedMessage)
      }),
      write: async (policy) => {
        if ((await waitForSubmission(input.protocol, signal)) === "v2") {
          const acknowledged = await input.management.setSubagentModels(input.sessionID, policy).catch((cause: unknown) => {
            input.admission.failedWrite = { cause }
            throw cause
          })
          if (!sameModelPolicy(acknowledged, policy)) throw new Error(input.failedMessage)
          expected.policy = acknowledged
          input.admission.acknowledgedPolicy = acknowledged
          input.admission.failedWrite = undefined
          return acknowledged
        }
        if (policy.mode === "inherit") {
          if (input.admission.legacyOverrideAcknowledged) throw new SessionManagementUnsupported()
          return policy
        }
        await input.legacyWrite([
          { permission: "task", pattern: "*/*", action: "deny" },
          ...policy.models.map((model): ModelRule => ({ permission: "task", pattern: `${model.providerID}/${model.id}`, action: "allow" })),
        ])
        input.admission.legacyOverrideAcknowledged = true
        return policy
      },
    }),
  }
}

export async function waitForSubmission<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  const cancelled = Promise.withResolvers<never>()
  const abort = () => cancelled.reject(signal.reason)
  signal.addEventListener("abort", abort, { once: true })
  return Promise.race([operation, cancelled.promise]).finally(() => signal.removeEventListener("abort", abort))
}

export async function waitForSubmissionWorktree(input: {
  scope: ServerScope
  directory: string
  signal: AbortSignal
  current: () => boolean
  onWaiting: () => void
  failedMessage: string
}) {
  if (!input.current() || input.signal.aborted) return false
  if (Worktree.get(input.scope, input.directory)?.status !== "pending") return true
  input.onWaiting()
  const timer = { id: undefined as number | undefined }
  const timeout = new Promise<Awaited<ReturnType<typeof Worktree.wait>>>((resolve) => {
    timer.id = window.setTimeout(() => resolve({ status: "failed", message: input.failedMessage }), 5 * 60 * 1000)
  })
  const result = await waitForSubmission(Promise.race([
    Worktree.wait(input.scope, input.directory), timeout,
  ]), input.signal).finally(() => {
    if (timer.id !== undefined) clearTimeout(timer.id)
  })
  if (!input.current() || input.signal.aborted) return false
  if (result.status === "failed") throw new Error(result.message)
  return true
}

/** Prepare attachments between two policy barriers; a successful HTTP admission remains successful after departure. */
export async function sendFollowupRequest(input: FollowupSendInput) {
  const current = () => !input.signal?.aborted && input.runtime?.current() !== false
  if (!current()) return false
  const text = input.draft.prompt.map((part) => ("content" in part ? part.content : "")).join("")
  const images = input.draft.prompt.filter((part): part is ImageAttachmentPart => part.type === "image")
  const setBusy = () => {
    if (!input.optimisticBusy || !current()) return
    input.serverSync.session.set("session_status", input.draft.sessionID, { type: "busy" })
  }

  const setIdle = () => {
    if (!input.optimisticBusy || !current()) return
    input.serverSync.session.set("session_status", input.draft.sessionID, { type: "idle" })
  }

  const wait = async () => {
    if (!current()) return false
    const ok = await input.before?.()
    if (ok === false || !current()) return false
    const ready = await input.runtime?.before(input.signal)
    return ready !== false && current()
  }

  const [head, ...tail] = text.split(" ")
  const cmd = head?.startsWith("/") ? head.slice(1) : undefined
  if (cmd && input.sync.data.command.find((item) => item.name === cmd)) {
    if (!(await wait())) return false
    const files = await Promise.all(images.map(async (attachment) => ({
      uri: await blobDataUrl(attachment.blob, attachment.mime), name: attachment.filename,
    })))
    try {
      if (!(await wait())) {
        setIdle()
        return false
      }
      setBusy()
      const messageID = Identifier.ascending("message")
      await input.api.command(
        {
          sessionID: input.draft.sessionID,
          id: messageID,
          command: cmd,
          arguments: tail.join(" "),
          agent: input.draft.agent,
          model: {
            id: input.draft.model.modelID,
            providerID: input.draft.model.providerID,
            variant: input.draft.variant,
          },
          delivery: input.draft.delivery,
          files,
        },
        { signal: input.signal },
      )
      return true
    } catch (err) {
      setIdle()
      throw err
    }
  }

  const messageID = input.messageID ?? Identifier.ascending("message")
  if (!(await wait())) return false
  const encodedImages = await Promise.all(
    images.map(async (attachment) => ({
      ...attachment,
      dataUrl: await blobDataUrl(attachment.blob, attachment.mime),
    })),
  )
  if (!(await wait())) return false
  const { requestParts, optimisticParts } = buildRequestParts({
    prompt: input.draft.prompt,
    context: input.draft.context,
    images: encodedImages,
    text,
    sessionID: input.draft.sessionID,
    messageID,
    sessionDirectory: input.draft.sessionDirectory,
  })

  const message: Message = {
    id: messageID,
    sessionID: input.draft.sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: input.draft.agent,
    model: { ...input.draft.model, variant: input.draft.variant },
  }

  const add = () =>
    input.sync.session.optimistic.add({
      directory: input.draft.sessionDirectory,
      sessionID: input.draft.sessionID,
      message,
      parts: optimisticParts,
    })

  const remove = () =>
    input.sync.session.optimistic.remove({
      directory: input.draft.sessionDirectory,
      sessionID: input.draft.sessionID,
      messageID,
    })

  batch(() => {
    if (input.pending) return
    setBusy()
    add()
  })

  try {
    if (!(await wait())) {
      batch(() => {
        setIdle()
        remove()
      })
      return false
    }

    await input.api.prompt(
      {
        sessionID: input.draft.sessionID,
        id: messageID,
        agent: input.draft.agent,
        model: input.draft.model,
        variant: input.draft.variant,
        system: input.draft.system,
        delivery: input.draft.delivery,
        legacyParts: requestParts,
        text: requestParts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
        files: requestParts.flatMap((part) => {
          if (part.type !== "file") return []
          const text = part.source?.text
          return [
            {
              uri: part.url,
              name: part.filename,
              mention: text ? { start: text.start, end: text.end, text: text.value } : undefined,
            },
          ]
        }),
        agents: requestParts.flatMap((part) =>
          part.type === "agent"
            ? [
                {
                  name: part.name,
                  mention: part.source
                    ? { start: part.source.start, end: part.source.end, text: part.source.value }
                    : undefined,
                },
              ]
            : [],
        ),
      },
      { signal: input.signal },
    )
    return true
  } catch (err) {
    batch(() => {
      setIdle()
      remove()
    })
    throw err
  }
}
