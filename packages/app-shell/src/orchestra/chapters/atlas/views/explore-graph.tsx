import { createEffect, For, on, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel, AtlasUnit } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Icon } from "../kit/chips"
import { Btn } from "../kit/controls"
import { esc, num } from "../kit/format"
import { GROUP_WORD, shortUnit, unitTone } from "./explore-units"
import { type AtlasGraphHandle, mountGraph } from "./graph"

// The unit graph (specs/atlas-ui/mock/views-explore.js:14-34): node size = facts, colour = how much still holds,
// ring = share changed, arrows point to what a unit depends on. Picking a unit shows it in the side panel.
export function ExploreGraph(props: { model: AtlasModel; group: string; selected?: string; onSelect: (id: string | undefined) => void }) {
  const language = useLanguage()
  const elements: { host?: HTMLDivElement } = {}
  const graph = { handle: undefined as AtlasGraphHandle | undefined, run: 0 }
  const short = (id: string) => shortUnit(id, language.t("orchestra.atlas.explore.topLevel"))
  const facts = (n: number) => language.plural("orchestra.atlas.explore.facts", n, { n: num(n) })
  const tip = (unit: AtlasUnit) =>
    `<b>${esc(short(unit.id))}</b><span>${esc(
      language.t(unit.drifted ? "orchestra.atlas.explore.graph.tipChanged" : "orchestra.atlas.explore.graph.tip", {
        group: language.t(GROUP_WORD[unit.group]),
        facts: facts(unit.facts),
        changed: num(unit.drifted),
      }),
    )}</span><span>${esc(language.t("orchestra.atlas.explore.graph.tipBlast", { count: num(props.model.dependentFacts(unit.id)) }))}</span>`

  createEffect(
    on(
      () => [props.model, props.group] as const,
      async () => {
        const host = elements.host
        if (!host) return
        graph.run += 1
        const run = graph.run
        graph.handle?.dispose()
        graph.handle = undefined
        const data = props.model.unitGraph()
        const max = Math.max(1, ...data.units.map((unit) => unit.facts))
        const next = await mountGraph(host, {
          nodes: data.units
            .filter((unit) => !props.group || unit.group === props.group)
            .map((unit) => ({
              id: unit.id,
              label: unit.id,
              short: short(unit.id),
              r: 5 + Math.sqrt(unit.facts / max) * 26,
              tone: `${unitTone(unit)} g-${unit.group}`,
              ring: unit.drifted / unit.facts,
              pin: unit.facts > max * 0.25,
              tip: tip(unit),
            })),
          edges: data.edges,
          offline: language.t("orchestra.atlas.explore.graph.offline"),
          length: 150,
          repel: 2600,
          selected: props.selected,
          onSelect: (id) => props.onSelect(id),
        })
        if (run !== graph.run) return next.dispose()
        graph.handle = next
      },
    ),
  )
  onCleanup(() => {
    graph.run += 1
    graph.handle?.dispose()
  })

  return (
    <div class="at-explore-graph">
      <div
        class="at-graph-host tall"
        role="img"
        aria-label={language.t("orchestra.atlas.explore.graph.aria")}
        ref={(element) => (elements.host = element)}
      />
      <div class="at-graph-zoom">
        <Btn icon="plus" ariaLabel={language.t("orchestra.atlas.explore.graph.zoomIn")} onClick={() => graph.handle?.zoom(1.25)} />
        <Btn icon="minus" ariaLabel={language.t("orchestra.atlas.explore.graph.zoomOut")} onClick={() => graph.handle?.zoom(0.8)} />
        <Btn icon="expand" ariaLabel={language.t("orchestra.atlas.explore.graph.fit")} onClick={() => graph.handle?.fit()} />
      </div>
      <div class="at-graph-legend floating">
        <span>
          <i class="lg good" />
          {language.t("orchestra.atlas.explore.graph.legend.holds")}
        </span>
        <span>
          <i class="lg warm" />
          {language.t("orchestra.atlas.explore.graph.legend.moved")}
        </span>
        <span>
          <i class="lg edge" />
          {language.t("orchestra.atlas.explore.graph.legend.edge")}
        </span>
        <span>
          <i class="lg hot" />
          {language.t("orchestra.atlas.explore.graph.legend.hot")}
        </span>
      </div>
      <aside class="at-graph-side">
        <Show
          when={props.model.units().find((unit) => unit.id === props.selected)}
          fallback={
            <div class="at-pick-empty">
              <Icon name="graph" />
              <span>{language.t("orchestra.atlas.explore.graph.empty")}</span>
            </div>
          }
        >
          {(unit) => <Pick model={props.model} unit={unit()} short={short(unit().id)} />}
        </Show>
      </aside>
    </div>
  )
}

// The picked unit (views-explore.js:122-131): its numbers and its first two facts.
function Pick(props: { model: AtlasModel; unit: AtlasUnit; short: string }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const briefing = () => props.model.briefing(props.unit.id)
  return (
    <div class="at-pick">
      <div class="at-pick-head">
        <span class={`at-sdot ${props.unit.drifted ? "warm" : "good"}`} />
        <strong>{props.short}</strong>
        <small>{language.t(GROUP_WORD[props.unit.group])}</small>
        <span class="grow" />
        <Btn
          label={language.t("orchestra.atlas.explore.graph.open")}
          primary
          onClick={() => atlas.go(atlasHref("unit", props.unit.id))}
        />
      </div>
      <div class="at-pick-stats">
        <div>
          <b>{num(props.unit.facts)}</b>
          <small>{language.t("orchestra.atlas.explore.graph.stat.facts")}</small>
        </div>
        <div>
          <b>{Math.round(((props.unit.facts - props.unit.drifted) / props.unit.facts) * 100)}%</b>
          <small>{language.t("orchestra.atlas.explore.graph.stat.hold")}</small>
        </div>
        <div>
          <b>{num(props.model.dependentFacts(props.unit.id))}</b>
          <small>{language.t("orchestra.atlas.explore.graph.stat.depend")}</small>
        </div>
        <div>
          <b>{num(briefing().used)}</b>
          <small>{language.t("orchestra.atlas.explore.graph.stat.briefed")}</small>
        </div>
      </div>
      <For each={briefing().adv.concat(briefing().inv).slice(0, 2)}>
        {(x) => (
          <p class="at-pick-fact" onClick={() => atlas.go(atlasHref("fact", x.key))}>
            {language.t("orchestra.atlas.explore.quoted", {
              text: x.claim.length > 150 ? `${x.claim.slice(0, 150)}…` : x.claim,
            })}
          </p>
        )}
      </For>
    </div>
  )
}
