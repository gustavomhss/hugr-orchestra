import type { Session } from "@/v2-wire"
import { showToast } from "@/utils/toast"
import { base64Encode } from "@orchestra/core/util/encode"
import { useNavigate, useParams } from "@solidjs/router"
import { batch, createRoot, startTransition } from "solid-js"
import { useTabs } from "@/context/tabs"
import { useServerSync, type ServerSync } from "@/context/server-sync"
import { useLayout } from "@/context/layout"
import { useLocal, type ModelSelection } from "@/context/local"
import { agentKey } from "@/context/agent-identity"
import { usePermission } from "@/context/permission"
import { type ImageAttachmentPart, type usePrompt } from "@/context/prompt"
import { useSDK, type DirectorySDK } from "@/context/sdk"
import { useServerSDK, type ServerSDK } from "@/context/server-sdk"
import { ServerConnection } from "@/context/server"
import { clearPending, pendingSnapshot } from "@/components/draft-subagent-models"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { modelExecutionReasonKey } from "@/i18n/frontend-recovery"
import { useSync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { Worktree } from "@/utils/worktree"
import { defaultCopyParent, repositoryProject, WORKTREE_STRATEGY } from "@/orchestra/chapters/workspaces-model"
import { setCursorPosition } from "./editor-dom"
import { formatServerError, hookRefusal } from "@/utils/server-errors"
import { pathKey } from "@/utils/path-key"
import { createPromptSubmissionState } from "./submission-state"
import { normalizeSessionInfo } from "@/utils/session"
import { Event } from "@orchestra/schema/event"
import { draftSessionKey } from "./draft-session"
import { createCompatibleApi } from "@/utils/server-compat"
import { assessModelExecution, createSubmissionOwner, createSubmissionPolicy, waitForSubagentPolicy, waitForSubmissionWorktree } from "./submission-policy"
import { sourceAdmission, handoffAdmission, type Admission } from "./submission-admission"
import { queuedPromptSources } from "./queued-prompt"
import type { FollowupDraft, PromptDispatch } from "./submission-types"
import type { createPromptSubmit, createFollowupSender } from "./submit"
import { trackPendingPrompt } from "./submission-pending"
import { submitShellCommand } from "./submission-transport"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>
type SubmissionCapture = {
  owner: ReturnType<ReturnType<typeof createSubmissionOwner>["capture"]>
  choiceOwner: ReturnType<ReturnType<typeof createSubmissionOwner>["capture"]>
  intent: ReturnType<ModelSelection["intent"]>
  intentKey: string
  epoch: number
  submission: ReturnType<typeof createPromptSubmissionState>
  images: ImageAttachmentPart[]
  mode: "normal" | "shell"
  modelSelection: ModelSelection
  sessionID: string | undefined
  agentID: string | undefined
  commentCount: number
  readonly currentModel: { id: string; provider: { id: string } } | undefined
  readonly currentAgent: { id: string; name: string } | undefined
  readonly variant: string | undefined
  delivery: "steer" | "queue" | undefined
  shouldQueue: boolean | undefined
  directorySDK: DirectorySDK
  client: DirectorySDK["orchestra"]
  api: DirectorySDK["api"]
  server: ServerSDK
  policyVersion: number
  readPolicyVersion: () => number
}

type Environment = {
  input: Parameters<typeof createPromptSubmit>[0]
  navigate: ReturnType<typeof useNavigate>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  serverSync: ReturnType<typeof useServerSync>
  serverSDK: ReturnType<typeof useServerSDK>
  local: ReturnType<typeof useLocal>
  permission: ReturnType<typeof usePermission>
  prompt: ReturnType<typeof usePrompt>
  layout: ReturnType<typeof useLayout>
  language: ReturnType<typeof sessionRecoveryLanguage>
  params: ReturnType<typeof useParams>
  search: { draftId?: string }
  tabs: ReturnType<typeof useTabs>
  queueOwner: object
  errorMessage: (error: unknown) => string
  abort: () => Promise<unknown>
  seed: (state: ServerSync, directory: string, info: Session) => void
  capture: (target: PromptTarget) => SubmissionCapture
  sendFollowupDraft: ReturnType<typeof createFollowupSender>
}

export function createSubmissionExecutor(environment: Environment) {
  const input = environment.input
  const navigate = environment.navigate
  const sdk = environment.sdk
  const sync = environment.sync
  const serverSync = environment.serverSync
  const serverSDK = environment.serverSDK
  const local = environment.local
  const permission = environment.permission
  const prompt = environment.prompt
  const layout = environment.layout
  const language = environment.language
  const params = environment.params
  const search = environment.search
  const tabs = environment.tabs
  const queueOwner = environment.queueOwner
  const errorMessage = environment.errorMessage
  const abort = environment.abort
  const seed = environment.seed
  const capture = environment.capture
  const sendFollowupDraft = environment.sendFollowupDraft

  const submit = async (target: PromptTarget, admission: Admission, captured = capture(target)) => {
    const owner = captured.owner
    const controller = new AbortController()
    admission.abort = controller
    const baseSignal = AbortSignal.any([controller.signal, captured.owner.signal])
    const signal = AbortSignal.any([baseSignal, captured.choiceOwner.signal])
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
    const confirmed = !captured.sessionID && admission.request?.admitted === true
    const retained = admission.request?.selection
    const currentModel = retained ? { id: retained.model.modelID, provider: { id: retained.model.providerID } } : captured.currentModel
    const currentAgent = retained ? { id: retained.agent, name: retained.agent } : captured.currentAgent
    const variant = retained ? retained.variant : captured.variant
    if (!confirmed && mode !== "shell" && !(admission.request?.kind === "prompt" && admission.request.admissionAttempted) && modelSelection.ready?.() === false)
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
    const untrackEarly = sessionID ? trackPendingPrompt(directorySDK.scope, sessionID, {
      abort: controller,
      cleanup: () => {},
    }) : undefined
    if (untrackEarly) admission.cleanup = untrackEarly
    const reportPolicyError = (err: unknown, current = ownsSource, active = signal) => {
      if (!active.aborted && current()) showToast({
        title: language.t("common.requestFailed"),
        description: sessionManagementUnsupported(err) ? language.t("session.subagentModels.unsupported") : errorMessage(err),
      })
    }
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
        Worktree.ready(directorySDK.scope, sessionDirectory)
      }

      if (!admission.directory && worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      // Persisted workspace lists can outlive a removed copy. Refuse before creating a Session in a stale placement.
      if (!session && sessionDirectory !== projectDirectory && worktreeSelection !== "create") {
        const valid = await server.api.project.current({ location: { directory: projectDirectory } })
          .then(async (project) => pathKey(project.directory) === pathKey(sessionDirectory) ||
            (await server.api.project.directories({ projectID: project.id }))
              .some((entry) => pathKey(entry.directory) === pathKey(sessionDirectory)))
          .catch((error: unknown) => {
            console.error("Failed to validate session workspace", error)
            return false
          })
        if (!ownsSource() || controller.signal.aborted) return false
        if (!valid) {
          console.error("Session workspace is not available in the owning project", sessionDirectory)
          showToast({
            variant: "error",
            title: language.t("prompt.toast.sessionCreateFailed.title"),
            description: language.t("common.requestFailed"),
          })
          return false
        }
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
      if (sessionID && !(await waitForSubagentPolicy({ sessionID, management: server.sessionManagement,
        current: ownsSource, signal }).catch((err: unknown) => {
        reportPolicyError(err)
        return false
      }))) return false
      if (!ownsSource() || captured.policyVersion !== captured.readPolicyVersion()) {
        if (!signal.aborted && ownsSource()) showToast({ title: language.t("dialog.subagentModels.saveFailed") })
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
    if (confirmed ? !ownsBinding() || baseSignal.aborted : !ownsSource() || signal.aborted) return false

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
    if (confirmed ? !ownsBinding() || baseSignal.aborted : !ownsSource() || signal.aborted) return false
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
    const capturedRequest = admission.request
    const removeOptimisticMessage = () => {
      const current = ownsSource()
      if (!current && !(capturedRequest?.kind === "prompt" && !capturedRequest.admissionAttempted && ownsBinding())) return
      syncState.session.optimistic.remove({ directory: sessionDirectory, sessionID: session.id,
        messageID: current ? admission.request?.id ?? messageID : messageID })
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
    untrackEarly?.()
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
      reportPolicyError(err)
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
      before: (active = signal) => shouldQueue ? waitForSubagentPolicy({
        sessionID: session.id, management: server.sessionManagement, current: ownsBinding, signal: active })
        : isNewSession || admission.request?.kind === "prompt" ? waitPolicy() : policy.wait(active),
    }
    if (isNewSession && admission.session) seed(serverState, sessionDirectory, admission.session)

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
          // Save the original admitted selection only after a positive ACK; it can recover handoff, not eligibility.
          request.selection = { agent, model, variant, delivery, policyVersion: captured.policyVersion }
        }
        return true
      }
      return false
    }
    const promote = async () => {
      const current = () => ownsBinding() && !baseSignal.aborted
      const request = admission.request
      if (!isNewSession || !request?.admitted || request.revision === undefined || admission.promoted || !current()) return
      // A confirmed receipt no longer depends on the unsent choice or its metadata generation.
      const handoffPolicy = createSubmissionPolicy({
        key: rulesKey, sessionID: session.id,
        management: server.sessionManagement, admission, current,
        initialPolicy: { mode: "inherit" }, failedMessage: language.t("common.requestFailed"),
      })
      const handoffError = (err: unknown) => {
        reportPolicyError(err, current, baseSignal)
        return false as const
      }
      receipt.revision ??= request.revision
      while (current()) {
        if (pendingSnapshot(rulesKey).revision !== receipt.revision) {
          const acknowledged = await handoffPolicy.acknowledge(baseSignal).catch(handoffError)
          if (!acknowledged || !current()) return
          receipt.revision = acknowledged.revision
        }
        if (!(await handoffPolicy.wait(baseSignal).catch(handoffError)) || !current()) return
        if (pendingSnapshot(rulesKey).revision === receipt.revision) break
      }
      await startTransition(() => {
        if (!current() || admission.promoted || admission.request !== request ||
          pendingSnapshot(rulesKey).revision !== receipt.revision) return
        // An admitted prompt always hands the draft off to its Session, so Enter on the draft can never post it again.
        // Edits made during the send (text, context, model, agent) move into the Session composer unsent.
        clearPending(rulesKey, receipt.revision ?? request.revision)
        const selected = modelSelection.intent()
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
          local.session.promote(sessionDirectory, session.id, {
            agent: selectedAgent ? agentKey(selectedAgent) : local.agent.key?.(),
            model: selected.model,
            variant: selected.variant,
          })
          layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
          if (draftID && draftServer) tabs.promoteDraft(draftID, { server: draftServer, sessionId: session.id })
          if (!draftID) navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
        })
      })
    }
    if (isNewSession && admission.request?.admitted) {
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
      admissionSignal: isNewSession ? baseSignal : undefined,
    })
      .then(async (sent) => {
        if (!sent) restoreInput()
        if (sent) await promote()
        if (sent && queued && ownsSource()) showToast({ title: language.t("orchestra.chat.delivery.queued") })
        return sent
      })
      .catch(async (err) => {
        if (signal.aborted) {
          removeOptimisticMessage()
          restoreInput()
          return false
        }
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

  return submit
}

// Reads one message of the Session from the server. A request that fails or takes too long rejects, which callers
// treat as "cannot confirm".
async function sessionHasNoMessages(server: ServerSDK, sessionID: string, directory: string) {
  const signal = AbortSignal.timeout(5_000)
  const page = await server.currentApi.message.list({ sessionID, limit: 1, order: "desc" }, { signal })
  return page.data.length === 0
}

