import { getFilename } from "@opencode-ai/core/util/path"
import { useNavigate } from "@solidjs/router"
import { createMemo, Show, startTransition } from "solid-js"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import type { HomeController } from "@/pages/home/home-controller"
import { displayName } from "@/pages/layout/helpers"
import { KpiDashboard } from "./kpis"

// Home is the selected repository profile's KPI dashboard. It remounts only when that profile changes,
// so a profile switch abandons the previous profile's reads.
export function OrchestraHome(props: { home: HomeController }) {
  const language = useLanguage()
  const tabs = useTabs()
  const navigate = useNavigate()
  const owner = createMemo(
    () => {
      const selection = props.home.selection.value()
      const conn = props.home.server.focused()
      const ctx = props.home.server.focusedContext()
      if (!selection.directory || !conn || !ctx) return
      return { key: `${selection.server}\0${selection.directory}`, directory: selection.directory, conn, ctx }
    },
    undefined,
    { equals: (a, b) => a?.key === b?.key },
  )

  return (
    <Show
      when={owner()}
      keyed
      fallback={
        <section class="orchestra-home-dashboard" data-component="orchestra-kpis-empty">
          <div class="home-inner">
            <header class="home-mast">
              <div>
                <div class="home-kicker">{language.t("orchestra.home.eyebrowEmpty")}</div>
                <h1>
                  {language.t("orchestra.home.titleLead")}
                  <br />
                  <span>{language.t("orchestra.home.titleTail")}</span>
                </h1>
              </div>
            </header>
            <p class="home-status">{language.t("orchestra.home.empty")}</p>
          </div>
        </section>
      }
    >
      {(owner) => {
        const project = () => props.home.project.selected()
        return (
          <KpiDashboard
            directory={owner.directory}
            sdk={owner.ctx.sdk}
            queryClient={owner.ctx.queryClient}
            name={project() ? displayName(project()!) : getFilename(owner.directory)}
            title={(sessionID, fallback) => owner.ctx.sync.session.peek(sessionID)?.title || fallback}
            running={(sessionID) => (owner.ctx.sync.session.data.session_status[sessionID]?.type ?? "idle") !== "idle"}
            openProviders={() => navigate("/orchestra/providers")}
            openSession={(sessionID) => {
              owner.ctx.projects.open(owner.directory)
              owner.ctx.projects.touch(owner.directory)
              void startTransition(() => {
                const tab = tabs.addSessionTab({ server: ServerConnection.key(owner.conn), sessionId: sessionID })
                tabs.select(tab)
              })
            }}
          />
        )
      }}
    </Show>
  )
}
