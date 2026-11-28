import { createEffect, createMemo, createSignal, ErrorBoundary, For, onCleanup, Show } from "solid-js"
import { base64Encode } from "@orchestra/core/util/encode"
import { Message } from "@orchestra/session-ui/message-part"
import { PromptInputV2Composer, usePromptInputV2Controller } from "@/components/prompt-input-v2"
import { CommentsProvider, useComments } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { useLocal } from "@/context/local"
import { ModelsProvider } from "@/context/models"
import { PromptProvider, usePrompt } from "@/context/prompt"
import { SDKProvider, useSDK } from "@/context/sdk"
import { ServerSDKProvider, useServerSDK } from "@/context/server-sdk"
import { ServerSyncProvider, useServerSync } from "@/context/server-sync"
import { DirectoryDataProvider } from "@/pages/directory-layout"
import { createPromptInputController } from "@/pages/session/composer"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"
import type { ServerConnection } from "@/context/server"
import { SessionRouteKey, SessionStateKey } from "@/utils/server-scope"
import { normalizeSessionInfo } from "@/utils/session"
import { isSessionNotFoundError } from "@/utils/server-errors"
import type { JanitorReport } from "@/utils/janitor-report"
import { agentKey } from "@/context/agent-identity"

export function JanitorPocketChat(props: {
  directory: () => string
  server: () => ServerConnection.Key | undefined
  report: JanitorReport
  onSessionID?: (sessionID: string) => void
}) {
  const language = useLanguage()
  const [sessionID, setSessionID] = createSignal<string>()
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error("[janitor-pocket]", error)
        return (
          <p class="px-4 py-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
            {language.t("janitor.pocket.unavailable")}
          </p>
        )
      }}
    >
      <ServerSDKProvider>
        <ServerSyncProvider>
          <LayoutProvider>
            <ModelsProvider directory={props.directory}>
              <SDKProvider directory={props.directory}>
                <DirectoryDataProvider directory={props.directory} server={props.server}>
                  <FileProvider>
                    <PromptProvider sessionID={sessionID}>
                      <CommentsProvider>
                        <PocketComposer
                          directory={props.directory}
                          report={props.report}
                          sessionID={sessionID}
                          onSessionID={(id) => {
                            setSessionID(id)
                            props.onSessionID?.(id)
                          }}
                        />
                      </CommentsProvider>
                    </PromptProvider>
                  </FileProvider>
                </DirectoryDataProvider>
              </SDKProvider>
            </ModelsProvider>
          </LayoutProvider>
        </ServerSyncProvider>
      </ServerSDKProvider>
    </ErrorBoundary>
  )
}

function PocketComposer(props: {
  directory: () => string
  report: JanitorReport
  sessionID: () => string | undefined
  onSessionID: (sessionID: string) => void
}) {
  const language = useLanguage()
  const prompt = usePrompt()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const comments = useComments()
  const local = useLocal()
  const sessionID = props.sessionID
  const [creating, setCreating] = createSignal(false)
  const [checkedKey, setCheckedKey] = createSignal<string>()
  const [attemptedKey, setAttemptedKey] = createSignal<string>()
  const [failedKey, setFailedKey] = createSignal<string>()
  const [retryNonce, setRetryNonce] = createSignal(0)
  let generation = 0
  onCleanup(() => { generation++ })
  const storageKey = createMemo(
    () => `orchestra.janitor.session.${serverSDK().scope}.${base64Encode(props.directory())}`,
  )
  const sessionKey = createMemo(() =>
    SessionStateKey.from(serverSDK().scope, SessionRouteKey.fromRoute(base64Encode(props.directory()), sessionID())),
  )

  const sessionInfo = () => {
    const id = sessionID()
    return id ? serverSync().session.get(id) : undefined
  }
  const model = createPromptModelSelection({
    agent: local.agent.current,
    session: {
      server: serverSDK,
      id: sessionID,
      info: sessionInfo,
      ready: () => sessionID() ? !!sessionInfo() : checkedKey() === storageKey(),
    },
  })

  createEffect(() => {
    retryNonce()
    const key = storageKey()
    if (sessionID() || creating() || attemptedKey() === key || failedKey() === key) return
    const checked = checkedKey() === key
    const agent = local.agent.current()
    const selected = model.execution.input().model
    if (checked && (!agent || !selected || !model.execution.ready())) return
    const directory = props.directory()
    const scope = serverSDK().scope
    const runID = ++generation
    setCreating(true)
    if (checked) setAttemptedKey(key)
    const isCurrent = () =>
      runID === generation && storageKey() === key && props.directory() === directory && serverSDK().scope === scope
    void (async () => {
      if (!checked) {
        let stored: string | null = null
        try {
          stored = localStorage.getItem(key)
        } catch {
          stored = null
        }
        if (stored) {
          const existing = await serverSync().session.resolve(stored, { force: true }).catch((error: unknown) => {
            if (!isSessionNotFoundError(error, stored)) throw error
          })
          if (!isCurrent()) return
          if (existing) {
            props.onSessionID(stored)
            return
          }
        }
        if (isCurrent()) setCheckedKey(key)
        return
      }

      if (!isCurrent() || !agent || !selected) return
      const currentSync = serverSync().ensureDirSyncContext(directory)
      const created = await sdk()
        .api.session.create({
          agent: agentKey(agent),
          model: selected,
          location: { directory },
        })
        .then((result) => normalizeSessionInfo(result))
      if (!isCurrent()) return
      currentSync.session.remember(created)
      try {
        localStorage.setItem(key, created.id)
      } catch {
        // Session remains usable for this mount even if persistence is unavailable.
      }
      props.onSessionID(created.id)
    })()
      .catch((error) => {
        if (isCurrent()) setFailedKey(key)
        console.error("[janitor-pocket] session", error)
      })
      .finally(() => {
        if (runID === generation) setCreating(false)
      })
  })

  const retry = () => {
    setFailedKey(undefined)
    setAttemptedKey(undefined)
    setRetryNonce((value) => value + 1)
  }

  const controls = createPromptInputController({
    sessionKey,
    sessionID,
    queryOptions: serverSync().queryOptions,
    model,
  })
  const input = usePromptInputV2Controller({
    sessionID,
    sessionInfo,
    pendingKey: sessionKey,
    get controls() {
      return controls()
    },
    get newSessionWorktree() {
      return props.directory()
    },
    onNewSessionWorktreeReset: () => {},
    onSubmit: () => comments.clear(),
  })

  return (
    <div class="flex min-h-0 flex-col">
      <PocketTimeline sessionID={sessionID} />
      <div class="border-t border-v2-border-border-base px-4 py-3">
        <Show
          when={prompt.ready() && sessionID()}
          fallback={
            <Show
              when={failedKey() === storageKey()}
              fallback={<p class="text-[13px] font-[440] text-v2-text-text-muted">{language.t("prompt.loading")}</p>}
            >
              <div class="flex items-center gap-2">
                <p class="text-[13px] font-[440] text-v2-text-text-muted">{language.t("janitor.pocket.unavailable")}</p>
                <button type="button" class="text-[13px] underline" onClick={retry}>
                  {language.t("janitor.pocket.retry")}
                </button>
              </div>
            </Show>
          }
        >
          <PromptInputV2Composer
            controller={input}
            class="[&_[data-slot=prompt-input-v2-toolbar]]:h-auto [&_[data-slot=prompt-input-v2-toolbar]]:min-h-11 [&_[data-slot=prompt-input-v2-toolbar]]:py-2 [&_[data-slot=prompt-input-v2-controls]]:flex-wrap"
          />
        </Show>
      </div>
    </div>
  )
}

function PocketTimeline(props: { sessionID: () => string | undefined }) {
  const sync = useServerSync()
  const language = useLanguage()
  const [failed, setFailed] = createSignal(false)
  const [retry, setRetry] = createSignal(0)
  createEffect(() => {
    retry()
    const id = props.sessionID()
    if (!id) return
    const session = sync().session
    let active = true
    session.pin(id)
    onCleanup(() => {
      active = false
      session.unpin(id)
    })
    setFailed(false)
    void session.sync(id).catch((error: unknown) => {
      if (!active) return
      setFailed(true)
      console.error("[janitor-pocket] history", error)
    })
  })
  const messages = createMemo(() => {
    const id = props.sessionID()
    return id ? (sync().session.data.message[id] ?? []) : []
  })

  return (
    <>
      <Show when={failed()}>
        <button type="button" class="self-start px-4 py-2 text-[13px] underline" onClick={() => setRetry((value) => value + 1)}>
          {language.t("janitor.pocket.retry")}
        </button>
      </Show>
      <Show when={messages().length > 0}>
        <div class="min-h-0 max-h-[38dvh] overflow-y-auto px-1 py-2">
          <For each={messages()}>
            {(message) => (
              <Message
                message={message}
                parts={sync().session.data.part[message.id] ?? []}
                showReasoningSummaries
                useV2Actions
              />
            )}
          </For>
        </div>
      </Show>
    </>
  )
}
