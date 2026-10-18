import { createSignal, For, Index, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { pasteOneLine } from "./details"
import { checkParams } from "./format"
import type { Control } from "./graph"
import { Ic, useRelayCopy } from "./ui"

// The `${name}` parameters the shipped templates use, each with a plain-words meaning in the copy file.
const PARAMS = ["base_ref", "src_path", "test_path", "test_cmd", "lint_cmd", "wp_dir", "review_artifact"] as const

// The criteria a step must meet to advance. Commands always block; an AI check is advisory unless blocking.
// `newID` names a new check; it must be unique across the whole workflow, not just this step.
export function CheckList(props: {
  controls: Control[]
  newID: () => string
  onChange: (controls: Control[]) => void
}) {
  const copy = useRelayCopy()
  // The text of the kind a check was switched away from, so switching back does not lose it.
  const [kept, setKept] = createStore<Record<string, { cmd?: string; judge?: string }>>({})
  // The check whose command field refused a multi-line paste.
  const [refused, setRefused] = createSignal<string>()
  const meaning = (name: string) => {
    const known = PARAMS.find((item) => item === name)
    return known ? copy.t(`orchestra.workflows.check.param.${known}`) : copy.t("orchestra.workflows.check.paramOther")
  }
  const update = (index: number, change: Partial<Control>, drop?: "cmd" | "judge" | "assert") =>
    props.onChange(
      props.controls.map((control, at) => {
        if (at !== index) return control
        const next: Control = { ...control, ...change }
        if (drop) delete next[drop]
        return next
      }),
    )
  const switchTo = (index: number, kind: "cmd" | "judge") => {
    const control = props.controls[index]
    setKept(control.id, kind === "cmd" ? { judge: control.judge ?? "" } : { cmd: control.cmd ?? "" })
    update(index, { [kind]: kept[control.id]?.[kind] ?? "" }, kind === "cmd" ? "judge" : "cmd")
  }
  return (
    <>
      <div class="wf-ctl-list">
        <Index each={props.controls}>
          {(control, index) => {
            const judge = () =>
              typeof control().judge === "string" && (control().cmd === undefined || control().cmd === null)
            const empty = () => !control().cmd && !control().judge && !control().host_check
            const assert = () => (typeof control().assert === "string" ? String(control().assert) : "")
            // Parameters can sit in the command, the AI criterion or the files the AI reads.
            const params = () =>
              checkParams([control().cmd ?? "", control().judge ?? "", ...[control().context ?? []].flat()])
            return (
              <div class="wf-ctl" data-check={control().id}>
                <div class="wf-ctl-top">
                  <input
                    value={control().id}
                    aria-label={copy.t("orchestra.workflows.check.id")}
                    placeholder={copy.t("orchestra.workflows.check.idPlaceholder")}
                    onChange={(event) => update(index, { id: event.currentTarget.value.trim() || control().id })}
                  />
                  <div class="wf-seg" role="group" aria-label={copy.t("orchestra.workflows.check.type")}>
                    <button type="button" aria-pressed={!judge()} onClick={() => judge() && switchTo(index, "cmd")}>
                      {copy.t("orchestra.workflows.check.command")}
                    </button>
                    <button type="button" aria-pressed={judge()} onClick={() => !judge() && switchTo(index, "judge")}>
                      {copy.t("orchestra.workflows.check.judge")}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="mx-btn icon"
                    aria-label={copy.t("orchestra.workflows.check.remove", { id: control().id })}
                    onClick={() => props.onChange(props.controls.filter((_, at) => at !== index))}
                  >
                    <Ic name="trash" />
                  </button>
                </div>
                <Show when={!judge() || typeof control().assert === "string"}>
                  <input
                    class="prose"
                    value={assert()}
                    placeholder={copy.t("orchestra.workflows.check.assertPlaceholder")}
                    aria-label={copy.t("orchestra.workflows.check.assert")}
                    onInput={(event) => update(index, { assert: event.currentTarget.value })}
                    onChange={(event) => !event.currentTarget.value && update(index, {}, "assert")}
                  />
                </Show>
                <Show
                  when={judge()}
                  fallback={
                    <>
                      <input
                        class="cmd"
                        value={control().cmd ?? ""}
                        placeholder={copy.t("orchestra.workflows.check.commandPlaceholder")}
                        aria-label={copy.t("orchestra.workflows.check.command")}
                        onInput={(event) => {
                          setRefused(undefined)
                          update(index, { cmd: event.currentTarget.value })
                        }}
                        onPaste={(event) => pasteOneLine(event, () => setRefused(control().id))}
                      />
                      <Show when={refused() === control().id}>
                        <p class="mx-error" role="alert">
                          {copy.t("orchestra.workflows.check.oneLine")}
                        </p>
                      </Show>
                      <Show when={empty()}>
                        <p class="mx-error">{copy.t("orchestra.workflows.check.empty")}</p>
                      </Show>
                    </>
                  }
                >
                  <textarea
                    rows="3"
                    value={control().judge ?? ""}
                    aria-label={copy.t("orchestra.workflows.check.criterion")}
                    onInput={(event) => update(index, { judge: event.currentTarget.value })}
                  />
                  <input
                    class="cmd gap"
                    value={[control().context ?? []].flat().join(" ")}
                    placeholder={copy.t("orchestra.workflows.check.contextPlaceholder")}
                    aria-label={copy.t("orchestra.workflows.check.context")}
                    onChange={(event) =>
                      update(index, { context: event.currentTarget.value.split(/\s+/).filter(Boolean) })
                    }
                  />
                </Show>
                <Show when={params().length}>
                  <div class="wf-ctl-params">
                    <span>{copy.t("orchestra.workflows.check.params")}</span>
                    <ul>
                      <For each={params()}>
                        {(name) => (
                          <li>
                            <code>{"${" + name + "}"}</code> {meaning(name)}
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </Show>
                <div class="wf-ctl-foot">
                  <Show
                    when={judge()}
                    fallback={
                      <>
                        <label>
                          <button
                            type="button"
                            class="mx-toggle"
                            role="switch"
                            aria-checked="true"
                            disabled
                            aria-label={copy.t("orchestra.workflows.check.blocking")}
                          />
                          {copy.t("orchestra.workflows.check.blocking")}
                        </label>
                        <span>{copy.t("orchestra.workflows.check.alwaysBlocks")}</span>
                      </>
                    }
                  >
                    <label>
                      <button
                        type="button"
                        class="mx-toggle"
                        role="switch"
                        aria-checked={!!control().blocking}
                        aria-label={copy.t("orchestra.workflows.check.blocking")}
                        onClick={() => update(index, { blocking: !control().blocking })}
                      />
                      {copy.t("orchestra.workflows.check.blocking")}
                    </label>
                    <label>
                      <button
                        type="button"
                        class="mx-toggle"
                        role="switch"
                        aria-checked={!!control().diff}
                        aria-label={copy.t("orchestra.workflows.check.diff")}
                        onClick={() => update(index, { diff: !control().diff })}
                      />
                      {copy.t("orchestra.workflows.check.diff")}
                    </label>
                    <span>{copy.t("orchestra.workflows.check.advisory")}</span>
                  </Show>
                </div>
              </div>
            )
          }}
        </Index>
      </div>
      <button
        type="button"
        class="mx-btn"
        onClick={() => props.onChange([...props.controls, { id: props.newID(), cmd: "" }])}
      >
        <Ic name="plus" />
        {copy.t("orchestra.workflows.check.add")}
      </button>
    </>
  )
}
