import type { Session } from "@orchestra/sdk/v2/client"
import { showToast } from "@/utils/toast"
import { base64Encode } from "@orchestra/core/util/encode"
import { Binary } from "@orchestra/core/util/binary"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { batch, onCleanup, startTransition, untrack, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { useTabs } from "@/context/tabs"
import { useServerSync, type ServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useLocal, type ModelSelection } from "@/context/local"
import { agentKey } from "@/context/agent-identity"
import { usePermission } from "@/context/permission"
import { type ImageAttachmentPart, type Prompt, type usePrompt } from "@/context/prompt"
import { useSDK, type DirectorySDK } from "@/context/sdk"
import { useServerSDK, type ServerSDK } from "@/context/server-sdk"
import { usePlatform, type Platform } from "@/context/platform"
import { resolveBehaviorSystem } from "@/utils/llm-behaviors-store"
import { clearPending, pendingSnapshot } from "@/components/draft-subagent-models"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { useSync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { setCursorPosition } from "./editor-dom"
import { formatServerError, hookRefusal } from "@/utils/server-errors"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { createPromptSubmissionState } from "./submission-state"
import { normalizeSessionInfo } from "@/utils/session"
import { Event } from "@orchestra/schema/event"
import { draftSessionKey } from "./draft-session"
import { createCompatibleApi } from "@/utils/server-compat"
import { createSubmissionOwner, createSubmissionPolicy, sendFollowupRequest, waitForSubagentPolicy, waitForSubmissionWorktree } from "./submission-policy"
import { sourceAdmission, handoffAdmission, type Admission } from "./submission-admission"
import { queuedPromptSources } from "./queued-prompt"
import type { AdmissionRequest, FollowupDraft, FollowupSendInput, PromptDispatch } from "./submission-types"
export type { FollowupDraft, FollowupSendInput } from "./submission-types"
export { acknowledgeDraftPolicy } from "./submission-policy"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>

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

// Shared by the composer and evidence replay: exact draft retries retain their event ID, and
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
  request?: AdmissionRequest
  dispatch?: PromptDispatch
}) {
  if (input.signal?.aborted || input.current?.() === false) return false
  if ((await input.before?.()) === false || input.signal?.aborted || input.current?.() === false) return false
  const send = (request = input.request, current = () => !input.signal?.aborted && input.current?.() !== false) => {
    const shell = request?.shell ?? {
      sessionID: input.sessionID,
      id: request ? Event.ID.make(request.id) : Event.ID.create(),
      command: input.command,
      agent: input.agent,
      model: input.model,
    }
    if (request) request.shell = shell
    if (!current()) return Promise.resolve(false)
    return input.api.shell(shell, { signal: input.signal })
  }
  if (input.dispatch) return input.dispatch(send)
  if (input.request?.admitted) return true
  return send()
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

  const [activity, setActivity] = createStore({ existing: 0 })
  const admissionSource = () => sourceAdmission(prompt.capture(),
    input.pendingKey?.() ?? draftSessionKey(sdk().scope, sdk().directory, search.draftId))
  // Create the store before the composer reads busy, untracked: a caller inside a tracked scope (such as a provider's
  // children) would otherwise re-run on a route or server change and permanently dispose this submitter's owner.
  untrack(admissionSource)

  const errorMessage = (err: unknown) => {
    const refusal = hookRefusal(err)
    if (refusal) return language.t("orchestra.chat.send.blockedByHook", refusal)
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
    const creating = target && key ? sourceAdmission(target, key).source : undefined
    const failed = (error: unknown) => showToast({
      variant: "error",
      title: language.t("orchestra.chat.stop.failed"),
      description: errorMessage(error),
    })
    input.onAbort?.()
    if (sessionID) return interruptPendingSession(source.scope, sessionID, source.api.session, serverState, failed)
    creating?.selections.forEach((admission) => admission.abort?.abort())
    const drafts = [...pending.values()].flatMap((jobs) => [...jobs].flatMap((job) => {
      const draft = job.draft
      return draft && draft.key === key && draft.target === target && draft.scope === source.scope &&
        draft.directory === source.directory ? [draft] : []
    }))
    return Promise.all([...new Map(drafts.map((draft) => [ScopedKey.from(draft.scope, draft.sessionID), draft])).values()]
      .map((draft) => interruptPendingSession(draft.scope, draft.sessionID, draft.api, draft.serverState, failed)))
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
    const controller = new AbortController()
    admission.abort = controller
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
    const credentials = JSON.stringify(server.server?.http)
    const serverState = serverSync()
    const syncState = sync()
    const projectDirectory = directorySDK.directory
    const permissionState = permission.currentServerState()
    const isNewSession = !params.id
    const sessionID = params.id
    const draftID = search.draftId
    const draftServer = draftID ? tabs.draft(draftID).server : undefined
    const ownsSource = () => {
      if (!owner.current()) return false
      const source = sdk()
      if (serverSDK() !== server || source.scope !== directorySDK.scope || JSON.stringify(server.server?.http) !== credentials) return false
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
    const worktreeSelection = admission.selection

    let sessionDirectory = admission.directory ?? projectDirectory
    const client = directorySDK.client
    let session = admission.session ?? input.info()

    if (isNewSession) {
      if (!admission.directory && worktreeSelection === "create") {
        const createdWorktree = await client.worktree
          .create({ directory: projectDirectory })
          .then((x) => x.data)
          .catch((err) => {
            if (ownsSource()) showToast({
              title: language.t("prompt.toast.worktreeCreateFailed.title"),
              description: errorMessage(err),
            })
            return undefined
          })

        if (!createdWorktree?.directory) {
          if (!ownsSource()) return false
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: language.t("common.requestFailed"),
          })
          return
        }
        sessionDirectory = createdWorktree.directory
        admission.directory = sessionDirectory
        if (!ownsSource() || controller.signal.aborted) return false
        WorktreeState.pending(directorySDK.scope, sessionDirectory)
      }

      if (!admission.directory && worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      if (sessionDirectory !== projectDirectory) {
        serverState.child(sessionDirectory)
      }
      admission.directory = sessionDirectory
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
          if (ownsSource()) showToast({
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
    if (!ownsSource() || controller.signal.aborted) return false
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
      if (isNewSession || !ownsSource()) return
      consumed.input = true
      if (!submission.clear(context) || !submission.current(prompt.capture())) return
      input.setMode("normal")
      input.setPopover(null)
    }

    // Leaving the Session abandons a send that has not reached the server, so the text goes back to the composer it
    // came from; the checks below only touch the editor when that composer is still on screen.
    const restoreInput = () => {
      if (!consumed.input) return false
      const restored = submission.restore()
      if (!restored) return false
      restored.target.set(restored.prompt, input.promptLength(restored.prompt))
      if (!ownsSource() || !submission.current(prompt.capture())) return true
      input.setMode(mode)
      input.setPopover(null)
      requestAnimationFrame(() => {
        if (!ownsSource() || !submission.current(prompt.capture())) return
        const editor = input.editor()
        if (!editor) return
        editor.focus()
        setCursorPosition(editor, input.promptLength(currentPrompt))
        input.queueScroll()
      })
      return true
    }

    const messageID = Identifier.ascending("message")
    const removeOptimisticMessage = () => {
      if (ownsSource()) syncState.session.optimistic.remove({ directory: sessionDirectory, sessionID: session.id,
        messageID: isNewSession ? admission.request?.id ?? messageID : messageID })
    }
    admission.cleanup = trackPendingPrompt(directorySDK.scope, session.id, {
      abort: controller,
      cleanup: () => { removeOptimisticMessage(); restoreInput() },
      draft: isNewSession ? {
        key: rulesKey, target, scope: directorySDK.scope, directory: projectDirectory,
        sessionID: session.id, api, serverState,
      } : undefined,
    })
    // A first send that fails leaves the Session this draft created behind, empty, in the sidebar. The draft itself
    // (text, context, subagent models, worktree) stays as it was for the next try.
    // Once the prompt was dispatched, the Session is kept and labelled: the server may have admitted it before the
    // failure (an admitted input is not a message until it is promoted), so the retry must reuse this Session and
    // message ID. Only a send that never left (its policy write failed) deletes a Session the server confirms empty.
    const settleEmptySession = async (dispatched: boolean) => {
      const created = admission.session
      if (!isNewSession || !created || admission.request?.admitted) return
      const empty = await sessionHasNoMessages(server, created.id, sessionDirectory).catch(() => undefined)
      if (empty === false) return
      const removed = !dispatched && empty === true &&
        (await api.remove({ sessionID: created.id, directory: sessionDirectory }).then(() => true, () => false))
      if (!removed) return seed(serverState, sessionDirectory, { ...created, title: language.t("orchestra.chat.send.emptySession") })
      const [, setStore] = serverState.child(sessionDirectory)
      setStore("session", (list: Session[]) => list.filter((item) => item.id !== created.id))
      // The next try creates a new Session, so nothing tied to the deleted one may carry over.
      admission.session = undefined
      admission.request = undefined
      admission.policyWritten = undefined
      admission.legacyOverrideAcknowledged = undefined
      admission.acknowledgedPolicy = undefined
      admission.failedWrite = undefined
    }
    const policy = createSubmissionPolicy({
      key: rulesKey, sessionID: session.id, protocol: server.protocol,
      management: server.sessionManagement, admission, current: ownsSource,
      initialPolicy: isNewSession ? { mode: "inherit" } : undefined,
      failedMessage: language.t("common.requestFailed"),
      legacyWrite: (permission) => server.client.session.update({ sessionID: session.id, directory: sessionDirectory, permission }),
    })
    const policyError = async (err: unknown) => {
      if (controller.signal.aborted) return false as const
      if (ownsSource()) showToast({
        title: language.t("common.requestFailed"),
        description: sessionManagementUnsupported(err) ? language.t("session.subagentModels.unsupported") : errorMessage(err),
      })
      await settleEmptySession(false)
      return false as const
    }
    const receipt = { revision: undefined as number | undefined }
    const waitPolicy = async (): Promise<boolean> => {
      while (ownsSource() && !controller.signal.aborted) {
        if (isNewSession && receipt.revision !== pendingSnapshot(rulesKey).revision) {
          const acknowledged = await policy.acknowledge(controller.signal).catch(policyError)
          if (!acknowledged || !ownsSource()) return false
          receipt.revision = acknowledged.revision
        }
        if (!(await policy.wait(controller.signal).catch(policyError))) return false
        if (!isNewSession || pendingSnapshot(rulesKey).revision === receipt.revision) return ownsSource()
      }
      return false
    }
    const runtime = {
      serverScopeKey: directorySDK.scope, directory: sessionDirectory, sessionID: session.id,
      api, sync: syncState, serverSync: serverState, current: ownsSource,
      before: (signal = controller.signal) => isNewSession ? waitPolicy() : policy.wait(signal),
    }
    if (isNewSession && admission.session) seed(serverState, sessionDirectory, admission.session)
    if (!(await waitPolicy()) || !ownsSource()) return false

    const actionKey = JSON.stringify({ currentPrompt, context, images, mode, agent, model, variant, worktreeSelection })
    const selectRequest = () => {
      if (admission.request?.key !== actionKey || admission.request.revision !== receipt.revision) {
        admission.request = {
          key: actionKey,
          id: mode === "shell" ? Event.ID.create() : Identifier.ascending("message"),
          admitted: false,
          revision: receipt.revision,
        }
      }
      return admission.request
    }
    const dispatch: PromptDispatch = async (send) => {
      if (!(await waitForWorktree())) return false
      while (ownsSource() && !controller.signal.aborted) {
        if (!(await waitPolicy()) || !ownsSource()) return false
        if (pendingSnapshot(rulesKey).revision !== receipt.revision) continue
        if (shouldAutoAccept) permissionState.enableAutoAccept(session.id, sessionDirectory)
        if (!ownsSource() || controller.signal.aborted) return false
        if (pendingSnapshot(rulesKey).revision !== receipt.revision) continue
        const request = selectRequest()
        if (!request.admitted) {
          request.revision = receipt.revision
          // Store observers can change ownership or policy; validate again after those mutations, at the API call.
          const sent = await send(request, () => ownsSource() && !controller.signal.aborted && pendingSnapshot(rulesKey).revision === receipt.revision)
          if (sent === false) continue
          request.admitted = true
        }
        return true
      }
      return false
    }
    const promote = async () => {
      if (!isNewSession || !admission.request?.admitted || admission.promoted || !ownsSource()) return
      // Subagent models picked while the prompt was in flight are acknowledged on its Session before the handoff.
      if (pendingSnapshot(rulesKey).revision !== admission.request.revision) await waitPolicy()
      await startTransition(() => {
        if (!ownsSource() || controller.signal.aborted || admission.promoted) return
        const request = admission.request
        if (!request?.admitted || request.revision === undefined) return
        // An admitted prompt always hands the draft off to its Session, so Enter on the draft can never post it again.
        // Edits made during the send (text, context, model, agent) move into the Session composer unsent.
        clearPending(rulesKey, receipt.revision ?? request.revision)
        const selectedModel = modelSelection.current()
        const selectedAgent = local.agent.current()
        const next = prompt.capture({ dir: base64Encode(sessionDirectory), id: session.id })
        handoffAdmission(next, draftSessionKey(directorySDK.scope, sessionDirectory), sourceAdmission(target, rulesKey).source)
        batch(() => {
          admission.promoted = true
          submission.retarget(next)
          submission.clear("comments")
          input.setMode("normal")
          input.setPopover(null)
          input.onNewSessionWorktreeReset?.()
          input.onSubmit?.()
          local.session.promote(sessionDirectory, session.id, selectedModel && selectedAgent ? {
            agent: agentKey(selectedAgent),
            model: { modelID: selectedModel.id, providerID: selectedModel.provider.id },
            variant: modelSelection.variant.current() ?? null,
          } : { agent, model, variant: variant ?? null })
          layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
          if (draftID && draftServer) tabs.promoteDraft(draftID, { server: draftServer, sessionId: session.id })
          if (!draftID) navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
        })
      })
    }
    if (isNewSession && selectRequest().admitted) {
      await promote()
      return true
    }
    if (!(await waitPolicy()) || !ownsSource()) return false
    if (shouldQueue) {
      draft.source = queuedPromptSources.capture(runtime, queueOwner)
      input.onQueue?.(draft)
      clearInput("all")
      return
    }

    if (!isNewSession) input.onSubmit?.()
    if (!(await waitPolicy()) || !ownsSource()) return false

    if (mode === "shell") {
      const sent = await submitShellCommand({
        api,
        sessionID: session.id,
        command: text,
        agent,
        model,
        signal: controller.signal,
        current: ownsSource,
        request: isNewSession ? selectRequest() : undefined,
        dispatch: isNewSession ? dispatch : undefined,
        before: async () => {
          if (!(await waitPolicy()) || !ownsSource()) return false
          clearInput()
          return !controller.signal.aborted && ownsSource()
        },
      }).catch(async (err) => {
        if (controller.signal.aborted) return false
        if (ownsSource()) showToast({
          title: language.t("prompt.toast.shellSendFailed.title"),
          description: errorMessage(err),
        })
        restoreInput()
        await settleEmptySession(true)
        return false
      })
      if (sent !== false) await promote()
      return sent
    }

    const request = isNewSession ? selectRequest() : undefined
    const isCommand = !request?.preparation && !!(request?.command ||
      text.startsWith("/") && syncState.data.command.some((command) => command.name === text.split(" ")[0].slice(1)))
    clearInput(isCommand ? "none" : "comments")

    function waitForWorktree() {
      return waitForSubmissionWorktree({
        scope: directorySDK.scope, directory: sessionDirectory, signal: controller.signal,
        current: ownsSource,
        onWaiting: () => {
          if (sessionDirectory === projectDirectory) syncState.set("session_status", draft.sessionID, { type: "busy" })
        },
        failedMessage: language.t("workspace.error.stillPreparing"),
      })
    }

    return sendFollowupDraft({
      api,
      sync: syncState,
      serverSync: serverState,
      draft: { ...draft, system: isCommand ? undefined : request?.preparation ? request.preparation.system :
        await followupSystem(platform, directorySDK.scope, serverState, projectDirectory) },
      messageID,
      optimisticBusy: isCommand || sessionDirectory === projectDirectory,
      pending: queued,
      signal: controller.signal,
      before: waitForWorktree,
      runtime,
      request,
      dispatch: isNewSession ? dispatch : undefined,
    })
      .then(async (sent) => {
        if (!sent) restoreInput()
        if (sent) await promote()
        if (sent && queued && ownsSource()) showToast({ title: language.t("orchestra.chat.delivery.queued") })
        return sent
      })
      .catch(async (err) => {
        if (controller.signal.aborted) return false
        if (ownsSource() && (isCommand || sessionDirectory === projectDirectory) && !queued) {
          syncState.set("session_status", session.id, { type: "idle" })
        }
        if (ownsSource()) showToast({
          title: language.t(isCommand ? "prompt.toast.commandSendFailed.title" : "prompt.toast.promptSendFailed.title"),
          description: isCommand && !hookRefusal(err) ? formatServerError(err, language.t, language.t("common.requestFailed")) : errorMessage(err),
        })
        removeOptimisticMessage()
        restoreInput()
        await settleEmptySession(true)
        return false
      })
  }

  return {
    abort,
    // What the composer renders as admitting: an admission in flight on this draft, or one already handed off to a
    // session. A draft submit holds busy for its whole admission, so the marker never clears mid-handoff.
    submitting: () => {
      return activity.existing > 0 || admissionSource().source.state.busy
    },
    handleSubmit(event: Event) {
      event.preventDefault()
      if (ownership.disposed()) return Promise.resolve(false)
      const target = prompt.capture()
      if (params.id) {
        const admission: Admission = { selection: input.newSessionWorktree?.() || "main" }
        setActivity("existing", (count) => count + 1)
        return submit(target, admission).finally(() => {
          setActivity("existing", (count) => count - 1)
          admission.cleanup?.()
        })
      }
      const current = admissionSource()
      if (current.source.state.busy) return Promise.resolve()
      const selection = input.newSessionWorktree?.() || "main"
      const admission = current.source.selections.get(selection) ?? { selection }
      current.source.selections.set(selection, admission)
      current.source.setBusy(true)
      return submit(target, admission).finally(() => {
        admission.cleanup?.()
        admission.abort = undefined
        current.source.setBusy(false)
        // A promoted admission belongs to its Session now; the draft's next visit must create a new one.
        if (admission.promoted && current.source.selections.get(selection) === admission) current.source.selections.delete(selection)
      })
    },
  }
}

// Reads one message of the Session from the server. A request that fails or takes too long rejects, which callers
// treat as "cannot confirm".
async function sessionHasNoMessages(server: ServerSDK, sessionID: string, directory: string) {
  const signal = AbortSignal.timeout(5_000)
  if ((await server.protocol) === "v1") {
    const result = await server.client.session.messages({ sessionID, directory, limit: 1 }, { signal })
    return (result.data ?? []).length === 0
  }
  const page = await server.currentApi.message.list({ sessionID, limit: 1, order: "desc" }, { signal })
  return page.data.length === 0
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

function interruptPendingSession(
  scope: ServerScope,
  sessionID: string,
  api: DirectorySDK["api"]["session"],
  state: ServerSync,
  failed: (error: unknown) => void,
) {
  state.session.set("todo", sessionID, [])
  const key = ScopedKey.from(scope, sessionID)
  const jobs = pending.get(key)
  if (jobs) {
    pending.delete(key)
    state.session.set("session_status", sessionID, { type: "idle" })
    ;[...jobs].reverse().forEach((job) => { job.abort.abort(); job.cleanup() })
  }
  return api.interrupt({ sessionID }).catch((error: unknown) => {
    failed(error)
    // The run may still be going: read its status back instead of keeping the optimistic idle.
    return api
      .active()
      .then((active) => state.session.set("session_status", sessionID, active[sessionID] ? { type: "busy" } : { type: "idle" }))
      .catch(() => {})
  })
}
