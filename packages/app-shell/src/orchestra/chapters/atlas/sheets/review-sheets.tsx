import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import { atlasHref } from "../atlas-route"
import { Icon, useAtlasWords } from "../kit/chips"
import { Btn, Tech } from "../kit/controls"
import { AtDialog, AtDialogFoot } from "../kit/dialog"
import { num } from "../kit/format"
import { Rich } from "../kit/text"
import { mineCommand } from "../views/genesis-data"
import { DoneFoot, LockedNote, useCopy, WritingAs } from "./parts"
import { promoteSummary } from "./promote-data"
import { type AtlasSheetProps, atlasSheetState, keepPromoteRun, openAtlasSheet } from "./state"

// The sheets Review opens (specs/atlas-ui/mock/app.js:195-248, actions :402-417).

const MINE_KINDS = [
  ["", "orchestra.atlas.genesis.knob.kinds.default"],
  ["advisory", "orchestra.atlas.genesis.kind.advisory"],
  ["dependency", "orchestra.atlas.genesis.kind.dependency"],
  ["count", "orchestra.atlas.genesis.kind.count"],
] as const

// [title, text, command] of each producer. The surface cannot run them (issue item 7), so each copies its command.
const PRODUCERS = [
  ["orchestra.atlas.sheets.producers.derive", "orchestra.atlas.sheets.producers.derive.text", "atlas derive-relations"],
  [
    "orchestra.atlas.sheets.producers.transition",
    "orchestra.atlas.sheets.producers.transition.text",
    "atlas transition <unit> <before> <after>",
  ],
  ["orchestra.atlas.sheets.producers.vacuity", "orchestra.atlas.sheets.producers.vacuity.text", "atlas test-vacuity ."],
] as const

export function PromoteAllSheet(props: AtlasSheetProps<"promote-all">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const [form, setForm] = createStore({ token: "" })
  const waiting = () => atlas.model()?.candidates.filter((x) => !x.promotedNow).length ?? 0
  const run = async () => {
    // The keys staged before the run tell the result sheet which accepted rows are new facts.
    const staged = atlas.model()?.candidates.map((x) => x.key) ?? []
    const result = await atlas.controller.promote({ token: form.token })
    if (!result || isAtlasEmpty(result)) return
    keepPromoteRun({ run: result, staged })
    openAtlasSheet({ kind: "promote-result" })
  }
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.promoteAll.title")}
      text={language.plural("orchestra.atlas.sheets.promoteAll.text", waiting(), { n: num(waiting()) })}
      onClose={props.onClose}
      footer={
        <AtDialogFoot
          label={language.t("orchestra.atlas.sheets.promoteAll.confirm")}
          disabled={atlas.controller.state.pending.includes("promote")}
          onCancel={props.onClose}
          onConfirm={() => void run()}
        />
      }
    >
      <WritingAs token={form.token} onToken={(token) => setForm("token", token)} />
      <LockedNote />
      <p class="mx-note">{language.t("orchestra.atlas.sheets.promoteAll.note")}</p>
    </AtDialog>
  )
}

export function PromoteResultSheet(props: AtlasSheetProps<"promote-result">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const claim = (key: string) => atlas.model()?.byKey[key]?.claim ?? key
  const openRow = (key: string) => {
    props.onClose()
    atlas.open(key)
  }
  return (
    <Show when={atlasSheetState.promote}>
      {(record) => {
        const summary = () => promoteSummary(record())
        const refusal = () => record().run.refusal ?? "untrusted"
        return (
          <Show
            when={record().run.read}
            fallback={
              <AtDialog
                title={language.t("orchestra.atlas.sheets.result.none.title")}
                text={language.t("orchestra.atlas.sheets.result.none.text", { reason: words.refusal(refusal()) })}
                onClose={props.onClose}
                footer={<DoneFoot onDone={props.onClose} />}
              >
                <Tech
                  rows={[
                    [
                      language.t("orchestra.atlas.sheets.result.output"),
                      <>
                        <Rich text={language.t("orchestra.atlas.sheets.result.none.output")} />
                        <br />
                        <Rich text={language.t("orchestra.atlas.sheets.result.none.next", { refusal: refusal() })} />
                        <br />
                        {language.t("orchestra.atlas.sheets.result.exit", { code: 2 })}
                      </>,
                    ],
                  ]}
                />
              </AtDialog>
            }
          >
            <AtDialog
              title={
                summary().fresh
                  ? language.plural("orchestra.atlas.sheets.result.fresh", summary().fresh, { n: num(summary().fresh) })
                  : language.t("orchestra.atlas.sheets.result.nofresh")
              }
              text={
                summary().refusedNew
                  ? language.plural("orchestra.atlas.sheets.result.refused", summary().refusedNew, {
                      n: num(summary().refusedNew),
                    })
                  : undefined
              }
              onClose={props.onClose}
              footer={<DoneFoot onDone={props.onClose} />}
            >
              <div class="at-result-row good">
                <Icon name="checkc" />
                <span>{language.t("orchestra.atlas.sheets.result.new")}</span>
                <span class="grow" />
                <b>{num(summary().fresh)}</b>
              </div>
              <div class="at-result-row">
                <Icon name="refresh" />
                <span>{language.t("orchestra.atlas.sheets.result.again")}</span>
                <span class="grow" />
                <b>{num(summary().again)}</b>
              </div>
              <For each={summary().groups}>
                {(group) => (
                  <details class="at-result-group">
                    <summary>
                      <Icon name="xc" />
                      <span>{words.refusal(group.code)}</span>
                      <span class="grow" />
                      <b>{num(group.keys.length)}</b>
                      <Icon name="chev" />
                    </summary>
                    <For each={group.keys.slice(0, 7)}>
                      {(key) => (
                        <div
                          class="ins-rel"
                          tabindex="0"
                          role="button"
                          onClick={() => openRow(key)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") openRow(key)
                          }}
                        >
                          <span class="ins-rel-claim">{claim(key)}</span>
                        </div>
                      )}
                    </For>
                    <Show when={group.keys.length > 7}>
                      <p class="mx-note">{language.t("orchestra.atlas.sheets.result.more", { n: num(group.keys.length - 7) })}</p>
                    </Show>
                  </details>
                )}
              </For>
              <Tech
                rows={[
                  [
                    language.t("orchestra.atlas.sheets.result.output"),
                    <>
                      <Rich
                        text={language.t("orchestra.atlas.sheets.result.summary", {
                          promoted: record().run.promoted,
                          candidates: record().run.candidates,
                          refused: record().run.refused,
                        })}
                      />
                      <br />
                      {language.t("orchestra.atlas.sheets.result.exit", { code: record().run.refused ? 2 : 0 })}
                    </>,
                  ],
                ]}
              />
            </AtDialog>
          </Show>
        )
      }}
    </Show>
  )
}

export function ReconcileSheet(props: AtlasSheetProps<"reconcile">) {
  const atlas = useAtlas()
  const language = useLanguage()
  return (
    <Show when={atlas.model()}>
      {(model) => {
        const result = () => model().reconcile()
        return (
          <AtDialog
            title={language.t("orchestra.atlas.sheets.reconcile.title")}
            text={language.t("orchestra.atlas.sheets.reconcile.text")}
            onClose={props.onClose}
            footer={
              <DoneFoot onDone={props.onClose}>
                <Show when={result().exitCode}>
                  <Btn
                    label={language.t("orchestra.atlas.sheets.reconcile.review")}
                    onClick={() => {
                      props.onClose()
                      atlas.go(atlasHref("review", "", { tab: "changed" }))
                    }}
                  />
                </Show>
              </DoneFoot>
            }
          >
            <label class="mx-field">
              <span>{language.t("orchestra.atlas.sheets.reconcile.base")}</span>
              <select>
                <option>{language.t("orchestra.atlas.sheets.reconcile.base.option", { base: result().base })}</option>
              </select>
            </label>
            <Show
              when={result().blind}
              fallback={
                <div class={`at-result-row ${result().exitCode ? "bad" : "good"}`}>
                  <Icon name={result().exitCode ? "lock" : "checkc"} />
                  <span>
                    {result().exitCode
                      ? language.plural("orchestra.atlas.sheets.reconcile.block", result().semantic.length, {
                          n: num(result().semantic.length),
                        })
                      : language.t("orchestra.atlas.sheets.reconcile.clear")}
                  </span>
                </div>
              }
            >
              <div class="at-result-row">
                <Icon name="minusc" />
                <span>{language.t("orchestra.atlas.sheets.reconcile.blind")}</span>
              </div>
            </Show>
            <div class="at-result-row">
              <Icon name="refresh" />
              <span>{language.t("orchestra.atlas.sheets.reconcile.mechanical")}</span>
              <span class="grow" />
              <b>{num(result().mechanical.length)}</b>
            </div>
            <Tech
              rows={[
                [
                  language.t("orchestra.atlas.sheets.reconcile.tech.command"),
                  <Rich
                    text={language.t("orchestra.atlas.sheets.reconcile.tech.command.value", {
                      base: result().base,
                      exit: result().exitCode,
                      reauthor: result().reauthorCount,
                      regrounded: result().regroundedCount,
                    })}
                  />,
                ],
                [
                  language.t("orchestra.atlas.sheets.reconcile.tech.reground"),
                  <Rich text={language.t("orchestra.atlas.sheets.reconcile.tech.reground.value")} />,
                ],
              ]}
            />
          </AtDialog>
        )
      }}
    </Show>
  )
}

export function MineSheet(props: AtlasSheetProps<"mine">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const copy = useCopy()
  const [form, setForm] = createStore({ kinds: "", budget: "200" })
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.mine.title")}
      text={language.t("orchestra.atlas.sheets.mine.text")}
      onClose={props.onClose}
      footer={
        <AtDialogFoot
          label={language.t("orchestra.atlas.sheets.copyCommand")}
          onCancel={props.onClose}
          onConfirm={() => {
            // The surface cannot run `atlas mine` (issue item 7): the sheet copies the command with the chosen knobs.
            copy(mineCommand({ kinds: form.kinds, budget: form.budget === "200" ? "" : form.budget }))
            props.onClose()
          }}
        />
      }
    >
      <div class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.mine.kinds")}</span>
        <div class="wf-range">
          <For each={MINE_KINDS}>
            {(kind) => (
              <button type="button" aria-pressed={form.kinds === kind[0]} onClick={() => setForm("kinds", kind[0])}>
                {language.t(kind[1])}
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="mx-fields">
        <label class="mx-field">
          <span>{language.t("orchestra.atlas.sheets.mine.budget")}</span>
          <input type="number" min="1" value={form.budget} onInput={(event) => setForm("budget", event.currentTarget.value)} />
        </label>
      </div>
      <Show when={atlas.model() && !atlas.model()?.writable()}>
        <div class="ins-note">
          <Icon name="lock" />
          <span>{language.t("orchestra.atlas.sheets.mine.locked", { reason: words.refusal("untrusted-store") })}</span>
        </div>
      </Show>
      <Tech
        rows={[
          [
            language.t("orchestra.atlas.sheets.mine.tech.command"),
            <Rich text={language.t("orchestra.atlas.sheets.mine.tech.command.value")} />,
          ],
          [language.t("orchestra.atlas.sheets.mine.tech.knobs"), <Rich text={language.t("orchestra.atlas.sheets.mine.tech.knobs.value")} />],
          [language.t("orchestra.atlas.sheets.mine.tech.model"), <Rich text={language.t("orchestra.atlas.sheets.mine.tech.model.value")} />],
        ]}
      />
    </AtDialog>
  )
}

export function ProducersSheet(props: AtlasSheetProps<"producers">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const copy = useCopy()
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.producers.title")}
      text={language.t("orchestra.atlas.sheets.producers.text")}
      onClose={props.onClose}
      footer={<DoneFoot onDone={props.onClose} />}
    >
      <For each={PRODUCERS}>
        {(producer) => (
          <div class="at-linkrow static">
            <Icon name="relations" />
            <span>
              <b>{language.t(producer[0])}</b>
              <br />
              <small>{language.t(producer[1])}</small>
            </span>
            <span class="grow" />
            <Btn label={language.t("orchestra.atlas.sheets.copyCommand")} icon="copy" onClick={() => copy(producer[2])} />
          </div>
        )}
      </For>
      <Show when={atlas.model() && !atlas.model()?.writable()}>
        <p class="mx-note">{language.t("orchestra.atlas.sheets.producers.locked", { reason: words.refusal("untrusted-store") })}</p>
      </Show>
      <Tech
        rows={[
          [
            language.t("orchestra.atlas.sheets.producers.tech.commands"),
            <Rich text={language.t("orchestra.atlas.sheets.producers.tech.commands.value")} />,
          ],
        ]}
      />
    </AtDialog>
  )
}
