import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import type { AtlasInterviewQuestion } from "../atlas-types"
import { Icon } from "../kit/chips"
import { Btn, Tech } from "../kit/controls"
import { num } from "../kit/format"
import { Rich } from "../kit/text"
import { INTERVIEW_CAP, interviewAnswer } from "./genesis-data"

// The ratification interview (specs/atlas-ui/mock/views-explore.js:421-430, app.js:341-383) over the engine's batch
// (D34): `review().interview`, each question keyed by its engine id. A pick or a typed sentence stays on this screen
// until Ratify writes one `answer` per question; an answered question drops out of the next read. A model's draft
// (D33) rides on its question until a person accepts it, which writes the same text as a plain answer. Delegation is
// still marked (R11) until its sheet exists.
const KIND = {
  owner: ["orchestra.atlas.genesis.iv.kind.owner", "orchestra.atlas.genesis.iv.kind.owner.count", "blue"],
  tier: ["orchestra.atlas.genesis.iv.kind.tier", "orchestra.atlas.genesis.iv.kind.tier.count", "good"],
  contested: ["orchestra.atlas.genesis.iv.kind.contested", "orchestra.atlas.genesis.iv.kind.contested.count", "warm"],
  intent: ["orchestra.atlas.genesis.iv.kind.intent", "orchestra.atlas.genesis.iv.kind.intent.count", ""],
} as const
const KIND_ORDER = ["owner", "tier", "contested", "intent"] as const

export function GenesisInterview() {
  const atlas = useAtlas()
  const language = useLanguage()
  const iv = createMemo(
    () => atlas.controller.state.review?.interview ?? { batch: [] as AtlasInterviewQuestion[], deferred: 0 },
  )
  // By question id: selected for delegation, and the answer (an option index or typed text).
  const [ui, setUi] = createStore<{ selected: Record<string, boolean>; answers: Record<string, number | string> }>({
    selected: {},
    answers: {},
  })
  const selected = () => iv().batch.filter((q) => ui.selected[q.id]).length
  const answered = (q: AtlasInterviewQuestion) =>
    typeof ui.answers[q.id] === "number" || String(ui.answers[q.id] ?? "").trim() !== ""
  const answerOf = (q: AtlasInterviewQuestion) => {
    const value = ui.answers[q.id]
    return typeof value === "number" ? interviewAnswer(q, value) : String(value ?? "").trim()
  }
  const done = () => iv().batch.filter(answered).length
  const count = (kind: AtlasInterviewQuestion["kind"]) => iv().batch.filter((q) => q.kind === kind).length
  const busy = () => atlas.controller.state.pending.includes("answer")
  const newcap = () => atlas.toast(language.t("orchestra.atlas.genesis.iv.newcap"), "info")
  // One answer per answered question, in batch order; each write rereads the batch (D34). A refused one keeps its pick.
  const ratify = async () => {
    const picked = iv().batch.filter(answered)
    if (!picked.length) return atlas.toast(language.t("orchestra.atlas.genesis.iv.nothing"), "info")
    const outcomes: boolean[] = []
    for (const q of picked) {
      const result = await atlas.controller.answer({ questionId: q.id, answer: answerOf(q) })
      outcomes.push(!!result && !isAtlasEmpty(result) && result.ok)
    }
    const recorded = outcomes.filter(Boolean).length
    const refused = picked.length - recorded
    atlas.toast(
      refused
        ? language.t("orchestra.atlas.genesis.iv.refusedSome", { n: num(recorded), refused: num(refused) })
        : language.plural("orchestra.atlas.genesis.iv.recorded", recorded, { n: num(recorded) }),
      refused ? "warning" : "checkc",
    )
  }
  // Accepting a draft records its text as the person's own answer (R11 acceptance).
  const accept = async (q: AtlasInterviewQuestion, answer: string) => {
    const result = await atlas.controller.answer({ questionId: q.id, answer })
    if (!result || isAtlasEmpty(result)) return
    if (!result.ok)
      return atlas.toast(language.t("orchestra.atlas.genesis.iv.refused", { reason: result.rejected ?? "unknown" }), "xc")
    atlas.toast(language.t("orchestra.atlas.genesis.iv.accepted"), "checkc")
  }
  return (
    <section class="at-panel at-gen-iv" id="interview">
      <header class="at-panel-head">
        <div>
          <h3>
            <Icon name="check" />
            {language.t("orchestra.atlas.genesis.iv.title")}
          </h3>
          <small>{language.t("orchestra.atlas.genesis.iv.purpose")}</small>
        </div>
        <div class="at-gen-iv-count">
          <b>{num(done())}</b>
          <span>{language.t("orchestra.atlas.genesis.iv.answered", { n: num(iv().batch.length) })}</span>
        </div>
      </header>
      <div class="at-gen-iv-kinds">
        <For each={KIND_ORDER}>
          {(kind) => <span class={`at-own-badge ${KIND[kind][2]}`}>{language.t(KIND[kind][1], { n: num(count(kind)) })}</span>}
        </For>
        <span class="grow" />
        <span class="muted">
          {language.plural("orchestra.atlas.genesis.iv.summary", iv().deferred, {
            open: num(iv().batch.length + iv().deferred),
            cap: num(INTERVIEW_CAP),
            n: num(iv().deferred),
          })}
        </span>
      </div>
      <div class="at-gen-iv-bar">
        <label>
          <input
            type="checkbox"
            checked={iv().batch.length > 0 && selected() === iv().batch.length}
            onChange={(event) =>
              setUi("selected", Object.fromEntries(iv().batch.map((q) => [q.id, event.currentTarget.checked])))
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
          cap="R11"
          onClick={() =>
            selected() ? newcap() : atlas.toast(language.t("orchestra.atlas.genesis.iv.selectFirst"), "info")
          }
        />
      </div>
      <Show
        when={iv().batch.length}
        fallback={<div class="at-band-empty">{language.t("orchestra.atlas.genesis.iv.empty")}</div>}
      >
        <ol class="at-gen-iv-list">
          <For each={iv().batch}>
            {(q, i) => (
              <li class="at-gen-iv-q" classList={{ done: answered(q), drafted: !!q.draft }} data-iv={q.id}>
                <span class="at-gen-iv-n">{i() + 1}</span>
                <div>
                  <div class="at-gen-iv-head">
                    <input
                      type="checkbox"
                      class="at-gen-iv-sel"
                      aria-label={language.t("orchestra.atlas.genesis.iv.select", { n: i() + 1 })}
                      checked={!!ui.selected[q.id]}
                      onChange={(event) => setUi("selected", q.id, event.currentTarget.checked)}
                    />
                    <span class={`at-own-badge ${KIND[q.kind][2]}`}>{language.t(KIND[q.kind][0])}</span>
                    <code>{q.site}</code>
                  </div>
                  <p>{q.ask}</p>
                  <small>{language.t("orchestra.atlas.genesis.iv.rank", { rank: num(q.rank) })}</small>
                  <Show when={q.draft}>
                    {(draft) => (
                      <div class="at-gen-iv-draft">
                        <Icon name="sparkle" />
                        <span>
                          {language.t("orchestra.atlas.genesis.iv.drafted", { model: draft().model, why: draft().why })}
                        </span>
                        <button class="mx-btn" type="button" disabled={busy()} onClick={() => void accept(q, draft().answer)}>
                          {language.t("orchestra.atlas.genesis.iv.accept")}
                        </button>
                      </div>
                    )}
                  </Show>
                  <Show
                    when={q.options}
                    fallback={
                      <input
                        class="at-knob-input at-gen-iv-text"
                        placeholder={language.t("orchestra.atlas.genesis.iv.placeholder")}
                        value={String(ui.answers[q.id] ?? q.draft?.answer ?? "")}
                        onInput={(event) => setUi("answers", q.id, event.currentTarget.value)}
                      />
                    }
                  >
                    {(options) => (
                      <div class="wf-range">
                        <For each={options()}>
                          {(option, j) => (
                            <button
                              type="button"
                              classList={{ draft: q.draft?.answer === interviewAnswer(q, j()) }}
                              aria-pressed={ui.answers[q.id] === j()}
                              onClick={() => setUi("answers", q.id, j())}
                            >
                              {option}
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
      </Show>
      <footer class="at-gen-iv-foot">
        <p class="mx-note">{language.t("orchestra.atlas.genesis.iv.note")}</p>
        <Btn
          label={language.t("orchestra.atlas.genesis.iv.ratify")}
          primary
          icon="check"
          write
          disabled={busy()}
          onClick={() => void ratify()}
        />
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
