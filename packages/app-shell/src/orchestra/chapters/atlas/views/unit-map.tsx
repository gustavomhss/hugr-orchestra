import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Btn, FactRow } from "../kit/controls"
import { esc, num } from "../kit/format"
import { type AtlasGraphHandle, mountGraph } from "./graph"

// A unit's map (specs/atlas-ui/mock/views.js:120-134): its files, sized by how many files import them, and one
// node per outside unit that imports them. It mounts when its section first opens.
export function UnitMap(props: { model: AtlasModel; path: string }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const [state, setState] = createStore({ pick: "" })
  const elements: { host?: HTMLDivElement } = {}
  const graph = { handle: undefined as AtlasGraphHandle | undefined, started: false, alive: true }
  const leaf = props.path.split("/").at(-1) ?? props.path
  const importers = (file: string) => (props.model.R.dependents[file] ?? []).length
  const tone = (file: string) =>
    props.model
      .live()
      .filter((x) => x.file === file)
      .some((x) => props.model.state(x) === "drifted")
      ? "warm"
      : "good"
  const mount = async () => {
    const host = elements.host
    if (!host || graph.started) return
    graph.started = true
    const data = props.model.fileGraph(props.path)
    const handle = await mountGraph(host, {
      nodes: [
        ...data.files.map((file) => ({
          id: file,
          label: file,
          short: file.slice(props.path.length + 1).split("/").at(-1),
          r: 5 + Math.min(10, importers(file) / 2),
          tone: tone(file),
          tip: `<b>${esc(file.slice(props.path.length + 1))}</b><span>${esc(
            language.t("orchestra.atlas.unit.map.importedBy", { count: num(importers(file)) }),
          )}</span>`,
        })),
        ...data.outside.map((entry) => ({
          id: `unit:${entry[0]}`,
          label: entry[0],
          short: entry[0].split("/").slice(1).join("/") || entry[0],
          r: 7 + Math.min(10, entry[1]),
          tone: "ext",
          pin: true,
          tip: `<b>${esc(entry[0])}</b><span>${esc(language.t("orchestra.atlas.unit.map.importsInto", { count: entry[1], leaf }))}</span>`,
        })),
      ],
      edges: data.edges,
      offline: language.t("orchestra.atlas.unit.map.offline"),
      length: 90,
      repel: 1600,
      labelMin: 11,
      onSelect: (id) => setState("pick", id ?? ""),
    })
    if (!graph.alive) return handle.dispose()
    graph.handle = handle
  }
  onMount(() => {
    const details = elements.host?.closest("details")
    if (!details) return void mount()
    const start = () => {
      if (details.open) void mount()
    }
    details.addEventListener("toggle", start)
    onCleanup(() => details.removeEventListener("toggle", start))
    start()
  })
  onCleanup(() => {
    graph.alive = false
    graph.handle?.dispose()
  })
  const unitPick = () => (state.pick.startsWith("unit:") ? state.pick.slice(5) : "")
  return (
    <>
      <div class="at-graph-host" ref={(element) => (elements.host = element)} />
      <div class="at-graph-legend">
        <span>
          <i class="lg good" />
          {language.t("orchestra.atlas.unit.map.holds")}
        </span>
        <span>
          <i class="lg warm" />
          {language.t("orchestra.atlas.unit.map.changed")}
        </span>
        <span>
          <i class="lg ext" />
          {language.t("orchestra.atlas.unit.map.ext")}
        </span>
        <span class="grow" />
        <span class="at-hint">{language.t("orchestra.atlas.unit.map.hint")}</span>
      </div>
      <div class="at-graph-pick">
        <Show when={state.pick}>
          <Show
            when={unitPick()}
            fallback={
              <>
                <div class="at-pick-head">
                  <code class="at-mono">{state.pick.slice(props.path.length + 1)}</code>
                  <span class="grow" />
                  <Btn label={language.t("orchestra.atlas.unit.map.openFile")} onClick={() => atlas.go(atlasHref("unit", state.pick))} />
                </div>
                <For each={props.model.live().filter((x) => x.file === state.pick)}>{(x) => <FactRow fact={x} noFile />}</For>
              </>
            }
          >
            {(unit) => (
              <div class="at-pick-head">
                <strong>{unit()}</strong>
                <span class="grow" />
                <Btn label={language.t("orchestra.atlas.unit.map.open")} primary onClick={() => atlas.go(atlasHref("unit", unit()))} />
              </div>
            )}
          </Show>
        </Show>
      </div>
    </>
  )
}
