import { createEffect, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { displayName, errorMessage } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { ChapterPageProps } from "../chapter-route"
import { MxBadge } from "./kit"
import {
  activeWorkspace,
  copyTarget,
  defaultCopyParent,
  homeRelative,
  removableWorkspaces,
  repositoryProject,
  repositoryWorkspaces,
  workspaceFailure,
  WORKTREE_STRATEGY,
} from "./workspaces-model"
import { persistedWorkspaces } from "./workspaces-store"
import "./workspaces.css"

type Project = { id: string; name?: string; worktree: string; vcs?: string; sandboxes?: string[] }
type Dialog = { kind: "new" } | { kind: "configure"; directory: string } | { kind: "delete"; directory: string }

export default function Workspaces(props: ChapterPageProps) {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const tabs = useTabs()
  const [preference, setPreference] = persistedWorkspaces(serverSDK().scope)
  const [state, setState] = createStore({
    status: "loading" as "loading" | "ready" | "empty" | "error" | "unavailable",
    protocol: "v2" as "v1" | "v2",
    project: undefined as Project | undefined,
    workspaces: [] as ReturnType<typeof repositoryWorkspaces>,
    branches: {} as Record<string, string | undefined>,
    removable: undefined as string[] | undefined,
    dialog: undefined as Dialog | undefined,
    busy: false,
    error: undefined as string | undefined,
  })
  const requests = { generation: 0, disposed: false }
  const dialog = { element: undefined as HTMLDialogElement | undefined }
  onCleanup(() => {
    requests.disposed = true
  })

  const rootKey = () => (state.project ? pathKey(state.project.worktree) : "")
  const active = () => activeWorkspace(state.workspaces, preference.active[rootKey()])
  const workspace = (directory: string) => state.workspaces.find((item) => item.directory === directory)
  const fallbackName = (directory: string) => {
    const item = workspace(directory)
    if (item?.root && state.project) return displayName(state.project)
    return item?.folder ?? directory
  }
  const name = (directory: string) => preference.names[pathKey(directory)] ?? fallbackName(directory)
  const removable = (directory: string) => state.removable?.includes(pathKey(directory))

  // After a write the cards stay on screen while the server's list reloads.
  async function load(quiet = false) {
    const generation = ++requests.generation
    const current = () => !requests.disposed && generation === requests.generation
    if (!quiet) setState({ status: "loading", removable: undefined })
    const result = await serverSDK()
      .protocol.then(async (protocol) => ({ protocol, projects: await listProjects(protocol) }))
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
    if (!current()) return
    if ("error" in result) {
      setState("status", workspaceFailure(result.error))
      return
    }
    const project = repositoryProject(result.value.projects, props.directory)
    const workspaces = project ? repositoryWorkspaces(project) : []
    setState({
      protocol: result.value.protocol,
      project,
      workspaces,
      status: workspaces.length ? "ready" : "empty",
    })
    if (!project) return
    const [branches, removable] = await Promise.all([
      readBranches(result.value.protocol, workspaces),
      serverSDK()
        .api.project.directories({ projectID: project.id, location: { directory: project.worktree } })
        .then((items) => removableWorkspaces(result.value.protocol, items))
        // Without the server's list nothing is offered for deletion.
        .catch((): string[] => []),
    ])
    if (!current()) return
    setState({ branches, removable })
  }

  async function listProjects(protocol: "v1" | "v2"): Promise<Project[]> {
    if (protocol !== "v1") return serverSDK().api.project.list()
    // The legacy compatibility adapter throws only the response body, losing
    // the status needed to distinguish an unsupported endpoint from an error.
    const result = await serverSDK().client.project.list(undefined, { throwOnError: false })
    if (!result.response.ok) throw new Error("UnexpectedStatus", { cause: { status: result.response.status } })
    return result.data ?? []
  }

  // Only V1 reports a branch per directory; V2 has no branch endpoint, so its cards omit the badge.
  async function readBranches(protocol: "v1" | "v2", workspaces: readonly { directory: string }[]) {
    if (protocol !== "v1") return {}
    const entries = await Promise.all(
      workspaces.map((item) =>
        serverSDK()
          .client.vcs.get({ directory: item.directory })
          .then(
            (result) => [pathKey(item.directory), result.data?.branch ?? undefined] as const,
            () => [pathKey(item.directory), undefined] as const,
          ),
      ),
    )
    return Object.fromEntries(entries)
  }

  onMount(() => void load())

  createEffect(() => {
    const element = dialog.element
    if (!element) return
    if (state.dialog && !element.open) element.showModal()
    if (!state.dialog && element.open) element.close()
  })

  function openDialog(next: Dialog) {
    setState({ dialog: next, error: undefined, busy: false })
  }

  function closeDialog() {
    if (state.busy) return
    setState({ dialog: undefined, error: undefined })
  }

  function selectWorkspace(directory: string) {
    setPreference("active", rootKey(), directory)
    void tabs.newDraft({ server: ServerConnection.key(props.server), directory }, "")
  }

  async function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const current = state.dialog
    if (!current || state.busy) return
    const form = new FormData(event.currentTarget)
    if (current.kind === "configure") {
      const next = String(form.get("name") ?? "").trim()
      setPreference(
        "names",
        pathKey(current.directory),
        next && next !== fallbackName(current.directory) ? next : undefined,
      )
      setState("dialog", undefined)
      return
    }
    if (current.kind === "delete") return remove(current.directory)
    return create(String(form.get("name") ?? "").trim(), String(form.get("directory") ?? ""))
  }

  async function create(label: string, parent: string) {
    const project = state.project
    if (!project) return
    const target = state.protocol === "v2" ? copyTarget(parent, label) : { directory: "", name: label }
    if (!target) {
      setState("error", language.t("orchestra.workspaces.field.invalidDirectory"))
      return
    }
    setState({ busy: true, error: undefined })
    const result = await (
      state.protocol === "v1"
        ? serverSDK()
            .client.worktree.create({ directory: project.worktree, worktreeCreateInput: { name: target.name } })
            .then((response) => response.data?.directory)
        : serverSDK()
            .api.projectCopy.create({
              projectID: project.id,
              strategy: WORKTREE_STRATEGY,
              directory: target.directory,
              name: target.name,
              location: { directory: project.worktree },
            })
            .then((copy) => copy.directory)
    ).then(
      (directory) => ({ directory }),
      (error: unknown) => ({ error }),
    )
    if (requests.disposed) return
    if ("error" in result || !result.directory) {
      setState({
        busy: false,
        error: errorMessage("error" in result ? result.error : undefined, language.t("common.requestFailed")),
      })
      return
    }
    const created = result.directory
    setPreference("names", pathKey(created), label)
    mirrorSandboxes(project.worktree, (sandboxes) => [...sandboxes.filter((item) => item !== created), created])
    setState({ busy: false, dialog: undefined })
    void load(true)
  }

  async function remove(directory: string) {
    const project = state.project
    if (!project) return
    setState({ busy: true, error: undefined })
    const result = await (
      state.protocol === "v1"
        ? serverSDK()
            .client.worktree.remove({ directory: project.worktree, worktreeRemoveInput: { directory } })
            .then((response) => response.data === true)
        : serverSDK()
            .api.projectCopy.remove({
              projectID: project.id,
              directory,
              force: true,
              location: { directory: project.worktree },
            })
            .then(() => true)
    ).then(
      (removed) => ({ removed }),
      (error: unknown) => ({ error }),
    )
    if (requests.disposed) return
    if ("error" in result || !result.removed) {
      setState({
        busy: false,
        error: errorMessage("error" in result ? result.error : undefined, language.t("common.requestFailed")),
      })
      return
    }
    setPreference("names", pathKey(directory), undefined)
    if (pathKey(preference.active[rootKey()] ?? "") === pathKey(directory))
      setPreference("active", rootKey(), undefined)
    mirrorSandboxes(project.worktree, (sandboxes) => sandboxes.filter((item) => pathKey(item) !== pathKey(directory)))
    setState({ busy: false, dialog: undefined })
    void load(true)
  }

  // Keep the shared project store (profile picker, new-session workspace menu) in step with the write.
  function mirrorSandboxes(root: string, change: (sandboxes: string[]) => string[]) {
    sync().set(
      "project",
      produce((projects) => {
        const project = projects.find((item) => pathKey(item.worktree) === pathKey(root))
        if (!project) return
        project.sandboxes = change(project.sandboxes ?? [])
      }),
    )
  }

  const home = () => sync().data.path.home

  return (
    <section class="mx-page orchestra-workspaces" aria-labelledby="workspaces-title" data-mx-page="workspaces">
      <div class="ws-inner">
        <header class="ws-mast">
          <div>
            <div class="ws-kicker">{language.t("orchestra.workspaces.title")}</div>
            <h1 id="workspaces-title">
              {language.t("orchestra.workspaces.heading")}
              <br />
              <span>{language.t("orchestra.workspaces.headingAccent")}</span>
            </h1>
          </div>
        </header>
        <div class="mx-toolbar">
          <button
            type="button"
            class="mx-btn primary"
            disabled={state.status !== "ready" || state.project?.vcs !== "git"}
            onClick={() => openDialog({ kind: "new" })}
          >
            {language.t("orchestra.workspaces.new")}
          </button>
          <Show when={state.project}>
            {(project) => (
              <MxBadge>
                <bdi>{displayName(project())}</bdi>
              </MxBadge>
            )}
          </Show>
        </div>
        <Show
          when={state.status === "ready"}
          fallback={
            <div class="mx-empty" role={state.status === "error" ? "alert" : "status"}>
              {language.t(`orchestra.workspaces.${state.status}`)}
              <Show when={state.status === "error"}>
                {" "}
                <button type="button" class="mx-link" onClick={() => void load()}>
                  {language.t("orchestra.workspaces.retry")}
                </button>
              </Show>
            </div>
          }
        >
          <div class="mx-grid">
            <For each={state.workspaces}>
              {(item) => {
                const selected = () => pathKey(active() ?? "") === pathKey(item.directory)
                return (
                  <article class="mx-card" data-directory={item.directory} data-active={selected()}>
                    <div class="mx-card-top">
                      <span class="mx-mark">
                        <svg class="ws-icon" viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M4 2h5l3 3v9H4V2ZM9 2v3h3M6 8h4M6 11h3" />
                        </svg>
                      </span>
                      <h3>
                        <bdi>{name(item.directory)}</bdi>
                      </h3>
                    </div>
                    <p>
                      <code dir="ltr" title={item.directory}>
                        {homeRelative(item.directory, home())}
                      </code>
                    </p>
                    <div class="mx-meta">
                      <MxBadge>
                        {language.t(item.root ? "orchestra.workspaces.root" : "orchestra.workspaces.sandbox")}
                      </MxBadge>
                      <Show when={state.branches[pathKey(item.directory)]}>
                        {(branch) => (
                          <MxBadge>
                            <bdi>{branch()}</bdi>
                          </MxBadge>
                        )}
                      </Show>
                      <MxBadge tone={selected() ? "good" : undefined}>
                        {language.t(selected() ? "orchestra.workspaces.active" : "orchestra.workspaces.idle")}
                      </MxBadge>
                    </div>
                    <footer class="mx-card-foot">
                      <button type="button" class="mx-btn" onClick={() => selectWorkspace(item.directory)}>
                        {language.t(selected() ? "orchestra.workspaces.openChat" : "orchestra.workspaces.use")}
                      </button>
                      <button
                        type="button"
                        class="mx-btn"
                        onClick={() => openDialog({ kind: "configure", directory: item.directory })}
                      >
                        {language.t("orchestra.workspaces.configure")}
                      </button>
                    </footer>
                  </article>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
      <dialog
        ref={(element) => (dialog.element = element)}
        class="mx-dialog ws-dialog"
        aria-labelledby="workspaces-dialog-title"
        onCancel={(event) => {
          event.preventDefault()
          closeDialog()
        }}
        // The browser may still force-close on repeated Escape; keep state in step with the element.
        onClose={() => setState({ dialog: undefined, error: undefined })}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          const box = event.currentTarget.getBoundingClientRect()
          const inside =
            event.clientX >= box.left &&
            event.clientX <= box.right &&
            event.clientY >= box.top &&
            event.clientY <= box.bottom
          if (!inside) closeDialog()
        }}
      >
        <Show when={state.dialog} keyed>
          {(current) => (
            <form autocomplete="off" onSubmit={submit}>
              <header class="mx-dialog-head">
                <div>
                  <h2 id="workspaces-dialog-title">
                    <Switch>
                      <Match when={current.kind === "new"}>{language.t("orchestra.workspaces.new")}</Match>
                      <Match when={current.kind === "configure" && current}>
                        {(configure) => (
                          <bdi>
                            {language.t("orchestra.workspaces.dialog.configure", {
                              name: name(configure().directory),
                            })}
                          </bdi>
                        )}
                      </Match>
                      <Match when={current.kind === "delete"}>{language.t("orchestra.workspaces.confirm.title")}</Match>
                    </Switch>
                  </h2>
                  <p>
                    {language.t(
                      current.kind !== "delete"
                        ? "orchestra.workspaces.dialog.description"
                        : state.protocol === "v1"
                          ? "orchestra.workspaces.confirm.descriptionBranch"
                          : "orchestra.workspaces.confirm.description",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  class="mx-link"
                  aria-label={language.t("orchestra.workspaces.dialog.close")}
                  onClick={closeDialog}
                >
                  <svg class="ws-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="m4 4 8 8m0-8-8 8" />
                  </svg>
                </button>
              </header>
              <div class="mx-dialog-body">
                <Show when={state.error}>
                  {(error) => (
                    <p class="mx-error" role="alert">
                      {error()}
                    </p>
                  )}
                </Show>
                <Switch>
                  <Match when={current.kind === "delete" && current}>
                    {(target) => (
                      <p class="mx-note">
                        {language.t("orchestra.workspaces.confirm.note", {
                          path: homeRelative(target().directory, home()),
                        })}
                      </p>
                    )}
                  </Match>
                  <Match when={current.kind === "new"}>
                    <WorkspaceFields
                      name=""
                      directory={
                        state.protocol === "v2" && state.project ? defaultCopyParent(state.project.worktree) : ""
                      }
                      directoryEditable={state.protocol === "v2"}
                      directoryPlaceholder={language.t("orchestra.workspaces.field.serverDirectory")}
                      branch=""
                      branchPlaceholder={language.t(
                        state.protocol === "v2"
                          ? "orchestra.workspaces.field.detached"
                          : "orchestra.workspaces.field.newBranch",
                      )}
                      root={false}
                    />
                  </Match>
                  <Match when={current.kind === "configure" && current}>
                    {(configure) => {
                      const directory = configure().directory
                      const root = workspace(directory)?.root ?? false
                      return (
                        <>
                          <WorkspaceFields
                            name={name(directory)}
                            directory={homeRelative(directory, home())}
                            directoryEditable={false}
                            branch={state.branches[pathKey(directory)] ?? ""}
                            branchPlaceholder={language.t("orchestra.workspaces.field.unknownBranch")}
                            root={root}
                          />
                          <Show
                            when={
                              !root && state.removable !== undefined && pathKey(active() ?? "") !== pathKey(directory)
                            }
                          >
                            <Show
                              when={removable(directory)}
                              fallback={<p class="mx-note ws-note">{language.t("orchestra.workspaces.external")}</p>}
                            >
                              <button
                                type="button"
                                class="mx-btn"
                                onClick={() => openDialog({ kind: "delete", directory })}
                              >
                                {language.t("orchestra.workspaces.delete")}
                              </button>
                            </Show>
                          </Show>
                        </>
                      )
                    }}
                  </Match>
                </Switch>
              </div>
              <footer class="mx-dialog-foot">
                <button type="button" class="mx-btn" disabled={state.busy} onClick={closeDialog}>
                  {language.t("common.cancel")}
                </button>
                <button class="mx-btn primary" type="submit" disabled={state.busy}>
                  {language.t(current.kind === "delete" ? "orchestra.workspaces.confirm.action" : "common.save")}
                </button>
              </footer>
            </form>
          )}
        </Show>
      </dialog>
    </section>
  )
}

function WorkspaceFields(props: {
  name: string
  directory: string
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
        <span>{language.t("orchestra.workspaces.field.directory")}</span>
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
