import type { Session } from "@/v2-wire"

import { showToast } from "@/utils/toast"
import { base64Encode } from "@orchestra/core/util/encode"
import { Binary } from "@orchestra/core/util/binary"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { batch, createRoot, onCleanup, startTransition, untrack, type Accessor } from "solid-js"
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
import { ServerConnection } from "@/context/server"
import { clearPending, pendingSnapshot } from "@/components/draft-subagent-models"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { modelExecutionReasonKey } from "@/i18n/frontend-recovery"
import { useSync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { defaultCopyParent, repositoryProject, WORKTREE_STRATEGY } from "@/orchestra/chapters/workspaces-model"
import { setCursorPosition } from "./editor-dom"
import { formatServerError, hookRefusal } from "@/utils/server-errors"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { createPromptSubmissionState } from "./submission-state"
import { normalizeSessionInfo } from "@/utils/session"
import { Event } from "@orchestra/schema/event"
import { draftSessionKey } from "./draft-session"
import { createCompatibleApi } from "@/utils/server-compat"
import { assessModelExecution, createSubmissionOwner, createSubmissionPolicy, sendFollowupRequest, waitForSubagentPolicy, waitForSubmissionWorktree } from "./submission-policy"
import { sourceAdmission, handoffAdmission, type Admission, type ExistingAdmission } from "./submission-admission"
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

export const sendFollowupDraft = createFollowupSender()

export function createFollowupSender(sources = queuedPromptSources) {
  return async (input: FollowupSendInput) => {
    const controller = !input.signal || input.currentSource ? new AbortController() : undefined
    const signal = controller && input.signal ? AbortSignal.any([controller.signal, input.signal]) : input.signal ?? controller?.signal
    const current = input.currentSource
    const rebound = current?.sessionID ? {
      serverScopeKey: current.serverScopeKey, directory: current.directory, sessionID: current.sessionID,
      api: input.api, sync: input.sync, serverSync: input.serverSync, current: current.current,
      before: (active = signal!) => waitForSubagentPolicy({ ...current, sessionID: current.sessionID!, signal: active }),
      readPolicyVersion: () => current.management.subagentModelsWriteVersion?.(current.sessionID!) ?? 0,
    } : undefined
    const source = input.runtime ?? sources.resolve(input.draft.source, input.draft, rebound, input.deliberate)
    if (!source && (input.currentSource || "source" in input.draft)) return false
    const policyVersion = source?.readPolicyVersion?.()
    const runtime = source && { ...source, current: () => source.current() &&
      (!!input.dispatch || source.readPolicyVersion?.() === policyVersion) && current?.current() !== false }
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
        signal,
        runtime,
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
  newSessionWorkspaceReady?: Accessor<boolean>
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
  const permission = usePermission()
  const prompt = input.prompt
  const layout = useLayout()
  const language = sessionRecoveryLanguage(useLanguage())
  const params = useParams()
  const [search] = useSearchParams<{ draftId?: string }>()
  const tabs = useTabs()
  const queueOwner = {}
  const existingOwner = {}
  onCleanup(() => queuedPromptSources.releaseOwner(queueOwner))
  const ownership = createSubmissionOwner(() => {
    const source = sdk()
    const draftID = search.draftId
    const tab = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === draftID)
    return {
      server: serverSDK(), credentials: JSON.stringify(serverSDK().server?.http), scope: source.scope, directory: source.directory,
      client: source.orchestra, api: source.api, worktree: input.newSessionWorktree?.(),
      sessionID: params.id, draftID, target: prompt.capture(),
      draftServer: tab?.type === "draft" ? tab.server : undefined,
      draftDirectory: tab?.type === "draft" ? tab.directory : undefined, draftExists: tab !== undefined,
    }
  })

  const [activity, setActivity] = createStore({ existing: 0 })
  const choiceOwner = createSubmissionOwner(() => ({
    intent: JSON.stringify((input.model ?? local.model).intent()), agent: local.agent.current()?.id,
    epoch: serverSDK().connectionEpoch?.() ?? 0,
    context: (input.model ?? local.model).execution.context(),
    policyVersion: params.id ? serverSDK().sessionManagement.subagentModelsWriteVersion?.(params.id) ?? 0 : 0,
  }))
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

  const capture = (target: PromptTarget) => {
    const modelSelection = input.model ?? local.model
    const intent = modelSelection.intent()
    const agentID = local.agent.key?.() ?? local.agent.current()?.id
    const selected: { value?: { model: { id: string; provider: { id: string } } | undefined;
      agent: { id: string; name: string } | undefined; variant: string | undefined } } = {}
    const selection = () => {
      if (selected.value) return selected.value
      const model = modelSelection.current()
      const agent = local.agent.current()
      const provisional = modelSelection.execution?.input().model
      const candidate = intent.model ?? (provisional && { providerID: provisional.providerID, modelID: provisional.id }) ??
        (model && { providerID: model.provider.id, modelID: model.id })
      const variant = typeof intent.variant === "string" ? intent.variant : intent.variant === null ? undefined
        : candidate && agent?.model?.providerID === candidate.providerID && agent.model.modelID === candidate.modelID && agent.variant !== undefined
          ? agent.variant : modelSelection.execution ? provisional?.variant : modelSelection.variant.current()
      selected.value = { model: candidate && { id: candidate.modelID, provider: { id: candidate.providerID } },
        agent: agentID ? { id: agentID, name: agent?.name ?? agentID } : undefined, variant }
      return selected.value
    }
    const server = serverSDK()
    const sessionID = params.id
    const mode = input.mode()
    const readPolicyVersion = () => sessionID && server.sessionManagement.subagentModelsWriteVersion
      ? server.sessionManagement.subagentModelsWriteVersion(sessionID) : 0
    return {
      owner: ownership.capture(),
      choiceOwner: choiceOwner.capture(), intent, intentKey: JSON.stringify(intent),
      epoch: server.connectionEpoch?.() ?? 0,
      submission: createPromptSubmissionState({ target, prompt: target.current(), context: target.context.items().slice() }),
      images: input.imageAttachments().map((image) => ({ ...image, blob: { ...image.blob } })),
      mode, modelSelection, sessionID, agentID,
      commentCount: input.commentCount(),
      get currentModel() { return selection().model },
      get currentAgent() { return selection().agent },
      get variant() { return selection().variant },
      delivery: sessionID ? input.delivery?.() : undefined,
      shouldQueue: !!sessionID && mode === "normal" && input.shouldQueue?.(),
      directorySDK: sdk(), client: sdk().orchestra, api: sdk().api, server,
      policyVersion: readPolicyVersion(), readPolicyVersion,
    }
  }

  const submit = async (target: PromptTarget, admission: Admission, captured = capture(target)) => {
    const owner = captured.owner
    const controller = new AbortController()
    admission.abort = controller
    const signal = AbortSignal.any([controller.signal, captured.owner.signal, captured.choiceOwner.signal])
    const submission = captured.submission
    const currentPrompt = submission.prompt
    const context = submission.context
    const text = currentPrompt.map((part) => ("content" in part ? part.content : "")).join("")
    const images = captured.images
    const mode = captured.mode

    if (text.trim().length === 0 && images.length === 0 && captured.commentCount === 0) {
      if (input.working()) void abort()
      return
    }

    const modelSelection = captured.modelSelection
    const retained = admission.request?.selection
    const currentModel = retained ? { id: retained.model.modelID, provider: { id: retained.model.providerID } } : captured.currentModel
    const currentAgent = retained ? { id: retained.agent, name: retained.agent } : captured.currentAgent
    const variant = retained ? retained.variant : captured.variant
    if (mode !== "shell" && !(admission.request?.kind === "prompt" && admission.request.admissionAttempted) && modelSelection.ready?.() === false)
      return false
    if (!currentModel || !currentAgent) {
      // On a first run there is no model to choose yet; the toast leads to where one is connected.
      showToast({
        title: language.t("prompt.toast.modelRequired.title"),
        description: language.t("prompt.toast.modelRequired.description"),
        actions: [
          {
            label: language.t("orchestra.chat.send.openProviders"),
            onClick: () => {
              // Chapters read the Home selection; keep this draft's project selected on the way to Providers.
              layout.home.setSelection({ server: ServerConnection.key(serverSDK().server), directory: sdk().directory })
              navigate("/orchestra/providers")
            },
          },
        ],
      })
      return
    }

    input.addToHistory(currentPrompt, mode)
    input.resetHistoryNavigation()

    const directorySDK = captured.directorySDK
    const server = captured.server
    const credentials = JSON.stringify(server.server?.http)
    const serverState = serverSync()
    const syncState = sync()
    const projectDirectory = directorySDK.directory
    const permissionState = permission.currentServerState()
    const isNewSession = !captured.sessionID
    const sessionID = captured.sessionID
    const draftID = search.draftId
    const draftServer = draftID ? tabs.draft(draftID).server : undefined
    const ownsBinding = () => {
      if (!owner.current()) return false
      if (server.transportCurrent?.() === false || directorySDK.transportCurrent?.() === false) return false
      const source = sdk()
      if (serverSDK() !== server || source.scope !== directorySDK.scope || JSON.stringify(server.server?.http) !== credentials) return false
      if (source.orchestra !== captured.client || source.api !== captured.api) return false
      if (source.directory !== projectDirectory || params.id !== sessionID || prompt.capture() !== target || search.draftId !== draftID) return false
      return !draftID || tabs.store.some((tab) =>
        tab.type === "draft" && tab.draftID === draftID && tab.server === draftServer && tab.directory === projectDirectory,
      )
    }
    const ownsSource = () => ownsBinding() && captured.choiceOwner.current() &&
      (server.connectionEpoch?.() ?? 0) === captured.epoch &&
      JSON.stringify(modelSelection.intent()) === captured.intentKey &&
      (local.agent.current()?.id ?? local.agent.key?.()) === captured.currentAgent?.id
    const rulesKey = input.pendingKey?.() ?? draftSessionKey(directorySDK.scope, projectDirectory, draftID)
    const shouldAutoAccept = isNewSession && input.autoAccept()
    const delivery = captured.delivery
    const shouldQueue = captured.shouldQueue
    const queued = delivery === "queue" && input.working()
    const worktreeSelection = admission.selection
    const actionKey = JSON.stringify({ currentPrompt, context, images, mode, agent: agentKey(currentAgent),
      model: { modelID: currentModel.id, providerID: currentModel.provider.id }, variant, worktreeSelection })
    if (isNewSession && admission.request && !admission.request.admitted &&
      (admission.request.key !== actionKey || admission.request.revision !== pendingSnapshot(rulesKey).revision))
      admission.request = undefined
    const kind = admission.request?.kind ?? (text.startsWith("/") &&
      syncState.data.command.some((command) => command.name === text.split(" ")[0].slice(1)) ? "command" : "prompt")

    let sessionDirectory = admission.directory ?? projectDirectory
    let session = admission.session ?? input.info()

    if (isNewSession) {
      if (!admission.directory && worktreeSelection === "create") {
        const project = repositoryProject(serverState.data.project, projectDirectory)
        // The server names the copy; it lands beside the repository like a Workspaces copy.
        const createdWorktree = await (project
          ? server.api.projectCopy.create({
              projectID: project.id,
              strategy: WORKTREE_STRATEGY,
              directory: defaultCopyParent(project.worktree),
              location: { directory: projectDirectory },
            })
          : Promise.resolve(undefined)
        )
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
        if (!ownsSource() || signal.aborted) return false
        WorktreeState.ready(directorySDK.scope, sessionDirectory)
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
            current: server.currentApi,
            directory: sessionDirectory,
          }).session

    if (mode !== "shell" && !shouldQueue && !(admission.request?.kind === "prompt" && admission.request.admissionAttempted) && (!isNewSession || !session)) {
      const policyReady = !sessionID || await Promise.resolve(server.sessionManagement.waitSubagentModels?.(sessionID))
        .then(() => true, () => false)
      if (!policyReady || !ownsSource() || captured.policyVersion !== captured.readPolicyVersion()) {
        if (ownsSource()) showToast({ title: language.t("dialog.subagentModels.saveFailed") })
        return false
      }
      const draftRevision = pendingSnapshot(rulesKey).revision
      const draftPhase = isNewSession ? createRoot((dispose) => ({ dispose,
        ...createSubmissionOwner(() => ({ revision: pendingSnapshot(rulesKey).revision })).capture(),
      })) : undefined
      const ready = await assessModelExecution({ api, directory: sessionDirectory, sessionID,
        agent: agentKey(currentAgent), model: { providerID: currentModel.provider.id, modelID: currentModel.id }, variant,
        signal: draftPhase ? AbortSignal.any([signal, draftPhase.signal]) : signal,
        current: () => ownsSource() && draftPhase?.current() !== false && captured.policyVersion === captured.readPolicyVersion(),
        onUnavailable: (reason) => showToast({ title: language.t(modelExecutionReasonKey(reason)) }),
      }).finally(() => draftPhase?.dispose())
      if (!ready) return false
      if (draftPhase && pendingSnapshot(rulesKey).revision !== draftRevision) {
        if (ownsSource()) showToast({ title: language.t("model.execution.unavailable") })
        return false
      }
    }
    if (!ownsSource() || signal.aborted) return false

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
    if (!ownsSource() || signal.aborted) return false
    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description"),
      })
      return
    }

    const model = admission.request?.selection?.model ?? {
      modelID: currentModel.id,
      providerID: currentModel.provider.id,
    }
    const agent = admission.request?.selection?.agent ?? agentKey(currentAgent)
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

    const messageID = admission.request?.id ?? Identifier.ascending("message")
    const removeOptimisticMessage = () => {
      if (ownsSource()) syncState.session.optimistic.remove({ directory: sessionDirectory, sessionID: session.id,
        messageID: admission.request?.id ?? messageID })
    }
    const phase: { value?: { signal: AbortSignal; current: () => boolean; dispose: VoidFunction; ready: boolean } } = {}
    const disposePhase = () => { const previous = phase.value; phase.value = undefined; previous?.dispose() }
    const untrackPending = trackPendingPrompt(directorySDK.scope, session.id, {
      abort: controller,
      cleanup: () => { removeOptimisticMessage(); restoreInput() },
      draft: isNewSession ? {
        key: rulesKey, target, scope: directorySDK.scope, directory: projectDirectory,
        sessionID: session.id, api, serverState,
      } : undefined,
    })
    admission.cleanup = () => { disposePhase(); untrackPending() }
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
      admission.acknowledgedPolicy = undefined
      admission.failedWrite = undefined
    }
    const policy = createSubmissionPolicy({
      key: rulesKey, sessionID: session.id,
      management: server.sessionManagement, admission, current: ownsSource,
      initialPolicy: isNewSession ? { mode: "inherit" } : undefined,
      failedMessage: language.t("common.requestFailed"),
    })
    const policyError = async (err: unknown) => {
      if (signal.aborted) return false as const
      if (ownsSource()) showToast({
        title: language.t("common.requestFailed"),
        description: sessionManagementUnsupported(err) ? language.t("session.subagentModels.unsupported") : errorMessage(err),
      })
      await settleEmptySession(false)
      return false as const
    }
    const receipt = { revision: undefined as number | undefined }
    const policyCurrent = () => !admission.request?.selection || captured.policyVersion === captured.readPolicyVersion()
    const ensurePolicyPhase = async () => {
      if (!isNewSession || mode === "shell") return ownsSource()
      if (phase.value) return phase.value.current() && phase.value.ready
      const child = createRoot((dispose) => ({ dispose,
        ...createSubmissionOwner(() => ({ sessionID: session.id,
          version: server.sessionManagement.subagentModelsWriteVersion?.(session.id) ?? 0,
        })).capture(),
      }))
      const onAbort = () => disposePhase()
      const capturedPhase = { ...child, ready: false, dispose: () => {
        signal.removeEventListener("abort", onAbort)
        child.dispose()
      } }
      phase.value = capturedPhase
      signal.addEventListener("abort", onAbort, { once: true })
      if (signal.aborted || !ownsSource()) { disposePhase(); return false }
      if (admission.request?.kind === "prompt" && admission.request.admissionAttempted) { capturedPhase.ready = true; return capturedPhase.current() }
      const ready = await assessModelExecution({ api, directory: sessionDirectory, sessionID: session.id,
        agent, model, variant, signal: AbortSignal.any([signal, capturedPhase.signal]),
        current: () => ownsSource() && capturedPhase.current() && pendingSnapshot(rulesKey).revision === receipt.revision,
        onUnavailable: (reason) => showToast({ title: language.t(modelExecutionReasonKey(reason)) }),
      })
      if (!capturedPhase.current() || !ownsSource()) return false
      capturedPhase.ready = ready
      return ready
    }
    const waitPolicy = async (): Promise<boolean> => {
      while (ownsSource() && !signal.aborted && policyCurrent()) {
        if (phase.value && !phase.value.current()) return false
        if (isNewSession && receipt.revision !== pendingSnapshot(rulesKey).revision) {
          disposePhase()
          const acknowledged = await policy.acknowledge(signal).catch(policyError)
          if (!acknowledged || !ownsSource()) return false
          receipt.revision = acknowledged.revision
        }
        if (!(await policy.wait(signal).catch(policyError)) || !policyCurrent()) return false
        if (!isNewSession) return ownsSource()
        if (pendingSnapshot(rulesKey).revision !== receipt.revision) continue
        if (!(await ensurePolicyPhase())) {
          if (phase.value && !phase.value.current()) return false
          if (pendingSnapshot(rulesKey).revision !== receipt.revision) continue
          return false
        }
        if (pendingSnapshot(rulesKey).revision === receipt.revision) return ownsSource()
      }
      return false
    }
    const runtime = {
      serverScopeKey: directorySDK.scope, directory: sessionDirectory, sessionID: session.id,
      api, sync: syncState, serverSync: serverState,
      current: () => shouldQueue ? ownsBinding() : ownsSource() && captured.policyVersion === captured.readPolicyVersion() &&
        (!isNewSession || mode === "shell" || phase.value?.current() === true),
      readPolicyVersion: () => server.sessionManagement.subagentModelsWriteVersion?.(session.id) ?? 0,
      before: (active = signal) => shouldQueue ? waitForSubagentPolicy({ serverScopeKey: directorySDK.scope,
        directory: sessionDirectory, sessionID: session.id, management: server.sessionManagement, current: ownsBinding, signal: active })
        : isNewSession || admission.request?.kind === "prompt" ? waitPolicy() : policy.wait(active),
    }
    if (isNewSession && admission.session) seed(serverState, sessionDirectory, admission.session)
    if (!(await waitPolicy()) || !ownsSource()) return false

    const selectRequest = () => {
      if (admission.request?.key !== actionKey || admission.request.revision !== receipt.revision) {
        admission.request = {
          key: actionKey,
          id: mode === "shell" ? Event.ID.create() : Identifier.ascending("message"),
          admitted: false,
          kind: mode === "normal" ? kind : undefined,
          revision: receipt.revision,
        }
      }
      return admission.request
    }
    const dispatch: PromptDispatch = async (send) => {
      if (!(await waitForWorktree())) return false
      if (!isNewSession) {
        const request = admission.request
        if (!request || !(await waitPolicy())) return false
        // The send inserts optimistic state before invoking this guard, so store observers cannot bypass the fence.
        const sent = await send(request, () => ownsSource() && !signal.aborted && policyCurrent())
        if (sent === false) return false
        request.admitted = true
        return true
      }
      while (ownsSource() && !signal.aborted) {
        if (!(await waitPolicy()) || !ownsSource()) return false
        if (pendingSnapshot(rulesKey).revision !== receipt.revision) continue
        if (shouldAutoAccept) permissionState.enableAutoAccept(session.id, sessionDirectory)
        if (!ownsSource() || signal.aborted) return false
        if (pendingSnapshot(rulesKey).revision !== receipt.revision) continue
        const request = selectRequest()
        if (!request.admitted) {
          request.revision = receipt.revision
          // Store observers can change ownership or policy; validate again after those mutations, at the API call.
          const sent = await send(request, () => ownsSource() && !signal.aborted && pendingSnapshot(rulesKey).revision === receipt.revision &&
            (mode === "shell" || phase.value?.current() === true && phase.value.ready)).catch((error: unknown) => {
            if (!request.admissionAttempted && ownsSource() && phase.value?.current() &&
              pendingSnapshot(rulesKey).revision !== receipt.revision) return false
            throw error
          })
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
      if (pendingSnapshot(rulesKey).revision !== admission.request.revision && !(await waitPolicy())) return
      await startTransition(() => {
        if (!ownsSource() || signal.aborted || admission.promoted) return
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
        signal,
        current: ownsSource,
        request: isNewSession ? selectRequest() : undefined,
        dispatch: isNewSession ? dispatch : undefined,
        before: async () => {
          if (!(await waitPolicy()) || !ownsSource()) return false
          clearInput()
          return !signal.aborted && ownsSource()
        },
      }).catch(async (err) => {
        if (signal.aborted) return false
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

    const request = isNewSession ? selectRequest() : admission.request
    const isCommand = request?.kind ? request.kind === "command" : !request?.preparation && !!(request?.command ||
      text.startsWith("/") && syncState.data.command.some((command) => command.name === text.split(" ")[0].slice(1)))
    clearInput(isCommand ? "none" : "comments")

    function waitForWorktree() {
      return waitForSubmissionWorktree({
        scope: directorySDK.scope, directory: sessionDirectory, signal,
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
      draft,
      messageID,
      optimisticBusy: isCommand || sessionDirectory === projectDirectory,
      pending: queued,
      signal,
      before: waitForWorktree,
      runtime,
      request,
      dispatch: isNewSession || request?.kind === "prompt" ? dispatch : undefined,
      preflight: () => ownsSource() && captured.policyVersion === captured.readPolicyVersion() &&
        (!isNewSession || phase.value?.current() === true && phase.value.ready && pendingSnapshot(rulesKey).revision === receipt.revision),
      signalForAdmission: () => phase.value ? AbortSignal.any([signal, phase.value.signal]) : signal,
    })
      .then(async (sent) => {
        if (!sent) restoreInput()
        if (sent) await promote()
        if (sent && queued && ownsSource()) showToast({ title: language.t("orchestra.chat.delivery.queued") })
        return sent
      })
      .catch(async (err) => {
        if (signal.aborted) return false
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
      if (ownership.disposed() || (!params.id && input.newSessionWorkspaceReady?.() === false)) return Promise.resolve(false)
      const target = prompt.capture()
      if (params.id) {
        const captured = capture(target)
        const owners = admissionSource().source.existing
        const actions = owners.get(existingOwner) ?? new Map<string, ExistingAdmission>()
        owners.set(existingOwner, actions)
        actions.forEach((action, key) => { if (!action.current()) actions.delete(key) })
        const agent = captured.agentID
        const text = captured.submission.prompt.map((part) => "content" in part ? part.content : "").join("")
        const intentKey = captured.mode === "normal" && !captured.shouldQueue && agent &&
          (text.trim().length || captured.images.length || captured.commentCount) ? JSON.stringify({
          currentPrompt: captured.submission.prompt, context: captured.submission.context, images: captured.images,
          mode: captured.mode, agent, model: captured.intent.model, variant: captured.intent.variant,
          delivery: captured.delivery, policyVersion: captured.policyVersion,
        }) : undefined
        // Lookup precedes catalog classification: an ambiguous unknown-slash prompt keeps its original kind.
        const previous = intentKey ? actions.get(intentKey) : undefined
        if (previous?.task) return previous.task
        const model = previous?.request.selection?.model ?? (captured.currentModel && {
          modelID: captured.currentModel.id, providerID: captured.currentModel.provider.id,
        })
        const kind = previous?.request.kind ?? (text.startsWith("/") &&
          sync().data.command.some((command) => command.name === text.split(" ")[0].slice(1)) ? "command" : "prompt")
        const key = previous?.request.key ?? JSON.stringify({
          currentPrompt: captured.submission.prompt, context: captured.submission.context, images: captured.images,
          mode: captured.mode, agent, model, variant: captured.variant, delivery: captured.delivery, policyVersion: captured.policyVersion,
        })
        const request: AdmissionRequest | undefined = intentKey && (previous || captured.modelSelection.ready?.() !== false && model) ? previous?.request ?? {
          key, intentKey, id: Identifier.ascending("message"), admitted: false, kind,
          selection: kind === "prompt" && agent && model ? {
            agent, model, variant: captured.variant, delivery: captured.delivery, policyVersion: captured.policyVersion,
          } : undefined,
        } : undefined
        const action: ExistingAdmission | undefined = request?.kind === "prompt" ? previous ?? {
          request,
          current: () => captured.owner.current() && captured.policyVersion === captured.readPolicyVersion(),
        } : undefined
        if (intentKey && action) actions.set(intentKey, action)
        const admission: Admission = { selection: input.newSessionWorktree?.() || "main", request }
        const task = Promise.withResolvers<boolean | undefined>()
        // Publish the joined task before callbacks, policy waits, or attachment preparation can reenter submit.
        if (action) action.task = task.promise
        setActivity("existing", (count) => count + 1)
        void submit(target, admission, captured).then((sent) => {
          if (sent === false && action && captured.owner.current() && !admission.abort?.signal.aborted &&
            captured.policyVersion !== captured.readPolicyVersion()) {
            const description = language.t("dialog.subagentModels.saveFailed")
            console.error(new Error(description))
            showToast({ variant: "error", title: language.t("common.requestFailed"), description })
          }
          if ((sent || action?.request.admitted) && intentKey && actions.get(intentKey) === action) actions.delete(intentKey)
          return typeof sent === "boolean" ? sent : undefined
        }).finally(() => {
          setActivity("existing", (count) => count - 1)
          admission.cleanup?.()
          if (action?.task === task.promise) action.task = undefined
        }).then(task.resolve, task.reject)
        return task.promise
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
  // The run may have ended or kept going while events were missed: read its status back instead of keeping a stale spinner.
  const readBack = (report: boolean) =>
    readBackStatus(
      Promise.resolve()
        .then(() => api.active())
        .then((active) =>
          state.session.set("session_status", sessionID, active[sessionID] ? { type: "busy" } : { type: "idle" }),
        ),
      (error) => {
        console.error(error)
        if (report) failed(error)
      },
    )
  return api.interrupt({ sessionID }).then(
    () => readBack(true),
    (error: unknown) => {
      failed(error)
      return readBack(false)
    },
  )
}

/** The status read after stop. Failure is reported and does not reject, so a stop that landed is not lost. */
export function readBackStatus(read: Promise<unknown>, report: (error: unknown) => void) {
  return read.then(
    () => undefined,
    (error: unknown) => {
      report(error)
    },
  )
}
