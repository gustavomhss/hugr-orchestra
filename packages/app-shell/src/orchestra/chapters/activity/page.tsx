import { For, Show } from "solid-js"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { tabKeydown } from "@/orchestra/tab-keys"
import { MxPage } from "../kit"
import { tabs, type Tab } from "./reading"
import { ActivityWorktrees } from "./worktrees"
import { ActivityTrees } from "./trees"
import { ActivityDisk } from "./disk"
import "./activity.css"

export default function ActivityPage(_props: ChapterPageProps) {
  const language = useLanguage()
  const [state, setState] = createStore({ tab: "Trees" as Tab, query: "" })
  const diskRoot = (): ActivityMonitor.DiskRootID | undefined =>
    state.tab === "Cache"
      ? "cache"
      : state.tab === "Temporary"
        ? "temporary"
        : state.tab === "Logs"
          ? "logs"
          : undefined
  return (
    <MxPage
      id="activity"
      eyebrow={language.t("orchestra.nav.monitor")}
      title={language.t("orchestra.monitor.title")}
      description={language.t("orchestra.monitor.description")}
    >
      <div
        class="activity-tabs"
        role="tablist"
        aria-label={language.t("orchestra.monitor.tabs")}
        onKeyDown={tabKeydown}
      >
        <For each={tabs}>
          {(name) => (
            <button
              id={`activity-tab-${tabs.indexOf(name)}`}
              type="button"
              role="tab"
              class="activity-tab"
              tabindex={state.tab === name ? 0 : -1}
              aria-selected={state.tab === name}
              aria-controls="activity-panel"
              onClick={() => setState("tab", name)}
            >
              {name}
            </button>
          )}
        </For>
      </div>
      <div class="mx-toolbar">
        <input
          class="mx-search"
          type="search"
          value={state.query}
          aria-label={language.t("orchestra.monitor.filter")}
          placeholder={language.t("orchestra.monitor.filter")}
          onInput={(event) => setState("query", event.currentTarget.value)}
        />
      </div>
      <div id="activity-panel" role="tabpanel" aria-labelledby={`activity-tab-${tabs.indexOf(state.tab)}`} tabindex={0}>
        <Show when={diskRoot()} keyed>
          {(rootID) => <ActivityDisk rootID={rootID} query={state.query} />}
        </Show>
        <Show when={state.tab === "Trees"}>
          <ActivityTrees query={state.query} />
        </Show>
        <Show
          when={state.tab === "Worktrees" || state.tab === "Trees" || diskRoot()}
          fallback={
            <div class="mx-empty" role="status">
              <strong>{language.t("orchestra.monitor.collectionUnavailable", { category: state.tab })}</strong>
              <p>{language.t("orchestra.monitor.collectionPending")}</p>
            </div>
          }
        >
          <Show when={state.tab === "Worktrees"}>
            <ActivityWorktrees query={state.query} />
          </Show>
        </Show>
      </div>
    </MxPage>
  )
}
