import { createMemo, For, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import { atlasHref } from "../atlas-route"
import { Btn } from "../kit/controls"
import { num } from "../kit/format"
import { BRIEFING_CAP, type BriefingItem, briefingQueue } from "./briefing-queue"

// The briefing, built in front of you (specs/atlas-ui/mock/views-explore.js:481-516): the same order and caps as
// retrieval/src/own.ts, one item every 110 ms. It starts when its <details> opens, or at once outside one.
// `focus` marks one fact's chip (Follow one fact).
const LEGEND = [
  ["gov", "orchestra.atlas.unit.build.gov"],
  ["gotcha", "orchestra.atlas.unit.build.gotcha"],
  ["ptr", "orchestra.atlas.unit.build.ptr"],
  ["adv", "orchestra.atlas.unit.build.adv"],
  ["out", "orchestra.atlas.unit.build.out"],
] as const

export function BriefingBuild(props: { path: string; focus?: string }) {
  const atlas = useAtlas()
  const language = useLanguage()
  // The frame renders views only while a snapshot is loaded, so the model is there; [] covers the gap on unmount.
  const queue = createMemo(() => {
    const model = atlas.model()
    return model ? briefingQueue(model, props.path) : []
  })
  const [state, setState] = createStore({ shown: 0, started: false })
  const elements: { root?: HTMLDivElement } = {}
  const timers: ReturnType<typeof setTimeout>[] = []
  const stop = () => timers.splice(0).forEach((id) => clearTimeout(id))
  const play = () => {
    stop()
    setState({ shown: 0, started: true })
    queue().forEach((_, index) => timers.push(setTimeout(() => setState("shown", index + 1), 120 + index * 110)))
  }
  onCleanup(stop)
  onMount(() => {
    const details = elements.root?.closest("details")
    if (!details) return play()
    const start = () => {
      if (details.open && !state.started) play()
    }
    details.addEventListener("toggle", start)
    onCleanup(() => details.removeEventListener("toggle", start))
    start()
  })
  const shown = () => queue().slice(0, state.shown)
  const sent = () => shown().filter((item) => item.ok)
  const used = () => sent().reduce((n, item) => n + item.cost, 0)
  const chip = (item: BriefingItem) => (
    <span
      class={`at-brief-chip ${item.band}`}
      classList={{ focus: !!item.fact && item.fact.key === props.focus }}
      onClick={() => {
        if (item.fact) atlas.go(atlasHref("fact", item.fact.key))
      }}
    >
      {item.label}
      <small>{item.cost}</small>
    </span>
  )
  return (
    <div class="at-brief" ref={(element) => (elements.root = element)}>
      <div class="at-brief-bar">
        <div class="at-brief-fill">
          <For each={sent()}>{(item) => <i class={item.band} style={{ width: `${(item.cost / BRIEFING_CAP) * 100}%` }} />}</For>
        </div>
      </div>
      <div class="at-brief-scale">
        <span>{num(0)}</span>
        <span>{language.t("orchestra.atlas.unit.build.used", { used: num(used()) })}</span>
        <span>{num(BRIEFING_CAP)}</span>
      </div>
      <div class="at-brief-legend">
        <For each={LEGEND}>
          {(item) => (
            <span>
              <i class={item[0]} />
              {language.t(item[1])}
            </span>
          )}
        </For>
      </div>
      <div class="at-brief-lanes">
        <div class="at-brief-in">
          <small>{language.t("orchestra.atlas.unit.build.sent")}</small>
          <For each={sent()}>{chip}</For>
        </div>
        <div class="at-brief-out">
          <small>{language.t("orchestra.atlas.unit.build.leftOut")}</small>
          <For each={shown().filter((item) => !item.ok)}>{chip}</For>
        </div>
      </div>
      <Btn label={language.t("orchestra.atlas.unit.build.again")} icon="refresh" onClick={() => play()} />
    </div>
  )
}
