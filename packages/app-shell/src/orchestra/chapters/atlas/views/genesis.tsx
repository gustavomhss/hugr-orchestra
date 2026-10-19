import { createEffect, createMemo, createResource, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Icon } from "../kit/chips"
import { Bar, Btn, Tech } from "../kit/controls"
import { num } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { openAtlasSheet } from "../sheets/state"
import {
  genesisConf,
  genesisQuery,
  HOW,
  KINDS,
  KNOBS,
  markRefutation,
  mineCommand,
  PROMOTE_COMMAND,
  sampleFact,
  stages,
  storeCounts,
} from "./genesis-data"
import { GenesisInterview } from "./genesis-interview"
import type { AtlasViewProps } from "./index"

// Genesis: how Atlas learns a repository (specs/atlas-ui/mock/views-explore.js:374-443).
const GAPS = [
  ["orchestra.atlas.genesis.gap.scope", "orchestra.atlas.genesis.gap.scope.detail"],
  ["orchestra.atlas.genesis.gap.resume", "orchestra.atlas.genesis.gap.resume.detail"],
  ["orchestra.atlas.genesis.gap.changed", "orchestra.atlas.genesis.gap.changed.detail"],
  ["orchestra.atlas.genesis.gap.deepen", "orchestra.atlas.genesis.gap.deepen.detail"],
  ["orchestra.atlas.genesis.gap.oracles", "orchestra.atlas.genesis.gap.oracles.detail"],
  ["orchestra.atlas.genesis.gap.claims", "orchestra.atlas.genesis.gap.claims.detail"],
] as const

export default function AtlasGenesisView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([language.t("orchestra.atlas.genesis.crumb")]))
  const list = createMemo(() => stages(props.model))
  const at = () => list().find((x) => x.id === props.route.query.stage) ?? list()[2]
  const conf = () => genesisConf(props.route.query)
  const cmd = () => mineCommand(conf())
  const counts = () => storeCounts(props.model)
  const copy = (text: string) => {
    const done = () => atlas.toast(language.t("orchestra.atlas.genesis.copied"), "copy")
    navigator.clipboard.writeText(text).then(done, done)
  }
  return (
    <div class="at-page wide">
      <section class="at-gen-hero">
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.genesis.eyebrow")}</div>
          <h1>{language.t("orchestra.atlas.genesis.title")}</h1>
          <p>
            <Rich text={language.t("orchestra.atlas.genesis.intro")} />
          </p>
        </div>
        <div class="heading-actions">
          <Btn
            label={language.t("orchestra.atlas.genesis.run")}
            primary
            icon="play"
            write
            onClick={() => openAtlasSheet({ kind: "mine" })}
          />
        </div>
      </section>

      <ol class="at-pipe">
        <For each={list()}>
          {(x, i) => (
            <li>
              <AtlasLink
                class={`at-pipe-step ${x.id === at().id ? "on" : ""} ${x.how}`}
                href={atlasHref("genesis", "", genesisQuery(conf(), { stage: x.id }))}
              >
                <span class="at-pipe-ic">
                  <Icon name={x.icon} />
                </span>
                <span class="at-pipe-n">
                  {x.ceiling ? language.t("orchestra.atlas.genesis.stage.ceiling", { n: num(x.n) }) : num(x.n)}
                </span>
                <span class="at-pipe-u">{language.t(x.unit, x.params)}</span>
                <strong>{language.t("orchestra.atlas.genesis.stage.step", { n: i() + 1, title: language.t(x.title) })}</strong>
                <span class={`at-pipe-how ${HOW[x.how][1]}`}>{language.t(HOW[x.how][0])}</span>
              </AtlasLink>
            </li>
          )}
        </For>
      </ol>
      <div class="at-gen-split">
        <span>
          <Rich text={language.t("orchestra.atlas.genesis.split.mine")} />
        </span>
        <span>
          <Rich text={language.t("orchestra.atlas.genesis.split.promote")} />
        </span>
      </div>

      <section class="at-gen-detail">
        <div>
          <h2>
            <Icon name={at().icon} />
            {language.t(at().title)}
          </h2>
          <p class="at-lead">
            <Rich text={language.t(at().what)} />
          </p>
          <ul class="at-gen-facts">
            <For each={at().facts}>
              {(fact) => (
                <li>
                  <Icon name="checkc" />
                  {language.t(fact)}
                </li>
              )}
            </For>
          </ul>
          <Tech rows={[[language.t("orchestra.atlas.genesis.tech.code"), <code>{at().refs}</code>]]} />
        </div>
        <Switch
          fallback={
            <div class="at-gen-sample">
              <div class="at-gen-sample-k">
                <Icon name="info" />
                {language.t("orchestra.atlas.genesis.store.title")}
              </div>
              <p class="mx-note">
                {at().id === "scan"
                  ? language.t("orchestra.atlas.genesis.store.scan", {
                      folders: num(counts().folders),
                      links: num(counts().links),
                    })
                  : language.t("orchestra.atlas.genesis.store.stage", {
                      all: num(counts().all),
                      waiting: num(props.model.candidates.length),
                    })}
              </p>
            </div>
          }
        >
          <Match when={at().id === "propose"}>
            <ProposeSample model={props.model} />
          </Match>
          <Match when={at().id === "rank"}>
            <div class="at-gen-sample">
              <div class="at-gen-sample-k">
                <Icon name="graph" />
                {language.t("orchestra.atlas.genesis.rank.title")}
              </div>
              <ol class="at-gen-choose">
                <li>
                  <b>{language.t("orchestra.atlas.genesis.rank.history")}</b>
                  <span>{language.t("orchestra.atlas.genesis.rank.history.yes")}</span>
                  <span class="muted">{language.t("orchestra.atlas.genesis.rank.history.no")}</span>
                </li>
                <li>
                  <b>{language.t("orchestra.atlas.genesis.rank.order")}</b>
                  <span>{language.t("orchestra.atlas.genesis.rank.order.text")}</span>
                </li>
                <li>
                  <b>{language.t("orchestra.atlas.genesis.rank.provable")}</b>
                  <span>{language.t("orchestra.atlas.genesis.rank.provable.text")}</span>
                </li>
                <li>
                  <b>{language.t("orchestra.atlas.genesis.rank.ceiling")}</b>
                  <span>{language.t("orchestra.atlas.genesis.rank.ceiling.text")}</span>
                </li>
              </ol>
            </div>
          </Match>
          <Match when={at().id === "check"}>
            <div class="at-gen-sample">
              <div class="at-gen-sample-k">
                <Icon name="shield" />
                {language.t("orchestra.atlas.genesis.check.title")}
              </div>
              <div class="at-gen-outcomes">
                <div class="good">
                  <b>{language.t("orchestra.atlas.genesis.check.proven")}</b>
                  <p>{language.t("orchestra.atlas.genesis.check.proven.text")}</p>
                  <small>{language.t("orchestra.atlas.genesis.check.inStore", { n: num(counts().proven) })}</small>
                </div>
                <div>
                  <b>{language.t("orchestra.atlas.genesis.check.hint")}</b>
                  <p>{language.t("orchestra.atlas.genesis.check.hint.text")}</p>
                  <small>
                    {language.t("orchestra.atlas.genesis.check.inStore", { n: num(counts().all - counts().proven) })}
                  </small>
                </div>
                <div class="warm">
                  <b>{language.t("orchestra.atlas.genesis.check.dropped")}</b>
                  <p>{language.t("orchestra.atlas.genesis.check.dropped.text")}</p>
                  <small>{language.t("orchestra.atlas.genesis.check.notKept")}</small>
                </div>
              </div>
            </div>
          </Match>
          <Match when={at().id === "accept"}>
            <div class="at-gen-sample">
              <div class="at-gen-sample-k">
                <Icon name="check" />
                {language.t("orchestra.atlas.genesis.accept.title")}
              </div>
              <Bar
                parts={[
                  ["good", props.model.facts.length],
                  ["blue", props.model.candidates.length],
                ]}
              />
              <div class="at-coverage-legend">
                <span>
                  <Rich text={language.t("orchestra.atlas.genesis.accept.promoted", { n: num(props.model.facts.length) })} />
                </span>
                <span>
                  <Rich text={language.t("orchestra.atlas.genesis.accept.waiting", { n: num(props.model.candidates.length) })} />
                </span>
              </div>
              <p class="mx-note">{language.t("orchestra.atlas.genesis.accept.note")}</p>
              <Btn
                label={language.t("orchestra.atlas.genesis.accept.review")}
                onClick={() => atlas.go(atlasHref("review", "", { tab: "mined" }))}
              />
            </div>
          </Match>
        </Switch>
      </section>

      <section class="at-panel at-arch-block">
        <header class="at-panel-head">
          <div>
            <h3>
              <Icon name="stack" />
              {language.t("orchestra.atlas.genesis.kinds.title")}
            </h3>
            <small>{language.t("orchestra.atlas.genesis.kinds.purpose")}</small>
          </div>
        </header>
        <div class="at-kinds">
          <div class="at-kinds-row head">
            <span>{language.t("orchestra.atlas.genesis.kinds.head.kind")}</span>
            <span>{language.t("orchestra.atlas.genesis.kinds.head.model")}</span>
            <span>{language.t("orchestra.atlas.genesis.kinds.head.check")}</span>
            <span>{language.t("orchestra.atlas.genesis.kinds.head.lands")}</span>
          </div>
          <For each={KINDS}>
            {(kind) => (
              <div class="at-kinds-row">
                <span>
                  <b>{language.t(kind.name)}</b>{" "}
                  <Show
                    when={kind.on}
                    fallback={<span class="at-own-badge">{language.t("orchestra.atlas.genesis.kinds.optin")}</span>}
                  >
                    <span class="at-own-badge good">{language.t("orchestra.atlas.genesis.kinds.default")}</span>
                  </Show>
                  <code>{kind.id}</code>
                </span>
                <span>{language.t(kind.model)}</span>
                <span>{language.t(kind.check)}</span>
                <span>{language.t(kind.lands)}</span>
              </div>
            )}
          </For>
        </div>
        <p class="mx-note">
          {language.t("orchestra.atlas.genesis.kinds.note", {
            all: num(counts().all),
            proven: num(counts().proven),
            justified: num(counts().justified),
          })}
        </p>
      </section>

      <GenesisInterview model={props.model} />

      <section class="at-panel at-gen-config">
        <header class="at-panel-head">
          <div>
            <h3>
              <Icon name="settings" />
              {language.t("orchestra.atlas.genesis.config.title")}
            </h3>
            <small>
              <Rich text={language.t("orchestra.atlas.genesis.config.purpose")} />
            </small>
          </div>
        </header>
        <div class="at-knobs">
          <For each={KNOBS}>
            {(knob) => (
              <div class="at-knob" id={`knob-${knob.id}`}>
                <div>
                  <strong>{language.t(knob.label)}</strong>
                  <small>
                    <Rich text={language.t(knob.help)} />
                  </small>
                  <code class="at-knob-var">{knob.env}</code>
                </div>
                <Show
                  when={knob.options}
                  fallback={
                    <Show
                      when={knob.id === "budget"}
                      fallback={<code class="at-mono">{language.t("orchestra.atlas.genesis.knob.model.source")}</code>}
                    >
                      <input
                        class="at-knob-input"
                        type="number"
                        min="1"
                        placeholder="200"
                        value={conf().budget}
                        onChange={(event) => atlas.setQuery({ "k-budget": event.currentTarget.value }, true)}
                      />
                    </Show>
                  }
                >
                  {(options) => (
                    <div class="wf-range">
                      <For each={options()}>
                        {(option) => (
                          <button
                            type="button"
                            aria-pressed={conf()[knob.id] === option[1]}
                            onClick={() => atlas.setQuery({ [`k-${knob.id}`]: option[1] }, true)}
                          >
                            {language.t(option[0])}
                          </button>
                        )}
                      </For>
                    </div>
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>
        <div class="at-cmd">
          <span>{language.t("orchestra.atlas.genesis.cmd.mine")}</span>
          <code>{cmd()}</code>
          <Btn icon="copy" ariaLabel={language.t("orchestra.atlas.genesis.cmd.copy")} onClick={() => copy(cmd())} />
        </div>
        <div class="at-cmd">
          <span>{language.t("orchestra.atlas.genesis.cmd.promote")}</span>
          <code>{PROMOTE_COMMAND}</code>
          <Btn icon="copy" ariaLabel={language.t("orchestra.atlas.genesis.cmd.copy")} onClick={() => copy(PROMOTE_COMMAND)} />
        </div>
        <Tech
          rows={[
            [
              language.t("orchestra.atlas.genesis.config.tech.path"),
              <Rich text={language.t("orchestra.atlas.genesis.config.tech.path.text")} />,
            ],
            [
              language.t("orchestra.atlas.genesis.config.tech.prints"),
              <Rich text={language.t("orchestra.atlas.genesis.config.tech.prints.text")} />,
            ],
            [language.t("orchestra.atlas.genesis.config.tech.cost"), language.t("orchestra.atlas.genesis.config.tech.cost.text")],
            [
              language.t("orchestra.atlas.genesis.config.tech.token"),
              <Rich text={language.t("orchestra.atlas.genesis.config.tech.token.text")} />,
            ],
          ]}
        />
      </section>

      <section class="at-panel at-arch-block">
        <header class="at-panel-head">
          <div>
            <h3>
              <Icon name="info" />
              {language.t("orchestra.atlas.genesis.gaps.title")}
            </h3>
            <small>{language.t("orchestra.atlas.genesis.gaps.purpose")}</small>
          </div>
        </header>
        <div class="at-gen-gaps">
          <For each={GAPS}>
            {(gap) => (
              <div>
                <b>{language.t(gap[0])}</b>
                <small>{language.t(gap[1])}</small>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  )
}

// The propose stage's sample: a real claim and the model's answer behind it. The answer is read on demand (D3)
// and cached by the controller; its first refutation mention is marked.
function ProposeSample(props: { model: AtlasModel }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const sample = () => sampleFact(props.model)
  const [reason] = createResource(
    () => sample()?.why ?? undefined,
    (id) => atlas.controller.reasoning(id),
  )
  const parts = () => {
    const value = reason.state === "ready" ? reason() : undefined
    return markRefutation(value && "text" in value ? value.text : "")
  }
  return (
    <div class="at-gen-sample">
      <div class="at-gen-sample-k">
        <Icon name="fact" />
        {language.t("orchestra.atlas.genesis.sample.title")}
      </div>
      <Show when={sample()}>
        {(x) => (
          <>
            <p class="at-gen-claim">{language.t("orchestra.atlas.genesis.sample.claim", { claim: x().claim })}</p>
            <code class="at-mono">{x().file}</code>
            <div class="at-reasoning short at-gen-reason">
              {parts().before}
              <Show when={parts().mark}>
                <mark>{parts().mark}</mark>
              </Show>
              {parts().after}
              {parts().more ? "…" : ""}
            </div>
          </>
        )}
      </Show>
      <p class="mx-note">{language.t("orchestra.atlas.genesis.sample.note")}</p>
      <Show when={sample()}>
        {(x) => (
          <Btn
            label={language.t("orchestra.atlas.genesis.sample.open")}
            onClick={() => atlas.go(atlasHref("fact", x().key))}
          />
        )}
      </Show>
    </div>
  )
}
