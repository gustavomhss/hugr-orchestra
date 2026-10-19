import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { Icon } from "../kit/chips"
import { seatName } from "../kit/format"
import { Rich } from "../kit/text"

// How Atlas stays free of drift across pull requests: every fact and every ownership skill is bound to the exact
// bytes of its code, so a change either refreshes them in the same PR (and CI proves it), or lands and is held until
// rebuilt. Ported from specs/atlas-ui/mock/views-explore.js:101-119. Home and Architecture (A28c) show it.

// R: runs today · B: built · D: designed.
const BADGES = {
  R: ["orchestra.atlas.overview.keep.badge.runs", "good"],
  B: ["orchestra.atlas.overview.keep.badge.built", "blue"],
  D: ["orchestra.atlas.overview.keep.badge.designed", ""],
} as const
// [icon, title, text, badge, tone]
const REFRESHED = [
  ["code", "orchestra.atlas.overview.keep.refreshed.code", "orchestra.atlas.overview.keep.refreshed.code.text", "R", ""],
  ["drift", "orchestra.atlas.overview.keep.refreshed.drift", "orchestra.atlas.overview.keep.refreshed.drift.text", "R", ""],
  ["fact", "orchestra.atlas.overview.keep.refreshed.fact", "orchestra.atlas.overview.keep.refreshed.fact.text", "R", ""],
  ["shield", "orchestra.atlas.overview.keep.refreshed.shield", "orchestra.atlas.overview.keep.refreshed.shield.text", "R", "good"],
] as const
const MERGED = [
  ["code", "orchestra.atlas.overview.keep.merged.code", "orchestra.atlas.overview.keep.merged.code.text", "R", ""],
  ["lock", "orchestra.atlas.overview.keep.merged.lock", "orchestra.atlas.overview.keep.merged.lock.text", "R", "warm"],
  ["list", "orchestra.atlas.overview.keep.merged.list", "orchestra.atlas.overview.keep.merged.list.text", "B", ""],
  ["agents", "orchestra.atlas.overview.keep.merged.agents", "orchestra.atlas.overview.keep.merged.agents.text", "D", ""],
] as const
type KeepStep = (typeof REFRESHED)[number] | (typeof MERGED)[number]

export function KeepSection() {
  const language = useLanguage()
  const badge = (stage: keyof typeof BADGES) => (
    <span class={`at-own-badge ${BADGES[stage][1]}`}>{language.t(BADGES[stage][0])}</span>
  )
  const track = (steps: readonly KeepStep[]) => (
    <div class="at-keep-row">
      <For each={steps}>
        {(step, index) => (
          <>
            <Show when={index() > 0}>
              <span class="at-keep-arrow">
                <Icon name="arrow" />
              </span>
            </Show>
            <div class={`at-keep-step ${step[4]}`}>
              <div class="at-keep-k">
                <Icon name={step[0]} />
                <b>{language.t(step[1])}</b>
                {badge(step[3])}
              </div>
              <p>
                <Rich text={language.t(step[2])} />
              </p>
            </div>
          </>
        )}
      </For>
    </div>
  )
  return (
    <section class="at-panel at-arch-block at-travel" id="keep">
      <header class="at-panel-head">
        <div>
          <h3>
            <Icon name="shield" />
            {language.t("orchestra.atlas.overview.keep.title")}
          </h3>
          <small>{language.t("orchestra.atlas.overview.keep.lead")}</small>
        </div>
      </header>
      <div class="at-keep-pin">
        <Icon name="hash" />
        <span>
          <Rich text={language.t("orchestra.atlas.overview.keep.anchor")} />
        </span>
      </div>
      <div class="at-keep-track">
        <div class="at-keep-label good">
          <Icon name="checkc" />
          {language.t("orchestra.atlas.overview.keep.refreshed")}
        </div>
        {track(REFRESHED)}
      </div>
      <div class="at-keep-track">
        <div class="at-keep-label warm">
          <Icon name="drift" />
          {language.t("orchestra.atlas.overview.keep.merged")}
        </div>
        {track(MERGED)}
      </div>
      <div class="at-keep-foot">
        <div>
          <b>
            <Icon name="shield" />
            {language.t("orchestra.atlas.overview.keep.ci")}
          </b>
          <p>
            <Rich text={language.t("orchestra.atlas.overview.keep.ci.text")} />
          </p>
        </div>
        <div>
          <b>
            <Icon name="agents" />
            {language.t("orchestra.atlas.overview.keep.maintainer", { name: seatName("rosie") })}
          </b>
          {badge("B")}
          <p>{language.t("orchestra.atlas.overview.keep.maintainer.text")}</p>
        </div>
      </div>
      <p class="mx-note">{language.t("orchestra.atlas.overview.keep.sources")}</p>
    </section>
  )
}
