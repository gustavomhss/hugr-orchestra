import { createEffect, createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasMemberId } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Icon } from "../kit/chips"
import { Btn } from "../kit/controls"
import { num, seatName } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import type { AtlasViewProps } from "./index"
import { HealthSection } from "./overview-health"
import { KeepSection } from "./overview-keep"
import { TravelSection } from "./overview-travel"

// Home: what Atlas knows, what it caught, what it gave agents (specs/atlas-ui/mock/views-explore.js:36-87).
const SEATS: AtlasMemberId[] = ["backend", "jimmy", "archie"]

export default function AtlasOverviewView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([]))
  // The mock scrolls to the health section when the route asks for it (mock/app.js:77).
  createEffect(() => {
    if (props.route.query.show !== "health") return
    setTimeout(() => document.getElementById("health")?.scrollIntoView({ block: "start" }), 0)
  })
  const scrollTo = (id: string) => (event: MouseEvent) => {
    event.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }
  const stats = createMemo(() => props.model.stats())
  const need = () => props.model.curationCount()
  const events = createMemo(() => props.model.activity())
  const changes = createMemo(() => props.model.codeChanges())
  const reads = () => events().filter((e) => e.kind === "read").length
  const indexed = () => props.model.health().index.configured.reduce((n, c) => n + c.files, 0)
  const tally = (id: AtlasMemberId) => {
    const mine = events().filter((e) => e.who === id)
    const parts = [
      [mine.filter((e) => e.kind === "read").length, "orchestra.atlas.overview.delivered.read"],
      [mine.filter((e) => e.kind === "memory" && e.ok && !e.recall).length, "orchestra.atlas.overview.delivered.saved"],
      [mine.filter((e) => e.kind === "resume" && e.ok).length, "orchestra.atlas.overview.delivered.resumed"],
      [mine.filter((e) => e.kind === "hold").length, "orchestra.atlas.overview.delivered.held"],
    ] as const
    return (
      parts
        .filter((part) => part[0] > 0)
        .map((part) => language.t(part[1], { count: part[0] }))
        .join(" · ") || language.t("orchestra.atlas.overview.delivered.nothing")
    )
  }
  return (
    <div class="at-page wide at-home">
      <section class="at-hero solo">
        <div class="at-hero-text">
          <div class="mx-eyebrow">
            {language.t("orchestra.atlas.overview.eyebrow", { name: props.model.R.project })}{" "}
            <Show when={need()}>
              <AtlasLink class="at-needs" href={atlasHref("review")}>
                {language.t("orchestra.atlas.overview.needs", { count: num(need()) })}
              </AtlasLink>
            </Show>
          </div>
          <h1>
            <Rich text={language.t("orchestra.atlas.overview.hero.title", { count: num(stats().facts) })} />
          </h1>
          <p>
            <Rich
              text={language.t("orchestra.atlas.overview.hero.lead", { fresh: num(stats().fresh), drifted: num(stats().drifted) })}
            />
          </p>
          <p class="at-hero-git">
            <Icon name="shield" /> {language.t("orchestra.atlas.overview.hero.git")}{" "}
            <a class="mx-link" href={atlasHref("overview")} onClick={scrollTo("travel")}>
              {language.t("orchestra.atlas.overview.hero.travel")}
            </a>{" "}
            ·{" "}
            <a class="mx-link" href={atlasHref("overview")} onClick={scrollTo("keep")}>
              {language.t("orchestra.atlas.overview.hero.keep")}
            </a>
          </p>
          <Show when={props.model.provenance() !== "trusted"}>
            <p class="at-hero-warn">
              <Icon name="lock" /> {language.t("orchestra.atlas.overview.hero.warn")}{" "}
              <AtlasLink class="mx-link" href={atlasHref("overview", "", { show: "health" })}>
                {language.t("orchestra.atlas.overview.hero.why")}
              </AtlasLink>
            </p>
          </Show>
          <div class="at-hero-actions">
            <Btn
              label={language.t("orchestra.atlas.overview.action.explore")}
              primary
              icon="graph"
              onClick={() => atlas.go(atlasHref("explore"))}
            />
            <Btn label={language.t("orchestra.atlas.overview.action.genesis")} icon="sparkle" onClick={() => atlas.go(atlasHref("genesis"))} />
            <Btn label={language.t("orchestra.atlas.overview.action.how")} icon="fact" onClick={() => atlas.go(atlasHref("how"))} />
          </div>
        </div>
      </section>
      <section class="at-stories">
        <AtlasLink class="at-story" href={atlasHref("genesis")}>
          <span class="at-story-k">
            <Icon name="sparkle" />
            {language.t("orchestra.atlas.overview.learned")}
          </span>
          <b>
            {language.t("orchestra.atlas.overview.learned.title", {
              count: num(props.model.R.candidates.length + props.model.facts.length),
            })}
          </b>
          <p>{language.t("orchestra.atlas.overview.learned.text", { files: num(indexed()) })}</p>
          <span class="at-story-foot">
            {language.t("orchestra.atlas.overview.learned.foot", {
              accepted: num(props.model.facts.length),
              waiting: num(props.model.R.candidates.length),
            })}{" "}
            <Icon name="arrow" />
          </span>
        </AtlasLink>
        <AtlasLink class="at-story warm" href={atlasHref("review", "", { tab: "changed" })}>
          <span class="at-story-k">
            <Icon name="drift" />
            {language.t("orchestra.atlas.overview.caught")}
          </span>
          <b>{language.plural("orchestra.atlas.overview.caught.title", stats().drifted, { n: num(stats().drifted) })}</b>
          <Show when={changes().length} fallback={<p>{language.t("orchestra.atlas.overview.caught.none")}</p>}>
            <For each={changes().slice(0, 3)}>
              {(change) => (
                <div class="at-story-row">
                  <code class="at-sha">{change.sha}</code>
                  <span>{change.subject.slice(0, 46)}</span>
                  <small>{change.facts.length}</small>
                </div>
              )}
            </For>
          </Show>
          <span class="at-story-foot">
            {language.t("orchestra.atlas.overview.caught.foot")} <Icon name="arrow" />
          </span>
        </AtlasLink>
        <AtlasLink class="at-story" href={atlasHref("activity")}>
          <span class="at-story-k">
            <Icon name="agents" />
            {language.t("orchestra.atlas.overview.delivered")}
          </span>
          <b>
            {reads()
              ? language.plural("orchestra.atlas.overview.delivered.reads", reads(), { n: num(reads()) })
              : language.t("orchestra.atlas.overview.delivered.none")}
          </b>
          <For each={SEATS}>
            {(id) => (
              <div class="at-story-row">
                <span class="at-avatar sm">{seatName(id)[0]}</span>
                <span>{seatName(id)}</span>
                <small>{tally(id)}</small>
              </div>
            )}
          </For>
          <span class="at-story-foot">
            {language.t("orchestra.atlas.overview.delivered.foot")} <Icon name="arrow" />
          </span>
        </AtlasLink>
      </section>
      <TravelSection />
      <KeepSection />
      <HealthSection model={props.model} open={props.route.query.show === "health"} />
    </div>
  )
}