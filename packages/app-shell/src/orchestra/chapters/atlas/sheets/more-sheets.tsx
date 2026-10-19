import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import { Icon, NewCap, useAtlasWords } from "../kit/chips"
import { Tech } from "../kit/controls"
import { AtDialog, AtDialogFoot } from "../kit/dialog"
import { num, seatName } from "../kit/format"
import type { AtlasIconName } from "../kit/icons"
import { Rich } from "../kit/text"
import type { AtlasSheetProps } from "./state"

// Check a claim, the hot set budget, and the three sheets whose action is a new capability (R7, R5, R1)
// (specs/atlas-ui/mock/app.js:249-263, :279-293, :310-313, :429-447, :491-519).

type ResultRow = { tone: string; icon: AtlasIconName; text: string }

const KINDS = [
  ["dependency", "orchestra.atlas.sheets.verify.kind.dependency"],
  ["count", "orchestra.atlas.sheets.verify.kind.count"],
  ["definition", "orchestra.atlas.sheets.verify.kind.definition"],
  ["negation", "orchestra.atlas.sheets.verify.kind.negation"],
] as const

// `undefined` = the check needs the reviewed snapshot, which only a maintainer prepares today (R7): shown as not run.
const PRECHECKS = [
  ["orchestra.atlas.sheets.publish.pre.atlas", "orchestra.atlas.sheets.publish.pre.atlas.tip", true],
  ["orchestra.atlas.sheets.publish.pre.branch", "orchestra.atlas.sheets.publish.pre.branch.tip", undefined],
  ["orchestra.atlas.sheets.publish.pre.plain", "orchestra.atlas.sheets.publish.pre.plain.tip", true],
  ["orchestra.atlas.sheets.publish.pre.unchanged", "orchestra.atlas.sheets.publish.pre.unchanged.tip", undefined],
] as const

function ResultLine(props: { row?: ResultRow }) {
  return (
    <Show when={props.row}>
      {(row) => (
        <div class={`at-result-row ${row().tone}`}>
          <Icon name={row().icon} />
          <span>{row().text}</span>
        </div>
      )}
    </Show>
  )
}

export function VerifySheet(props: AtlasSheetProps<"verify">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const [form, setForm] = createStore({
    kind: "dependency",
    target: "",
    scope: props.sheet.scope.split("/").slice(0, 2).join("/"),
    result: undefined as ResultRow | undefined,
  })
  const run = async () => {
    const target = form.target.trim()
    const scope = form.scope.trim()
    if (!target || !scope) return atlas.toast(language.t("orchestra.atlas.sheets.verify.fill"), "info")
    const answer = await atlas.controller.verify({ kind: form.kind, target, scope })
    if (!answer || isAtlasEmpty(answer)) return
    if (!answer.ok || !answer.data)
      return setForm("result", {
        tone: "bad",
        icon: "xc",
        text: language.t("orchestra.atlas.sheets.refused", { reason: words.refusal(answer.rejected ?? "unknown") }),
      })
    if (answer.data.verdict === "proven")
      return setForm("result", { tone: "good", icon: "checkc", text: language.t("orchestra.atlas.sheets.verify.proven") })
    if (answer.data.verdict === "refuted")
      return setForm("result", { tone: "bad", icon: "xc", text: language.t("orchestra.atlas.sheets.verify.refuted") })
    setForm("result", {
      tone: "",
      icon: "minusc",
      text: language.t("orchestra.atlas.sheets.verify.abstain", { reason: answer.data.reason ?? "" }),
    })
  }
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.verify.title")}
      text={language.t("orchestra.atlas.sheets.verify.text")}
      onClose={props.onClose}
      footer={
        <footer class="mx-dialog-foot">
          <span class="grow" />
          <button type="button" class="mx-btn" onClick={() => props.onClose()}>
            {language.t("orchestra.atlas.sheets.close")}
          </button>
          <button
            type="button"
            class="mx-btn primary"
            disabled={atlas.controller.state.pending.includes("verify")}
            onClick={() => void run()}
          >
            {language.t("orchestra.atlas.sheets.verify.run")}
          </button>
        </footer>
      }
    >
      <label class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.verify.claim")}</span>
        <select onChange={(event) => setForm("kind", event.currentTarget.value)}>
          <For each={KINDS}>
            {(kind) => (
              <option value={kind[0]} selected={form.kind === kind[0]}>
                {language.t(kind[1])}
              </option>
            )}
          </For>
        </select>
      </label>
      <div class="mx-fields">
        <label class="mx-field">
          <span>{language.t("orchestra.atlas.sheets.verify.target")}</span>
          <input
            placeholder={language.t("orchestra.atlas.sheets.verify.target.placeholder")}
            value={form.target}
            onInput={(event) => setForm("target", event.currentTarget.value)}
          />
        </label>
        <label class="mx-field">
          <span>{language.t("orchestra.atlas.sheets.verify.scope")}</span>
          <input value={form.scope} onInput={(event) => setForm("scope", event.currentTarget.value)} />
        </label>
      </div>
      <ResultLine row={form.result} />
      <Tech
        rows={[
          [
            language.t("orchestra.atlas.sheets.verify.tech.command"),
            <Rich text={language.t("orchestra.atlas.sheets.verify.tech.command.value")} />,
          ],
          [language.t("orchestra.atlas.sheets.verify.tech.answers"), language.t("orchestra.atlas.sheets.verify.tech.answers.value")],
        ]}
      />
    </AtDialog>
  )
}

export function HotsetSheet(props: AtlasSheetProps<"hotset">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const [form, setForm] = createStore({ budget: "500", result: undefined as ResultRow | undefined })
  const compare = () => {
    const model = atlas.model()
    if (!model) return
    if (model.provenance() !== "trusted")
      return setForm("result", { tone: "", icon: "lock", text: language.t("orchestra.atlas.sheets.hotset.refused") })
    const size = model.health().hotSet
    if (size > Number(form.budget))
      return setForm("result", {
        tone: "bad",
        icon: "warning",
        text: language.t("orchestra.atlas.sheets.hotset.over", { size: num(size) }),
      })
    setForm("result", { tone: "good", icon: "checkc", text: language.t("orchestra.atlas.sheets.hotset.within", { size: num(size) }) })
  }
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.hotset.title")}
      text={language.t("orchestra.atlas.sheets.hotset.text")}
      onClose={props.onClose}
      footer={
        <footer class="mx-dialog-foot">
          <span class="grow" />
          <button type="button" class="mx-btn" onClick={() => props.onClose()}>
            {language.t("orchestra.atlas.sheets.close")}
          </button>
          <button type="button" class="mx-btn primary" onClick={() => compare()}>
            {language.t("orchestra.atlas.sheets.hotset.compare")}
          </button>
        </footer>
      }
    >
      <label class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.hotset.budget")}</span>
        <input type="number" min="1" value={form.budget} onInput={(event) => setForm("budget", event.currentTarget.value)} />
      </label>
      <ResultLine row={form.result} />
      <Tech
        rows={[
          [
            language.t("orchestra.atlas.sheets.hotset.tech.command"),
            <Rich text={language.t("orchestra.atlas.sheets.hotset.tech.command.value")} />,
          ],
        ]}
      />
    </AtDialog>
  )
}

export function RepublishSheet(props: AtlasSheetProps<"republish">) {
  const atlas = useAtlas()
  const language = useLanguage()
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.publish.title")}
      text={language.t("orchestra.atlas.sheets.publish.text")}
      onClose={props.onClose}
      footer={
        <AtDialogFoot
          note={<NewCap id="R7" />}
          label={language.t("orchestra.atlas.sheets.publish.confirm")}
          onCancel={props.onClose}
          onConfirm={() => atlas.toast(language.t("orchestra.atlas.sheets.publish.newcap"), "info")}
        />
      }
    >
      <div class="at-checks-strip">
        <For each={PRECHECKS}>
          {(check) => (
            <span class={`at-check ${check[2] ? "good" : "idle"}`} data-tip={language.t(check[1])}>
              <Icon name={check[2] ? "checkc" : "minusc"} />
              {language.t(check[0])}
            </span>
          )}
        </For>
      </div>
      <div class="ins-note">
        <Icon name="info" />
        <span>{language.t("orchestra.atlas.sheets.publish.info")}</span>
      </div>
      <Tech
        rows={[
          [
            language.t("orchestra.atlas.sheets.publish.tech.script"),
            <Rich text={language.t("orchestra.atlas.sheets.publish.tech.script.value")} />,
          ],
          [language.t("orchestra.atlas.sheets.publish.tech.writes"), language.t("orchestra.atlas.sheets.publish.tech.writes.value")],
          [language.t("orchestra.atlas.sheets.publish.tech.refuses"), language.t("orchestra.atlas.sheets.publish.tech.refuses.value")],
          [language.t("orchestra.atlas.sheets.publish.tech.producer"), language.t("orchestra.atlas.sheets.publish.tech.producer.value")],
          [language.t("orchestra.atlas.sheets.publish.tech.when"), language.t("orchestra.atlas.sheets.publish.tech.when.value")],
        ]}
      />
    </AtDialog>
  )
}

export function RespawnSheet(props: AtlasSheetProps<"respawn">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const name = () => seatName(props.sheet.member)
  // The task's latest saved checkpoint: what a resume would hand back.
  const latest = () => atlas.model()?.memory[props.sheet.member].tasks.filter((task) => task.taskId === props.sheet.unit).at(-1)
  const [form, setForm] = createStore({ packet: language.t("orchestra.atlas.sheets.respawn.packet.value") })
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.respawn.title", { name: name() })}
      text={language.t("orchestra.atlas.sheets.respawn.text")}
      onClose={props.onClose}
      footer={
        <AtDialogFoot
          note={<NewCap id="R5" />}
          label={language.t("orchestra.atlas.sheets.respawn.confirm")}
          onCancel={props.onClose}
          onConfirm={() => {
            props.onClose()
            atlas.toast(language.t("orchestra.atlas.sheets.respawn.newcap"), "info")
          }}
        />
      }
    >
      <div class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.respawn.checkpoint")}</span>
        <Show
          when={latest()}
          fallback={
            <div class="ins-note">
              <Icon name="xc" />
              <span>
                {language.t("orchestra.atlas.sheets.respawn.refused", { reason: words.refusal("no-own-fold"), name: name() })}
              </span>
            </div>
          }
        >
          {(task) => (
            <>
              <div class="at-linkrow static">
                <Icon name="memory" />
                <span>{task().stoppedAt}</span>
              </div>
              <p class="mx-note">{language.t("orchestra.atlas.sheets.respawn.sends", { name: name() })}</p>
            </>
          )}
        </Show>
      </div>
      <label class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.respawn.packet")}</span>
        <textarea rows={3} value={form.packet} onInput={(event) => setForm("packet", event.currentTarget.value)} />
      </label>
      <Tech
        rows={[
          [
            language.t("orchestra.atlas.sheets.respawn.tech.call"),
            <Rich text={language.t("orchestra.atlas.sheets.respawn.tech.call.value", { unit: props.sheet.unit })} />,
          ],
          [language.t("orchestra.atlas.sheets.respawn.tech.choice"), language.t("orchestra.atlas.sheets.respawn.tech.choice.value")],
          [
            language.t("orchestra.atlas.sheets.respawn.tech.compaction"),
            language.t("orchestra.atlas.sheets.respawn.tech.compaction.value"),
          ],
        ]}
      />
    </AtDialog>
  )
}

export function RuleSheet(props: AtlasSheetProps<"rule">) {
  const atlas = useAtlas()
  const language = useLanguage()
  const [form, setForm] = createStore({
    rule: props.sheet.lesson,
    scope: props.sheet.lesson ? language.t("orchestra.atlas.sheets.rule.scope.default") : "",
  })
  return (
    <AtDialog
      title={language.t("orchestra.atlas.sheets.rule.title")}
      text={language.t("orchestra.atlas.sheets.rule.text")}
      onClose={props.onClose}
      footer={
        <AtDialogFoot
          note={<NewCap id="R1" />}
          label={language.t("orchestra.atlas.sheets.rule.confirm")}
          onCancel={props.onClose}
          onConfirm={() => {
            props.onClose()
            atlas.toast(language.t("orchestra.atlas.sheets.rule.newcap"), "info")
          }}
        />
      }
    >
      <label class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.rule.rule")}</span>
        <textarea rows={3} value={form.rule} onInput={(event) => setForm("rule", event.currentTarget.value)} />
      </label>
      <label class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.rule.scope")}</span>
        <input
          placeholder={language.t("orchestra.atlas.sheets.rule.scope.placeholder")}
          value={form.scope}
          onInput={(event) => setForm("scope", event.currentTarget.value)}
        />
      </label>
      <p class="mx-note">{language.t("orchestra.atlas.sheets.rule.note", { name: seatName(props.sheet.member) })}</p>
    </AtDialog>
  )
}
