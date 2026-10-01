import { createEffect, createMemo, createSignal, ErrorBoundary, For, Show } from "solid-js"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Message } from "@opencode-ai/session-ui/message-part"
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
import type { JanitorReport } from "@/utils/janitor-report"

export function JanitorPocketChat(props: {
  directory: () => string
  server: () => ServerConnection.Key | undefined
  report: JanitorReport
  onSessionID?: (sessionID: string) => void
}) {
  const language = useLanguage()
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
                    <PromptProvider>
                      <CommentsProvider>
                        <PocketComposer
                          directory={props.directory}
                          report={props.report}
                          onSessionID={props.onSessionID}
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
  onSessionID?: (sessionID: string) => void
}) {
  const language = useLanguage()
  const prompt = usePrompt()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const comments = useComments()
  const local = useLocal()
  const model = createPromptModelSelection({ agent: () => local.agent.current() })
  const [sessionID, setSessionID] = createSignal<string>()
  const [creating, setCreating] = createSignal(false)
  const [attemptedKey, setAttemptedKey] = createSignal<string>()
  const [failedKey, setFailedKey] = createSignal<string>()
  const [retryNonce, setRetryNonce] = createSignal(0)
  let generation = 0
  const storageKey = createMemo(
    () => `opencode.janitor.session.${serverSDK().scope}.${base64Encode(props.directory())}`,
  )
  const sessionKey = createMemo(() =>
    SessionStateKey.from(serverSDK().scope, SessionRouteKey.fromRoute(base64Encode(props.directory()), sessionID())),
  )
  const adoptSession = (id: string) => {
    setSessionID(id)
    props.onSessionID?.(id)
  }

  createEffect(() => {
    retryNonce()
    const agent = local.agent.current()
    const selected = model.current()
    const key = storageKey()
    if (!agent || !selected || sessionID() || creating() || attemptedKey() === key || failedKey() === key) return
    const directory = props.directory()
    const scope = serverSDK().scope
    const runID = ++generation
    setCreating(true)
    setAttemptedKey(key)
    const isCurrent = () =>
      runID === generation && storageKey() === key && props.directory() === directory && serverSDK().scope === scope
    void (async () => {
      let stored: string | null = null
      try {
        stored = localStorage.getItem(key)
      } catch {
        stored = null
      }
      if (stored) {
        try {
          await serverSync().session.sync(stored)
          if (isCurrent() && serverSync().session.get(stored)?.directory === directory) {
            adoptSession(stored)
            return
          }
        } catch {
          try {
            localStorage.removeItem(key)
          } catch {
            // Storage may be unavailable; continue with a new session.
          }
        }
      }

      if (!isCurrent()) return
      const currentSync = serverSync().ensureDirSyncContext(directory)
      const created = await sdk()
        .api.session.create({
          agent: agent.name,
          model: { id: selected.id, providerID: selected.provider.id },
          location: { directory: props.directory() },
        })
        .then((result) => normalizeSessionInfo(result))
      currentSync.session.remember(created)
      await currentSync.session.sync(created.id)
      if (!isCurrent()) return
      try {
        localStorage.setItem(key, created.id)
      } catch {
        // Session remains usable for this mount even if persistence is unavailable.
      }
      adoptSession(created.id)
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
          <PromptInputV2Composer controller={input} />
        </Show>
      </div>
    </div>
  )
}

function PocketTimeline(props: { sessionID: () => string | undefined }) {
  const sync = useServerSync()
  const messages = createMemo(() => {
    const id = props.sessionID()
    return id ? (sync().session.data.message[id] ?? []) : []
  })

  return (
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
  )
}
