import { createSubmissionExecutor } from "./submission-execute"
import { pending, trackPendingPrompt, interruptPendingSession } from "./submission-pending"
export { submitShellCommand } from "./submission-transport"
export { readBackStatus } from "./submission-pending"
import type { Session } from "@/v2-wire"
import { showToast } from "@/utils/toast"
import { Binary } from "@orchestra/core/util/binary"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { onCleanup, untrack, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { useTabs } from "@/context/tabs"
import { useServerSync, type ServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useLocal, type ModelSelection } from "@/context/local"
import { usePermission } from "@/context/permission"
import { type ImageAttachmentPart, type Prompt, type usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { useSync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { hookRefusal } from "@/utils/server-errors"
import { ScopedKey } from "@/utils/server-scope"
import { createPromptSubmissionState } from "./submission-state"
import { Event } from "@orchestra/schema/event"
import { draftSessionKey } from "./draft-session"
import { createSubmissionOwner, sendFollowupRequest, waitForSubagentPolicy } from "./submission-policy"
import { sourceAdmission, type Admission, type ExistingAdmission } from "./submission-admission"
import { queuedPromptSources } from "./queued-prompt"
import type { AdmissionRequest, FollowupDraft, FollowupSendInput } from "./submission-types"
export type { FollowupDraft, FollowupSendInput } from "./submission-types"
export { acknowledgeDraftPolicy } from "./submission-policy"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>

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

  const submit = createSubmissionExecutor({
    input, navigate, sdk, sync, serverSync, serverSDK, local, permission, prompt, layout, language, params, search, tabs, queueOwner, errorMessage, abort, seed, capture, sendFollowupDraft,
  })

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
        const text = target.current().map((part) => "content" in part ? part.content : "").join("")
        const command = text.startsWith("/") && sync().data.command.some((command) => command.name === text.split(" ")[0].slice(1))
        const selection = input.model ?? local.model
        if (selection === local.model && selection.ready?.() === true && input.mode() === "normal" &&
          !input.shouldQueue?.() && !command && (text.trim().length || input.imageAttachments().length || input.commentCount())) {
          const model = selection.execution.input().model
          const agent = local.agent.key?.() ?? local.agent.current()?.id
          // Commit the Send's choice before ownership: its first optimistic row must not restore a new intent mid-send.
          if (model && agent) local.session.restore({ sessionID: params.id, agent,
            model: { providerID: model.providerID, modelID: model.id, variant: model.variant } })
        }
        const captured = capture(target)
        const owners = admissionSource().source.existing
        const actions = owners.get(existingOwner) ?? new Map<string, ExistingAdmission>()
        owners.set(existingOwner, actions)
        actions.forEach((action, key) => { if (!action.current()) actions.delete(key) })
        const agent = captured.agentID
        const intentKey = captured.mode === "normal" && !captured.shouldQueue && agent &&
          (text.trim().length || captured.images.length || captured.commentCount) ? JSON.stringify({
          currentPrompt: captured.submission.prompt, context: captured.submission.context, images: captured.images,
          mode: captured.mode, agent, model: captured.intent.model, variant: captured.intent.variant,
          delivery: captured.delivery, policyVersion: captured.policyVersion,
        }) : undefined
        // A retained request keeps its original kind even if the command catalog changed after its lost ACK.
        const previous = intentKey ? actions.get(intentKey) : undefined
        if (previous?.task) return previous.task
        const model = previous?.request.selection?.model ?? (captured.currentModel && {
          modelID: captured.currentModel.id, providerID: captured.currentModel.provider.id,
        })
        const kind = previous?.request.kind ?? (command ? "command" : "prompt")
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
