import type { Message, Session } from "@orchestra/sdk/v2/client"
import { showToast } from "@/utils/toast"
import { base64Encode } from "@orchestra/core/util/encode"
import { Binary } from "@orchestra/core/util/binary"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { batch, startTransition, type Accessor } from "solid-js"
import { useTabs } from "@/context/tabs"
import { useServerSync, type ServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useLocal, type ModelSelection } from "@/context/local"
import { agentKey } from "@/context/agent-identity"
import { usePermission } from "@/context/permission"
import { type ContextItem, type ImageAttachmentPart, type Prompt, type usePrompt } from "@/context/prompt"
import { useSDK, type DirectorySDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform, type Platform } from "@/context/platform"
import { resolveBehaviorSystem } from "@/utils/llm-behaviors-store"
import { clearPending, pendingRules } from "@/components/draft-subagent-models"
import { useSync, type DirectorySync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { buildRequestParts } from "./build-request-parts"
import { setCursorPosition } from "./editor-dom"
import { formatServerError } from "@/utils/server-errors"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { createPromptSubmissionState } from "./submission-state"
import { normalizeSessionInfo } from "@/utils/session"
import { Event } from "@orchestra/schema/event"
import { blobDataUrl } from "@/utils/draft-store"
import { draftSessionKey } from "./draft-session"
import { createCompatibleApi } from "@/utils/server-compat"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>
type Admission = { busy: boolean; directory?: string; session?: Session; rules?: boolean }
const admissions = new WeakMap<PromptTarget, Map<string, Admission>>()

type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
}

const pending = new Map<string, Set<PendingPrompt>>()

export type FollowupDraft = {
  sessionID: string
  sessionDirectory: string
  prompt: Prompt
  context: (ContextItem & { key: string })[]
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
  // Profile LLM behaviors (Orchestra Plugins), resolved when the message is sent; never stored when queued.
  system?: string
  // An explicit V2 delivery mode; omitted, the server steers.
  delivery?: "steer" | "queue"
}

type FollowupSendInput = {
  api: DirectorySDK["api"]["session"]
  serverSync: ServerSync
  sync: DirectorySync
  draft: FollowupDraft
  messageID?: string
  optimisticBusy?: boolean
  // A queued prompt waits server-side until running work would stop; it gets no optimistic sent turn.
  pending?: boolean
  signal?: AbortSignal
  before?: () => Promise<boolean> | boolean
}

// Read the profile's behaviors at send time. Never rejects, and gives up on a slow storage load.
export function followupSystem(platform: Platform, scope: ServerScope, serverSync: ServerSync, directory: string) {
  return resolveBehaviorSystem({ platform, scope, projects: serverSync.data.project, directory }).catch(() => undefined)
}

const draftText = (prompt: Prompt) => prompt.map((part) => ("content" in part ? part.content : "")).join("")

const draftImages = (prompt: Prompt) => prompt.filter((part): part is ImageAttachmentPart => part.type === "image")

export async function sendFollowupDraft(input: FollowupSendInput) {
  if (input.signal?.aborted) return false
  const text = draftText(input.draft.prompt)
  const images = draftImages(input.draft.prompt)
  const setBusy = () => {
    if (!input.optimisticBusy || input.signal?.aborted) return
    input.serverSync.session.set("session_status", input.draft.sessionID, { type: "busy" })
  }

  const setIdle = () => {
    if (!input.optimisticBusy || input.signal?.aborted) return
    input.serverSync.session.set("session_status", input.draft.sessionID, { type: "idle" })
  }

  const wait = async () => {
    const ok = await input.before?.()
    if (ok === false) return false
    return true
  }

  const [head, ...tail] = text.split(" ")
  const cmd = head?.startsWith("/") ? head.slice(1) : undefined
  if (cmd && input.sync.data.command.find((item) => item.name === cmd)) {
    setBusy()
    try {
      if (!(await wait()) || input.signal?.aborted) {
        setIdle()
        return false
      }

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
          files: await Promise.all(
            images.map(async (attachment) => ({
              uri: await blobDataUrl(attachment.blob, attachment.mime),
              name: attachment.filename,
            })),
          ),
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
  const encodedImages = await Promise.all(
    images.map(async (attachment) => ({
      ...attachment,
      dataUrl: await blobDataUrl(attachment.blob, attachment.mime),
    })),
  )
  if (input.signal?.aborted) return false
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
    if (!(await wait()) || input.signal?.aborted) {
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

// Shared by the composer and evidence replay: every shell run gets a new event ID, and
// the request carries no workdir, so callers must only replay in the session directory.
export function submitShellCommand(input: {
  api: DirectorySDK["api"]["session"]
  sessionID: string
  command: string
  agent: string
  model: { providerID: string; modelID: string }
}) {
  return input.api.shell({
    sessionID: input.sessionID,
    id: Event.ID.create(),
    command: input.command,
    agent: input.agent,
    model: input.model,
  })
}

type PromptSubmitInput = {
  prompt: ReturnType<typeof usePrompt>
  info: Accessor<{ id: string } | undefined>
  imageAttachments: Accessor<ImageAttachmentPart[]>
  commentCount: Accessor<number>
  autoAccept: Accessor<boolean>
  mode: Accessor<"normal" | "shell">
  working: Accessor<boolean>
  editor: () => HTMLDivElement | undefined
  queueScroll: () => void
  promptLength: (prompt: Prompt) => number
  addToHistory: (prompt: Prompt, mode: "normal" | "shell") => void
  resetHistoryNavigation: () => void
  setMode: (mode: "normal" | "shell") => void
  setPopover: (popover: "at" | "slash" | null) => void
  newSessionWorktree?: Accessor<string | undefined>
  pendingKey?: Accessor<string>
  onNewSessionWorktreeReset?: () => void
  shouldQueue?: Accessor<boolean>
  onQueue?: (draft: FollowupDraft) => void
  onAbort?: () => void
  onSubmit?: () => void
  model?: ModelSelection
  delivery?: Accessor<"steer" | "queue" | undefined>
}

export function createPromptSubmit(input: PromptSubmitInput) {
  const navigate = useNavigate()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const local = useLocal()
  const platform = usePlatform()
  const permission = usePermission()
  const prompt = input.prompt
  const layout = useLayout()
  const language = useLanguage()
  const params = useParams()
  const [search] = useSearchParams<{ draftId?: string }>()
  const tabs = useTabs()

  const errorMessage = (err: unknown) => {
    if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message
    if (err && typeof err === "object" && "data" in err) {
      const data = (err as { data?: { message?: string } }).data
      if (data?.message) return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  const abort = async () => {
    const sessionID = params.id
    if (!sessionID) return Promise.resolve()
    const source = sdk()
    const serverState = serverSync()

    serverState.session.set("todo", sessionID, [])

    input.onAbort?.()

    const key = ScopedKey.from(source.scope, sessionID)
    const queued = pending.get(key)
    if (queued) {
      pending.delete(key)
      serverState.session.set("session_status", sessionID, { type: "idle" })
      ;[...queued].reverse().forEach((job) => {
        job.abort.abort()
        job.cleanup()
      })
    }
    return source.api.session.interrupt({ sessionID }).catch(() => {})
  }

  const seed = (state: ServerSync, dir: string, info: Session) => {
    state.session.remember(info)
    const [, setStore] = state.child(dir)
    setStore("session", (list: Session[]) => {
      const result = Binary.search(list, info.id, (item) => item.id)
      const next = [...list]
      if (result.found) {
        next[result.index] = info
        return next
      }
      next.splice(result.index, 0, info)
      return next
    })
  }

  const submit = async (target: PromptTarget, admission: Admission) => {
    const submission = createPromptSubmissionState({
      target,
      prompt: target.current(),
      context: target.context.items().slice(),
    })
    const currentPrompt = submission.prompt
    const context = submission.context
    const text = currentPrompt.map((part) => ("content" in part ? part.content : "")).join("")
    const images = input.imageAttachments().slice()
    const mode = input.mode()

    if (text.trim().length === 0 && images.length === 0 && input.commentCount() === 0) {
      if (input.working()) void abort()
      return
    }

    const modelSelection = input.model ?? local.model
    const currentModel = modelSelection.current()
    const currentAgent = local.agent.current()
    const variant = modelSelection.variant.current()
    if (!currentModel || !currentAgent) {
      showToast({
        title: language.t("prompt.toast.modelRequired.title"),
        description: language.t("prompt.toast.modelRequired.description"),
      })
      return
    }

    input.addToHistory(currentPrompt, mode)
    input.resetHistoryNavigation()

    const directorySDK = sdk()
    const server = serverSDK()
    const serverState = serverSync()
    const syncState = sync()
    const projectDirectory = directorySDK.directory
    const permissionState = permission.currentServerState()
    const isNewSession = !params.id
    const draftID = search.draftId
    const draftServer = draftID ? tabs.draft(draftID).server : undefined
    const ownsDraft = () =>
      !draftID ||
      (search.draftId === draftID &&
        !params.id &&
        sdk().scope === directorySDK.scope &&
        sdk().directory === projectDirectory &&
        tabs.store.some(
          (tab) =>
            tab.type === "draft" &&
            tab.draftID === draftID &&
            tab.server === draftServer &&
            tab.directory === projectDirectory,
        ))
    const rulesKey = input.pendingKey?.() ?? draftSessionKey(directorySDK.scope, projectDirectory, draftID)
    const shouldAutoAccept = isNewSession && input.autoAccept()
    const worktreeSelection = input.newSessionWorktree?.() || "main"

    let sessionDirectory = admission.directory ?? projectDirectory
    const client = directorySDK.client
    let session = admission.session ?? input.info()

    if (isNewSession) {
      if (!admission.directory && worktreeSelection === "create") {
        const createdWorktree = await client.worktree
          .create({ directory: projectDirectory })
          .then((x) => x.data)
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.worktreeCreateFailed.title"),
              description: errorMessage(err),
            })
            return undefined
          })

        if (!createdWorktree?.directory) {
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: language.t("common.requestFailed"),
          })
          return
        }
        WorktreeState.pending(directorySDK.scope, createdWorktree.directory)
        sessionDirectory = createdWorktree.directory
        admission.directory = sessionDirectory
      }

      if (!admission.directory && worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      if (sessionDirectory !== projectDirectory) {
        serverState.child(sessionDirectory)
      }
    }

    const api =
      sessionDirectory === projectDirectory
        ? directorySDK.api.session
        : createCompatibleApi({
            protocol: server.protocol,
            current: server.currentApi,
            legacy: (directory) =>
              server.createClient({ directory: directory ?? sessionDirectory, throwOnError: true }),
            directory: sessionDirectory,
          }).session

    if (!session && isNewSession) {
      const created = await api
        .create({
          agent: agentKey(currentAgent),
          model: { id: currentModel.id, providerID: currentModel.provider.id, variant },
          location: { directory: sessionDirectory },
        })
        .then(normalizeSessionInfo)
        .catch((err) => {
          showToast({
            title: language.t("prompt.toast.sessionCreateFailed.title"),
            description: errorMessage(err),
          })
          return undefined
        })
      if (created) {
        admission.session = created
        admission.directory = sessionDirectory
        seed(serverState, sessionDirectory, created)
        session = created
      }
    }
    if (session && isNewSession) {
      // The draft can change servers while admission waits. Leave its captured
      // state and admitted session untouched rather than capture under the new SDK.
      if (!ownsDraft()) return
      // Keep the admitted session and worktree for retry until its rules are durable.
      const draftRules = pendingRules(rulesKey)
      if (draftRules.length > 0 || admission.rules) {
        const saved = await (async () => {
          if ((await server.protocol) !== "v1") throw new Error(language.t("common.requestFailed"))
          let rules = draftRules
          while (true) {
            admission.rules = true
            await server.client.session.update({
              sessionID: session.id,
              directory: sessionDirectory,
              permission: rules.length ? rules : [{ permission: "task", pattern: "*/*", action: "allow" }],
            })
            const next = pendingRules(rulesKey)
            // A picker edit during persistence needs its own durable acknowledgement.
            if (JSON.stringify(next) !== JSON.stringify(rules)) {
              rules = next
              continue
            }
            if (!ownsDraft()) return false
            clearPending(rulesKey)
            admission.rules = false
            return true
          }
        })().catch((err) => {
          showToast({ title: language.t("common.requestFailed"), description: errorMessage(err) })
          return false
        })
        if (!saved) return
      }
      const handoff = { accepted: false }
      await startTransition(() => {
        if (!session || !ownsDraft()) return
        handoff.accepted = true
        if (shouldAutoAccept) permissionState.enableAutoAccept(session.id, sessionDirectory)
        local.session.promote(sessionDirectory, session.id, {
          agent: agentKey(currentAgent),
          model: { providerID: currentModel.provider.id, modelID: currentModel.id },
          variant: variant ?? null,
        })
        layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
        // Move later edits before promotion disposes the draft's persisted state.
        submission.retarget(prompt.capture({ dir: base64Encode(sessionDirectory), id: session.id }))
        if (draftID && draftServer) {
          tabs.promoteDraft(draftID, { server: draftServer, sessionId: session.id })
          return
        }
        navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
      })
      if (!handoff.accepted) return
      admission.session = undefined
      admission.directory = undefined
      input.onNewSessionWorktreeReset?.()
    }
    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description"),
      })
      return
    }

    const model = {
      modelID: currentModel.id,
      providerID: currentModel.provider.id,
    }
    const agent = agentKey(currentAgent)
    const draft: FollowupDraft = {
      sessionID: session.id,
      sessionDirectory,
      prompt: currentPrompt,
      context,
      agent,
      model,
      variant,
      delivery: isNewSession ? undefined : input.delivery?.(),
    }

    const clearInput = (context: "none" | "comments" | "all" = "none") => {
      if (!submission.clear(context) || !submission.current(prompt.capture())) return
      input.setMode("normal")
      input.setPopover(null)
    }

    const restoreInput = () => {
      const restored = submission.restore()
      if (!restored) return false
      restored.target.set(restored.prompt, input.promptLength(restored.prompt))
      if (!submission.current(prompt.capture())) return true
      input.setMode(mode)
      input.setPopover(null)
      requestAnimationFrame(() => {
        const editor = input.editor()
        if (!editor) return
        editor.focus()
        setCursorPosition(editor, input.promptLength(currentPrompt))
        input.queueScroll()
      })
      return true
    }

    if (!isNewSession && mode === "normal" && input.shouldQueue?.()) {
      input.onQueue?.(draft)
      clearInput("all")
      return
    }

    input.onSubmit?.()

    if (mode === "shell") {
      clearInput()
      await submitShellCommand({
        api,
        sessionID: session.id,
        command: text,
        agent,
        model,
      }).catch((err) => {
        showToast({
          title: language.t("prompt.toast.shellSendFailed.title"),
          description: errorMessage(err),
        })
        restoreInput()
      })
      return
    }

    if (text.startsWith("/")) {
      const [cmdName, ...args] = text.split(" ")
      const commandName = cmdName.slice(1)
      const customCommand = syncState.data.command.find((c) => c.name === commandName)
      if (customCommand) {
        clearInput()
        const messageID = Identifier.ascending("message")
        serverState.session.set("session_status", session.id, { type: "busy" })
        await api
          .command({
            sessionID: session.id,
            id: messageID,
            command: commandName,
            arguments: args.join(" "),
            agent,
            model: { id: model.modelID, providerID: model.providerID, variant },
            delivery: draft.delivery,
            files: await Promise.all(
              images.map(async (attachment) => ({
                uri: await blobDataUrl(attachment.blob, attachment.mime),
                name: attachment.filename,
              })),
            ),
          })
          .catch((err) => {
            serverState.session.set("session_status", session.id, { type: "idle" })
            showToast({
              title: language.t("prompt.toast.commandSendFailed.title"),
              description: formatServerError(err, language.t, language.t("common.requestFailed")),
            })
            restoreInput()
          })
        return
      }
    }

    const messageID = Identifier.ascending("message")

    const removeOptimisticMessage = () => {
      syncState.session.optimistic.remove({
        directory: sessionDirectory,
        sessionID: session.id,
        messageID,
      })
    }

    clearInput("comments")

    const controller = new AbortController()
    const key = ScopedKey.from(directorySDK.scope, session.id)
    const jobs = pending.get(key) ?? new Set<PendingPrompt>()
    const job = {
      abort: controller,
      cleanup: () => {
        removeOptimisticMessage()
        restoreInput()
      },
    }
    jobs.add(job)
    pending.set(key, jobs)

    const waitForWorktree = async () => {
      if (controller.signal.aborted) return false
      const worktree = WorktreeState.get(directorySDK.scope, sessionDirectory)
      if (!worktree || worktree.status !== "pending") return true

      if (sessionDirectory === projectDirectory) {
        syncState.set("session_status", session.id, { type: "busy" })
      }

      const abortWait = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        if (controller.signal.aborted) {
          resolve({ status: "failed", message: "aborted" })
          return
        }
        controller.signal.addEventListener(
          "abort",
          () => {
            resolve({ status: "failed", message: "aborted" })
          },
          { once: true },
        )
      })

      const timeoutMs = 5 * 60 * 1000
      const timer = { id: undefined as number | undefined }
      const timeout = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        timer.id = window.setTimeout(() => {
          resolve({
            status: "failed",
            message: language.t("workspace.error.stillPreparing"),
          })
        }, timeoutMs)
      })

      const result = await Promise.race([
        WorktreeState.wait(directorySDK.scope, sessionDirectory),
        abortWait,
        timeout,
      ]).finally(() => {
        if (timer.id === undefined) return
        clearTimeout(timer.id)
      })
      if (controller.signal.aborted) return false
      if (result.status === "failed") throw new Error(result.message)
      return true
    }

    const queued = draft.delivery === "queue" && input.working()
    // The input is already cleared, so waiting on the profile's behaviors cannot resend this message.
    await sendFollowupDraft({
      api,
      sync: syncState,
      serverSync: serverState,
      draft: { ...draft, system: await followupSystem(platform, directorySDK.scope, serverState, projectDirectory) },
      messageID,
      optimisticBusy: sessionDirectory === projectDirectory,
      pending: queued,
      signal: controller.signal,
      before: waitForWorktree,
    })
      .then((sent) => {
        if (sent && queued) showToast({ title: language.t("orchestra.chat.delivery.queued") })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (sessionDirectory === projectDirectory && !queued) {
          syncState.set("session_status", session.id, { type: "idle" })
        }
        showToast({
          title: language.t("prompt.toast.promptSendFailed.title"),
          description: errorMessage(err),
        })
        removeOptimisticMessage()
        restoreInput()
      })
      .finally(() => {
        jobs.delete(job)
        if (pending.get(key) === jobs && jobs.size === 0) pending.delete(key)
      })
  }

  return {
    abort,
    handleSubmit(event: Event) {
      event.preventDefault()
      const target = prompt.capture()
      if (params.id) return submit(target, { busy: false })
      const key = input.pendingKey?.() ?? draftSessionKey(sdk().scope, sdk().directory, search.draftId)
      const scoped = admissions.get(target) ?? new Map<string, Admission>()
      admissions.set(target, scoped)
      const admission = scoped.get(key) ?? { busy: false }
      if (admission.busy) return Promise.resolve()
      scoped.set(key, admission)
      admission.busy = true
      return submit(target, admission).finally(() => {
        admission.busy = false
      })
    },
  }
}
