import { createEffect, createResource, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasFact, AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Icon, StateChip } from "../kit/chips"
import { Btn } from "../kit/controls"
import { num } from "../kit/format"
import { AtlasLink } from "../kit/text"
import { BriefingBuild } from "./briefing-build"
import { anotherFact, blastOf, followFact, HOW_STOPS, howStep, reasoningFailed, reasoningText, servedIn } from "./how-data"
import type { AtlasViewProps } from "./index"

// Follow one fact: a real sentence from this store, from mining to its code moving
// (specs/atlas-ui/mock/views-explore.js:445-479).
const GATES = [
  ["shape", "orchestra.atlas.how.gate.shape", "orchestra.atlas.how.gate.shape.text"],
  ["truth", "orchestra.atlas.how.gate.truth", "orchestra.atlas.how.gate.truth.text"],
  ["authz", "orchestra.atlas.how.gate.authz", "orchestra.atlas.how.gate.authz.text"],
  ["ratify", "orchestra.atlas.how.gate.ratify", "orchestra.atlas.how.gate.ratify.text"],
] as const

export default function AtlasHowView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([language.t("orchestra.atlas.how.crumb")]))
  return (
    <Show
      when={followFact(props.model, props.route.query.pick)}
      fallback={
        <div class="at-page wide">
          <p class="mx-empty">{language.t("orchestra.atlas.how.none")}</p>
        </div>
      }
    >
      {(fact) => <Follow model={props.model} fact={fact()} step={howStep(props.route.query.step)} />}
    </Show>
  )
}

function Follow(props: { model: AtlasModel; fact: AtlasFact; step: number }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const href = (step: number) => atlasHref("how", "", { pick: props.fact.key, step: String(step) })
  const stop = () => HOW_STOPS[props.step]
  return (
    <div class="at-page wide">
      <section class="at-gen-hero">
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.how.eyebrow")}</div>
          <h1>{language.t("orchestra.atlas.how.title")}</h1>
          <p>{language.t("orchestra.atlas.how.lead")}</p>
        </div>
        <div class="heading-actions">
          <Btn
            label={language.t("orchestra.atlas.how.another")}
            icon="refresh"
            onClick={() => atlas.go(atlasHref("how", "", { pick: anotherFact(props.model, props.fact).key }))}
          />
        </div>
      </section>
      <div class="at-how-fact">
        <span>
          <Icon name="fact" />
        </span>
        <p>{language.t("orchestra.atlas.how.quote", { claim: props.fact.claim })}</p>
        <code class="at-mono">{props.fact.file}</code>
      </div>
      <ol class="at-how-track">
        <For each={HOW_STOPS}>
          {(item, index) => (
            <li>
              <AtlasLink class={index() === props.step ? "on" : index() < props.step ? "done" : ""} href={href(index())}>
                <span>
                  <Icon name={item[0]} />
                </span>
                <b>{language.t(item[1])}</b>
              </AtlasLink>
            </li>
          )}
        </For>
      </ol>
      <section class="at-how-stop">
        <h2>
          <Icon name={stop()[0]} />
          {language.t(stop()[1])}
        </h2>
        <Switch>
          <Match when={props.step === 0}>
            <Learned fact={props.fact} />
          </Match>
          <Match when={props.step === 1}>
            <Checked fact={props.fact} />
          </Match>
          <Match when={props.step === 2}>
            <Stored model={props.model} fact={props.fact} />
          </Match>
          <Match when={props.step === 3}>
            <Served model={props.model} fact={props.fact} />
          </Match>
          <Match when={props.step === 4}>
            <Watched model={props.model} fact={props.fact} />
          </Match>
        </Switch>
        <div class="at-how-nav">
          <Show when={props.step} fallback={<span />}>
            <Btn label={language.t("orchestra.atlas.how.back")} icon="back" onClick={() => atlas.go(href(props.step - 1))} />
          </Show>
          <Show
            when={props.step < HOW_STOPS.length - 1}
            fallback={
              <Btn
                label={language.t("orchestra.atlas.how.open")}
                primary
                onClick={() => atlas.go(atlasHref("fact", props.fact.key))}
              />
            }
          >
            <Btn
              label={language.t("orchestra.atlas.how.next", { title: language.t(HOW_STOPS[props.step + 1][1]) })}
              primary
              icon="arrow"
              onClick={() => atlas.go(href(props.step + 1))}
            />
          </Show>
        </div>
      </section>
    </div>
  )
}

function Learned(props: { fact: AtlasFact }) {
  const atlas = useAtlas()
  const language = useLanguage()
  // D3: reasoning is read one entry at a time and cached by the controller.
  const [reasoning, { refetch }] = createResource(
    () => props.fact.why ?? undefined,
    (id) => atlas.controller.reasoning(id),
  )
  // The controller keeps a failed read as undefined and reports it in its own error: that is not "no reasoning".
  const failed = () =>
    reasoningFailed({
      asked: props.fact.why !== undefined && props.fact.why !== null,
      loading: reasoning.loading,
      error: reasoning.error,
      // A rejected resource throws when its value is read.
      value: reasoning.error ? undefined : reasoning(),
      controllerError: atlas.controller.state.error,
    })
  const text = () => reasoningText(reasoning()) ?? language.t("orchestra.atlas.how.learned.none")
  return (
    <>
      <p class="at-lead">{language.t("orchestra.atlas.how.learned.line")}</p>
      <div class="at-how-card">
        <p class="at-gen-claim">{language.t("orchestra.atlas.how.quote", { claim: props.fact.claim })}</p>
        <Show
          when={!failed()}
          fallback={
            <>
              <p class="mx-error">{language.t("orchestra.atlas.how.learned.error")}</p>
              <Btn label={language.t("orchestra.atlas.frame.retry")} icon="refresh" onClick={() => void refetch()} />
            </>
          }
        >
          <div class="at-reasoning short">{text().length > 520 ? `${text().slice(0, 520)}…` : text()}</div>
        </Show>
        <small>{language.t("orchestra.atlas.how.learned.answer")}</small>
      </div>
    </>
  )
}

function Checked(props: { fact: AtlasFact }) {
  const language = useLanguage()
  return (
    <>
      <p class="at-lead">{language.t("orchestra.atlas.how.checked.line")}</p>
      <div class="at-how-gates">
        <For each={GATES}>
          {(gate, index) => (
            <>
              <Show when={index()}>
                <Icon name="arrow" />
              </Show>
              <div class="at-how-gate">
                <span>{index() + 1}</span>
                <b>{language.t(gate[1])}</b>
                <small>{language.t(gate[2], { scope: props.fact.scope })}</small>
                <code>{gate[0]}</code>
              </div>
            </>
          )}
        </For>
      </div>
    </>
  )
}

function Stored(props: { model: AtlasModel; fact: AtlasFact }) {
  const language = useLanguage()
  return (
    <>
      <p class="at-lead">{language.t("orchestra.atlas.how.stored.line")}</p>
      <div class="at-how-store">
        <div class="at-how-layer">
          <b>{language.t("orchestra.atlas.how.layer.identity")}</b>
          <code>{`${props.fact.key.slice(0, 16)}…`}</code>
          <small>{language.t("orchestra.atlas.how.layer.identity.text")}</small>
        </div>
        <div class="at-how-layer">
          <b>{language.t("orchestra.atlas.how.layer.content")}</b>
          <code>{`cas/${props.fact.hash.slice(0, 2)}/${props.fact.hash.slice(0, 14)}…`}</code>
          <small>{language.t("orchestra.atlas.how.layer.content.text")}</small>
        </div>
        <div class="at-how-layer">
          <b>{language.t("orchestra.atlas.how.layer.current")}</b>
          <code>{`projection.${props.model.R.gen}.json`}</code>
          <small>{language.t("orchestra.atlas.how.layer.current.text", { gen: props.model.R.gen })}</small>
        </div>
        <div class="at-how-layer">
          <b>{language.t("orchestra.atlas.how.layer.anchor")}</b>
          <code>{`${props.fact.file} · ${props.fact.subtree}`}</code>
          <small>{language.t("orchestra.atlas.how.layer.anchor.text", { rev: props.fact.derivedAt })}</small>
        </div>
      </div>
      <p class="mx-note">{language.t("orchestra.atlas.how.stored.note", { n: num(props.model.R.casObjects) })}</p>
    </>
  )
}

function Served(props: { model: AtlasModel; fact: AtlasFact }) {
  const language = useLanguage()
  return (
    <>
      <p class="at-lead">
        {servedIn(props.model, props.fact)
          ? language.t("orchestra.atlas.how.served.in")
          : language.t("orchestra.atlas.how.served.out")}
      </p>
      <div class="at-how-brief">
        <BriefingBuild path={props.model.unitOf(props.fact.file)} focus={props.fact.key} />
      </div>
      <p class="mx-note">{language.t("orchestra.atlas.how.served.note")}</p>
    </>
  )
}

function Watched(props: { model: AtlasModel; fact: AtlasFact }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const blast = () => blastOf(props.model, props.fact)
  return (
    <Show
      when={props.fact.drift}
      fallback={
        <>
          <p class="at-lead">{language.t("orchestra.atlas.how.watched.still")}</p>
          <div class="at-how-card">
            <StateChip state="fresh" />
          </div>
        </>
      }
    >
      {(drift) => (
        <>
          <p class="at-lead">{language.t("orchestra.atlas.how.watched.moved", { stat: drift().stat })}</p>
          <div class="at-how-card">
            <For each={drift().commits}>
              {(commit) => (
                <div class="at-commit">
                  <code class="at-sha">{commit[0]}</code>
                  <span>{commit[1]}</span>
                </div>
              )}
            </For>
            <Show when={blast()}>
              <small>{language.plural("orchestra.atlas.how.watched.blast", blast(), { n: num(blast()) })}</small>
            </Show>
          </div>
          <Btn
            label={language.t("orchestra.atlas.how.review")}
            primary
            onClick={() => atlas.go(atlasHref("review", "", { tab: "changed", fact: props.fact.key }))}
          />
        </>
      )}
    </Show>
  )
}
