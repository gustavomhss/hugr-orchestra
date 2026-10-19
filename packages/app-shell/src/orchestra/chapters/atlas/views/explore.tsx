import { createEffect, createMemo, For, Match, onCleanup, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasUnit } from "../atlas-model"
import { atlasHref, type AtlasQueryPatch } from "../atlas-route"
import { Icon } from "../kit/chips"
import { Btn, FactRow, Seven } from "../kit/controls"
import { num, seatName } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { openAtlasSheet } from "../sheets/state"
import { ExploreMap } from "./explore-map"
import { EXPLORE_GROUPS, shortUnit, sortUnits, toSort } from "./explore-units"
import type { AtlasViewProps } from "./index"

// Explore: the graph is the way in (specs/atlas-ui/mock/views-explore.js:133-173). Graph, Map and List show the same
// units; a search over facts replaces the body while it has text.
const VIEWS = [
  ["graph", "orchestra.atlas.explore.view.graph", "graph"],
  ["map", "orchestra.atlas.explore.view.map", "stack"],
  ["list", "orchestra.atlas.explore.view.list", "list"],
] as const
const SORTS = [
  ["facts", "orchestra.atlas.explore.sort.facts"],
  ["changed", "orchestra.atlas.explore.sort.changed"],
  ["share", "orchestra.atlas.explore.sort.share"],
  ["name", "orchestra.atlas.explore.sort.name"],
] as const

export default function AtlasExploreView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([language.t("orchestra.atlas.explore.crumb")]))
  const view = () => props.route.query.view ?? "graph"
  const group = () => props.route.query.group ?? ""
  const sort = () => toSort(props.route.query.sort)
  const short = (id: string) => shortUnit(id, language.t("orchestra.atlas.explore.topLevel"))
  const units = createMemo(() => props.model.units().filter((unit) => !group() || unit.group === group()))
  const href = (patch: AtlasQueryPatch) =>
    atlasHref("explore", "", { view: view(), group: group(), sort: props.route.query.sort, ...patch })
  const text = () => (props.route.query.q ?? "").trim().toLowerCase()
  const results = createMemo(() => props.model.live().filter((x) => `${x.claim} ${x.file}`.toLowerCase().includes(text())))
  const facts = (n: number) => language.plural("orchestra.atlas.explore.facts", n, { n: num(n) })
  const search = { timer: undefined as ReturnType<typeof setTimeout> | undefined }
  onCleanup(() => clearTimeout(search.timer))
  return (
    <div class="at-page wide">
      <div class="mx-heading">
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.explore.eyebrow")}</div>
          <h1>{language.t("orchestra.atlas.explore.title")}</h1>
          <p>
            {language.t("orchestra.atlas.explore.summary", {
              units: language.plural("orchestra.atlas.explore.units", props.model.units().length, { n: num(props.model.units().length) }),
              facts: facts(props.model.stats().facts),
              links: language.t("orchestra.atlas.explore.links", { count: num(props.model.unitGraph().edges.length) }),
            })}
          </p>
        </div>
        <div class="heading-actions">
          <Btn label={language.t("orchestra.atlas.explore.check")} icon="shield" onClick={() => openAtlasSheet({ kind: "verify", scope: "" })} />
        </div>
      </div>
      <div class="at-explore-bar">
        <div class="wf-range">
          <For each={VIEWS}>
            {(item) => (
              <button type="button" aria-pressed={view() === item[0]} onClick={() => atlas.go(href({ view: item[0] }))}>
                <Icon name={item[2]} />
                {language.t(item[1])}
              </button>
            )}
          </For>
        </div>
        <div class="at-typechips">
          <For each={EXPLORE_GROUPS}>
            {(item) => (
              <button
                type="button"
                class={`at-typechip ${group() === item[0] ? "on" : ""}`}
                onClick={() => atlas.go(href({ group: item[0] }))}
              >
                {language.t(item[1])}
                <span>{props.model.units().filter((unit) => !item[0] || unit.group === item[0]).length}</span>
              </button>
            )}
          </For>
        </div>
        <span class="grow" />
        <label class="at-search">
          <Icon name="search" />
          <input
            id="list-search"
            placeholder={language.t("orchestra.atlas.explore.search")}
            aria-label={language.t("orchestra.atlas.explore.search")}
            value={props.route.query.q ?? ""}
            onInput={(event) => {
              const value = event.currentTarget.value
              clearTimeout(search.timer)
              search.timer = setTimeout(() => atlas.setQuery({ q: value, fact: undefined }, true), 140)
            }}
          />
          <kbd>/</kbd>
        </label>
      </div>
      <Show
        when={text()}
        fallback={
          <Switch>
            <Match when={view() === "map"}>
              <ExploreMap model={props.model} units={units()} />
            </Match>
            <Match when={view() === "list"}>
              <div class="at-sortbar">
                <span>{language.t("orchestra.atlas.explore.sort")}</span>
                <div class="wf-range">
                  <For each={SORTS}>
                    {(item) => (
                      <button
                        type="button"
                        aria-pressed={sort() === item[0]}
                        onClick={() => atlas.go(href({ sort: item[0] === "facts" ? "" : item[0] }))}
                      >
                        {language.t(item[1])}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div class="at-ucards">
                <For each={sortUnits(units(), sort(), short)}>{(unit) => <UnitCard unit={unit} short={short(unit.id)} />}</For>
              </div>
            </Match>
            <Match when={view() !== "map" && view() !== "list"}>
              <p class="mx-empty" data-pending="graph">{language.t("orchestra.atlas.frame.pending")}</p>
            </Match>
          </Switch>
        }
      >
        <section class="at-panel">
          <header class="at-panel-head">
            <h3>{language.plural("orchestra.atlas.explore.match", results().length, { n: num(results().length) })}</h3>
            <Btn label={language.t("orchestra.atlas.explore.clear")} onClick={() => atlas.go(href({ q: "" }))} />
          </header>
          <Show when={results().length} fallback={<div class="at-band-empty">{language.t("orchestra.atlas.explore.nothing")}</div>}>
            <Seven id="search" rows={results()} first={25}>
              {(x) => <FactRow fact={x} />}
            </Seven>
          </Show>
        </section>
      </Show>
    </div>
  )
}

// A unit card (mock cards(), views-explore.js:283-287): its name, facts and changed count, and its territory.
function UnitCard(props: { unit: AtlasUnit; short: string }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const owner = () => {
    const territory = atlas.model()?.territoryOf(props.unit.id)
    if (!territory) return language.t("orchestra.atlas.explore.card.noTerritory")
    return language.t("orchestra.atlas.explore.card.territory", { name: territory.name, owner: seatName(territory.owner) })
  }
  return (
    <AtlasLink class="at-ucard" href={atlasHref("unit", props.unit.id)}>
      <span class="at-ucard-top">
        <strong>{props.unit.id === "(root)" ? language.t("orchestra.atlas.explore.card.topLevel") : props.short}</strong>
        <span class={`at-sdot ${props.unit.drifted ? "warm" : "good"}`} />
      </span>
      <span class="at-ucard-num">
        <Rich text={language.plural("orchestra.atlas.explore.card.facts", props.unit.facts, { n: num(props.unit.facts) })} />
        <Show when={props.unit.drifted}>
          {" · "}
          <span class="warm">{language.t("orchestra.atlas.explore.card.changed", { count: num(props.unit.drifted) })}</span>
        </Show>
      </span>
      <small>{owner()}</small>
    </AtlasLink>
  )
}
