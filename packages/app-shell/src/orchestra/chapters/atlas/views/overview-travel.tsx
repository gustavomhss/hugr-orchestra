import { For } from "solid-js"
import { useLanguage } from "@/context/language"
import { Help, Icon } from "../kit/chips"
import { Rich } from "../kit/text"

// How Atlas travels with the repository (modules/atlas/.gitignore: the reviewed config and the append-only logs are
// committed with the code, the store bytes are local state any clone rebuilds). Ported from
// specs/atlas-ui/mock/views-explore.js:88-99. Home and Architecture (A28c) show it.

const COMMITTED = [
  ["memory.jsonl", "orchestra.atlas.overview.travel.memory"],
  ["orientation.jsonl", "orchestra.atlas.overview.travel.orientation"],
  ["policy.json", "orchestra.atlas.overview.travel.policy"],
  [".orchestra/skills/own/", "orchestra.atlas.overview.travel.skills"],
] as const
const REBUILT = [
  ["cas/ · projection", "orchestra.atlas.overview.travel.cas"],
  ["index.scip", "orchestra.atlas.overview.travel.index"],
  ["staging", "orchestra.atlas.overview.travel.staging"],
] as const
const STEPS = [
  ["orchestra.atlas.overview.travel.step.pr", "orchestra.atlas.overview.travel.step.pr.text"],
  ["orchestra.atlas.overview.travel.step.merge", "orchestra.atlas.overview.travel.step.merge.text"],
  ["orchestra.atlas.overview.travel.step.clone", "orchestra.atlas.overview.travel.step.clone.text"],
] as const

export function TravelSection() {
  const language = useLanguage()
  return (
    <section class="at-panel at-arch-block at-travel" id="travel">
      <header class="at-panel-head">
        <div>
          <h3>
            <Icon name="branch" />
            {language.t("orchestra.atlas.overview.travel.title")}
          </h3>
          <small>{language.t("orchestra.atlas.overview.travel.lead")}</small>
        </div>
      </header>
      <div class="at-travel-flow">
        <div class="at-travel-col">
          <div class="at-travel-k good">
            <Icon name="branch" />
            {language.t("orchestra.atlas.overview.travel.committed")}
          </div>
          <For each={COMMITTED}>
            {(row) => (
              <div class="at-travel-row">
                <code>{row[0]}</code>
                <p>{language.t(row[1])}</p>
              </div>
            )}
          </For>
        </div>
        <div class="at-travel-mid">
          <div class="at-travel-node">
            <Icon name="branch" />
            <b>{language.t("orchestra.atlas.overview.travel.origin")}</b>
            <small>{language.t("orchestra.atlas.overview.travel.origin.detail")}</small>
          </div>
          <div class="at-travel-arrow">
            <Icon name="arrow" />
          </div>
          <div class="at-travel-node">
            <Icon name="download" />
            <b>{language.t("orchestra.atlas.overview.travel.clone")}</b>
            <small>{language.t("orchestra.atlas.overview.travel.clone.detail")}</small>
          </div>
        </div>
        <div class="at-travel-col">
          <div class="at-travel-k">
            <Icon name="refresh" />
            {language.t("orchestra.atlas.overview.travel.rebuilt")}
          </div>
          <For each={REBUILT}>
            {(row) => (
              <div class="at-travel-row">
                <code>{row[0]}</code>
                <p>{language.t(row[1])}</p>
              </div>
            )}
          </For>
        </div>
      </div>
      <div class="at-travel-steps">
        <For each={STEPS}>
          {(step, index) => (
            <div>
              <span>{index() + 1}</span>
              <b>{language.t(step[0])}</b>
              <p>{language.t(step[1])}</p>
            </div>
          )}
        </For>
      </div>
      <p class="mx-note">
        <Rich text={language.t("orchestra.atlas.overview.travel.export")} />{" "}
        <Help text={language.t("orchestra.atlas.overview.travel.export.help")} />
      </p>
    </section>
  )
}
