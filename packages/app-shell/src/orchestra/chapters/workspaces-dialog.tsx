import { createEffect, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { homeRelative } from "./workspaces-model"

// `focusVisible` is a standard FocusOptions member that this TypeScript DOM library does not declare yet.
const visibleFocus: FocusOptions & { focusVisible: boolean } = { focusVisible: true }

export type WorkspaceDialog =
  | { kind: "new" }
  | { kind: "configure"; directory: string }
  | { kind: "delete"; directory: string }
  | { kind: "force"; directory: string }

type Workspace = { directory: string; root: boolean; removable: boolean; active: boolean }

// The mock's native `<dialog class="mx-dialog">`: one element, its content keyed by the open dialog.
export function WorkspacesDialog(props: {
  dialog?: WorkspaceDialog
  protocol: "v1" | "v2"
  busy: boolean
  error?: string
  home?: string
  copyParent: string
  workspace: (directory: string) => Workspace | undefined
  name: (directory: string) => string
  branch: (directory: string) => string | undefined
  onDelete: (directory: string) => void
  onSubmit: (form: FormData) => void
  onClose: () => void
  onClosed: () => void
}) {
  const language = useLanguage()
  const refs = { dialog: undefined as HTMLDialogElement | undefined, close: undefined as HTMLButtonElement | undefined }

  // Like the mock's showModal, focus starts on the close button with a visible ring, also after the content changes.
  createEffect(() => {
    const element = refs.dialog
    if (!element) return
    if (!props.dialog) {
      if (element.open) element.close()
      return
    }
    if (!element.open) element.showModal()
    // showModal already focused the close button without a ring after a pointer click; focusing it again is a no-op.
    refs.close?.blur()
    refs.close?.focus(visibleFocus)
  })

  const heading = (current: WorkspaceDialog) => {
    if (current.kind === "new")
      return {
        title: language.t("orchestra.workspaces.new"),
        description: language.t("orchestra.workspaces.dialog.description"),
      }
    if (current.kind === "configure")
      return {
        title: language.t("orchestra.workspaces.dialog.configure", { name: props.name(current.directory) }),
        description: language.t("orchestra.workspaces.dialog.description"),
      }
    if (current.kind === "delete")
      return {
        title: language.t("orchestra.workspaces.confirm.title"),
        description: language.t("orchestra.workspaces.confirm.description"),
      }
    return {
      title: language.t("orchestra.workspaces.force.title"),
      description: language.t("orchestra.workspaces.force.description"),
    }
  }

  const action = (current: WorkspaceDialog) => {
    if (current.kind === "delete") return language.t("orchestra.workspaces.confirm.action")
    if (current.kind === "force") return language.t("orchestra.workspaces.force.action")
    return language.t("common.save")
  }

  // V1 always forces the removal and deletes the worktree's branch; V2 refuses a dirty tree until asked again.
  const deleteNote = (directory: string) => {
    const path = homeRelative(directory, props.home)
    if (props.protocol === "v2") return language.t("orchestra.workspaces.confirm.guarded", { path })
    const note = language.t("orchestra.workspaces.confirm.note", { path })
    const branch = props.branch(directory)
    if (!branch) return note
    return `${note} ${language.t("orchestra.workspaces.confirm.branch", { branch })}`
  }

  return (
    <dialog
      ref={(element) => (refs.dialog = element)}
      class="mx-dialog ws-dialog"
      aria-labelledby="workspaces-dialog-title"
      // A Kobalte layer behind this modal (a navigation tooltip still open or animating out) takes Escape on the
      // document and cancels the native close. The modal is the top layer, so it takes Escape first.
      on:keydown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        props.onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        props.onClose()
      }}
      // The browser may still force-close on a repeated Escape; keep the owner's state in step with the element.
      onClose={(event) => {
        if (!event.currentTarget.open) props.onClosed()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const box = event.currentTarget.getBoundingClientRect()
        const inside =
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom
        if (!inside) props.onClose()
      }}
    >
      <Show when={props.dialog} keyed>
        {(current) => (
          <form
            autocomplete="off"
            onSubmit={(event) => {
              event.preventDefault()
              props.onSubmit(new FormData(event.currentTarget))
            }}
          >
            <header class="mx-dialog-head">
              <div>
                <h2 id="workspaces-dialog-title">
                  <bdi>{heading(current).title}</bdi>
                </h2>
                <p>{heading(current).description}</p>
              </div>
              <button
                ref={(element) => (refs.close = element)}
                type="button"
                class="mx-link"
                aria-label={language.t("orchestra.workspaces.dialog.close")}
                onClick={() => props.onClose()}
              >
                <svg class="ws-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 4 8 8m0-8-8 8" />
                </svg>
              </button>
            </header>
            <div class="mx-dialog-body">
              <Show when={props.error}>
                {(error) => (
                  <p class="mx-error" role="alert">
                    {error()}
                  </p>
                )}
              </Show>
              <Switch>
                <Match when={current.kind === "delete" && current}>
                  {(target) => <p class="mx-note">{deleteNote(target().directory)}</p>}
                </Match>
                <Match when={current.kind === "force" && current}>
                  {(target) => (
                    <p class="mx-note">
                      {language.t("orchestra.workspaces.force.note", {
                        path: homeRelative(target().directory, props.home),
                      })}
                    </p>
                  )}
                </Match>
                <Match when={current.kind === "new"}>
                  <WorkspaceFields
                    name=""
                    directory={props.protocol === "v2" ? props.copyParent : ""}
                    directoryLabel={
                      props.protocol === "v2"
                        ? "orchestra.workspaces.field.parentDirectory"
                        : "orchestra.workspaces.field.directory"
                    }
                    directoryEditable={props.protocol === "v2"}
                    directoryPlaceholder={language.t("orchestra.workspaces.field.serverDirectory")}
                    branch=""
                    branchPlaceholder={language.t(
                      props.protocol === "v2"
                        ? "orchestra.workspaces.field.detached"
                        : "orchestra.workspaces.field.newBranch",
                    )}
                    root={false}
                  />
                </Match>
                <Match when={current.kind === "configure" && props.workspace(current.directory)}>
                  {(workspace) => (
                    <>
                      <WorkspaceFields
                        name={props.name(workspace().directory)}
                        directory={homeRelative(workspace().directory, props.home)}
                        directoryLabel="orchestra.workspaces.field.directory"
                        directoryEditable={false}
                        branch={props.branch(workspace().directory) ?? ""}
                        branchPlaceholder={language.t(
                          props.protocol === "v1"
                            ? "orchestra.workspaces.field.noBranch"
                            : "orchestra.workspaces.field.unknownBranch",
                        )}
                        root={workspace().root}
                      />
                      <Show when={!workspace().root && !workspace().active}>
                        <Show
                          when={workspace().removable}
                          fallback={<p class="mx-note ws-note">{language.t("orchestra.workspaces.external")}</p>}
                        >
                          <button type="button" class="mx-btn" onClick={() => props.onDelete(workspace().directory)}>
                            {language.t("orchestra.workspaces.delete")}
                          </button>
                        </Show>
                      </Show>
                    </>
                  )}
                </Match>
              </Switch>
            </div>
            <footer class="mx-dialog-foot">
              <button type="button" class="mx-btn" disabled={props.busy} onClick={() => props.onClose()}>
                {language.t("common.cancel")}
              </button>
              <button class="mx-btn primary" type="submit" disabled={props.busy}>
                {action(current)}
              </button>
            </footer>
          </form>
        )}
      </Show>
    </dialog>
  )
}

function WorkspaceFields(props: {
  name: string
  directory: string
  directoryLabel: "orchestra.workspaces.field.directory" | "orchestra.workspaces.field.parentDirectory"
  directoryEditable: boolean
  directoryPlaceholder?: string
  branch: string
  branchPlaceholder: string
  root: boolean
}) {
  const language = useLanguage()
  return (
    <>
      <label class="mx-field">
        <span>{language.t("orchestra.workspaces.field.name")}</span>
        <input name="name" type="text" value={props.name} required />
      </label>
      <label class="mx-field">
        <span>{language.t(props.directoryLabel)}</span>
        <input
          name="directory"
          type="text"
          dir="ltr"
          value={props.directory}
          placeholder={props.directoryPlaceholder}
          readOnly={!props.directoryEditable}
          required={props.directoryEditable}
        />
      </label>
      <div class="mx-fields">
        <label class="mx-field">
          <span>{language.t("orchestra.workspaces.field.branch")}</span>
          <input
            name="branch"
            type="text"
            dir="ltr"
            value={props.branch}
            placeholder={props.branchPlaceholder}
            readOnly
          />
        </label>
        <label class="mx-field">
          <span>{language.t("orchestra.workspaces.field.type")}</span>
          <select name="type" disabled>
            <option value="local" selected={props.root}>
              {language.t("orchestra.workspaces.root")}
            </option>
            <option value="sandbox" selected={!props.root}>
              {language.t("orchestra.workspaces.sandbox")}
            </option>
          </select>
        </label>
      </div>
    </>
  )
}
