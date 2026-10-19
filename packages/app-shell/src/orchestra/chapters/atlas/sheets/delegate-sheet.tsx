import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import { Tech } from "../kit/controls"
import { AtDialog, AtDialogFoot } from "../kit/dialog"
import { num } from "../kit/format"
import type { AtlasSheetProps } from "./state"

// Delegate interview questions to a model (specs/atlas-ui/mock/app.js:227-235, :342-374; D33). The host makes one
// model call per question and writes each draft as an `answer` marked drafted; the question stays open until a person
// accepts the draft in the interview. The models are the app's connected ones, minus those hidden in Settings.
type Choice = ReturnType<ReturnType<typeof useModels>["list"]>[number]
type Key = { providerID: string; modelID: string }
const KINDS = [
  ["owner", "orchestra.atlas.genesis.iv.kind.owner"],
  ["tier", "orchestra.atlas.genesis.iv.kind.tier"],
  ["contested", "orchestra.atlas.genesis.iv.kind.contested"],
  ["intent", "orchestra.atlas.genesis.iv.kind.intent"],
] as const
const SHOWN = 6
const same = (model: Choice, key: Key) => model.provider.id === key.providerID && model.id === key.modelID

export function DelegateSheet(props: AtlasSheetProps<"iv-delegate">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const models = useModels()
  const choices = createMemo(() =>
    models.list().filter((model) => models.visible({ providerID: model.provider.id, modelID: model.id })),
  )
  const [form, setForm] = createStore<Key>({ providerID: "", modelID: "" })
  // The person's pick, else the most recently used connected model, else the first one.
  const chosen = () =>
    choices().find((model) => same(model, form)) ??
    models.recent.list().flatMap((key) => choices().filter((model) => same(model, key)))[0] ??
    choices()[0]
  const picked = () =>
    (atlas.controller.state.review?.interview.batch ?? []).filter((q) => props.sheet.questionIds.includes(q.id))
  const kinds = () =>
    KINDS.map((kind) => [kind[1], picked().filter((q) => q.kind === kind[0]).length] as const)
      .filter((entry) => entry[1] > 0)
      .map((entry) => `${num(entry[1])} ${language.t(entry[0])}`)
      .join(" · ")
  const pending = () => atlas.controller.state.pending.includes("delegate")
  const run = async () => {
    const model = chosen()
    if (!model) return
    const result = await atlas.controller.delegate({
      questionIds: picked().map((q) => q.id),
      providerID: model.provider.id,
      modelID: model.id,
    })
    if (!result || isAtlasEmpty(result)) return
    props.onClose()
    const drafted = result.drafted.filter((row) => row.ok).length
    const failed = result.drafted.length - drafted
    atlas.toast(
      failed
        ? language.t("orchestra.atlas.sheets.delegate.partial", { n: num(drafted), failed: num(failed) })
        : language.plural("orchestra.atlas.sheets.delegate.done", drafted, { n: num(drafted) }),
      failed ? "warning" : "sparkle",
    )
  }
  return (
    <AtDialog
      title={language.plural("orchestra.atlas.sheets.delegate.title", picked().length, { n: num(picked().length) })}
      text={language.t("orchestra.atlas.sheets.delegate.text")}
      onClose={props.onClose}
      footer={
        <AtDialogFoot
          label={language.t(pending() ? "orchestra.atlas.sheets.delegate.running" : "orchestra.atlas.sheets.delegate.confirm")}
          disabled={!chosen() || !picked().length || pending()}
          onCancel={props.onClose}
          onConfirm={() => void run()}
        />
      }
    >
      <div class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.delegate.model")}</span>
        <Show
          when={choices().length}
          fallback={<small class="muted">{language.t("orchestra.atlas.sheets.delegate.noModel")}</small>}
        >
          <select
            aria-label={language.t("orchestra.atlas.sheets.delegate.model")}
            onChange={(event) => {
              const model = choices()[Number(event.currentTarget.value)]
              if (model) setForm({ providerID: model.provider.id, modelID: model.id })
            }}
          >
            <For each={choices()}>
              {(model, index) => (
                <option value={String(index())} selected={model === chosen()}>
                  {`${model.provider.name} · ${model.name}`}
                </option>
              )}
            </For>
          </select>
        </Show>
      </div>
      <div class="at-gen-iv-picked">
        <b>{kinds()}</b>
        <For each={picked().slice(0, SHOWN)}>
          {(q) => (
            <span>
              <code>{q.site}</code>
              {q.ask.slice(0, 80)}
            </span>
          )}
        </For>
        <Show when={picked().length > SHOWN}>
          <span class="muted">
            {language.t("orchestra.atlas.sheets.delegate.more", { n: num(picked().length - SHOWN) })}
          </span>
        </Show>
      </div>
      <p class="mx-note">{language.t("orchestra.atlas.sheets.delegate.note")}</p>
      <Tech
        rows={[
          [language.t("orchestra.atlas.sheets.delegate.tech.runs"), language.t("orchestra.atlas.sheets.delegate.tech.runs.value")],
          [
            language.t("orchestra.atlas.sheets.delegate.tech.writes"),
            language.t("orchestra.atlas.sheets.delegate.tech.writes.value"),
          ],
        ]}
      />
    </AtDialog>
  )
}
