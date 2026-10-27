import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { displayName, errorMessage } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { ChapterPageProps } from "../chapter-route"
import { MxBadge } from "./kit"
import { NoRepository } from "./no-repository"
import { type WorkspaceDialog, WorkspacesDialog } from "./workspaces-dialog"
import {
  activeWorkspace,
  copyTarget,
  defaultCopyParent,
  forceRequired,
  homeRelative,
  repositoryProject,
  repositoryWorkspaces,
  workspaceFailure,
  WORKTREE_STRATEGY,
} from "./workspaces-model"
import { persistedWorkspaces } from "./workspaces-store"
import "./workspaces.css"

type Project = { id: string; name?: string; worktree: string; vcs?: string; sandboxes?: string[] }

export default function Workspaces(props: ChapterPageProps) {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const tabs = useTabs()
  const [preference, setPreference, , preferenceReady] = persistedWorkspaces(serverSDK().scope)
  const [state, setState] = createStore({
    status: "loading" as "loading" | "ready" | "empty" | "error" | "unavailable",
    project: undefined as Project | undefined,
    workspaces: [] as ReturnType<typeof repositoryWorkspaces>,
    branches: {} as Record<string, string | undefined>,
    dialog: undefined as WorkspaceDialog | undefined,
    busy: false,
    error: undefined as string | undefined,
  })
  const requests = { generation: 0, disposed: false }
  onCleanup(() => {
    requests.disposed = true
  })

  const rootKey = () => (state.project ? pathKey(state.project.worktree) : "")
  const active = () => activeWorkspace(state.workspaces, preference.active[rootKey()])
  const isActive = (directory: string) => pathKey(active() ?? "") === pathKey(directory)
  const workspace = (directory: string) => state.workspaces.find((item) => item.directory === directory)
  const fallbackName = (directory: string) => {
    const item = workspace(directory)
    if (item?.root && state.project) return displayName(state.project)
    return item?.folder ?? directory
  }
  const name = (directory: string) => preference.names[pathKey(directory)] ?? fallbackName(directory)
  const branch = (directory: string) => state.branches[pathKey(directory)]
  const home = () => sync().data.path.home
  // New workspaces are worktrees, so a folder that is not a repository cannot have one.
  const gitRequired = () => state.status === "ready" && state.project?.vcs !== "git"

  // After a write the cards stay on screen while the server's list reloads.
  async function load(quiet = false) {
    const generation = ++requests.generation
    const current = () => !requests.disposed && generation === requests.generation
    if (!quiet) setState("status", "loading")
    // Desktop storage is asynchronous; read the saved choice before marking a card Active.
    await preferenceReady.promise
    const result = await serverSDK()
      .ready.then(async () => {
        const project = repositoryProject(await serverSDK().api.project.list(), props.directory)
        if (!project) return { project, directories: [] }
        const directories = await serverSDK().api.project.directories({
          projectID: project.id,
        })
        return { project, directories }
      })
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
    if (!current()) return
    if ("error" in result) {
      setState("status", workspaceFailure(result.error))
      return
    }
    const project = result.value.project
    const workspaces = project ? repositoryWorkspaces(project, result.value.directories) : []
    setState({ project, workspaces, status: workspaces.length ? "ready" : "empty" })
    if (!project) return
    remember(project.worktree, workspaces)
    const branches = await readBranches(workspaces)
    if (!current()) return
    setState("branches", branches)
  }

  // New drafts accept only workspaces this server listed; a choice it no longer lists falls back to the root.
  function remember(root: string, workspaces: readonly { directory: string; root: boolean }[]) {
    const key = pathKey(root)
    setPreference(
      "known",
      key,
      workspaces.filter((item) => !item.root).map((item) => item.directory),
    )
    const stored = preference.active[key]
    if (stored && !workspaces.some((item) => pathKey(item.directory) === pathKey(stored)))
      setPreference("active", key, undefined)
  }

  async function readBranches(workspaces: readonly { directory: string }[]) {
    const entries = await Promise.all(
      workspaces.map((item) =>
        (serverSDK().orchestra.vcs.get({ location: { directory: item.directory } }).then((result) => result.data.branch)
        ).then(
            (branch) => [pathKey(item.directory), branch ?? undefined] as const,
            () => [pathKey(item.directory), undefined] as const,
          ),
      ),
    )
    return Object.fromEntries(entries)
  }

  onMount(() => void load())

  function openDialog(next: WorkspaceDialog) {
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

  function submit(form: FormData) {
    const current = state.dialog
    if (!current || state.busy) return
    if (current.kind === "configure") return rename(current.directory, String(form.get("name") ?? "").trim())
    if (current.kind === "delete") return void remove(current.directory, false)
    if (current.kind === "force") return void remove(current.directory, true)
    void create(String(form.get("name") ?? "").trim(), String(form.get("directory") ?? ""))
  }

  // Display names are local to this profile; clearing a name or matching the default removes the override.
  function rename(directory: string, next: string) {
    setPreference("names", pathKey(directory), next && next !== fallbackName(directory) ? next : undefined)
    setState("dialog", undefined)
  }

  async function create(label: string, parent: string) {
    const project = state.project
    if (!project) return
    const target = copyTarget(parent, label)
    if (!target) {
      setState("error", language.t("orchestra.workspaces.field.invalidDirectory"))
      return
    }
    setState({ busy: true, error: undefined })
    const result = await (
      serverSDK()
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
    setState({ busy: false, dialog: undefined })
    void load(true)
  }

  async function remove(directory: string, force: boolean) {
    const project = state.project
    const target = workspace(directory)
    // The root and the active workspace are never removed, whatever reached this point.
    if (!project || !target || target.root || !target.removable || isActive(directory)) return
    setState({ busy: true, error: undefined })
    const result = await (
      serverSDK()
        .api.projectCopy.remove({
          projectID: project.id,
          directory,
          force,
          location: { directory: project.worktree },
        })
        .then(() => true)
    ).then(
      (removed) => ({ removed }),
      (error: unknown) => ({ error }),
    )
    if (requests.disposed) return
    if ("error" in result && !force && forceRequired(result.error)) {
      setState({ busy: false, dialog: { kind: "force", directory } })
      return
    }
    if ("error" in result || !result.removed) {
      setState({
        busy: false,
        error: errorMessage("error" in result ? result.error : undefined, language.t("common.requestFailed")),
      })
      return
    }
    setPreference("names", pathKey(directory), undefined)
    setState({ busy: false, dialog: undefined })
    void load(true)
  }

  return (
    <section class="mx-page orchestra-workspaces" aria-labelledby="workspaces-title" data-mx-page="workspaces">
      <div class="ws-inner">
        <header class="mx-heading">
          <div>
            <div class="mx-eyebrow">{language.t("orchestra.workspaces.title")}</div>
            <h1 id="workspaces-title">{language.t("orchestra.workspaces.heading")}</h1>
            <p>{language.t("orchestra.workspaces.headingAccent")}</p>
          </div>
          <button
            type="button"
            class="mx-btn primary"
            disabled={state.status !== "ready" || state.project?.vcs !== "git"}
            aria-describedby={gitRequired() ? "workspaces-git-required" : undefined}
            onClick={() => openDialog({ kind: "new" })}
          >
            {language.t("orchestra.workspaces.new")}
          </button>
        </header>
        <div class="mx-toolbar">
          <Show when={state.project}>
            {(project) => (
              <MxBadge>
                <bdi>{displayName(project())}</bdi>
              </MxBadge>
            )}
          </Show>
        </div>
        <Show when={gitRequired()}>
          <p id="workspaces-git-required" class="mx-note">
            {language.t("orchestra.workspaces.gitRequired")}
          </p>
        </Show>
        <Show
          when={state.status === "ready"}
          fallback={
            <Show
              when={state.status === "empty" && state.project?.vcs !== "git"}
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
              <NoRepository
                server={props.server}
                title={language.t("orchestra.noRepository.title")}
                hint={language.t("orchestra.workspaces.gitRequired")}
              />
            </Show>
          }
        >
          <div class="mx-grid">
            <For each={state.workspaces}>
              {(item) => (
                <article class="mx-card" data-directory={item.directory} data-active={isActive(item.directory)}>
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
                    <Show when={branch(item.directory)}>
                      {(value) => (
                        <MxBadge>
                          <bdi>{value()}</bdi>
                        </MxBadge>
                      )}
                    </Show>
                    <MxBadge tone={isActive(item.directory) ? "good" : undefined}>
                      {language.t(
                        isActive(item.directory) ? "orchestra.workspaces.active" : "orchestra.workspaces.idle",
                      )}
                    </MxBadge>
                  </div>
                  <footer class="mx-card-foot">
                    <button type="button" class="mx-btn" onClick={() => selectWorkspace(item.directory)}>
                      {language.t(
                        isActive(item.directory) ? "orchestra.workspaces.openChat" : "orchestra.workspaces.use",
                      )}
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
              )}
            </For>
          </div>
        </Show>
      </div>
      <WorkspacesDialog
        dialog={state.dialog}
        busy={state.busy}
        error={state.error}
        home={home()}
        copyParent={state.project ? defaultCopyParent(state.project.worktree) : ""}
        workspace={(directory) => {
          const item = workspace(directory)
          return item && { ...item, active: isActive(directory) }
        }}
        name={name}
        branch={branch}
        onDelete={(directory) => openDialog({ kind: "delete", directory })}
        onSubmit={submit}
        onClose={closeDialog}
        onClosed={() => setState({ dialog: undefined, error: undefined, busy: false })}
      />
    </section>
  )
}
