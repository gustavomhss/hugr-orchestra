import { For, type JSX, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "./atlas-context"
import type { AtlasMemberId } from "./atlas-model"
import { atlasHref, type AtlasViewId } from "./atlas-route"
import { Icon } from "./kit/chips"
import { Btn } from "./kit/controls"
import { num, seatName } from "./kit/format"
import type { AtlasIconName } from "./kit/icons"

const MEMBERS: AtlasMemberId[] = ["backend", "jimmy", "archie", "maestro"]

// The in-page sub-navigation (D7), ported from renderRail in specs/atlas-ui/mock/app.js:107-139: Atlas, Engine and
// Memory groups, with the store's state in the footer. Settings and "All screens" are not ported (D7, D12).
export function AtlasRail() {
  const atlas = useAtlas()
  const language = useLanguage()
  const held = () => !atlas.model()
  const view = () => atlas.route().view
  const member = () => (view() === "memory" ? atlas.route().param.split("/")[0] || "backend" : undefined)
  const healthOk = () => {
    const model = atlas.model()
    return !model || (model.health().cas.sound && model.provenance() === "trusted")
  }
  const count = (n: number, tone: string) => (
    <Show when={!held()}>
      <span class={`wf-count ${tone}`}>{num(n)}</span>
    </Show>
  )
  return (
    <aside class="atlas-context" aria-label={language.t("orchestra.atlas.frame.rail.aria")}>
      <header class="context-head">
        <span class="mx-mark">
          <Icon name="atlas" />
        </span>
        <div>
          <strong>{language.t("orchestra.atlas.frame.rail.title")}</strong>
          <Show when={atlas.model()}>
            {(model) => <small>{language.t("orchestra.atlas.frame.rail.project", { name: model().R.project })}</small>}
          </Show>
        </div>
      </header>
      <div class="atlas-rail-actions">
        <Btn icon="search" ariaLabel={language.t("orchestra.atlas.frame.search")} tip={language.t("orchestra.atlas.frame.search")} onClick={() => atlas.palette()} />
        <Btn icon="refresh" ariaLabel={language.t("orchestra.atlas.frame.refresh")} tip={language.t("orchestra.atlas.frame.refresh")} disabled={atlas.controller.state.loading} onClick={() => void atlas.controller.refresh()} />
      </div>
      <div class="context-group">
        <RailLink view="overview" icon="home" label={language.t("orchestra.atlas.frame.nav.overview")} selected={view() === "overview"}>
          <Show when={!healthOk()}>
            <span class="at-sdot warm" data-tip={language.t("orchestra.atlas.frame.health.attention")} />
          </Show>
        </RailLink>
        <RailLink view="explore" icon="graph" label={language.t("orchestra.atlas.frame.nav.explore")} selected={["explore", "unit", "fact"].includes(view())} />
        <RailLink view="review" icon="inbox" label={language.t("orchestra.atlas.frame.nav.review")} selected={view() === "review"}>
          {count(atlas.model()?.curationCount() ?? 0, "warm")}
        </RailLink>
        <RailLink view="activity" icon="history" label={language.t("orchestra.atlas.frame.nav.activity")} selected={view() === "activity"} />
      </div>
      <div class="context-group">
        <div class="context-label">{language.t("orchestra.atlas.frame.group.engine")}</div>
        <RailLink view="genesis" icon="sparkle" label={language.t("orchestra.atlas.frame.nav.genesis")} selected={view() === "genesis"} />
        <RailLink view="architecture" icon="stack" label={language.t("orchestra.atlas.frame.nav.architecture")} selected={view() === "architecture"} />
        <RailLink view="ownership" icon="territory" label={language.t("orchestra.atlas.frame.nav.ownership")} selected={view() === "ownership"} />
        <RailLink view="how" icon="fact" label={language.t("orchestra.atlas.frame.nav.how")} selected={view() === "how"} />
      </div>
      <div class="context-group">
        <div class="context-label">{language.t("orchestra.atlas.frame.group.memory")}</div>
        <For each={MEMBERS}>
          {(id) => (
            <RailLink view="memory" param={id} icon="memory" label={seatName(id)} selected={member() === id}>
              <Show when={atlas.model()?.memory[id].bound === false}>
                <span class="context-hint">{language.t("orchestra.atlas.frame.memory.off")}</span>
              </Show>
            </RailLink>
          )}
        </For>
      </div>
      <footer class="context-footer">
        <Show
          when={!held()}
          fallback={<span>{language.t("orchestra.atlas.frame.footer.held")}</span>}
        >
          <Show
            when={atlas.model()?.provenance() !== "trusted"}
            fallback={
              <span>
                <Icon name="server" /> {language.t("orchestra.atlas.frame.footer.local")}
              </span>
            }
          >
            <a
              class="warm"
              href={atlasHref("overview", "", { show: "health" })}
              onClick={(event) => {
                event.preventDefault()
                atlas.go(atlasHref("overview", "", { show: "health" }))
              }}
            >
              <Icon name="lock" />{" "}
              {language.t(
                atlas.model()?.provenance() === "tracked-staging"
                  ? "orchestra.atlas.frame.footer.locked"
                  : "orchestra.atlas.frame.footer.readOnly",
              )}
            </a>
          </Show>
        </Show>
      </footer>
    </aside>
  )
}

function RailLink(props: {
  view: AtlasViewId
  param?: string
  icon: AtlasIconName
  label: string
  selected: boolean
  children?: JSX.Element
}) {
  const atlas = useAtlas()
  const href = () => atlasHref(props.view, props.param)
  return (
    <a
      class="context-item"
      classList={{ selected: props.selected }}
      href={href()}
      aria-current={props.selected ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault()
        atlas.go(href())
      }}
    >
      <Icon name={props.icon} />
      <span>{props.label}</span>
      {props.children}
    </a>
  )
}
