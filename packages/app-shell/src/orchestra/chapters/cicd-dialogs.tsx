import { createEffect, createSignal, createUniqueId, For, onMount, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { ENVIRONMENTS, TRIGGERS, type Pipeline } from "./cicd-data"
import type { PipelineDefinition } from "./cicd-runner"

// Marks copied from the mock's icon set (16-unit stroke icons).
export function CicdIcon(props: { children: JSX.Element }) {
  return (
    <svg class="cicd-ic" viewBox="0 0 16 16" aria-hidden="true">
      {props.children}
    </svg>
  )
}

export function PipelineMark() {
  return (
    <CicdIcon>
      <circle cx="3" cy="8" r="2" />
      <circle cx="13" cy="4" r="2" />
      <circle cx="13" cy="12" r="2" />
      <path d="M5 8h3V4h3M8 8v4h3" />
    </CicdIcon>
  )
}

// Native modal dialog shaped like the mock's `.mx-dialog`: top layer, blurred backdrop, Escape and
// outside clicks close it. `onSubmit` returning false keeps it open.
export function CicdDialog(props: {
  title: string
  detail: string
  submit?: string
  error?: string
  onSubmit?: (data: FormData) => false | void
  onClose: () => void
  children: JSX.Element
}) {
  const language = useLanguage()
  const id = createUniqueId()
  let dialog!: HTMLDialogElement
  onMount(() => dialog.showModal())
  return (
    <dialog
      ref={dialog}
      class="mx-dialog cicd-dialog"
      aria-labelledby={`${id}-title`}
      // A Kobalte layer behind this modal (a navigation tooltip still open or animating out) takes Escape on the
      // document and cancels the native close. The modal is the top layer, so it takes Escape first.
      on:keydown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        dialog.close()
      }}
      onClose={() => props.onClose()}
      onClick={(event) => {
        if (event.target !== dialog) return
        const rect = dialog.getBoundingClientRect()
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        if (!inside) dialog.close()
      }}
    >
      <form
        class="cicd-dialog-form"
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          if (props.onSubmit?.(new FormData(event.currentTarget)) === false) return
          dialog.close()
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <h2 id={`${id}-title`}>{props.title}</h2>
            <p>{props.detail}</p>
          </div>
          <button
            type="button"
            class="mx-link"
            aria-label={language.t("orchestra.cicd.dialog.close")}
            onClick={() => dialog.close()}
          >
            <CicdIcon>
              <path d="m4 4 8 8m0-8-8 8" />
            </CicdIcon>
          </button>
        </header>
        <div class="mx-dialog-body">
          <Show when={props.error}>
            <p class="mx-error" role="alert">
              {props.error}
            </p>
          </Show>
          {props.children}
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={() => dialog.close()}>
            {language.t("orchestra.cicd.dialog.cancel")}
          </button>
          <Show when={props.submit}>
            <button type="submit" class="mx-btn primary">
              {props.submit}
            </button>
          </Show>
        </footer>
      </form>
    </dialog>
  )
}

export function PipelineDialog(props: {
  pipeline?: Pipeline
  branch: string
  onSave: (definition: PipelineDefinition) => void
  onRemove: () => void
  onClose: () => void
}) {
  const language = useLanguage()
  const [error, setError] = createSignal("")
  const item = () => props.pipeline
  return (
    <CicdDialog
      title={
        props.pipeline
          ? language.t("orchestra.cicd.dialog.editTitle", { name: props.pipeline.name })
          : language.t("orchestra.cicd.new")
      }
      detail={language.t("orchestra.cicd.dialog.detail")}
      submit={language.t("orchestra.cicd.dialog.save")}
      error={error()}
      onClose={props.onClose}
      onSubmit={(data) => {
        const name = String(data.get("name") ?? "").trim()
        const branch = String(data.get("branch") ?? "").trim()
        const command = String(data.get("command") ?? "")
          .replace(/\r\n?/g, "\n")
          .trim()
        const problem = !name
          ? "orchestra.cicd.field.nameRequired"
          : !branch
            ? "orchestra.cicd.field.branchRequired"
            : !command
              ? "orchestra.cicd.field.commandsRequired"
              : undefined
        if (problem) {
          setError(language.t(problem))
          return false
        }
        props.onSave({
          id: item()?.id ?? crypto.randomUUID(),
          name,
          branch,
          trigger: TRIGGERS.find((value) => value === data.get("trigger")) ?? "manual",
          command,
          environment: ENVIRONMENTS.find((value) => value === data.get("environment")) ?? "preview",
          deploy: data.has("deploy"),
        })
      }}
    >
      <label class="mx-field">
        <span>{language.t("orchestra.cicd.field.name")}</span>
        <input name="name" type="text" value={item()?.name ?? ""} required />
      </label>
      <div class="mx-fields">
        <label class="mx-field">
          <span>{language.t("orchestra.cicd.field.branch")}</span>
          <input name="branch" type="text" value={item()?.branch ?? props.branch} required />
        </label>
        <label class="mx-field">
          <span>{language.t("orchestra.cicd.field.trigger")}</span>
          <select name="trigger">
            <For each={TRIGGERS}>
              {(value) => (
                <option value={value} selected={value === (item()?.trigger ?? "manual")}>
                  {language.t(`orchestra.cicd.trigger.${value}`)}
                </option>
              )}
            </For>
          </select>
        </label>
      </div>
      <label class="mx-field">
        <span>{language.t("orchestra.cicd.field.commands")}</span>
        <textarea name="command" dir="ltr" spellcheck={false}>
          {item()?.command ?? "bun run build && bun test"}
        </textarea>
      </label>
      <label class="mx-field">
        <span>{language.t("orchestra.cicd.field.environment")}</span>
        <select name="environment">
          <For each={ENVIRONMENTS}>
            {(value) => (
              <option value={value} selected={value === (item()?.environment ?? "preview")}>
                {language.t(`orchestra.cicd.environment.${value}`)}
              </option>
            )}
          </For>
        </select>
      </label>
      <label class="cicd-choice">
        <input type="checkbox" name="deploy" checked={item()?.deploy ?? false} />
        {language.t("orchestra.cicd.field.deploy")}
      </label>
      <Show when={item()}>
        <button type="button" class="mx-btn" onClick={() => props.onRemove()}>
          {language.t("orchestra.cicd.remove")}
        </button>
      </Show>
    </CicdDialog>
  )
}

export function LogsDialog(props: { pipeline: Pipeline; log: string; onClose: () => void }) {
  const language = useLanguage()
  let log!: HTMLPreElement
  // Follow live output while the run streams.
  createEffect(() => {
    if (props.pipeline.status !== "running" || !props.log) return
    log.parentElement?.scrollTo({ top: log.parentElement.scrollHeight })
  })
  return (
    <CicdDialog
      title={language.t("orchestra.cicd.logsTitle", { name: props.pipeline.name })}
      detail={language.t("orchestra.cicd.logsDetail", {
        branch: props.pipeline.branch,
        status: language.t(`orchestra.cicd.status.${props.pipeline.status}`),
      })}
      onClose={props.onClose}
    >
      <pre ref={log} class="mx-log" dir="ltr" tabindex="0" data-slot="cicd-log">
        {props.log || language.t("orchestra.cicd.logsEmpty")}
      </pre>
      <button
        type="button"
        class="mx-btn"
        disabled={!props.log}
        onClick={() => {
          const url = URL.createObjectURL(new Blob([`${props.log}\n`], { type: "text/plain;charset=utf-8" }))
          const link = document.createElement("a")
          link.href = url
          link.download = `${props.pipeline.name}.log`
          link.click()
          // Keep the URL alive until the browser has consumed the download click.
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}
      >
        {language.t("orchestra.cicd.download")}
      </button>
    </CicdDialog>
  )
}
