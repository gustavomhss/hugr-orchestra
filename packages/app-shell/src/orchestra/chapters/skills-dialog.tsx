import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { SkillAccess, SkillEntry } from "./skills-data"

export type SkillDialogState =
  | { type: "add" }
  | { type: "edit"; skill: SkillEntry; access: SkillAccess }
  | { type: "remove"; skill: SkillEntry }

export type SkillSaveInput = { name: string; description: string; content: string; path?: string; mtime?: number }

// Mock `modal()`: one native modal dialog whose content is replaced per step. Each action resolves to
// an error message, or undefined once the page has applied it and closed the dialog.
export function SkillDialog(props: {
  state: SkillDialogState
  onClose: () => void
  onSave: (input: SkillSaveInput) => Promise<string | undefined>
  onRemove: (skill: SkillEntry) => Promise<string | undefined>
  onAskRemove: (skill: SkillEntry) => void
}) {
  const language = useLanguage()
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const lifetime = { disposed: false }
  const skill = props.state.type === "add" ? undefined : props.state.skill
  const editable = props.state.type === "add" || (props.state.type === "edit" && props.state.access === "edit")
  let dialog!: HTMLDialogElement

  onMount(() => dialog.showModal())
  onCleanup(() => {
    lifetime.disposed = true
  })

  async function run(action: () => Promise<string | undefined>) {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    const failure = await action()
    if (lifetime.disposed) return
    setBusy(false)
    setError(failure)
  }

  function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const state = props.state
    if (state.type === "remove") return void run(() => props.onRemove(state.skill))
    const data = new FormData(event.currentTarget)
    void run(() =>
      props.onSave({
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        content: String(data.get("instructions") ?? ""),
        path: skill?.location,
        mtime: skill?.mtime ?? undefined,
      }),
    )
  }

  const title = () => {
    if (props.state.type === "add") return language.t("orchestra.skills.dialog.add")
    if (props.state.type === "remove") return language.t("orchestra.skills.remove.title")
    return language.t(props.state.access === "edit" ? "orchestra.skills.dialog.edit" : "orchestra.skills.dialog.read", {
      name: props.state.skill.name,
    })
  }
  const detail = () => {
    if (props.state.type === "add") return language.t("orchestra.skills.dialog.addDetail")
    if (props.state.type === "remove")
      return language.t("orchestra.skills.remove.detail", { location: props.state.skill.location })
    const location = props.state.skill.location
    if (props.state.access === "builtin") return language.t("orchestra.skills.dialog.builtin")
    if (props.state.access === "global") return language.t("orchestra.skills.dialog.global", { location })
    if (props.state.access === "governed") return language.t("orchestra.skills.dialog.governed", { location })
    if (props.state.access === "fixed") return language.t("orchestra.skills.dialog.fixed", { location })
    return language.t("orchestra.skills.location", { location })
  }

  return (
    <dialog
      ref={dialog}
      class="mx-dialog orchestra-skills-dialog"
      aria-labelledby="orchestra-skills-dialog-title"
      // A Kobalte layer behind this modal (a navigation tooltip still open or animating out) takes Escape on the
      // document and cancels the native close. The modal is the top layer, so it takes Escape first.
      on:keydown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        dialog.close()
      }}
      onClose={() => {
        if (!lifetime.disposed) props.onClose()
      }}
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
      <form autocomplete="off" onSubmit={submit}>
        <header class="mx-dialog-head">
          <div>
            <h2 id="orchestra-skills-dialog-title">
              <bdi>{title()}</bdi>
            </h2>
            <p>
              <bdi>{detail()}</bdi>
            </p>
          </div>
          <button
            type="button"
            class="mx-link"
            aria-label={language.t("orchestra.skills.dialog.close")}
            onClick={() => dialog.close()}
          >
            <svg class="orchestra-skills-ic" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </header>
        <div class="mx-dialog-body">
          <p class="mx-error" role="alert" hidden={!error()}>
            {error()}
          </p>
          <Show
            when={props.state.type !== "remove"}
            fallback={<p class="mx-note">{language.t("orchestra.skills.remove.note")}</p>}
          >
            <label class="mx-field">
              <span>{language.t("orchestra.skills.dialog.name")}</span>
              <input name="name" type="text" value={skill?.name ?? ""} required readOnly={!editable} />
            </label>
            <label class="mx-field">
              <span>{language.t("orchestra.skills.dialog.description")}</span>
              <input name="description" type="text" value={skill?.description ?? ""} required readOnly={!editable} />
            </label>
            <label class="mx-field">
              <span>{language.t("orchestra.skills.content")}</span>
              <textarea
                name="instructions"
                value={skill?.content ?? ""}
                readOnly={!editable}
                rows={Math.min(16, (skill?.content ?? "").split("\n").length)}
              />
            </label>
            <Show when={props.state.type === "edit" && editable && skill}>
              {(target) => (
                <button type="button" class="mx-btn" onClick={() => props.onAskRemove(target())}>
                  {language.t("orchestra.skills.dialog.remove")}
                </button>
              )}
            </Show>
          </Show>
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={() => dialog.close()}>
            {language.t("orchestra.skills.dialog.cancel")}
          </button>
          <Show when={editable || props.state.type === "remove"}>
            <button class="mx-btn primary" type="submit" disabled={busy()}>
              {language.t(
                props.state.type === "remove" ? "orchestra.skills.remove.confirm" : "orchestra.skills.dialog.save",
              )}
            </button>
          </Show>
        </footer>
      </form>
    </dialog>
  )
}
