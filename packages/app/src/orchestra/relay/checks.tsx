import { Index, Show } from "solid-js"
import type { Control } from "./graph"
import { Ic, useRelayCopy } from "./ui"

// The criteria a step must meet to advance. Commands always block; a judge is advisory unless blocking.
export function CheckList(props: { controls: Control[]; onChange: (controls: Control[]) => void }) {
  const copy = useRelayCopy()
  const update = (index: number, change: Partial<Control>, drop?: "cmd" | "judge") =>
    props.onChange(
      props.controls.map((control, at) => {
        if (at !== index) return control
        const next: Control = { ...control, ...change }
        if (drop) delete next[drop]
        return next
      }),
    )
  return (
    <>
      <div class="wf-ctl-list">
        <Index each={props.controls}>
          {(control, index) => {
            const judge = () =>
              typeof control().judge === "string" && (control().cmd === undefined || control().cmd === null)
            const empty = () => !control().cmd && !control().judge && !control().host_check
            return (
              <div class="wf-ctl" data-check={control().id}>
                <div class="wf-ctl-top">
                  <input
                    value={control().id}
                    aria-label={copy.t("orchestra.workflows.check.id")}
                    placeholder="check_id"
                    onChange={(event) => update(index, { id: event.currentTarget.value.trim() || control().id })}
                  />
                  <div class="wf-seg" role="group" aria-label={copy.t("orchestra.workflows.check.type")}>
                    <button
                      type="button"
                      aria-pressed={!judge()}
                      onClick={() => judge() && update(index, { cmd: "" }, "judge")}
                    >
                      {copy.t("orchestra.workflows.check.command")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={judge()}
                      onClick={() => !judge() && update(index, { judge: "" }, "cmd")}
                    >
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
                <Show
                  when={judge()}
                  fallback={
                    <>
                      <input
                        class="cmd"
                        value={control().cmd ?? ""}
                        placeholder={copy.t("orchestra.workflows.check.commandPlaceholder")}
                        aria-label={copy.t("orchestra.workflows.check.command")}
                        onInput={(event) => update(index, { cmd: event.currentTarget.value })}
                      />
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
        onClick={() => {
          const taken = new Set(props.controls.map((control) => control.id))
          const id =
            Array.from({ length: taken.size + 1 }, (_, at) => `check_${at + 1}`).find((item) => !taken.has(item)) ??
            `check_${Date.now()}`
          props.onChange([...props.controls, { id, cmd: "" }])
        }}
      >
        <Ic name="plus" />
        {copy.t("orchestra.workflows.check.add")}
      </button>
    </>
  )
}
