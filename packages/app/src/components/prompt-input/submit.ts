import type { Message, Session } from "@orchestra/sdk/v2/client"
import { showToast } from "@/utils/toast"
import { base64Encode } from "@orchestra/core/util/encode"
import { Binary } from "@orchestra/core/util/binary"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { batch, createComputed, createMemo, onCleanup, startTransition, type Accessor } from "solid-js"
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
import { sameModelPolicy, type SubagentModelPolicy } from "@/components/subagent-model-rules"
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
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { SessionManagementUnsupported } from "@/utils/session-management-errors"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>
type PromptPreparation = ReturnType<typeof buildRequestParts> & { system?: string }
type AdmissionRequest = {
  key: string
  id: string
  admitted: boolean
  revision?: number
  preparation?: PromptPreparation
  command?: Parameters<DirectorySDK["api"]["session"]["command"]>[0]
  shell?: Parameters<DirectorySDK["api"]["session"]["shell"]>[0]
}
type PromptDispatch = (send: (request: AdmissionRequest) => Promise<unknown>) => Promise<boolean>
type Admission = { busy: boolean; directory?: string; session?: Pick<Session, "id">; policyWritten?: boolean; legacyOverrideAcknowledged?: boolean }
const admissions = new WeakMap<PromptTarget, Map<string, Admission>>()

/** Each edit, including restoring inheritance, needs its own durable receipt. */
export async function acknowledgeDraftPolicy(input: {
  key: string
  current: () => boolean
  write: (policy: SubagentModelPolicy) => Promise<SubagentModelPolicy>
  wait: () => Promise<void>
  written: () => boolean
  markWritten: () => void
  failedMessage: string
}) {
  while (input.current()) {
    const snapshot = pendingSnapshot(input.key)
    if (snapshot.revision > 0 || input.written()) {
      input.markWritten()
      const acknowledged = await input.write(snapshot.policy)
      if (!input.current()) return
      if (!sameModelPolicy(acknowledged, snapshot.policy)) throw new Error(input.failedMessage)
    }
    await input.wait()
    if (!input.current()) return
    if (pendingSnapshot(input.key).revision !== snapshot.revision) continue
    return snapshot
  }
}

type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
}

const pending = new Map<string, PendingPrompt>()

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
  // Queued handoff retains the admitting source and rechecks its latest writes at send time.
  source?: {
    api: DirectorySDK["api"]["session"]
    serverSync: ServerSync
    sync: DirectorySync
    current: () => boolean
    before: () => Promise<boolean>
  }
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
  before?: () => Promise<boolean> | boolean
  dispatch?: PromptDispatch
  request?: AdmissionRequest
}

// Read the profile's behaviors at send time. Never rejects, and gives up on a slow storage load.
export function followupSystem(platform: Platform, scope: ServerScope, serverSync: ServerSync, directory: string) {
  return resolveBehaviorSystem({ platform, scope, projects: serverSync.data.project, directory }).catch(() => undefined)
}

const draftText = (prompt: Prompt) => prompt.map((part) => ("content" in part ? part.content : "")).join("")

const draftImages = (prompt: Prompt) => prompt.filter((part): part is ImageAttachmentPart => part.type === "image")

export async function sendFollowupDraft(input: FollowupSendInput) {
  const api = input.draft.source?.api ?? input.api
  const serverState = input.draft.source?.serverSync ?? input.serverSync
  const syncState = input.draft.source?.sync ?? input.sync
  const current = () => input.draft.source?.current() !== false
  if (input.request?.admitted) return current()
  const text = draftText(input.draft.prompt)
  const images = draftImages(input.draft.prompt)
  const setBusy = () => {
    if (!input.optimisticBusy) return
    if (!current()) return
    serverState.session.set("session_status", input.draft.sessionID, { type: "busy" })
  }

  const setIdle = () => {
    if (!input.optimisticBusy) return
    if (!current()) return
    serverState.session.set("session_status", input.draft.sessionID, { type: "idle" })
  }

  const wait = async () => {
    if (!current()) return false
    const ok = await input.before?.()
    if (ok === false || !current()) return false
    const ready = await input.draft.source?.before()
    return ready !== false && current()
  }

  if (!(await wait()) || !current()) return false

  const [head, ...tail] = text.split(" ")
  const cmd = head?.startsWith("/") ? head.slice(1) : undefined
  if (cmd && !input.request?.preparation && (input.request?.command || syncState.data.command.find((item) => item.name === cmd))) {
    const files = input.request?.command?.files ?? await Promise.all(
      images.map(async (attachment) => ({
        uri: await blobDataUrl(attachment.blob, attachment.mime),
        name: attachment.filename,
      })),
    )
    if (!current()) return false
    try {
      if (!(await wait()) || !current()) {
        setIdle()
        return false
      }
      if (!input.dispatch) setBusy()
      const messageID = Identifier.ascending("message")
      const send = (request?: AdmissionRequest) => {
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
        if (input.dispatch) setBusy()
        return api.command(command)
      }
      if (input.dispatch) {
        const sent = await input.dispatch(send)
        if (!sent) setIdle()
        return sent
      }
      await send()
      return current()
    } catch (err) {
      setIdle()
      throw err
    }
  }

  const messageID = input.messageID ?? Identifier.ascending("message")
  const encodedImages = input.request?.preparation ? [] : await Promise.all(
    images.map(async (attachment) => ({
      ...attachment,
      dataUrl: await blobDataUrl(attachment.blob, attachment.mime),
    })),
  )
  if (!current()) return false
  if (!(await wait()) || !current()) return false
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
    syncState.session.optimistic.add({
      directory: input.draft.sessionDirectory,
      sessionID: input.draft.sessionID,
      message: { ...message, id: prepared.request?.id ?? messageID },
      parts: prepared.value.optimisticParts,
    })

  const remove = () =>
    syncState.session.optimistic.remove({
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
    if (!(await wait()) || !current()) {
      batch(() => {
        setIdle()
        remove()
      })
      return false
    }

    const send = (request?: AdmissionRequest) => {
      if (request) {
        if (!request.preparation) {
          // A policy change at the final fence is a new action. Rebind both sides of the prepared turn together.
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
      const requestParts = prepared.value.requestParts
      return api.prompt({
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
      })
    }
    if (input.dispatch) {
      const sent = await input.dispatch(send)
      if (!sent) batch(() => { setIdle(); remove() })
      return sent
    }
    await send()
    return current()
  } catch (err) {
    batch(() => {
      setIdle()
      remove()
    })
    throw err
  }
}

// Shared by the composer and evidence replay: every shell run gets a new event ID (exact draft retries retain it), and
// the request carries no workdir, so callers must only replay in the session directory.
export async function submitShellCommand(input: {
  api: DirectorySDK["api"]["session"]
  sessionID: string
  command: string
  agent: string
  model: { providerID: string; modelID: string }
  before?: () => Promise<boolean> | boolean
  current?: () => boolean
  id?: Event.ID
  dispatch?: PromptDispatch
}) {
  if (input.current?.() === false) return
  if ((await input.before?.()) === false || input.current?.() === false) return
  const send = (request?: AdmissionRequest) => {
    const shell = request?.shell ?? {
      sessionID: input.sessionID,
      id: request ? Event.ID.make(request.id) : input.id ?? Event.ID.create(),
      command: input.command,
      agent: input.agent,
      model: input.model,
    }
    if (request) request.shell = shell
    return input.api.shell(shell)
  }
  if (input.dispatch) return input.dispatch(send)
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
  const pendingKey = (sessionID: string) => ScopedKey.from(sdk().scope, sessionID)
  const ownerIdentity = createMemo(() => {
    const source = sdk()
    const draftID = search.draftId
    const tab = tabs.store.filter((tab) => tab.type === "draft").find((tab) => tab.draftID === draftID)
    return {
      server: serverSDK(),
      scope: source.scope,
      directory: source.directory,
      sessionID: params.id,
      draftID,
      target: prompt.capture(),
      draftServer: tab?.server,
      draftDirectory: tab?.directory,
      draftExists: tab !== undefined,
    }
  }, undefined, {
    equals: (left, right) => !!left &&
      left.server === right.server && left.scope === right.scope && left.directory === right.directory &&
      left.sessionID === right.sessionID && left.draftID === right.draftID && left.target === right.target &&
      left.draftServer === right.draftServer && left.draftDirectory === right.draftDirectory && left.draftExists === right.draftExists,
  })
  const ownership: {
    generation: number
    disposed: boolean
    handoff?: (next: ReturnType<typeof ownerIdentity>) => boolean
  } = { generation: 0, disposed: false }
  createComputed(() => {
    const current = ownerIdentity()
    // One ACK-qualified transition may move this attempt into its admitted Session.
    if (ownership.handoff?.(current)) {
      ownership.handoff = undefined
      return
    }
    ownership.handoff = undefined
    ownership.generation++
  })
  onCleanup(() => {
    ownership.disposed = true
    ownership.generation++
    ownership.handoff = undefined
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
    if (ownership.disposed) return
    const sessionID = params.id
    if (!sessionID) return Promise.resolve()

    serverSync().session.set("todo", sessionID, [])

    input.onAbort?.()

    const key = pendingKey(sessionID)
    const queued = pending.get(key)
    if (queued) {
      queued.abort.abort()
      queued.cleanup()
      pending.delete(key)
      return Promise.resolve()
    }
    return sdk()
      .api.session.interrupt({ sessionID })
      .catch(() => {})
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
    const ownerGeneration = ownership.generation
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
      if (ownership.disposed || ownership.generation !== ownerGeneration) return false
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
        ownership.handoff = (owner) => owner.server === server && owner.scope === directorySDK.scope &&
          owner.directory === sessionDirectory && owner.sessionID === session.id &&
          owner.draftID === undefined && owner.target === next
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
      ownership.handoff = undefined
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
      source: { api, sync: syncState, serverSync: serverState, current: ownsSource, before: waitPolicy },
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

    for (const item of commentItems) submission.target().context.remove(item.key)
    clearInput()

    const waitForWorktree = async () => {
      if (!ownsSource()) return false
      const worktree = WorktreeState.get(directorySDK.scope, sessionDirectory)
      if (!worktree || worktree.status !== "pending") return true

      if (sessionDirectory === projectDirectory) {
        syncState.set("session_status", session.id, { type: "busy" })
      }

      const controller = new AbortController()
      const cleanup = () => {
        if (sessionDirectory === projectDirectory) {
          syncState.set("session_status", session.id, { type: "idle" })
        }
        removeOptimisticMessage()
        if (restoreInput()) restoreCommentItems(submission.target(), commentItems)
      }

      pending.set(ScopedKey.from(directorySDK.scope, session.id), { abort: controller, cleanup })

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
      const timer: { id?: number } = {}
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
      pending.delete(ScopedKey.from(directorySDK.scope, session.id))
      if (controller.signal.aborted || !ownsSource()) return false
      if (result.status === "failed") throw new Error(result.message)
      return true
    }

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
      before: waitForWorktree,
    })
      .then((sent) => {
        if (sent && queued) showToast({ title: language.t("orchestra.chat.delivery.queued") })
      })
      .catch((err) => {
        pending.delete(ScopedKey.from(directorySDK.scope, session.id))
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
      if (ownership.disposed) return Promise.resolve()
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
        if (admission.session && params.id === admission.session.id) scoped.delete(key)
      })
    },
  }
}
