import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel } from "../atlas-model"
import { Icon, NewCap } from "../kit/chips"
import { Btn, Tech } from "../kit/controls"
import { num } from "../kit/format"
import { Rich } from "../kit/text"
import { INTERVIEW_CAP, openQuestions } from "./genesis-data"

// The ratification interview (specs/atlas-ui/mock/views-explore.js:421-430, app.js:341-383). Nothing serves it yet
// (R11, D13): picks, typed answers and the selection live on this screen only, and Delegate and Ratify show the
// marker's toast. Delegation (the mock's delegate sheet) is built by Track C04.
const KIND = {
  owner: ["orchestra.atlas.genesis.iv.kind.owner", "orchestra.atlas.genesis.iv.kind.owner.count", "blue"],
  tier: ["orchestra.atlas.genesis.iv.kind.tier", "orchestra.atlas.genesis.iv.kind.tier.count", "good"],
  contested: ["orchestra.atlas.genesis.iv.kind.contested", "orchestra.atlas.genesis.iv.kind.contested.count", "warm"],
  intent: ["orchestra.atlas.genesis.iv.kind.intent", "orchestra.atlas.genesis.iv.kind.intent.count", ""],
} as const
const KIND_ORDER = ["owner", "tier", "contested", "intent"] as const

export function GenesisInterview(props: { model: AtlasModel }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const iv = createMemo(() => openQuestions(props.model))
  // By question index in the batch: selected for delegation, and the answer (an option index or typed text).
  const [ui, setUi] = createStore<{ selected: Record<number, boolean>; answers: Record<number, number | string> }>({
    selected: {},
    answers: {},
  })
  const selected = () => iv().batch.filter((_, i) => ui.selected[i]).length
  const answered = (i: number) => typeof ui.answers[i] === "number" || String(ui.answers[i] ?? "").trim() !== ""
  const done = () => iv().batch.filter((_, i) => answered(i)).length
  const newcap = () => atlas.toast(language.t("orchestra.atlas.genesis.iv.newcap"), "info")
  return (
    <section class="at-panel at-gen-iv" id="interview">
      <header class="at-panel-head">
        <div>
          <h3>
            <Icon name="check" />
            {language.t("orchestra.atlas.genesis.iv.title")}
          </h3>
          <small>
            {language.t("orchestra.atlas.genesis.iv.purpose")} <NewCap id="R11" />
          </small>
        </div>
        <div class="at-gen-iv-count">
          <b>{num(done())}</b>
          <span>{language.t("orchestra.atlas.genesis.iv.answered", { n: num(iv().batch.length) })}</span>
        </div>
      </header>
      <div class="at-gen-iv-kinds">
        <For each={KIND_ORDER}>
          {(kind) => (
            <span class={`at-own-badge ${KIND[kind][2]}`}>
              {language.t(KIND[kind][1], { n: num(iv().counts[kind]) })}
            </span>
          )}
        </For>
        <span class="grow" />
        <span class="muted">
          {language.plural("orchestra.atlas.genesis.iv.summary", iv().deferred.length, {
            open: num(iv().batch.length + iv().deferred.length),
            cap: num(INTERVIEW_CAP),
            n: num(iv().deferred.length),
          })}
        </span>
      </div>
      <div class="at-gen-iv-bar">
        <label>
          <input
            type="checkbox"
            checked={iv().batch.length > 0 && selected() === iv().batch.length}
            onChange={(event) =>
              setUi("selected", Object.fromEntries(iv().batch.map((_, i) => [i, event.currentTarget.checked])))
            }
          />
          {language.t("orchestra.atlas.genesis.iv.selectAll")}
        </label>
        <span class="muted">
          {selected()
            ? language.plural("orchestra.atlas.genesis.iv.selected", selected(), { n: num(selected()) })
            : language.t("orchestra.atlas.genesis.iv.pick")}
        </span>
        <span class="grow" />
        <Btn
          label={
            selected()
              ? language.plural("orchestra.atlas.genesis.iv.delegateN", selected(), { n: num(selected()) })
              : language.t("orchestra.atlas.genesis.iv.delegate")
          }
          icon="sparkle"
          onClick={() =>
            selected() ? newcap() : atlas.toast(language.t("orchestra.atlas.genesis.iv.selectFirst"), "info")
          }
        />
      </div>
      <ol class="at-gen-iv-list">
        <For each={iv().batch}>
          {(q, i) => (
            <li class="at-gen-iv-q" classList={{ done: answered(i()) }} data-iv={i()}>
              <span class="at-gen-iv-n">{i() + 1}</span>
              <div>
                <div class="at-gen-iv-head">
                  <input
                    type="checkbox"
                    class="at-gen-iv-sel"
                    aria-label={language.t("orchestra.atlas.genesis.iv.select", { n: i() + 1 })}
                    checked={!!ui.selected[i()]}
                    onChange={(event) => setUi("selected", i(), event.currentTarget.checked)}
                  />
                  <span class={`at-own-badge ${KIND[q.kind][2]}`}>{language.t(KIND[q.kind][0])}</span>
                  <code>{q.site}</code>
                </div>
                <p>{language.t(q.ask.key, q.ask.params)}</p>
                <small>{language.t("orchestra.atlas.genesis.iv.ranked", { why: language.t(q.why.key, q.why.params) })}</small>
                <Show
                  when={q.options}
                  fallback={
                    <input
                      class="at-knob-input at-gen-iv-text"
                      placeholder={language.t("orchestra.atlas.genesis.iv.placeholder")}
                      value={String(ui.answers[i()] ?? "")}
                      onInput={(event) => setUi("answers", i(), event.currentTarget.value)}
                    />
                  }
                >
                  {(options) => (
                    <div class="wf-range">
                      <For each={options()}>
                        {(option, j) => (
                          <button type="button" aria-pressed={ui.answers[i()] === j()} onClick={() => setUi("answers", i(), j())}>
                            {language.t(option.key, option.params)}
                          </button>
                        )}
                      </For>
                    </div>
                  )}
                </Show>
              </div>
            </li>
          )}
        </For>
      </ol>
      <footer class="at-gen-iv-foot">
        <p class="mx-note">{language.t("orchestra.atlas.genesis.iv.note")}</p>
        <Btn label={language.t("orchestra.atlas.genesis.iv.ratify")} primary icon="check" write onClick={newcap} />
      </footer>
      <Tech
        rows={[
          [language.t("orchestra.atlas.genesis.tech.code"), <Rich text={language.t("orchestra.atlas.genesis.iv.tech.code")} />],
          [language.t("orchestra.atlas.genesis.iv.tech.kinds"), language.t("orchestra.atlas.genesis.iv.tech.kinds.text")],
          [language.t("orchestra.atlas.genesis.iv.tech.today"), language.t("orchestra.atlas.genesis.iv.tech.today.text")],
          [language.t("orchestra.atlas.genesis.iv.tech.here"), language.t("orchestra.atlas.genesis.iv.tech.here.text")],
        ]}
      />
    </section>
  )
}
