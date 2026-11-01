import { createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import type { AtlasFact, AtlasModel } from "../atlas-model"
import { Help, Icon, NewCap, useAtlasWords } from "../kit/chips"
import { Tech } from "../kit/controls"
import { AtDialog, AtDialogFoot } from "../kit/dialog"
import { Rich } from "../kit/text"
import { ChecksStrip, LockedNote, WithFact, WritingAs } from "./parts"
import type { AtlasSheetProps } from "./state"
import { type FactWrite, writeFact } from "./write"

// The fact sheets of specs/atlas-ui/mock/app.js:183-194 and :264-277, with their confirm actions (app.js:420-490).
// The strip previews the gates from the model; the write goes through the door, whose verdict decides.

const TIERS = [
  ["T1", "orchestra.atlas.sheets.ratify.t1", "orchestra.atlas.sheets.ratify.t1.text"],
  ["T0", "orchestra.atlas.sheets.ratify.t0", "orchestra.atlas.sheets.ratify.t0.text"],
] as const

const anchorOf = (x: AtlasFact) => x.anchor?.qualifiedPath ?? x.file
const tierOf = (x: AtlasFact) => (x.tier === "T0" || x.tier === "T1" ? x.tier : "T2")
// The mock checks a new fact as `{ file, tier: "T2" }`; checks() reads only its file, scope, tier and drift.
const draftOf = (file: string) => ({ file, tier: "T2" }) as AtlasFact

// Sends one write and words a refusal; `send` resolves true when the fact was saved. The refusal shows inside the
// sheet (`error`): a toast would sit under the modal.
function useFactWrite() {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const [error, setError] = createSignal("")
  return {
    error,
    async send(model: AtlasModel, input: FactWrite) {
      setError("")
      if (!model.writable()) {
        setError(words.refusal("untrusted-store"))
        return false
      }
      const outcome = await writeFact(atlas.controller, input)
      if (!outcome) return false
      if (!outcome.ok) {
        setError(language.t("orchestra.atlas.sheets.refused", { reason: words.refusal(outcome.reason) }))
        return false
      }
      return true
    },
  }
}

export function RatifySheet(props: AtlasSheetProps<"ratify">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const write = useFactWrite()
  const [form, setForm] = createStore({ tier: "T1" as "T1" | "T0", token: "" })
  return (
    <WithFact factKey={props.sheet.key}>
      {(model, fact) => (
        <AtDialog
          title={language.t("orchestra.atlas.sheets.ratify.title")}
          text={fact().claim}
          error={write.error()}
          onClose={props.onClose}
          footer={
            <AtDialogFoot
              label={language.t("orchestra.atlas.sheets.ratify.confirm")}
              disabled={atlas.controller.state.pending.length > 0}
              onCancel={props.onClose}
              onConfirm={async () => {
                const saved = await write.send(model(), {
                  anchor: anchorOf(fact()),
                  slot: fact().slot ?? "",
                  claim: fact().claim,
                  token: form.token,
                  tier: form.tier,
                  scope: fact().scope,
                })
                if (!saved) return
                props.onClose()
                atlas.toast(
                  language.t(form.tier === "T0" ? "orchestra.atlas.sheets.ratify.core" : "orchestra.atlas.sheets.ratify.done"),
                  "shield",
                )
              }}
            />
          }
        >
          <div class="at-radio">
            <For each={TIERS}>
              {(tier) => (
                <label>
                  <input
                    type="radio"
                    name="tier"
                    value={tier[0]}
                    checked={form.tier === tier[0]}
                    onChange={() => setForm("tier", tier[0])}
                  />
                  <span>
                    <b>{language.t(tier[1])}</b>
                    <small>{language.t(tier[2])}</small>
                  </span>
                </label>
              )}
            </For>
          </div>
          <WritingAs core={form.tier === "T0"} token={form.token} onToken={(token) => setForm("token", token)} />
          <ChecksStrip checks={model().checks(fact(), { tier: form.tier, token: form.token })} />
          <p class="mx-note">{language.t("orchestra.atlas.sheets.ratify.note")}</p>
          <LockedNote />
        </AtDialog>
      )}
    </WithFact>
  )
}

export function EditSheet(props: AtlasSheetProps<"edit">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const write = useFactWrite()
  const [form, setForm] = createStore({ text: atlas.model()?.byKey[props.sheet.key]?.claim ?? "", token: "" })
  return (
    <WithFact factKey={props.sheet.key}>
      {(model, fact) => {
        const drifted = () => model().state(fact()) === "drifted"
        return (
          <AtDialog
            title={language.t(drifted() ? "orchestra.atlas.sheets.edit.rewrite" : "orchestra.atlas.sheets.edit.title")}
            text={language.t(drifted() ? "orchestra.atlas.sheets.edit.rewrite.text" : "orchestra.atlas.sheets.edit.text")}
            error={write.error()}
            onClose={props.onClose}
            footer={
              <AtDialogFoot
                note={<NewCap id="R8" />}
                label={language.t("orchestra.atlas.sheets.edit.confirm")}
                disabled={atlas.controller.state.pending.length > 0}
                onCancel={props.onClose}
                onConfirm={async () => {
                  const claim = form.text.trim()
                  if (claim === fact().claim) return atlas.toast(language.t("orchestra.atlas.sheets.nothingChanged"), "info")
                  // The rewrite keeps the fact's own tier and group, so a ratified fact is not lowered to a hint.
                  const saved = await write.send(model(), {
                    anchor: anchorOf(fact()),
                    slot: fact().slot ?? "",
                    claim,
                    token: form.token,
                    tier: fact().tier,
                    scope: fact().scope,
                  })
                  if (!saved) return
                  props.onClose()
                  atlas.toast(language.t("orchestra.atlas.sheets.edit.saved"), "check")
                }}
              />
            }
          >
            <label class="mx-field">
              <span>{language.t("orchestra.atlas.sheets.edit.sentence")}</span>
              <textarea rows={4} value={form.text} onInput={(event) => setForm("text", event.currentTarget.value)} />
            </label>
            <WritingAs core={fact().tier === "T0"} token={form.token} onToken={(token) => setForm("token", token)} />
            <ChecksStrip checks={model().checks(fact(), { regrounds: true, tier: tierOf(fact()), token: form.token })} />
            <p class="mx-note">{language.t("orchestra.atlas.sheets.edit.note")}</p>
            <LockedNote />
          </AtDialog>
        )
      }}
    </WithFact>
  )
}

export function ClassifySheet(props: AtlasSheetProps<"classify">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const write = useFactWrite()
  const [form, setForm] = createStore({ slot: "", token: "" })
  return (
    <WithFact factKey={props.sheet.key}>
      {(model, fact) => (
        <AtDialog
          title={language.t("orchestra.atlas.sheets.classify.title")}
          text={fact().claim}
          error={write.error()}
          onClose={props.onClose}
          footer={
            <AtDialogFoot
              label={language.t("orchestra.atlas.sheets.classify.confirm")}
              disabled={atlas.controller.state.pending.length > 0}
              onCancel={props.onClose}
              onConfirm={async () => {
                if (!form.slot) return atlas.toast(language.t("orchestra.atlas.sheets.classify.pick"), "info")
                const slot = form.slot
                const saved = await write.send(model(), { anchor: anchorOf(fact()), slot, claim: fact().claim, token: form.token })
                if (!saved) return
                props.onClose()
                atlas.toast(language.t("orchestra.atlas.sheets.classify.saved", { slot }), "fact")
              }}
            />
          }
        >
          <div class="at-slotpick">
            <For each={model().SLOT_GROUPS}>
              {(group) => (
                <div class="at-slotgroup">
                  <strong>{language.t(group[0])}</strong>
                  <small>{language.t(group[1])}</small>
                  <For each={group[2]}>
                    {(slot) => (
                      <label>
                        <input
                          type="radio"
                          name="slot"
                          value={slot}
                          checked={form.slot === slot}
                          onChange={() => setForm("slot", slot)}
                        />
                        <code>{slot}</code>
                        <span>{language.t(model().SLOT_MEANING[slot])}</span>
                      </label>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
          <WritingAs token={form.token} onToken={(token) => setForm("token", token)} />
          <ChecksStrip checks={model().checks(fact(), { regrounds: true, draft: true, token: form.token })} />
          <p class="mx-note">{language.t("orchestra.atlas.sheets.classify.note")}</p>
          <LockedNote />
        </AtDialog>
      )}
    </WithFact>
  )
}

export function LinkSheet(props: AtlasSheetProps<"link">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const [form, setForm] = createStore({ other: "", token: "" })
  const [error, setError] = createSignal("")
  return (
    <WithFact factKey={props.sheet.key}>
      {(model, fact) => {
        const others = () => model().live().filter((y) => y.key !== fact().key)
        const confirm = async () => {
          const text = form.other.trim()
          const other = others().find((y) => y.key === text || y.claim === text)
          if (!other) return atlas.toast(language.t("orchestra.atlas.sheets.link.pick"), "info")
          setError("")
          if (!model().writable()) return setError(words.refusal("untrusted-store"))
          const result = await atlas.controller.link({ a: fact().key, b: other.key, token: form.token })
          if (!result || isAtlasEmpty(result)) return
          if (!result.ok || !result.data?.linked)
            return setError(
              language.t("orchestra.atlas.sheets.refused", {
                reason: words.refusal(result.data?.rejected ?? result.rejected ?? "unknown"),
              }),
            )
          props.onClose()
          atlas.toast(language.t("orchestra.atlas.sheets.link.done"), "link")
        }
        return (
          <AtDialog
            title={language.t("orchestra.atlas.sheets.link.title")}
            text={fact().claim}
            error={error()}
            onClose={props.onClose}
            footer={
              <AtDialogFoot
                label={language.t("orchestra.atlas.sheets.link.confirm")}
                disabled={atlas.controller.state.pending.length > 0}
                onCancel={props.onClose}
                onConfirm={() => void confirm()}
              />
            }
          >
            <label class="mx-field">
              <span>{language.t("orchestra.atlas.sheets.link.other")}</span>
              <input
                list="atlas-link-facts"
                placeholder={language.t("orchestra.atlas.sheets.link.placeholder")}
                value={form.other}
                onInput={(event) => setForm("other", event.currentTarget.value)}
              />
            </label>
            <datalist id="atlas-link-facts">
              <For each={others()}>{(y) => <option value={y.claim}>{y.file}</option>}</For>
            </datalist>
            <p class="mx-note">{language.t("orchestra.atlas.sheets.link.note")}</p>
            <WritingAs token={form.token} onToken={(token) => setForm("token", token)} />
            <LockedNote />
            <Tech
              rows={[
                [
                  language.t("orchestra.atlas.sheets.link.tech.command"),
                  <Rich text={language.t("orchestra.atlas.sheets.link.tech.command.value")} />,
                ],
                [language.t("orchestra.atlas.sheets.link.tech.needs"), language.t("orchestra.atlas.sheets.link.tech.needs.value")],
              ]}
            />
          </AtDialog>
        )
      }}
    </WithFact>
  )
}

export function AddFactSheet(props: AtlasSheetProps<"add-fact">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const write = useFactWrite()
  const files = () => {
    const model = atlas.model()
    return model ? [...new Set(model.live().filter(model.under(props.sheet.path)).map((x) => x.file))].sort() : []
  }
  const [form, setForm] = createStore({ anchor: files()[0] ?? props.sheet.path, slot: "contract", text: "", token: "" })
  return (
    <Show when={atlas.model()}>
      {(model) => (
        <AtDialog
          title={language.t("orchestra.atlas.sheets.add.title")}
          text={language.t("orchestra.atlas.sheets.add.text")}
          error={write.error()}
          onClose={props.onClose}
          footer={
            <AtDialogFoot
              label={language.t("orchestra.atlas.sheets.add.confirm")}
              disabled={atlas.controller.state.pending.length > 0}
              onCancel={props.onClose}
              onConfirm={async () => {
                const claim = form.text.trim()
                if (!claim) return atlas.toast(language.t("orchestra.atlas.sheets.add.empty"), "info")
                const saved = await write.send(model(), { anchor: form.anchor, slot: form.slot, claim, token: form.token })
                if (!saved) return
                props.onClose()
                atlas.toast(language.t("orchestra.atlas.sheets.add.done"), "fact")
              }}
            />
          }
        >
          <div class="mx-fields">
            <label class="mx-field">
              <span>{language.t("orchestra.atlas.sheets.add.about")}</span>
              <select onChange={(event) => setForm("anchor", event.currentTarget.value)}>
                <For each={files()}>
                  {(file) => (
                    <option value={file} selected={form.anchor === file}>
                      {file.slice(props.sheet.path.length + 1) || file}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <label class="mx-field">
              <span>{language.t("orchestra.atlas.sheets.add.kind")}</span>
              <select onChange={(event) => setForm("slot", event.currentTarget.value)}>
                <For each={model().SLOT_GROUPS}>
                  {(group) => (
                    <optgroup label={language.t(group[0])}>
                      <For each={group[2]}>
                        {(slot) => (
                          <option value={slot} selected={form.slot === slot}>
                            {language.t(model().SLOT_MEANING[slot])}
                          </option>
                        )}
                      </For>
                    </optgroup>
                  )}
                </For>
              </select>
            </label>
          </div>
          <label class="mx-field">
            <span>{language.t("orchestra.atlas.sheets.add.sentence")}</span>
            <textarea
              rows={3}
              placeholder={language.t("orchestra.atlas.sheets.add.placeholder")}
              value={form.text}
              onInput={(event) => setForm("text", event.currentTarget.value)}
            />
          </label>
          <div class="at-result-row">
            <Icon name="fact" />
            <span>{language.t("orchestra.atlas.sheets.add.creates")}</span>
            <Help text={language.t("orchestra.atlas.sheets.add.creates.help")} />
          </div>
          <WritingAs token={form.token} onToken={(token) => setForm("token", token)} />
          <ChecksStrip checks={model().checks(draftOf(form.anchor), { regrounds: true, draft: true, token: form.token })} />
          <LockedNote />
          <Tech
            rows={[
              [
                language.t("orchestra.atlas.sheets.add.tech.commands"),
                <Rich text={language.t("orchestra.atlas.sheets.add.tech.commands.value")} />,
              ],
              [
                language.t("orchestra.atlas.sheets.add.tech.group"),
                <Rich text={language.t("orchestra.atlas.sheets.add.tech.group.value", { group: props.sheet.path.split("/")[0] })} />,
              ],
              [language.t("orchestra.atlas.sheets.add.tech.anchors"), language.t("orchestra.atlas.sheets.add.tech.anchors.value")],
            ]}
          />
        </AtDialog>
      )}
    </Show>
  )
}
