import { createMemo } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { sessionHref } from "@/utils/session-route"
import { appDockController, sameTab } from "./apps-panel-controller"
import { OrchestraActivity } from "./orchestra-activity"
import { cockpitView, updateCockpitView, type CockpitView } from "./orchestra-cockpit-state"
import { OrchestraDock } from "./orchestra-dock"
import { dockSnapshot } from "./orchestra-dock-snapshot"
import { OrchestraEvidenceDocs } from "./orchestra-evidence-docs"
import { OrchestraEvidenceFiles } from "./orchestra-evidence-files"
import { OrchestraEvidenceTerminal } from "./orchestra-evidence-terminal"
import { useSessionLayout } from "./session-layout"
import type { TasksData } from "./tasks-data"
import { TasksPanel } from "./tasks-panel"
import "./orchestra-cockpit.css"

// Orchestra's Apps tab: the compact Dock anchored on top, with Tasks and Activity below it at the same
// time. Both cards read the one Tasks projection the side panel owns, and Activity reads the Dock
// controller's existing state rather than subscribing to the desktop again.
export function OrchestraCockpit(props: { tasks: TasksData }) {
  const { sessionKey } = useSessionLayout()
  const navigate = useNavigate()
  const serverSDK = useServerSDK()
  const dock = appDockController()
  const view = () => cockpitView(sessionKey())
  const update = (patch: Partial<CockpitView>) => updateCockpitView(sessionKey(), patch)
  const snapshot = createMemo(() => dockSnapshot(dock.state, dock.available))

  return (
    <div class="orchestra-cockpit">
      <OrchestraDock
        pane={view().pane}
        onPaneChange={(pane) => update({ pane })}
        files={() => <OrchestraEvidenceFiles path={view().file} onPathChange={(file) => update({ file })} />}
        docs={() => (
          <OrchestraEvidenceDocs
            path={view().doc}
            onPathChange={(doc) => update({ doc })}
            onOpenFiles={(file) => update({ pane: "files", file })}
          />
        )}
        terminal={() => <OrchestraEvidenceTerminal />}
      />
      <div class="orchestra-cockpit-feed">
        <TasksPanel
          data={props.tasks}
          summary={{ expanded: () => view().tasks, setExpanded: (tasks) => update({ tasks }) }}
        />
        <OrchestraActivity
          tasks={props.tasks}
          dock={snapshot}
          expanded={() => view().activity}
          setExpanded={(activity) => update({ activity })}
          onOpenTask={(task) =>
            navigate(sessionHref(ServerConnection.key(serverSDK().server), task.childId ?? task.sessionId))
          }
          onShowBrowser={(observed) => {
            const tab = dock.state.tabs.find((item) => sameTab(item, observed.tab))
            if (tab) dock.select(tab)
            update({ pane: "browser" })
          }}
        />
      </div>
    </div>
  )
}
