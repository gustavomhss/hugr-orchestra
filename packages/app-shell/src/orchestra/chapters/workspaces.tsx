import { For, onCleanup, onMount, Show } from "solid-js"
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
    protocol: "v2" as "v1" | "v2",
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

  // After a write the cards stay on screen while the server's list reloads.
  async function load(quiet = false) {
    const generation = ++requests.generation
    const current = () => !requests.disposed && generation === requests.generation
    if (!quiet) setState("status", "loading")
    // Desktop storage is asynchronous; read the saved choice before marking a card Active.
    await preferenceReady.promise
    const result = await serverSDK()
      .protocol.then(async (protocol) => {
        const project = repositoryProject(await listProjects(protocol), props.directory)
        if (!project || protocol === "v1") return { protocol, project, directories: undefined }
        const directories = await serverSDK().api.project.directories({
          projectID: project.id,
          location: { directory: project.worktree },
        })
        return { protocol, project, directories }
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
    setState({ protocol: result.value.protocol, project, workspaces, status: workspaces.length ? "ready" : "empty" })
    if (!project) return
    remember(project.worktree, workspaces)
    const branches = await readBranches(result.value.protocol, workspaces)
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

  async function listProjects(protocol: "v1" | "v2") {
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
    // V1 records new worktrees as project sandboxes; keep the shared project store in step until it refetches.
    if (state.protocol === "v1")
      mirrorSandboxes(project.worktree, (sandboxes) => [...sandboxes.filter((item) => item !== created), created])
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
      state.protocol === "v1"
        ? serverSDK()
            .client.worktree.remove({ directory: project.worktree, worktreeRemoveInput: { directory } })
            .then((response) => response.data === true)
        : serverSDK()
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
    if ("error" in result && state.protocol === "v2" && !force && forceRequired(result.error)) {
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
    mirrorSandboxes(project.worktree, (sandboxes) => sandboxes.filter((item) => pathKey(item) !== pathKey(directory)))
    setState({ busy: false, dialog: undefined })
    void load(true)
  }

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
        protocol={state.protocol}
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
