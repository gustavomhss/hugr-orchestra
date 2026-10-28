import { createSignal, For, Index, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { RelayTrial } from "./client"
import { pasteOneLine } from "./details"
import { failure } from "./dialogs"
import { checkParams } from "./format"
import type { Control } from "./graph"
import { useStudio } from "./studio"
import { Ic, useRelayCopy } from "./ui"

// The `${name}` parameters the shipped templates use, each with a plain-words meaning in the copy file.
const PARAMS = ["base_ref", "src_path", "test_path", "test_cmd", "lint_cmd", "wp_dir", "review_artifact"] as const

// What "Add check" offers: the usual reasons a step is done, each a check of the right kind with a readable id. A
// command preset starts empty on purpose: a run leaves an unset `${test_cmd}` literal, so a guessed parameter would
// fail; the command field suggests common commands instead.
const PRESETS = [
  { key: "tests", control: { cmd: "" } },
  { key: "lint", control: { cmd: "" } },
  { key: "review", control: { judge: "", diff: true, blocking: true } },
  { key: "judge", control: { judge: "", blocking: true } },
  { key: "command", control: { cmd: "" } },
] as const
const SUGGESTIONS = [
  "bun test",
  "npm test",
  "pnpm test",
  "pytest",
  "go test ./...",
  "cargo test",
  "bun typecheck",
  "npx tsc --noEmit",
  "npm run lint",
  "ruff check .",
  "cargo clippy -- -D warnings",
]

// The criteria a step must meet to advance. Commands always block; an AI check is advisory unless blocking.
// `newID` names a new check; it must be unique across the whole workflow, not just this step.
export function CheckList(props: {
  controls: Control[]
  newID: (name: string) => string
  onChange: (controls: Control[]) => void
}) {
  const copy = useRelayCopy()
  const studio = useStudio()
  // The project's own commands lead the suggestions; the ones a check already runs are not offered again.
  const detected = () => studio?.commands()?.commands ?? []
  const offered = () => detected().filter((item) => !props.controls.some((control) => control.cmd === item.command))
  const pytest = () =>
    (studio?.commands()?.pytest ?? []).filter(
      (file) => !props.controls.some((control) => control.cmd === `pytest -q ${file}`),
    )
  const suggestions = () => [...new Set([...detected().map((item) => item.command), ...SUGGESTIONS])]
  // "Test now" results by check id. A result belongs to the command it ran, so editing the command hides it.
  const [trials, setTrials] = createStore<
    Record<string, { command: string; running: boolean; result?: RelayTrial; error?: string }>
  >({})
  const trial = (control: Control) => {
    const command = control.cmd ?? ""
    if (!studio || !command.trim()) return
    setTrials(control.id, { command, running: true, result: undefined, error: undefined })
    studio
      .trial(command)
      .then((result) => setTrials(control.id, { command, running: false, result }))
      .catch((error) => setTrials(control.id, { command, running: false, error: failure(error) }))
  }
  // The text of the kind a check was switched away from, so switching back does not lose it.
  const [kept, setKept] = createStore<Record<string, { cmd?: string; judge?: string }>>({})
  // The check whose command field refused a multi-line paste.
  const [refused, setRefused] = createSignal<string>()
  const [picking, setPicking] = createSignal(false)
  let list: HTMLDivElement | undefined
  const add = (preset: (typeof PRESETS)[number]) => {
    const id = props.newID(preset.key)
    setPicking(false)
    props.onChange([
      ...props.controls,
      {
        id,
        ...preset.control,
        ...(preset.key === "review" ? { judge: copy.t("orchestra.workflows.check.preset.reviewCriterion") } : {}),
      },
    ])
    // The parent may redraw the list after the change, so the new check's first field is found once the frame settles.
    requestAnimationFrame(() =>
      list?.querySelector<HTMLElement>(`[data-check="${CSS.escape(id)}"] :is(textarea, input.cmd)`)?.focus(),
    )
  }
  // Several new checks at once: `newID` only sees the saved flow, so ids taken in this batch get a suffix.
  const addCommands = (items: { name: string; cmd: string }[]) => {
    const taken = new Set(props.controls.map((control) => control.id))
    const added = items.map((item) => {
      const base = props.newID(item.name)
      const id = taken.has(base)
        ? `${base}-${Array.from({ length: items.length + 1 }, (_, at) => at + 2).find((at) => !taken.has(`${base}-${at}`))}`
        : base
      taken.add(id)
      return { id, cmd: item.cmd }
    })
    setPicking(false)
    props.onChange([...props.controls, ...added])
  }
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
      <div class="wf-ctl-list" ref={list}>
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
                <Show
                  when={judge()}
                  fallback={
                    <>
                      <input
                        class="cmd"
                        list="wf-check-commands"
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
                      <Show when={studio}>
                        {(() => {
                          const shown = () =>
                            trials[control().id]?.command === control().cmd ? trials[control().id] : undefined
                          const blocked = () =>
                            !studio?.commands()?.trusted
                              ? copy.t("orchestra.workflows.check.trialUntrusted")
                              : params().length
                                ? copy.t("orchestra.workflows.check.trialParams")
                                : undefined
                          return (
                            <div class="wf-trial">
                              <div class="wf-trial-head">
                                <button
                                  type="button"
                                  class="mx-btn"
                                  disabled={!!blocked() || !control().cmd?.trim() || !!shown()?.running}
                                  title={blocked()}
                                  onClick={() => trial(control())}
                                >
                                  <Ic name="play" />
                                  {shown()?.running
                                    ? copy.t("orchestra.workflows.check.trialRunning")
                                    : copy.t("orchestra.workflows.check.trial")}
                                </button>
                                <Show
                                  when={shown()?.result}
                                  fallback={<span class="wf-trial-note">{blocked() ?? copy.t("orchestra.workflows.check.trialHint")}</span>}
                                >
                                  {(result) => (
                                    <span class="wf-trial-verdict" classList={{ pass: result().exitCode === 0 && !result().timedOut }}>
                                      {result().timedOut
                                        ? copy.t("orchestra.workflows.check.trialTimedOut")
                                        : result().exitCode === 0
                                          ? copy.t("orchestra.workflows.check.trialPass", {
                                              seconds: (result().durationMs / 1000).toFixed(1),
                                            })
                                          : copy.t("orchestra.workflows.check.trialFail", {
                                              code: String(result().exitCode),
                                              seconds: (result().durationMs / 1000).toFixed(1),
                                            })}
                                    </span>
                                  )}
                                </Show>
                              </div>
                              <Show when={shown()?.error}>
                                {(error) => (
                                  <p class="mx-error" role="alert">
                                    {copy.t("orchestra.workflows.check.trialError", { reason: error() })}
                                  </p>
                                )}
                              </Show>
                              <Show when={shown()?.result?.output}>
                                <details class="wf-trial-output" open={shown()?.result?.exitCode !== 0}>
                                  <summary>
                                    {shown()?.result?.truncated
                                      ? copy.t("orchestra.workflows.check.trialOutputTail")
                                      : copy.t("orchestra.workflows.check.trialOutput")}
                                  </summary>
                                  <pre>{shown()?.result?.output}</pre>
                                </details>
                              </Show>
                            </div>
                          )
                        })()}
                      </Show>
                    </>
                  }
                >
                  <Show when={studio?.preview()?.judge === "stub"}>
                    <p class="wf-ctl-warn" role="note">
                      <Ic name="warn" />
                      {copy.t("orchestra.workflows.check.judgeStub")}
                    </p>
                  </Show>
                  <textarea
                    rows="3"
                    placeholder={copy.t("orchestra.workflows.check.criterionPlaceholder")}
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
                <Show when={!judge() || typeof control().assert === "string"}>
                  <details class="wf-ctl-more" open={!!assert()}>
                    <summary>{copy.t("orchestra.workflows.check.more")}</summary>
                    <input
                      class="prose"
                      value={assert()}
                      placeholder={copy.t("orchestra.workflows.check.assertPlaceholder")}
                      aria-label={copy.t("orchestra.workflows.check.assert")}
                      onInput={(event) => update(index, { assert: event.currentTarget.value })}
                      onChange={(event) => !event.currentTarget.value && update(index, {}, "assert")}
                    />
                  </details>
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
      <datalist id="wf-check-commands">
        <For each={suggestions()}>{(command) => <option value={command} />}</For>
      </datalist>
      <Show when={offered().length || pytest().length}>
        <div class="wf-ctl-detected" role="group" aria-label={copy.t("orchestra.workflows.check.detected")}>
          <span class="wf-col-kicker">{copy.t("orchestra.workflows.check.detected")}</span>
          <div class="wf-ctl-chips">
            <For each={offered()}>
              {(item) => (
                <button
                  type="button"
                  class="wf-chip"
                  title={copy.t("orchestra.workflows.check.detectedFrom", { source: item.source })}
                  onClick={() => addCommands([{ name: item.kind, cmd: item.command }])}
                >
                  <Ic name="plus" />
                  <code>{item.command}</code>
                  <small>{item.source}</small>
                </button>
              )}
            </For>
            <Show when={pytest().length > 1}>
              <button
                type="button"
                class="wf-chip"
                onClick={() =>
                  addCommands(
                    pytest().map((file) => ({
                      name: file.replace(/\.py$/, "").split("/").pop() ?? "test",
                      cmd: `pytest -q ${file}`,
                    })),
                  )
                }
              >
                <Ic name="plus" />
                {copy.t("orchestra.workflows.check.pytestEach", { count: String(pytest().length) })}
              </button>
            </Show>
          </div>
        </div>
      </Show>
      <Show
        when={picking()}
        fallback={
          <button type="button" class="mx-btn" onClick={() => setPicking(true)}>
            <Ic name="plus" />
            {copy.t("orchestra.workflows.check.add")}
          </button>
        }
      >
        <div class="wf-plan-picker" role="group" aria-label={copy.t("orchestra.workflows.check.pick")}>
          <div class="wf-plan-picker-head">
            <span>{copy.t("orchestra.workflows.check.pick")}</span>
            <button type="button" class="mx-btn" onClick={() => setPicking(false)}>
              {copy.t("orchestra.workflows.plan.cancel")}
            </button>
          </div>
          <div class="wf-plan-kinds">
            <For each={PRESETS}>
              {(preset, index) => (
                <button
                  type="button"
                  class="wf-pick"
                  ref={(element) => index() === 0 && queueMicrotask(() => element.focus())}
                  onClick={() => add(preset)}
                  onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), setPicking(false))}
                >
                  <span>
                    <strong>{copy.t(`orchestra.workflows.check.preset.${preset.key}`)}</strong>
                    <small>{copy.t(`orchestra.workflows.check.preset.${preset.key}Body`)}</small>
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  )
}
