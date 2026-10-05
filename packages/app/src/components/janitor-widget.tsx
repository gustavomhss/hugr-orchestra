import { createEffect, createSignal, Show } from "solid-js"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { JanitorPocketChat } from "@/components/janitor-pocket"
import { useJanitor } from "@/context/janitor"
import { useLanguage } from "@/context/language"
import { useGlobal } from "@/context/global"
import { useServer } from "@/context/server"
import { tabKey, useTabs, type DraftTab, type SessionTab } from "@/context/tabs"
import type { JanitorSeverity } from "@/utils/janitor-report"
import { sessionHref } from "@/utils/session-route"

const Panel =
  "bg-v2-background-bg-layer-01 shadow-[var(--v2-elevation-floating),inset_0_0_0_0.5px_var(--v2-border-border-muted)]"

function dot(severity: JanitorSeverity) {
  if (severity === "urgent") return "bg-icon-critical-base"
  if (severity === "attention") return "bg-icon-warning-base"
  return "bg-icon-success-base"
}

export function JanitorWidget() {
  const janitor = useJanitor()
  const language = useLanguage()
  const global = useGlobal()
  const server = useServer()
  const tabs = useTabs()
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const location = useLocation()
  const routeSessionID = () => params.id ?? location.pathname.match(/\/session\/([^/]+)$/)?.[1]
  const [routeDirectory, setRouteDirectory] = createSignal<string>()
  const [sessionID, setSessionID] = createSignal<string>()
  let resolveToken = 0
  createEffect(() => {
    if (!janitor.store.report) {
      setRouteDirectory(undefined)
      setSessionID(undefined)
      return
    }
    const id = routeSessionID()
    const currentServer = server.current
    const token = ++resolveToken
    setRouteDirectory(undefined)
    setSessionID(undefined)
    if (!id || !currentServer) return
    void global
      .ensureServerCtx(currentServer)
      .sync.session.resolve(id)
      .then((session) => {
        if (token === resolveToken) setRouteDirectory(session.directory)
      })
      .catch(() => undefined)
  })

  const target = () => {
    const currentServer = server.current
    const current = routeDirectory()
    if (current) return { directory: current, server: server.key }
    const id = routeSessionID()
    const sessionInfo = id && currentServer ? global.ensureServerCtx(currentServer).sync.session.get(id) : undefined
    if (sessionInfo?.directory) return { directory: sessionInfo.directory, server: server.key }
    const sessionTab = tabs.store.find(
      (item): item is SessionTab => item.type === "session" && item.sessionId === id && item.server === server.key,
    )
    const sessionDirectory = sessionTab ? tabs.info[tabKey(sessionTab)]?.directory : undefined
    if (sessionDirectory) return { directory: sessionDirectory, server: server.key }
    const draft = tabs.store.find(
      (item): item is DraftTab => item.type === "draft" && !!item.directory && item.server === server.key,
    )
    if (draft) return { directory: draft.directory, server: draft.server }
    return undefined
  }
  const openSession = () => {
    const item = target()
    const id = sessionID()
    if (!item || !id) return
    janitor.dismiss()
    navigate(sessionHref(item.server, id))
  }

  return (
    <Show when={janitor.store.report} keyed>
      {(report) => (
        <aside
          aria-label={language.t("janitor.report.title")}
          class={`fixed bottom-4 end-4 z-[1000] flex max-h-[calc(100dvh-32px)] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[8px] ${Panel}`}
        >
          <Show
            when={janitor.store.expanded}
            fallback={
              <button
                type="button"
                aria-label={language.t("janitor.widget.open")}
                onClick={() => janitor.expand()}
                class="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-start transition-colors hover:bg-v2-overlay-simple-overlay-hover"
              >
                <span
                  aria-hidden="true"
                  class={`size-2 shrink-0 rounded-full ${dot(report.findings[0]?.severity ?? "attention")}`}
                />
                <span class="flex-1 truncate text-[13px] font-[530] leading-5 tracking-[-0.04px] text-v2-text-text-base">
                  {language.plural("janitor.notify.title", report.findings.length)}
                </span>
                <Tag>
                  <span class="tabular-nums">{report.findings.length}</span>
                </Tag>
                <span class="text-v2-icon-icon-muted">
                  <IconV2 name="expand" />
                </span>
              </button>
            }
          >
            <div class="flex min-h-0 min-w-0 shrink-0 items-center gap-2.5 px-4 pb-2 pt-3">
              <span
                aria-hidden="true"
                class={`size-2 shrink-0 rounded-full ${dot(report.findings[0]?.severity ?? "attention")}`}
              />
              <p class="flex-1 truncate text-[13px] font-[530] leading-5 tracking-[-0.04px] text-v2-text-text-base">
                {language.t("janitor.report.title")}
              </p>
              <Tag>
                <span class="tabular-nums">{report.findings.length}</span>
              </Tag>
              <Show when={sessionID()}>
                <ButtonV2 type="button" size="small" variant="ghost-muted" onClick={openSession}>
                  {language.t("janitor.widget.openSession")}
                </ButtonV2>
              </Show>
              <IconButtonV2
                type="button"
                size="small"
                variant="ghost-muted"
                aria-label={language.t("janitor.widget.close")}
                icon={<IconV2 name="collapse" />}
                onClick={() => janitor.collapse()}
              />
            </div>
            <div class="flex min-h-0 min-w-0 flex-col overflow-y-auto">
              <Show
                when={target()}
                keyed
                fallback={
                  <p class="px-4 py-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
                    {language.t("janitor.chat.noProject")}
                  </p>
                }
              >
                {(item) => (
                  <JanitorPocketChat
                    directory={() => item.directory}
                    server={() => item.server}
                    report={report}
                    onSessionID={setSessionID}
                  />
                )}
              </Show>
            </div>
            <div class="flex shrink-0 gap-2 px-4 py-3">
              <ButtonV2 type="button" size="small" variant="neutral" onClick={() => janitor.snooze()}>
                {language.t("janitor.widget.snooze")}
              </ButtonV2>
              <ButtonV2 type="button" size="small" variant="ghost" onClick={() => janitor.dismiss()}>
                {language.t("common.dismiss")}
              </ButtonV2>
            </div>
          </Show>
        </aside>
      )}
    </Show>
  )
}
