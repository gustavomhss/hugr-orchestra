import { getFilename } from "@opencode-ai/core/util/path"
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
  untrack,
} from "solid-js"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { ChapterPageProps } from "../chapter-route"
import { GITLAB_CI, loadWorkflows, workflowFailure } from "./cicd-data"
import { CicdDialog, LogsDialog, PipelineDialog, PipelineMark } from "./cicd-dialogs"
import { profilePipelines } from "./cicd-runner"
import { MxBadge, MxPage } from "./kit"
import "./cicd.css"

type Dialog =
  | { type: "edit"; id?: string }
  | { type: "logs"; id: string }
  | { type: "remove"; id: string }
  | { type: "source"; path: string }

export default function Cicd(props: ChapterPageProps) {
  const sdk = useSDK()
  const language = useLanguage()
  const tabs = useTabs()
  const global = useGlobal()
  const sync = useServerSync()
  const pipelines = profilePipelines(`${ServerConnection.key(props.server)}\0${pathKey(props.directory)}`, {
    sdk: useServerSDK()(),
    platform: usePlatform(),
    directory: props.directory,
    t: language.t,
  })
  const abort = new AbortController()
  onCleanup(() => abort.abort())
  const [query, setQuery] = createSignal("")
  // A signal, not a store, so a dialog's close handler can compare by identity.
  const [dialog, setDialog] = createSignal<Dialog>()
  const closeDialog = (current: Dialog) => () => {
    if (dialog() === current) setDialog(undefined)
  }
  const dialogOf = <T extends Dialog["type"]>(type: T) => {
    const current = dialog()
    if (current && isDialog(current, type)) return current
  }
  const profile = createMemo(() => {
    const directory = pathKey(props.directory)
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find(
        (item) =>
          pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
      )
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })
  // V2 has no VCS route yet; the legacy route still answers on current servers and is only a form default.
  const [vcs] = createResource(() =>
    sdk()
      .client.vcs.get(undefined, { signal: abort.signal, throwOnError: false })
      .then((result) => result.data?.branch)
      .catch(() => undefined),
  )
  const branch = () => vcs() ?? sync().child(props.directory, { bootstrap: false })[0].vcs?.branch ?? ""
  const matches = (text: string) => text.toLowerCase().includes(query().trim().toLowerCase())
  const trigger = (value: "manual" | "push" | "pullRequest") => language.t(`orchestra.cicd.trigger.${value}`)

  createEffect(() => {
    if (!pipelines.ready()) return
    untrack(() => pipelines.resume())
  })

  const [inventory, actions] = createResource(() =>
    loadWorkflows(async (path) => {
      if ((await sdk().protocol) !== "v1")
        return sdk()
          .api.file.list({ path, location: { directory: props.directory } }, { signal: abort.signal })
          .then((result) => result.data)
      const result = await sdk().client.file.list({ path }, { signal: abort.signal, throwOnError: false })
      if (!result.response.ok) throw new Error("Workflow list failed", { cause: { status: result.response.status } })
      return result.data ?? []
    }),
  )
  const [source] = createResource(
    () => dialogOf("source")?.path,
    async (path) => {
      const content = async () => {
        if ((await sdk().protocol) === "v1") {
          const result = await sdk().client.file.read({ path }, { signal: abort.signal, throwOnError: false })
          if (!result.response.ok)
            throw new Error("Workflow read failed", { cause: { status: result.response.status } })
          if (!result.data || result.data.type !== "text" || result.data.encoding === "base64")
            throw new Error("Unsupported workflow content")
          return result.data.content
        }
        return sdk()
          .api.file.read({ path, location: { directory: props.directory } }, { signal: abort.signal })
          .then((bytes) => new TextDecoder().decode(bytes))
      }
      return content()
        .then((text) => ({ status: "ready" as const, path, text }))
        .catch((error: unknown) => ({ status: workflowFailure(error), path, text: "" }))
    },
  )
  const kind = (path: string) => language.t(path === GITLAB_CI ? "orchestra.cicd.gitlab" : "orchestra.cicd.github")
  const cards = createMemo(() =>
    pipelines.list().filter((item) =>
      matches(
        [
          item.name,
          item.command,
          language.t(`orchestra.cicd.status.${item.status}`),
          item.branch,
          trigger(item.trigger),
          item.deploy
            ? language.t("orchestra.cicd.deploy", {
                environment: language.t(`orchestra.cicd.environment.${item.environment}`),
              })
            : language.t("orchestra.cicd.checksOnly"),
        ].join(" "),
      ),
    ),
  )
  const workflows = createMemo(() => (inventory()?.paths ?? []).filter((path) => matches(`${path} ${kind(path)}`)))

  return (
    <MxPage
      id="cicd"
      eyebrow={language.t("orchestra.cicd.eyebrow", { profile: profile() })}
      title={language.t("orchestra.cicd.title")}
      description={language.t("orchestra.cicd.description")}
      action={
        <button type="button" class="mx-btn primary" onClick={() => setDialog({ type: "edit" })}>
          {language.t("orchestra.cicd.new")}
        </button>
      }
    >
      <div class="mx-toolbar">
        <input
          class="mx-search"
          placeholder={language.t("orchestra.cicd.search")}
          aria-label={language.t("orchestra.cicd.searchLabel")}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <MxBadge>
          <bdi>{profile()}</bdi>
        </MxBadge>
      </div>
      <Show
        when={pipelines.list().length}
        fallback={
          <div class="mx-empty">
            {language.t("orchestra.cicd.none")}
            <br />
            {language.t("orchestra.cicd.noneHint")}
          </div>
        }
      >
        <div class="mx-grid">
          <For each={cards()}>
            {(item) => (
              <article class="mx-card" data-mx-card data-pipeline={item.id}>
                <div class="mx-card-top">
                  <span class="mx-mark">
                    <PipelineMark />
                  </span>
                  <h3>{item.name}</h3>
                </div>
                <p dir="ltr">{item.command}</p>
                <div class="mx-meta">
                  <MxBadge
                    tone={
                      item.status === "passed"
                        ? "good"
                        : item.status === "failed" || item.status === "error"
                          ? "bad"
                          : undefined
                    }
                  >
                    {language.t(`orchestra.cicd.status.${item.status}`)}
                  </MxBadge>
                  <MxBadge>
                    <bdi>{item.branch}</bdi>
                  </MxBadge>
                  <MxBadge>{trigger(item.trigger)}</MxBadge>
                  <MxBadge>
                    {item.deploy
                      ? language.t("orchestra.cicd.deploy", {
                          environment: language.t(`orchestra.cicd.environment.${item.environment}`),
                        })
                      : language.t("orchestra.cicd.checksOnly")}
                  </MxBadge>
                </div>
                <footer class="mx-card-foot">
                  <div>
                    <button
                      type="button"
                      class="mx-btn"
                      onClick={(event) => {
                        // The second click of a double click must not stop the run the first one started.
                        if (event.detail > 1) return
                        if (item.status === "running") return pipelines.stop(item.id)
                        void pipelines.run(item.id, vcs())
                      }}
                    >
                      {language.t(item.status === "running" ? "orchestra.cicd.stop" : "orchestra.cicd.run")}
                    </button>{" "}
                    <button type="button" class="mx-btn" onClick={() => setDialog({ type: "logs", id: item.id })}>
                      {language.t("orchestra.cicd.logs")}
                    </button>
                  </div>
                  <button type="button" class="mx-btn" onClick={() => setDialog({ type: "edit", id: item.id })}>
                    {language.t("orchestra.cicd.edit")}
                  </button>
                </footer>
              </article>
            )}
          </For>
        </div>
      </Show>
      <Show when={!query().trim() || workflows().length}>
        <h3 class="mx-section">{language.t("orchestra.cicd.workflows")}</h3>
        <div class="mx-table" data-slot="cicd-workflows">
          <Switch>
            <Match when={inventory.loading}>
              <div class="mx-row">
                <small role="status">{language.t("orchestra.cicd.loading")}</small>
              </div>
            </Match>
            <Match when={inventory()?.status !== "ready"}>
              <div class="mx-row">
                <small class="mx-grow" role={inventory()?.status === "error" ? "alert" : "status"}>
                  {language.t(
                    inventory()?.status === "empty"
                      ? "orchestra.cicd.empty"
                      : inventory()?.status === "unavailable"
                        ? "orchestra.cicd.unavailable"
                        : "orchestra.cicd.error",
                  )}
                </small>
                <Show when={inventory()?.status === "error"}>
                  <button type="button" class="mx-btn" onClick={() => void actions.refetch()}>
                    {language.t("orchestra.cicd.refresh")}
                  </button>
                </Show>
              </div>
            </Match>
            <Match when={true}>
              <For each={workflows()}>
                {(path) => (
                  <div class="mx-row" data-mx-card>
                    <div class="mx-grow">
                      <strong dir="ltr">
                        <bdi>{path}</bdi>
                      </strong>
                      <small>{kind(path)}</small>
                    </div>
                    <button
                      type="button"
                      class="mx-btn"
                      aria-label={`${language.t("orchestra.cicd.source")} ${path}`}
                      onClick={() => setDialog({ type: "source", path })}
                    >
                      {language.t("orchestra.cicd.source")}
                    </button>
                  </div>
                )}
              </For>
            </Match>
          </Switch>
        </div>
      </Show>
      <p class="mx-note">{language.t("orchestra.cicd.note")}</p>
      <Switch>
        <Match when={dialogOf("edit")} keyed>
          {(current) => (
            <PipelineDialog
              pipeline={current.id ? pipelines.list().find((item) => item.id === current.id) : undefined}
              branch={branch()}
              onSave={(definition) => pipelines.save(definition)}
              onRemove={() => {
                if (current.id) setDialog({ type: "remove", id: current.id })
              }}
              onClose={closeDialog(current)}
            />
          )}
        </Match>
        <Match
          when={(() => {
            const current = dialogOf("logs")
            const item = current && pipelines.list().find((entry) => entry.id === current.id)
            return current && item ? { current, item } : undefined
          })()}
        >
          {(open) => (
            <LogsDialog
              pipeline={open().item}
              log={pipelines.log(open().item.id)}
              onClose={closeDialog(open().current)}
            />
          )}
        </Match>
        <Match when={dialogOf("remove")} keyed>
          {(current) => (
            <CicdDialog
              title={language.t("orchestra.cicd.removeTitle")}
              detail={language.t("orchestra.cicd.removeDetail")}
              submit={language.t("orchestra.cicd.dialog.confirm")}
              onSubmit={() => pipelines.remove(current.id)}
              onClose={closeDialog(current)}
            >
              <p class="mx-note">{language.t("orchestra.cicd.removeNote", { profile: profile() })}</p>
            </CicdDialog>
          )}
        </Match>
        <Match when={dialogOf("source")} keyed>
          {(current) => (
            <CicdDialog
              title={current.path}
              detail={language.t("orchestra.cicd.sourceDetail", { kind: kind(current.path) })}
              submit={language.t("orchestra.cicd.discuss")}
              onSubmit={() => {
                void tabs.newDraft(
                  { server: ServerConnection.key(props.server), directory: props.directory },
                  language.t("orchestra.cicd.prompt", { path: current.path }),
                )
              }}
              onClose={closeDialog(current)}
            >
              <Switch>
                <Match when={source.loading || source()?.path !== current.path}>
                  <p class="mx-note" role="status">
                    {language.t("orchestra.cicd.previewLoading")}
                  </p>
                </Match>
                <Match when={source()?.status !== "ready"}>
                  <p class="mx-error" role="alert">
                    {language.t(
                      source()?.status === "unavailable"
                        ? "orchestra.cicd.previewUnavailable"
                        : "orchestra.cicd.previewError",
                    )}
                  </p>
                </Match>
                <Match when={true}>
                  <pre class="mx-log" dir="ltr" tabindex="0" data-slot="cicd-source">
                    {source()?.text}
                  </pre>
                </Match>
              </Switch>
            </CicdDialog>
          )}
        </Match>
      </Switch>
    </MxPage>
  )
}

function isDialog<T extends Dialog["type"]>(value: Dialog, type: T): value is Extract<Dialog, { type: T }> {
  return value.type === type
}
