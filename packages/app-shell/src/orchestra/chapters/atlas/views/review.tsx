import { createEffect, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import { atlasHref } from "../atlas-route"
import { Icon, TierChip, useAtlasWords } from "../kit/chips"
import { Acc, Btn, FactRow, Seven, Tech } from "../kit/controls"
import { num } from "../kit/format"
import { Rich } from "../kit/text"
import { atlasSheetState, openAtlasSheet } from "../sheets/state"
import type { AtlasViewProps } from "./index"
import { changedFacts, changedUnits, lastRun, rowOutcome, waiting } from "./review-data"

// Review: everything that waits on a person (specs/atlas-ui/mock/views-more.js:15-56).
const TABS = [
  ["changed", "orchestra.atlas.review.tab.changed", "drift"],
  ["mined", "orchestra.atlas.review.tab.mined", "sparkle"],
  ["ratify", "orchestra.atlas.review.tab.ratify", "shield"],
] as const

export default function AtlasReviewView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([language.t("orchestra.atlas.review.crumb")]))
  const tab = () => TABS.find((item) => item[0] === props.route.query.tab)?.[0] ?? "changed"
  const need = () => props.model.curationCount()
  const counts = () => ({
    changed: props.model.stats().drifted,
    mined: props.model.stats().candidates,
    ratify: props.model.live().filter((x) => x.proposedTier).length,
  })
  return (
    <div class="at-page narrow">
      <div class="mx-heading">
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.review.eyebrow")}</div>
          <h1>{language.t("orchestra.atlas.review.title")}</h1>
          <p>
            {need()
              ? language.plural("orchestra.atlas.review.waiting", need(), { n: num(need()) })
              : language.t("orchestra.atlas.review.nothing")}
          </p>
        </div>
        <div class="heading-actions">
          <Btn
            label={language.t("orchestra.atlas.review.mine")}
            icon="sparkle"
            write
            onClick={() => openAtlasSheet({ kind: "mine" })}
          />
          <Btn
            icon="relations"
            ariaLabel={language.t("orchestra.atlas.review.producers")}
            tip={language.t("orchestra.atlas.review.producers.tip")}
            onClick={() => openAtlasSheet({ kind: "producers" })}
          />
        </div>
      </div>
      <div class="wf-tabs" role="tablist">
        <For each={TABS}>
          {(item) => (
            <button
              type="button"
              class="wf-tab"
              role="tab"
              aria-selected={tab() === item[0]}
              onClick={() => atlas.go(atlasHref("review", "", { tab: item[0] }))}
            >
              <Icon name={item[2]} />
              {language.t(item[1])}
              <span class="wf-count">{num(counts()[item[0]])}</span>
            </button>
          )}
        </For>
      </div>
      <Switch>
        <Match when={tab() === "changed"}>
          <Changed route={props.route} model={props.model} />
        </Match>
        <Match when={tab() === "mined"}>
          <Mined route={props.route} model={props.model} />
        </Match>
        <Match when={tab() === "ratify"}>
          <Ratify route={props.route} model={props.model} />
        </Match>
      </Switch>
    </div>
  )
}

function Changed(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  const list = () => changedFacts(props.model, { unit: props.route.query.unit, commit: props.route.query.commit })
  const commits = (count: number) => language.plural("orchestra.atlas.review.commits", count, { n: num(count) })
  return (
    <>
      <div class="at-toolbar">
        <span class="at-subline">{language.t("orchestra.atlas.review.changed.line")}</span>
        <span class="grow" />
        <Btn
          label={language.t("orchestra.atlas.review.reconcile")}
          icon="branch"
          onClick={() => openAtlasSheet({ kind: "reconcile" })}
        />
      </div>
      <div class="at-toolbar">
        <label class="at-select">
          <Icon name="stack" />
          <select
            aria-label={language.t("orchestra.atlas.review.unit.aria")}
            onChange={(event) => atlas.setQuery({ unit: event.currentTarget.value, fact: undefined })}
          >
            <option value="">{language.t("orchestra.atlas.review.unit.all")}</option>
            <For each={changedUnits(props.model)}>
              {(unit) => (
                <option value={unit} selected={props.route.query.unit === unit}>
                  {unit}
                </option>
              )}
            </For>
          </select>
        </label>
        <label class="at-select">
          <Icon name="commit" />
          <select
            aria-label={language.t("orchestra.atlas.review.commit.aria")}
            onChange={(event) => atlas.setQuery({ commit: event.currentTarget.value, fact: undefined })}
          >
            <option value="">{language.t("orchestra.atlas.review.commit.any")}</option>
            <For each={props.model.codeChanges()}>
              {(change) => (
                <option value={change.sha} selected={props.route.query.commit === change.sha}>
                  {language.t("orchestra.atlas.review.commit.option", { sha: change.sha, subject: change.subject.slice(0, 44) })}
                </option>
              )}
            </For>
          </select>
        </label>
      </div>
      <section class="at-panel">
        <Show
          when={list().length}
          fallback={
            <div class="at-clear">
              <Icon name="checkc" />
              <strong>{language.t("orchestra.atlas.review.changed.clear.title")}</strong>
              <p>{language.t("orchestra.atlas.review.changed.clear.body")}</p>
            </div>
          }
        >
          <Seven id="changed" rows={list()} first={25}>
            {(x) => <FactRow fact={x} extra={<span>{commits(x.drift?.commits.length ?? 0)}</span>} />}
          </Seven>
        </Show>
      </section>
    </>
  )
}

function Mined(props: AtlasViewProps) {
  const language = useLanguage()
  const words = useAtlasWords()
  const list = () => waiting(props.model)
  const kept = () => atlasSheetState.promote
  return (
    <>
      <div class="at-toolbar">
        <span class="at-subline">{language.t("orchestra.atlas.review.mined.line")}</span>
        <span class="grow" />
        <Show when={list().length}>
          <Btn
            label={language.t("orchestra.atlas.review.acceptAll")}
            primary
            write
            onClick={() => openAtlasSheet({ kind: "promote-all" })}
          />
        </Show>
      </div>
      <Show when={kept()}>
        {(record) => (
          <div class="at-resultline">
            <Icon name={record().run.refused ? "warning" : "checkc"} />
            <span>
              {record().run.read
                ? language.t("orchestra.atlas.review.lastRun", {
                    fresh: num(lastRun(record()).fresh),
                    refused: num(lastRun(record()).refused),
                  })
                : language.t("orchestra.atlas.review.lastRun.refused")}
            </span>
            <Btn
              label={language.t("orchestra.atlas.review.details")}
              onClick={() => openAtlasSheet({ kind: "promote-result" })}
            />
          </div>
        )}
      </Show>
      <section class="at-panel">
        <Show
          when={list().length}
          fallback={
            <div class="at-clear">
              <Icon name="checkc" />
              <strong>{language.t("orchestra.atlas.review.mined.clear.title")}</strong>
              <p>{language.t("orchestra.atlas.review.mined.clear.body")}</p>
              <Btn label={language.t("orchestra.atlas.review.mine")} onClick={() => openAtlasSheet({ kind: "mine" })} />
            </div>
          }
        >
          <Seven id="mined" rows={list()} first={25}>
            {(x) => (
              <FactRow
                fact={x}
                extra={
                  <Show when={rowOutcome(kept(), x.key)}>
                    {(row) => (
                      <span class={`at-outcome ${row().settled ? "good" : "bad"}`}>
                        {row().settled
                          ? language.t("orchestra.atlas.review.outcome.accepted")
                          : words.refusal(row().rejected ?? "")}
                      </span>
                    )}
                  </Show>
                }
              />
            )}
          </Seven>
        </Show>
      </section>
    </>
  )
}

function Ratify(props: AtlasViewProps) {
  const language = useLanguage()
  const proposals = () => props.model.live().filter((x) => x.proposedTier)
  const keywords = () => props.model.R.t0Keywords
  const core = () => props.model.territories().filter((t) => keywords().some((k) => t.name.includes(k)))
  const quoted = () =>
    keywords()
      .map((keyword) => language.t("orchestra.atlas.review.core.keyword", { keyword }))
      .join(language.t("orchestra.atlas.review.core.or"))
  return (
    <>
      <div class="at-toolbar">
        <span class="at-subline">{language.t("orchestra.atlas.review.ratify.line")}</span>
      </div>
      <Show
        when={proposals().length}
        fallback={
          <div class="at-clear">
            <Icon name="shield" />
            <strong>{language.t("orchestra.atlas.review.ratify.clear.title")}</strong>
            <p>{language.t("orchestra.atlas.review.ratify.clear.body")}</p>
          </div>
        }
      >
        <section class="at-panel">
          <For each={proposals()}>{(x) => <FactRow fact={x} />}</For>
        </section>
      </Show>
      <Acc
        id="review-core"
        icon="territory"
        title={language.t("orchestra.atlas.review.core.title")}
        purpose={language.t("orchestra.atlas.review.core.purpose")}
        summary={core().length}
      >
        <Show
          when={core().length}
          fallback={
            <div class="at-band-empty">{language.t("orchestra.atlas.review.core.none", { keywords: quoted() })}</div>
          }
        >
          <For each={core()}>
            {(territory) => (
              <div class="at-linkrow static">
                <Icon name="territory" />
                <span>{territory.name}</span>
                <span class="grow" />
                <TierChip tier={territory.tier} />
              </div>
            )}
          </For>
        </Show>
        <Tech
          rows={[
            [language.t("orchestra.atlas.review.core.tech.label"), <Rich text={language.t("orchestra.atlas.review.core.tech")} />],
          ]}
        />
      </Acc>
    </>
  )
}
