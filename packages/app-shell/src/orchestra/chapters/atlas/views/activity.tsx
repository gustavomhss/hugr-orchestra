import { createEffect, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasEvent } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Help, Icon, useAtlasWords } from "../kit/chips"
import { Seven } from "../kit/controls"
import { num, seatName } from "../kit/format"
import { AtlasLink } from "../kit/text"
import { ACTIVITY_SHOWS, type ActivityRow, activityRows, countRows, eventText, eventTime, shownRows } from "./activity-data"
import type { AtlasViewProps } from "./index"

// Activity: what Atlas gave agents and took from them (specs/atlas-ui/mock/views-more.js:58-83). Agent events are
// session receipts, which are not served yet (D12); code rows come from the store.
const LABELS = {
  all: "orchestra.atlas.activity.show.all",
  reads: "orchestra.atlas.activity.show.reads",
  memory: "orchestra.atlas.activity.show.memory",
  holds: "orchestra.atlas.activity.show.holds",
  code: "orchestra.atlas.activity.show.code",
} as const

export default function AtlasActivityView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([language.t("orchestra.atlas.activity.crumb")]))
  const show = () => ACTIVITY_SHOWS.find((item) => item === props.route.query.show) ?? "all"
  const rows = () => activityRows(props.model)
  const list = () => shownRows(rows(), show())
  return (
    <div class="at-page narrow">
      <div class="mx-heading">
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.activity.eyebrow")}</div>
          <h1>{language.t("orchestra.atlas.activity.title")}</h1>
          <p>{language.t("orchestra.atlas.activity.line")}</p>
        </div>
      </div>
      <div class="at-toolbar">
        <div class="wf-range">
          <For each={ACTIVITY_SHOWS}>
            {(item) => (
              <button
                type="button"
                aria-pressed={show() === item}
                onClick={() => atlas.go(atlasHref("activity", "", { show: item }))}
              >
                {language.t(LABELS[item])}
                <Show when={item !== "all" && item}>
                  {(filter) => <span class="wf-count">{num(countRows(rows(), filter()))}</span>}
                </Show>
              </button>
            )}
          </For>
        </div>
        <Help text={language.t("orchestra.atlas.activity.help")} />
      </div>
      <section class="at-panel">
        <Show when={list().length} fallback={<div class="at-band-empty">{language.t("orchestra.atlas.activity.empty")}</div>}>
          <Seven id={`act${show()}`} rows={list()} first={25}>
            {(row) => (row.kind === "code" ? <CodeRow row={row} /> : <EventRow event={row.event} />)}
          </Seven>
        </Show>
      </section>
    </div>
  )
}

function CodeRow(props: { row: Extract<ActivityRow, { kind: "code" }> }) {
  const language = useLanguage()
  return (
    <AtlasLink class="at-event" href={atlasHref("review", "", { tab: "changed", commit: props.row.sha })}>
      <span class="at-avatar sm">
        <Icon name="commit" />
      </span>
      <div class="at-event-main">
        <span>{language.plural("orchestra.atlas.activity.code", props.row.facts, { sha: props.row.sha, n: num(props.row.facts) })}</span>
        <small>{props.row.subject}</small>
      </div>
      <Icon name="arrow" />
    </AtlasLink>
  )
}

function EventRow(props: { event: AtlasEvent }) {
  const language = useLanguage()
  const words = useAtlasWords()
  const text = () => eventText(props.event)
  return (
    <div class="at-event">
      <span class="at-avatar sm">{seatName(props.event.who)[0]}</span>
      <div class="at-event-main">
        <span>
          {language.t(text().key, text().params as Record<string, string | number>)}
          <Show when={props.event.unit && props.event.kind !== "read"}>
            {" "}
            <small>· {props.event.unit}</small>
          </Show>
        </span>
        <small>{language.t("orchestra.atlas.activity.time", eventTime(props.event.at))}</small>
      </div>
      <Show when={props.event.kind === "memory" && !props.event.ok}>
        <span class="at-outcome bad">{words.refusal(props.event.refusal ?? "")}</span>
      </Show>
      <Show when={props.event.kind === "hold"}>
        <span class="at-outcome">{language.t("orchestra.atlas.activity.onHold")}</span>
      </Show>
    </div>
  )
}
