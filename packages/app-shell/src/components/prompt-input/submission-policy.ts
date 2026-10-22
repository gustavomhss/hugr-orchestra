import { batch, createComputed, createMemo, onCleanup } from "solid-js"
import { pendingSnapshot } from "../draft-subagent-models"
import { sameModelPolicy, type ModelRule, type SubagentModelPolicy } from "../subagent-model-rules"
import type { SessionManagement } from "@/utils/session-management"
import { SessionManagementUnsupported } from "@/utils/session-management-errors"
import type { ServerProtocol } from "@/utils/server-protocol"
import { Worktree } from "@/utils/worktree"
import type { ServerScope } from "@/utils/server-scope"
import type { Message } from "@/v2-wire"

import type { ImageAttachmentPart } from "@/context/prompt"
import { Identifier } from "@/utils/id"
import { blobDataUrl } from "@/utils/draft-store"
import { buildRequestParts } from "./build-request-parts"
import type { AdmissionRequest, FollowupSendInput } from "./submission-types"

export type FailedPolicyWrite = { cause: unknown; version?: number }
type SubmissionManagement = Pick<SessionManagement, "setSubagentModels" | "readSubagentModels"> & {
  waitSubagentModels?: (id: string) => Promise<void>
  subagentModelsWriteVersion?: (id: string) => number
}

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
  management: SubmissionManagement
  legacyWrite: (permission: ModelRule[]) => Promise<unknown>
  admission: { policyWritten?: boolean; legacyOverrideAcknowledged?: boolean; acknowledgedPolicy?: SubagentModelPolicy; failedWrite?: FailedPolicyWrite }
  current: () => boolean
  initialPolicy?: SubagentModelPolicy
  failedMessage: string
}) {
  const expected = { policy: input.admission.acknowledgedPolicy ?? input.initialPolicy }
  const failedWrite = input.admission.failedWrite
  const wait = (signal: AbortSignal, retry?: FailedPolicyWrite) => waitForSubagentPolicy({
    ...input, signal, expected: () => expected.policy, retry,
  })
  return {
    wait,
    acknowledge: (signal: AbortSignal) => acknowledgeDraftPolicy({
      key: input.key,
      current: () => input.current() && !signal.aborted,
      written: () => input.admission.policyWritten === true,
      markWritten: () => { input.admission.policyWritten = true },
      failedMessage: input.failedMessage,
      wait: () => wait(signal),
      beforeWrite: () => wait(signal, failedWrite),
      write: async (policy) => {
        const protocol = await waitForSubmission(input.protocol, signal)
        if (!input.current() || signal.aborted) return policy
        if (protocol === "v2") {
          const write = input.management.setSubagentModels(input.sessionID, policy)
          const version = input.management.subagentModelsWriteVersion?.(input.sessionID)
          const acknowledged = await write.catch((cause: unknown) => {
            input.admission.failedWrite = { cause, version }
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

/** A canonical response is ready only across a stable per-Session SET generation. */
export async function waitForSubagentPolicy(input: {
  sessionID: string
  protocol: Promise<ServerProtocol>
  management: SubmissionManagement
  current: () => boolean
  signal: AbortSignal
  expected?: () => SubagentModelPolicy | undefined
  failedMessage?: string
  retry?: FailedPolicyWrite
}) {
  if (!input.current() || input.signal.aborted) return false
  if ((await waitForSubmission(input.protocol, input.signal)) !== "v2") return input.current() && !input.signal.aborted
  const management = input.management
  if (!management.waitSubagentModels) throw new SessionManagementUnsupported()
  const join = () => waitForSubmission(management.waitSubagentModels!(input.sessionID), input.signal).catch((cause: unknown) => {
    if (!input.retry || input.retry.cause !== cause || input.retry.version === undefined ||
      management.subagentModelsWriteVersion?.(input.sessionID) !== input.retry.version ||
      !input.current() || input.signal.aborted) throw cause
  })
  while (input.current() && !input.signal.aborted) {
    await join()
    if (!input.current() || input.signal.aborted) return false
    const expected = input.expected?.()
    if (!expected) return true
    if (!management.subagentModelsWriteVersion) throw new SessionManagementUnsupported()
    const version = management.subagentModelsWriteVersion(input.sessionID)
    const canonical = await waitForSubmission(management.readSubagentModels(input.sessionID), input.signal)
    await join()
    if (!input.current() || input.signal.aborted) return false
    if (management.subagentModelsWriteVersion(input.sessionID) !== version) continue
    if (!sameModelPolicy(canonical.policy, expected)) throw new Error(input.failedMessage)
    return true
  }
  return false
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
  if (input.request?.admitted) return true
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
  if (cmd && !input.request?.preparation && (input.request?.command || input.sync.data.command.find((item) => item.name === cmd))) {
    if (!(await wait())) return false
    const files = input.request?.command?.files ?? await Promise.all(images.map(async (attachment) => ({
      uri: await blobDataUrl(attachment.blob, attachment.mime), name: attachment.filename,
    })))
    try {
      if (!(await wait())) {
        setIdle()
        return false
      }
      const messageID = input.request?.id ?? input.messageID ?? Identifier.ascending("message")
      const send = (request = input.request, ready = current) => {
        const command = request?.command ?? {
          sessionID: input.draft.sessionID,
          id: request?.id ?? messageID,
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
        }
        if (request) request.command = command
        if (request) setBusy()
        if (!ready()) return Promise.resolve(false)
        return input.api.command(command, { signal: input.signal })
      }
      if (input.dispatch) {
        const sent = await input.dispatch(send)
        if (!sent && current()) setIdle()
        return sent
      }
      setBusy()
      if (!(await wait())) {
        setIdle()
        return false
      }
      await send()
      return true
    } catch (err) {
      setIdle()
      throw err
    }
  }

  const messageID = input.request?.id ?? input.messageID ?? Identifier.ascending("message")
  if (!(await wait())) return false
  const encodedImages = input.request?.preparation ? [] : await Promise.all(
    images.map(async (attachment) => ({
      ...attachment,
      dataUrl: await blobDataUrl(attachment.blob, attachment.mime),
    })),
  )
  if (!(await wait())) return false
  const preparation = input.request?.preparation ?? {
    ...buildRequestParts({
      prompt: input.draft.prompt,
      context: input.draft.context,
      images: encodedImages,
      text,
      sessionID: input.draft.sessionID,
      messageID,
      sessionDirectory: input.draft.sessionDirectory,
    }),
    system: input.draft.system,
  }
  if (input.request) input.request.preparation = preparation
  const prepared = { request: input.request, value: preparation }

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
      message: { ...message, id: prepared.request?.id ?? messageID },
      parts: prepared.value.optimisticParts,
    })

  const remove = () =>
    input.sync.session.optimistic.remove({
      directory: input.draft.sessionDirectory,
      sessionID: input.draft.sessionID,
      messageID: prepared.request?.id ?? messageID,
    })

  batch(() => {
    if (input.pending || input.dispatch) return
    setBusy()
    add()
  })

  try {
    if (!(await wait())) {
      batch(() => {
        setIdle()
        if (current()) remove()
      })
      return false
    }

    const send = (request?: AdmissionRequest, ready = current) => {
      if (request) {
        if (!request.preparation) {
          // A new policy revision is a new action; request and optimistic part IDs move together.
          const requestParts = prepared.value.requestParts.map((part) => ({ ...part, id: Identifier.ascending("part") }))
          request.preparation = {
            requestParts,
            optimisticParts: prepared.value.optimisticParts.map((part, index) => ({ ...part, id: requestParts[index].id, messageID: request.id })),
            system: prepared.value.system,
          }
        }
        prepared.request = request
        prepared.value = request.preparation
        batch(() => {
          if (input.pending) return
          setBusy()
          add()
        })
      }
      if (!ready()) {
        if (current()) batch(() => { setIdle(); remove() })
        return Promise.resolve(false)
      }
      const requestParts = prepared.value.requestParts
      return input.api.prompt({
        sessionID: input.draft.sessionID,
        id: request?.id ?? messageID,
        agent: input.draft.agent,
        model: input.draft.model,
        variant: input.draft.variant,
        system: prepared.value.system,
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
      }, { signal: input.signal })
    }
    if (input.dispatch) {
      const sent = await input.dispatch(send)
      if (!sent && current()) batch(() => { setIdle(); remove() })
      return sent
    }
    await send(input.request)
    return true
  } catch (err) {
    batch(() => {
      setIdle()
      if (current()) remove()
    })
    throw err
  }
}
