import { getFilename } from "@orchestra/core/util/path"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { useNavigate } from "@solidjs/router"
import { createMemo, Show, startTransition } from "solid-js"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import type { HomeController } from "@/pages/home/home-controller"
import { displayName } from "@/pages/layout/helpers"
import { HomeFlightCard } from "./flight-engineer/entry"
import { HomeFolderStart, HomeProjectStart } from "./home-start"
import { KpiDashboard } from "./kpis"
import { sessionTitle } from "@/utils/session-title"

// Home is the composer for the selected repository profile, with its KPI dashboard once the profile has sessions.
// It remounts only when that profile changes, so a profile switch abandons the previous profile's reads.
export function OrchestraHome(props: { home: HomeController }) {
  const tabs = useTabs()
  const navigate = useNavigate()
  const owner = createMemo(
    () => {
      const selection = props.home.selection.value()
      const conn = props.home.server.focused()
      const ctx = props.home.server.focusedContext()
      if (!selection.directory || !conn || !ctx || ServerConnection.key(conn) !== selection.server) return
      return { key: `${selection.server}\0${selection.directory}`, directory: selection.directory, conn, ctx }
    },
    undefined,
    { equals: (a, b) => a?.key === b?.key },
  )

  return (
    <Show when={owner()} keyed fallback={<NoProjectHome home={props.home} />}>
      {(owner) => {
        const project = () => props.home.project.selected()
        // The KPIs need sessions to count, so a new project shows only the composer until its first session.
        const hasSessions = () => owner.ctx.sync.child(owner.directory, { bootstrap: false })[0].session.length > 0
        return (
          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <HomeProjectStart home={props.home} directory={owner.directory} conn={owner.conn} />
            <Show when={hasSessions()}>
              <KpiDashboard
                directory={owner.directory}
                sdk={owner.ctx.sdk}
                queryClient={owner.ctx.queryClient}
                name={project() ? displayName(project()!) : getFilename(owner.directory)}
                title={(sessionID, fallback) => sessionTitle(owner.ctx.sync.session.peek(sessionID)?.title || fallback) ?? fallback}
                running={(sessionID) => (owner.ctx.sync.session.data.session_status[sessionID]?.type ?? "idle") !== "idle"}
                openProviders={() => navigate("/orchestra/providers")}
                extra={<HomeFlightCard sdk={owner.ctx.sdk} directory={owner.directory} />}
                newSession={() => props.home.project.openProjectNewSession(owner.conn, owner.directory)}
                openSession={(sessionID) => {
                  owner.ctx.projects.open(owner.directory)
                  owner.ctx.projects.touch(owner.directory)
                  void startTransition(() => {
                    const tab = tabs.addSessionTab({ server: ServerConnection.key(owner.conn), sessionId: sessionID })
                    tabs.select(tab)
                  })
                }}
              />
            </Show>
          </div>
        )
      }}
    </Show>
  )
}

// No project is selected. With no projects at all, the first step is picking and trusting a folder; otherwise the
// person chooses one of the existing projects.
function NoProjectHome(props: { home: HomeController }) {
  return (
    <Show when={props.home.project.list().length === 0} fallback={<ChooseProjectHome home={props.home} />}>
      <HomeFolderStart home={props.home} />
    </Show>
  )
}

function ChooseProjectHome(props: { home: HomeController }) {
  const language = useLanguage()
  return (
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
        <Show when={props.home.server.focused()}>
          {(conn) => (
            <ButtonV2 class="mt-3" variant="contrast" icon="plus" onClick={() => props.home.project.choose(conn())}>
              {language.t("command.project.open")}
            </ButtonV2>
          )}
        </Show>
      </div>
    </section>
  )
}
