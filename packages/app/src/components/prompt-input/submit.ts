import type { Session } from "@orchestra/sdk/v2/client"
import { showToast } from "@/utils/toast"
import { base64Encode } from "@orchestra/core/util/encode"
import { Binary } from "@orchestra/core/util/binary"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { batch, onCleanup, startTransition, type Accessor } from "solid-js"
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
import { clearPending, pendingRules, pendingSnapshot } from "@/components/draft-subagent-models"
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
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { SessionManagementUnsupported } from "@/utils/session-management-errors"
import { acknowledgeDraftPolicy, createSubmissionOwner, createSubmissionPolicy, sendFollowupRequest, waitForSubagentPolicy, waitForSubmissionWorktree } from "./submission-policy"
import { queuedPromptSources, type QueuedPromptSource, type QueuedPromptRuntime } from "./queued-prompt"
export { acknowledgeDraftPolicy } from "./submission-policy"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>
type Admission = { busy: boolean; directory?: string; session?: Pick<Session, "id">; policyWritten?: boolean; legacyOverrideAcknowledged?: boolean; cleanup?: VoidFunction }
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
  source?: QueuedPromptSource
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
  runtime?: QueuedPromptRuntime
  deliberate?: boolean
  currentSource?: {
    serverScopeKey: ServerScope
    directory: string
    sessionID: string | undefined
    protocol: Parameters<typeof createSubmissionPolicy>[0]["protocol"]
    management: Parameters<typeof createSubmissionPolicy>[0]["management"]
    current: () => boolean
  }
}

// Read the profile's behaviors at send time. Never rejects, and gives up on a slow storage load.
export function followupSystem(platform: Platform, scope: ServerScope, serverSync: ServerSync, directory: string) {
  return resolveBehaviorSystem({ platform, scope, projects: serverSync.data.project, directory }).catch(() => undefined)
}

export const sendFollowupDraft = createFollowupSender()

export function createFollowupSender(sources = queuedPromptSources) {
  return async (input: FollowupSendInput) => {
    const controller = !input.signal ? new AbortController() : undefined
    const current = input.currentSource
    const rebound = current?.sessionID ? {
      serverScopeKey: current.serverScopeKey, directory: current.directory, sessionID: current.sessionID,
      api: input.api, sync: input.sync, serverSync: input.serverSync, current: current.current,
      before: (signal = input.signal ?? controller!.signal) => waitForSubagentPolicy({ ...current, sessionID: current.sessionID!, signal }),
    } : undefined
    const source = input.runtime ?? sources.resolve(input.draft.source, input.draft, rebound, input.deliberate)
    if (!source && (input.currentSource || "source" in input.draft)) return false
    const untrack = controller && source ? trackPendingPrompt(source.serverScopeKey, input.draft.sessionID, {
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
        runtime: source,
      })
    } finally {
      untrack?.()
    }
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
  const queueOwner = {}
  onCleanup(() => queuedPromptSources.releaseOwner(queueOwner))
  const ownership = createSubmissionOwner(() => {
    const source = sdk()
    const draftID = search.draftId
    const tab = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === draftID)
    return {
      server: serverSDK(), credentials: JSON.stringify(serverSDK().server?.http), scope: source.scope, directory: source.directory,
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
    const key = sessionID ? undefined : input.pendingKey?.() ?? draftSessionKey(source.scope, source.directory, search.draftId)
    const target = sessionID ? undefined : prompt.capture()
    input.onAbort?.()
    if (sessionID) return interruptPendingSession(source.scope, sessionID, source.api.session, serverState)
    const drafts = [...pending.values()].flatMap((jobs) => [...jobs].flatMap((job) => {
      const draft = job.draft
      return draft && draft.key === key && draft.target === target && draft.scope === source.scope &&
        draft.directory === source.directory ? [draft] : []
    }))
    return Promise.all([...new Map(drafts.map((draft) => [ScopedKey.from(draft.scope, draft.sessionID), draft])).values()]
      .map((draft) => interruptPendingSession(draft.scope, draft.sessionID, draft.api, draft.serverState)))
  }

  const restoreCommentItems = (
    target: ReturnType<ReturnType<typeof usePrompt>["capture"]>,
    items: (ContextItem & { key: string })[],
  ) => {
    for (const item of items) {
      target.context.add({
        type: "file",
        path: item.path,
        selection: item.selection,
        comment: item.comment,
        commentID: item.commentID,
        commentOrigin: item.commentOrigin,
        preview: item.preview,
      })
    }
  }

  const clearContext = (target: ReturnType<ReturnType<typeof usePrompt>["capture"]>) => {
    for (const item of target.context.items()) {
      target.context.remove(item.key)
    }
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

    const model = { modelID: currentModel.id, providerID: currentModel.provider.id }
    const agent = agentKey(currentAgent)

    input.addToHistory(currentPrompt, mode)
    input.resetHistoryNavigation()

    const directorySDK = sdk()
    const server = serverSDK()
    const serverState = serverSync()
    const syncState = sync()
    const projectDirectory = directorySDK.directory
    const permissionState = permission.currentServerState()
    const sessionID = params.id
    const isNewSession = !sessionID
    const draftID = search.draftId
    const draftServer = draftID ? tabs.draft(draftID).server : undefined
    const rulesKey = input.pendingKey?.() ?? draftSessionKey(directorySDK.scope, projectDirectory, draftID)
    const delivery = isNewSession ? undefined : input.delivery?.()
    const shouldQueue = !isNewSession && mode === "normal" && input.shouldQueue?.()
    const queued = delivery === "queue" && input.working()
    const handoff = { accepted: false }
    const ownsSource = () => {
      if (!owner.current()) return false
      if (sdk().scope !== directorySDK.scope || serverSDK() !== server) return false
      if (handoff.accepted) {
        return sdk().directory === admission.directory && params.id === admission.session?.id && submission.current(prompt.capture())
      }
      if (sdk().directory !== projectDirectory || params.id !== sessionID || prompt.capture() !== target) return false
      if (!isNewSession || !draftID) return search.draftId === draftID
      return search.draftId === draftID && tabs.store.some((tab) =>
        tab.type === "draft" && tab.draftID === draftID && tab.server === draftServer && tab.directory === projectDirectory,
      )
    }
    const shouldAutoAccept = isNewSession && input.autoAccept()
    const worktreeSelection = input.newSessionWorktree?.() || "main"

    let sessionDirectory = admission.directory ?? projectDirectory
    const client = directorySDK.client

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
        admission.directory = createdWorktree.directory
        if (!ownsSource()) return
        WorktreeState.pending(directorySDK.scope, createdWorktree.directory)
        sessionDirectory = createdWorktree.directory
      }

      if (!admission.directory && worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      if (sessionDirectory !== projectDirectory) {
        serverState.child(sessionDirectory)
      }
    }

    const api = sessionDirectory === projectDirectory
      ? directorySDK.api.session
      : createCompatibleApi({
          protocol: server.protocol,
          current: server.currentApi,
          legacy: (directory) => server.createClient({ directory: directory ?? sessionDirectory, throwOnError: true }),
          directory: sessionDirectory,
        }).session

    let session = admission.session ?? input.info()
    if (!session && isNewSession) {
      const created = await api.create({
          agent,
          model: { id: model.modelID, providerID: model.providerID, variant },
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
        if (!ownsSource()) return
        seed(serverState, sessionDirectory, created)
        session = created
      }
    }
    if (!ownsSource()) return
    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description"),
      })
      return
    }

    if (!ownsSource()) return
    const protocol = await server.protocol
    if (!ownsSource()) return
    const policyError = (err: unknown): never => {
      if (ownsSource()) showToast({ title: language.t("dialog.subagentModels.saveFailed"), description: errorMessage(err) })
      throw err
    }
    const waitPolicy = async () => {
      if (!ownsSource()) return false
      if (protocol === "v2") await server.sessionManagement.waitSubagentModels(session.id).catch(policyError)
      return ownsSource()
    }
    if (isNewSession) {
      admission.session = session
      admission.directory = sessionDirectory
      const receipt = await acknowledgeDraftPolicy({
        key: rulesKey,
        current: ownsSource,
        written: () => admission.policyWritten === true,
        markWritten: () => { admission.policyWritten = true },
        failedMessage: language.t("common.requestFailed"),
        wait: () => protocol === "v2" ? server.sessionManagement.waitSubagentModels(session.id) : Promise.resolve(),
        write: async (policy) => {
          if (protocol === "v2") return server.sessionManagement.setSubagentModels(session.id, policy)
          if (policy.mode === "inherit") {
            // Public V1 update appends rules; it cannot remove an acknowledged model override.
            if (admission.legacyOverrideAcknowledged) {
              throw new SessionManagementUnsupported(language.t("dialog.subagentModels.unsupported"))
            }
            return policy
          }
          await server.client.session.update({
            sessionID: session.id,
            directory: sessionDirectory,
            permission: pendingRules(rulesKey),
          })
          admission.legacyOverrideAcknowledged = true
          return policy
        },
      }).catch(policyError)
      if (!receipt || !ownsSource()) return
      await startTransition(() => {
        if (!ownsSource() || pendingSnapshot(rulesKey).revision !== receipt.revision) return
        if (!clearPending(rulesKey, receipt.revision)) return
        const next = prompt.capture({ dir: base64Encode(sessionDirectory), id: session.id })
        owner.handoff((value) => value.server === server && value.scope === directorySDK.scope &&
          value.directory === sessionDirectory && value.sessionID === session.id &&
          value.draftID === undefined && value.target === next)
        batch(() => {
          if (shouldAutoAccept) permissionState.enableAutoAccept(session.id, sessionDirectory)
          local.session.promote(sessionDirectory, session.id, {
            agent,
            model,
            variant: variant ?? null,
          })
          layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
          submission.retarget(next)
          handoff.accepted = true
          if (draftID && draftServer) tabs.promoteDraft(draftID, { server: draftServer, sessionId: session.id })
          if (!draftID) navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
        })
      })
      owner.handoff()
      if (!handoff.accepted || !ownsSource()) return
    }
    if (!(await waitPolicy()) || !ownsSource()) return
    if (isNewSession) input.onNewSessionWorktreeReset?.()

    const draft: FollowupDraft = {
      sessionID: session.id,
      sessionDirectory,
      prompt: currentPrompt,
      context,
      agent,
      model,
      variant,
      delivery,
      source: queuedPromptSources.capture({
        serverScopeKey: directorySDK.scope, directory: sessionDirectory, sessionID: session.id,
        api, sync: syncState, serverSync: serverState, current: ownsSource, before: waitPolicy,
      }, queueOwner),
    }

    const clearInput = () => {
      if (!ownsSource()) return
      submission.clear()
      input.setMode("normal")
      input.setPopover(null)
    }

    const restoreInput = () => {
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

    if (shouldQueue) {
      input.onQueue?.(draft)
      if (!ownsSource()) return
      clearContext(submission.target())
      clearInput()
      return
    }

    input.onSubmit?.()
    if (!(await waitPolicy()) || !ownsSource()) return

    if (mode === "shell") {
      await submitShellCommand({
        api, sessionID: session.id, command: text, agent, model, current: ownsSource,
        before: async () => {
          if (!(await waitPolicy()) || !ownsSource()) return false
          clearInput()
          return ownsSource()
        },
      }).catch(
        (err) => {
          showToast({
            title: language.t("prompt.toast.shellSendFailed.title"),
            description: errorMessage(err),
          })
          restoreInput()
          throw err
        },
      )
      return
    }

    if (text.startsWith("/")) {
      const [cmdName, ...args] = text.split(" ")
      const commandName = cmdName.slice(1)
      const customCommand = syncState.data.command.find((c) => c.name === commandName)
      if (customCommand) {
        const files = await Promise.all(
          images.map(async (attachment) => ({
            uri: await blobDataUrl(attachment.blob, attachment.mime),
            name: attachment.filename,
          })),
        )
        if (!ownsSource()) return
        if (!(await waitPolicy()) || !ownsSource()) return
        clearInput()
        const messageID = Identifier.ascending("message")
        serverState.session.set("session_status", session.id, { type: "busy" })
        await api.command({
            sessionID: session.id,
            id: messageID,
            command: commandName,
            arguments: args.join(" "),
            agent,
            model: { id: model.modelID, providerID: model.providerID, variant },
            delivery: draft.delivery,
            files,
          })
          .catch((err) => {
            serverState.session.set("session_status", session.id, { type: "idle" })
            showToast({
              title: language.t("prompt.toast.commandSendFailed.title"),
              description: formatServerError(err, language.t, language.t("common.requestFailed")),
            })
            restoreInput()
            throw err
          })
        return
      }
    }

    const commentItems = context.filter((item) => item.type === "file" && !!item.comment?.trim())
    const messageID = Identifier.ascending("message")

    const removeOptimisticMessage = () => {
      syncState.session.optimistic.remove({
        directory: sessionDirectory,
        sessionID: session.id,
        messageID,
      })
    }

    const controller = new AbortController()
    admission.cleanup = trackPendingPrompt(directorySDK.scope, session.id, {
      abort: controller,
      cleanup: () => { removeOptimisticMessage(); restoreInput() },
      draft: isNewSession ? {
        key: rulesKey, target, scope: directorySDK.scope, directory: projectDirectory,
        sessionID: session.id, api, serverState,
      } : undefined,
    })

    for (const item of commentItems) submission.target().context.remove(item.key)
    clearInput()

    const waitForWorktree = () => waitForSubmissionWorktree({
      scope: directorySDK.scope, directory: sessionDirectory, signal: controller.signal,
      current: ownsSource,
      onWaiting: () => {
        if (sessionDirectory === projectDirectory) syncState.set("session_status", session.id, { type: "busy" })
      },
      failedMessage: language.t("workspace.error.stillPreparing"),
    })

    const system = await followupSystem(platform, directorySDK.scope, serverState, projectDirectory)
    if (!ownsSource()) return
    await sendFollowupDraft({
      api,
      sync: syncState,
      serverSync: serverState,
      draft: { ...draft, system },
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
        if (sessionDirectory === projectDirectory && !queued) {
          syncState.set("session_status", session.id, { type: "idle" })
        }
        showToast({
          title: language.t("prompt.toast.promptSendFailed.title"),
          description: errorMessage(err),
        })
        removeOptimisticMessage()
        if (restoreInput()) restoreCommentItems(submission.target(), commentItems)
        throw err
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
