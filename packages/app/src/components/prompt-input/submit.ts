import type { Session } from "@orchestra/sdk/v2/client"
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
import { clearPending } from "@/components/draft-subagent-models"
import type { SubagentModelPolicy } from "@/components/subagent-model-rules"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { useSync, type DirectorySync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { setCursorPosition } from "./editor-dom"
import { formatServerError } from "@/utils/server-errors"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { createPromptSubmissionState } from "./submission-state"
import { normalizeSessionInfo } from "@/utils/session"
import { Event } from "@orchestra/schema/event"
import { blobDataUrl } from "@/utils/draft-store"
import { draftSessionKey } from "./draft-session"
import { createCompatibleApi } from "@/utils/server-compat"
import { createSubmissionOwner, createSubmissionPolicy, sendFollowupRequest, waitForSubmissionWorktree } from "./submission-policy"
export { acknowledgeDraftPolicy } from "./submission-policy"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>
type Admission = {
  busy: boolean
  directory?: string
  session?: Session
  policyWritten?: boolean
  legacyOverrideAcknowledged?: boolean
  acknowledgedPolicy?: SubagentModelPolicy
  failedWrite?: { cause: unknown }
  cleanup?: VoidFunction
}
const admissions = new WeakMap<PromptTarget, Map<string, Admission>>()

type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
  draft?: {
    key: string
    target: PromptTarget
    scope: ServerScope
    directory: string
    sessionID: string
    api: DirectorySDK["api"]["session"]
    serverState: ServerSync
  }
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
  source?: {
    scope: ServerScope
    api: DirectorySDK["api"]["session"]
    serverSync: ServerSync
    sync: DirectorySync
    current: () => boolean
    before: (signal?: AbortSignal) => Promise<boolean>
  }
}

export type FollowupSendInput = {
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

export async function sendFollowupDraft(input: FollowupSendInput) {
  const source = input.draft.source
  const controller = source && !input.signal ? new AbortController() : undefined
  const untrack = controller && source ? trackPendingPrompt(source.scope, input.draft.sessionID, {
    abort: controller,
    cleanup: () => {},
  }) : undefined
  try {
    return await sendFollowupRequest({
      ...input,
      api: source?.api ?? input.api,
      sync: source?.sync ?? input.sync,
      serverSync: source?.serverSync ?? input.serverSync,
      signal: input.signal ?? controller?.signal,
    })
  } finally {
    untrack?.()
  }
}

// Shared by the composer and evidence replay: every shell run gets a new event ID, and
// the request carries no workdir, so callers must only replay in the session directory.
export async function submitShellCommand(input: {
  api: DirectorySDK["api"]["session"]
  sessionID: string
  command: string
  agent: string
  model: { providerID: string; modelID: string }
  signal?: AbortSignal
  before?: () => Promise<boolean> | boolean
  current?: () => boolean
}) {
  if (input.signal?.aborted || input.current?.() === false) return false
  if ((await input.before?.()) === false || input.signal?.aborted || input.current?.() === false) return false
  return input.api.shell({
    sessionID: input.sessionID,
    id: Event.ID.create(),
    command: input.command,
    agent: input.agent,
    model: input.model,
  }, { signal: input.signal })
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
  const language = sessionRecoveryLanguage(useLanguage())
  const params = useParams()
  const [search] = useSearchParams<{ draftId?: string }>()
  const tabs = useTabs()
  const ownership = createSubmissionOwner(() => {
    const source = sdk()
    const draftID = search.draftId
    const tab = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === draftID)
    return {
      server: serverSDK(), scope: source.scope, directory: source.directory,
      sessionID: params.id, draftID, target: prompt.capture(),
      draftServer: tab?.type === "draft" ? tab.server : undefined,
      draftDirectory: tab?.type === "draft" ? tab.directory : undefined, draftExists: tab !== undefined,
    }
  })

  const errorMessage = (err: unknown) => {
    if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message
    if (err && typeof err === "object" && "data" in err) {
      const data = err.data
      if (data && typeof data === "object" && "message" in data && typeof data.message === "string") return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  const abort = async () => {
    const sessionID = params.id
    const source = sdk()
    const serverState = serverSync()
    input.onAbort?.()
    if (sessionID) return interruptPendingSession(source.scope, sessionID, source.api.session, serverState)
    const key = input.pendingKey?.() ?? draftSessionKey(source.scope, source.directory, search.draftId)
    const target = prompt.capture()
    const drafts = [...pending.values()].flatMap((jobs) => [...jobs].flatMap((job) => {
      const draft = job.draft
      return draft && draft.key === key && draft.target === target && draft.scope === source.scope &&
        draft.directory === source.directory ? [draft] : []
    }))
    return Promise.all([...new Map(drafts.map((draft) => [ScopedKey.from(draft.scope, draft.sessionID), draft])).values()]
      .map((draft) => interruptPendingSession(draft.scope, draft.sessionID, draft.api, draft.serverState)))
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
    const owner = ownership.capture()
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
    const sessionID = params.id
    const draftID = search.draftId
    const draftServer = draftID ? tabs.draft(draftID).server : undefined
    const handoff = { accepted: false }
    const ownsSource = () => {
      if (!owner.current()) return false
      const source = sdk()
      if (serverSDK() !== server || source.scope !== directorySDK.scope) return false
      if (handoff.accepted) return source.directory === admission.directory && params.id === admission.session?.id && submission.current(prompt.capture())
      if (source.directory !== projectDirectory || params.id !== sessionID || prompt.capture() !== target || search.draftId !== draftID) return false
      return !draftID || tabs.store.some((tab) =>
        tab.type === "draft" && tab.draftID === draftID && tab.server === draftServer && tab.directory === projectDirectory,
      )
    }
    const rulesKey = input.pendingKey?.() ?? draftSessionKey(directorySDK.scope, projectDirectory, draftID)
    const shouldAutoAccept = isNewSession && input.autoAccept()
    const delivery = isNewSession ? undefined : input.delivery?.()
    const shouldQueue = !isNewSession && mode === "normal" && input.shouldQueue?.()
    const queued = delivery === "queue" && input.working()
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
        sessionDirectory = createdWorktree.directory
        admission.directory = sessionDirectory
        if (!ownsSource()) return false
        WorktreeState.pending(directorySDK.scope, sessionDirectory)
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
        session = created
      }
    }
    if (!ownsSource()) return false
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
      delivery,
    }

    const consumed = { input: false }
    const clearInput = (context: "none" | "comments" | "all" = "none") => {
      if (!ownsSource()) return
      consumed.input = true
      if (!submission.clear(context) || !submission.current(prompt.capture())) return
      input.setMode("normal")
      input.setPopover(null)
    }

    const restoreInput = () => {
      if (!consumed.input) return false
      const restored = submission.restore()
      if (!restored) return false
      restored.target.set(restored.prompt, input.promptLength(restored.prompt))
      if (!ownsSource() || !submission.current(prompt.capture())) return true
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

    const messageID = Identifier.ascending("message")
    const removeOptimisticMessage = () => syncState.session.optimistic.remove({ directory: sessionDirectory, sessionID: session.id, messageID })
    const controller = new AbortController()
    admission.cleanup = trackPendingPrompt(directorySDK.scope, session.id, {
      abort: controller,
      cleanup: () => { removeOptimisticMessage(); restoreInput() },
      draft: isNewSession ? {
        key: rulesKey, target, scope: directorySDK.scope, directory: projectDirectory,
        sessionID: session.id, api, serverState,
      } : undefined,
    })
    const policy = createSubmissionPolicy({
      key: rulesKey, sessionID: session.id, protocol: server.protocol,
      management: server.sessionManagement, admission, current: ownsSource,
      initialPolicy: isNewSession ? { mode: "inherit" } : undefined,
      failedMessage: language.t("common.requestFailed"),
      legacyWrite: (permission) => server.client.session.update({ sessionID: session.id, directory: sessionDirectory, permission }),
    })
    const policyError = (err: unknown) => {
      if (!controller.signal.aborted && ownsSource()) showToast({
        title: language.t("common.requestFailed"),
        description: sessionManagementUnsupported(err) ? language.t("session.subagentModels.unsupported") : errorMessage(err),
      })
      return false as const
    }
    const waitPolicy = () => policy.wait(controller.signal).catch(policyError)
    draft.source = {
      scope: directorySDK.scope, api, sync: syncState, serverSync: serverState, current: ownsSource,
      before: (signal = controller.signal) => policy.wait(signal),
    }
    if (isNewSession) {
      if (admission.session) seed(serverState, sessionDirectory, admission.session)
      const receipt = await policy.acknowledge(controller.signal).catch(policyError)
      if (!receipt || !ownsSource()) return false
      await startTransition(() => {
        if (!ownsSource() || !clearPending(rulesKey, receipt.revision)) return
        const next = prompt.capture({ dir: base64Encode(sessionDirectory), id: session.id })
        owner.handoff((value) => value.server === server && value.scope === directorySDK.scope &&
          value.directory === sessionDirectory && value.sessionID === session.id && value.draftID === undefined && value.target === next)
        batch(() => {
          if (shouldAutoAccept) permissionState.enableAutoAccept(session.id, sessionDirectory)
          local.session.promote(sessionDirectory, session.id, { agent, model, variant: variant ?? null })
          layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
          submission.retarget(next)
          handoff.accepted = true
          if (draftID && draftServer) tabs.promoteDraft(draftID, { server: draftServer, sessionId: session.id })
          if (!draftID) navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
        })
      })
      owner.handoff()
      if (!handoff.accepted || !ownsSource()) return false
      input.onNewSessionWorktreeReset?.()
    }
    if (!(await waitPolicy()) || !ownsSource()) return false
    if (shouldQueue) {
      input.onQueue?.(draft)
      clearInput("all")
      return
    }

    input.onSubmit?.()
    if (!(await waitPolicy()) || !ownsSource()) return false

    if (mode === "shell") {
      return submitShellCommand({
        api,
        sessionID: session.id,
        command: text,
        agent,
        model,
        signal: controller.signal,
        current: ownsSource,
        before: async () => {
          if (!(await waitPolicy()) || !ownsSource()) return false
          clearInput()
          return !controller.signal.aborted && ownsSource()
        },
      }).catch((err) => {
        if (controller.signal.aborted) return false
        if (ownsSource()) showToast({
          title: language.t("prompt.toast.shellSendFailed.title"),
          description: errorMessage(err),
        })
        restoreInput()
        return false
      })
    }

    if (text.startsWith("/")) {
      const [cmdName, ...args] = text.split(" ")
      const commandName = cmdName.slice(1)
      const customCommand = syncState.data.command.find((c) => c.name === commandName)
      if (customCommand) {
        const files = await Promise.all(images.map(async (attachment) => ({ uri: await blobDataUrl(attachment.blob, attachment.mime), name: attachment.filename })))
        if (!(await waitPolicy()) || !ownsSource()) return false
        clearInput()
        serverState.session.set("session_status", session.id, { type: "busy" })
        return api
          .command({
            sessionID: session.id,
            id: messageID,
            command: commandName,
            arguments: args.join(" "),
            agent,
            model: { id: model.modelID, providerID: model.providerID, variant },
            delivery: draft.delivery,
            files,
          }, { signal: controller.signal })
          .then(() => true)
          .catch((err) => {
            if (controller.signal.aborted) return false
            if (ownsSource()) serverState.session.set("session_status", session.id, { type: "idle" })
            if (ownsSource()) showToast({
              title: language.t("prompt.toast.commandSendFailed.title"),
              description: formatServerError(err, language.t, language.t("common.requestFailed")),
            })
            restoreInput()
            return false
          })
      }
    }

    clearInput("comments")

    const waitForWorktree = () => waitForSubmissionWorktree({
      scope: directorySDK.scope, directory: sessionDirectory, signal: controller.signal,
      current: ownsSource,
      onWaiting: () => {
        if (sessionDirectory === projectDirectory) syncState.set("session_status", session.id, { type: "busy" })
      },
      failedMessage: language.t("workspace.error.stillPreparing"),
    })

    // The input is already cleared, so waiting on the profile's behaviors cannot resend this message.
    return sendFollowupDraft({
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
        if (!sent) restoreInput()
        if (sent && queued && ownsSource()) showToast({ title: language.t("orchestra.chat.delivery.queued") })
        return sent
      })
      .catch((err) => {
        if (controller.signal.aborted) return false
        if (ownsSource() && sessionDirectory === projectDirectory && !queued) {
          syncState.set("session_status", session.id, { type: "idle" })
        }
        if (ownsSource()) showToast({
          title: language.t("prompt.toast.promptSendFailed.title"),
          description: errorMessage(err),
        })
        removeOptimisticMessage()
        restoreInput()
        return false
      })
  }

  return {
    abort,
    handleSubmit(event: Event) {
      event.preventDefault()
      if (ownership.disposed()) return Promise.resolve(false)
      const target = prompt.capture()
      if (params.id) {
        const admission: Admission = { busy: false }
        return submit(target, admission).finally(() => admission.cleanup?.())
      }
      const key = input.pendingKey?.() ?? draftSessionKey(sdk().scope, sdk().directory, search.draftId)
      const scoped = admissions.get(target) ?? new Map<string, Admission>()
      admissions.set(target, scoped)
      const admission = scoped.get(key) ?? { busy: false }
      if (admission.busy) return Promise.resolve()
      scoped.set(key, admission)
      admission.busy = true
      return submit(target, admission).finally(() => {
        admission.cleanup?.()
        admission.busy = false
        if (admission.session && params.id === admission.session.id) scoped.delete(key)
      })
    },
  }
}

function trackPendingPrompt(scope: ServerScope, sessionID: string, job: PendingPrompt) {
  const key = ScopedKey.from(scope, sessionID)
  const jobs = pending.get(key) ?? new Set<PendingPrompt>()
  jobs.add(job)
  pending.set(key, jobs)
  return () => {
    jobs.delete(job)
    if (pending.get(key) === jobs && jobs.size === 0) pending.delete(key)
  }
}

function interruptPendingSession(scope: ServerScope, sessionID: string, api: DirectorySDK["api"]["session"], state: ServerSync) {
  state.session.set("todo", sessionID, [])
  const key = ScopedKey.from(scope, sessionID)
  const jobs = pending.get(key)
  if (jobs) {
    pending.delete(key)
    state.session.set("session_status", sessionID, { type: "idle" })
    ;[...jobs].reverse().forEach((job) => { job.abort.abort(); job.cleanup() })
  }
  return api.interrupt({ sessionID }).catch(() => {})
}
