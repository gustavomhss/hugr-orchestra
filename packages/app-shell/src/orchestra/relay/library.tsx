import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation } from "@solidjs/router"
import { showToast } from "@/utils/toast"
import { MxPage } from "../chapters/kit"
import { documentProfile, type RelayDocument } from "./client"
import { rememberDocument } from "./cache"
import { CreateWorkflowDialog, templates } from "./create"
import { createAction, DeleteDialog, failure } from "./dialogs"
import { badgeTone, newestFirst, RUN_TONE, runHandle, span } from "./format"
import { type Flow, flowFromDocument, nodeOf, steps } from "./graph"
import {
  phaseNames,
  RetainedDrafts,
  RunBadge,
  stateLabel,
  TemplateCard,
  unpublishedChanges,
  VersionBadges,
} from "./parts"
import { copyDocument, freeName } from "./presets"
import { type RelayRoute, relayPath } from "./route"
import type { RelayRun, RelayRunStatus } from "./runs"
import type { RelaySource } from "./source"
import { Ic, Menu, type MenuItem, RelayDialog, useRelayCopy } from "./ui"

type Props = {
  source: RelaySource
  route: Extract<RelayRoute, { page: "library" }>
  profile: string
  // The chapter keeps the view, so search and filter survive a round trip through an editor.
  view?: LibraryView
  go: (path: string, replace?: boolean) => void
  close: (path: string) => void
}

export const createLibraryView = () => createStore({ query: "", filter: "all" as "all" | "published" | "draft" })
export type LibraryView = ReturnType<typeof createLibraryView>

// A published workflow with newer edits is still waiting to be published, so it is a draft too.
const STATES = {
  all: () => true,
  published: (document: RelayDocument) => !!document.activeVersionId,
  draft: (document: RelayDocument) => !document.activeVersionId || unpublishedChanges(document),
}

export function WorkflowLibrary(props: Props) {
  const copy = useRelayCopy()
  const duplication = createAction(useLocation())
  const [view, setView] = props.view ?? createLibraryView()
  const [template, setTemplate] = createSignal<string>()
  const [menu, setMenu] = createSignal<{ anchor: HTMLElement; document: RelayDocument }>()
  const [dialog, setDialog] = createSignal<{ type: "delete" | "rename"; document: RelayDocument }>()
  const flows = createMemo(
    () => new Map(props.source.list().map((document) => [document.id, flowFromDocument(document, "workflow")])),
  )
  // "5 min ago" is computed from the clock, so the rows read this signal to be computed again every minute.
  const [clock, setClock] = createSignal(0)
  const ticker = setInterval(() => setClock((value) => value + 1), 60_000)
  onCleanup(() => clearInterval(ticker))
  const updated = (at: number | undefined) => (clock(), copy.when(at))
  // The shipped profiles are templates, not rows: they are offered under "Start from a template" and nowhere else.
  const owned = createMemo(() => props.source.list().filter((document) => documentProfile(document) === undefined))
  const searched = createMemo(() => {
    const text = view.query.trim().toLowerCase()
    return owned().filter((document) => !text || `${document.name} ${document.description}`.toLowerCase().includes(text))
  })
  const shown = createMemo(() => searched().filter(STATES[view.filter]))
  // A refetch that failed keeps the list that was loaded, so the page does not turn into an error.
  const cached = () => props.source.list().length > 0
  const loaded = () => props.source.documents.isSuccess || cached()
  const emptyCopy = () => {
    if (view.query.trim() || view.filter === "all") return copy.t("orchestra.workflows.noMatches")
    return copy.t(
      view.filter === "published" ? "orchestra.workflows.filter.emptyPublished" : "orchestra.workflows.filter.emptyDraft",
    )
  }
  const duplicate = (document: RelayDocument) =>
    duplication.run(async (current) => {
      const base = copy.t("orchestra.workflows.create.copyName", { name: document.name })
      const name = freeName(
        props.source.list().map((item) => item.name),
        base,
        (n) => copy.t("orchestra.workflows.create.copyNumbered", { name: document.name, n }),
      )
      const created = await props.source.client
        .create(copyDocument(document, name))
        .catch(
          (error: unknown) =>
            void showToast({ title: copy.t("orchestra.workflows.menu.duplicateFailed"), description: failure(error) }),
        )
      if (!created) return
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), created)
      if (!current()) return
      props.go(relayPath.editor("workflow", created.id))
    })
  const openTemplate = (id: string) => {
    setTemplate(id)
    props.go(relayPath.create("workflow"))
  }
  const rowMenu = (document: RelayDocument): MenuItem[] => [
    {
      label: copy.t("orchestra.workflows.menu.open"),
      icon: "open",
      run: () => props.go(relayPath.editor("workflow", document.id)),
    },
    {
      label: copy.t("orchestra.workflows.menu.rename"),
      icon: "edit",
      run: () => setDialog({ type: "rename", document }),
    },
    {
      label: copy.t("orchestra.workflows.menu.duplicate"),
      icon: "workflows",
      disabled: duplication.busy(),
      run: () => void duplicate(document),
    },
    "-",
    {
      label: copy.t("orchestra.workflows.menu.delete"),
      icon: "trash",
      danger: true,
      run: () => setDialog({ type: "delete", document }),
    },
  ]

  return (
    <MxPage
      id="orchestra-workflows"
      eyebrow={copy.t("orchestra.workflows.eyebrow", { profile: props.profile })}
      title={copy.t("orchestra.workflows.title")}
      description={copy.t("orchestra.workflows.description")}
      action={
        <button
          type="button"
          class="mx-btn primary"
          disabled={!loaded()}
          onClick={() => openTemplate("blank")}
        >
          <Ic name="plus" />
          {copy.t("orchestra.workflows.new")}
        </button>
      }
    >
      <p class="wf-xlink">
        <a
          href={relayPath.library("hook")}
          onClick={(event) => {
            event.preventDefault()
            props.go(relayPath.library("hook"))
          }}
        >
          {copy.t("orchestra.workflows.xlink")}
        </a>
      </p>
      <RetainedDrafts source={props.source} kind="workflow" go={props.go} />
      <Switch>
        <Match when={props.source.documents.isPending}>
          <p class="mx-empty" role="status">
            {copy.t("orchestra.workflows.loading")}
          </p>
        </Match>
        <Match when={props.source.documents.isError && !cached()}>
          <p class="mx-error" role="alert">
            {copy.t("orchestra.workflows.error", { reason: String(props.source.documents.error?.message ?? "") })}
          </p>
          <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </Match>
        <Match when={true}>
          <Show when={props.source.documents.isError}>
            <p class="mx-error wf-retained" role="alert">
              <span>{copy.t("orchestra.workflows.refreshFailed")}</span>
              <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
                {copy.t("orchestra.workflows.retry")}
              </button>
            </p>
          </Show>
          <Show
            when={owned().length}
            fallback={
              <div class="mx-empty wf-empty">
                <strong>{copy.t("orchestra.workflows.empty.title")}</strong>
                {copy.t(
                  templates(props.source.list()).length
                    ? "orchestra.workflows.empty.body"
                    : "orchestra.workflows.empty.bodyBlank",
                )}
                <br />
                <button type="button" class="mx-btn primary" onClick={() => openTemplate("blank")}>
                  <Ic name="plus" />
                  {copy.t("orchestra.workflows.template.blank")}
                </button>
              </div>
            }
          >
            <div class="mx-toolbar wf-toolbar">
              <input
                class="mx-search"
                type="text"
                aria-label={copy.t("orchestra.workflows.search")}
                placeholder={copy.t("orchestra.workflows.search")}
                value={view.query}
                onInput={(event) => setView("query", event.currentTarget.value)}
              />
              <div class="wf-range" role="group" aria-label={copy.t("orchestra.workflows.filter.label")}>
                <For each={["all", "published", "draft"] as const}>
                  {(value) => (
                    <button type="button" aria-pressed={view.filter === value} onClick={() => setView("filter", value)}>
                      {copy.t(`orchestra.workflows.filter.${value}`)}
                      <span class="wf-count">{searched().filter(STATES[value]).length}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="wf-lhead wf-lib" aria-hidden="true">
              <span />
              <span>{copy.t("orchestra.workflows.head.workflow")}</span>
              <span>{copy.t("orchestra.workflows.head.version")}</span>
              <span>{copy.t("orchestra.workflows.head.updated")}</span>
              <span />
            </div>
            <Show when={shown().length} fallback={<p class="mx-empty">{emptyCopy()}</p>}>
              <div class="mx-table wf-lib" role="list" aria-label={copy.t("orchestra.workflows.title")}>
                <For each={shown()}>
                  {(document) => {
                    const flow = () => flows().get(document.id)
                    const names = () => (flow() ? phaseNames(flow()!) : [])
                    return (
                      <div
                        class="mx-row wf-lrow"
                        role="listitem"
                        tabindex="0"
                        data-document={document.id}
                        onClick={() => props.go(relayPath.editor("workflow", document.id))}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " "))
                            return
                          event.preventDefault()
                          props.go(relayPath.editor("workflow", document.id))
                        }}
                      >
                        <span class="mx-mark">
                          <Ic name="workflows" />
                        </span>
                        <div class="mx-grow">
                          <strong>{document.name}</strong>
                          <Show when={document.description}>
                            <small>{document.description}</small>
                          </Show>
                          <small class="wf-oneline">
                            {(names().length ? names().join(" → ") : copy.t("orchestra.workflows.row.noPhases")) +
                              " · " +
                              copy.count(
                                flow() ? steps(flow()!).length : 0,
                                "orchestra.workflows.count.step.one",
                                "orchestra.workflows.count.step.other",
                              )}
                          </small>
                        </div>
                        <div class="wf-badges">
                          <VersionBadges document={document} />
                        </div>
                        <div>
                          <span class="wf-state">
                            <small>{updated(document.updated)}</small>
                          </span>
                        </div>
                        <div class="wf-actions" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            class="mx-btn icon"
                            aria-label={copy.t("orchestra.workflows.row.more", { name: document.name })}
                            aria-haspopup="menu"
                            onClick={(event) => setMenu({ anchor: event.currentTarget, document })}
                          >
                            <Ic name="more" />
                          </button>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </Show>
          {/* With no template there is only Blank, and the New workflow button already starts it. */}
          <Show when={templates(props.source.list()).length}>
            <div class="wf-sub" style={{ "margin-top": "30px" }}>
              <h3 class="mx-section">{copy.t("orchestra.workflows.templates.title")}</h3>
              <span class="mx-meta">{copy.t("orchestra.workflows.templates.meta")}</span>
            </div>
            <div class="wf-tpl-grid">
              <TemplateCard id="blank" flows={flows()} documents={props.source.list()} onPick={openTemplate} />
              <For each={templates(props.source.list())}>
                {(document) => (
                  <TemplateCard
                    id={document.id}
                    flows={flows()}
                    documents={props.source.list()}
                    onPick={openTemplate}
                  />
                )}
              </For>
            </div>
          </Show>
        </Match>
      </Switch>
      <Show when={props.route.create && loaded()}>
        <CreateWorkflowDialog
          source={props.source}
          flows={flows()}
          initial={template() ?? "blank"}
          onClose={() => props.close(relayPath.library("workflow"))}
          onCreated={(id) => props.go(relayPath.editor("workflow", id), true)}
        />
      </Show>
      <Show when={menu()}>
        {(current) => (
          <Menu
            anchor={current().anchor}
            label={copy.t("orchestra.workflows.row.more", { name: current().document.name })}
            items={rowMenu(current().document)}
            onClose={() => setMenu(undefined)}
          />
        )}
      </Show>
      <Show when={dialog()} keyed>
        {(current) =>
          current.type === "rename" ? (
            <RenameDialog document={current.document} source={props.source} onClose={() => setDialog(undefined)} />
          ) : (
            <DeleteDialog
              document={current.document}
              kind="workflow"
              source={props.source}
              onClose={() => setDialog(undefined)}
              onDeleted={() => setDialog(undefined)}
            />
          )
        }
      </Show>
    </MxPage>
  )
}

function RenameDialog(props: { document: RelayDocument; source: RelaySource; onClose: () => void }) {
  const copy = useRelayCopy()
  const action = createAction()
  const [name, setName] = createSignal(props.document.name)
  const rename = () => {
    const value = name().trim()
    if (!value) return action.setError(copy.t("orchestra.workflows.create.nameRequired"))
    if (value === props.document.name) return props.onClose()
    return action.run(async () => {
      // The list holds the newest version; the menu was opened on an older one if the list refreshed since.
      const latest = props.source.list().find((item) => item.id === props.document.id) ?? props.document
      const saved = await props.source.client.save(latest, { name: value })
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), saved)
      props.onClose()
    })
  }
  return (
    <RelayDialog
      title={copy.t("orchestra.workflows.rename.title")}
      busy={action.busy()}
      onClose={props.onClose}
      onSubmit={rename}
      foot={
        <>
          <button type="button" class="mx-btn" disabled={action.busy()} onClick={props.onClose}>
            {copy.t("orchestra.workflows.dialog.cancel")}
          </button>
          <button type="submit" class="mx-btn primary" disabled={action.busy()}>
            {copy.t("orchestra.workflows.rename.submit")}
          </button>
        </>
      }
    >
      <label class="mx-field" style={{ "margin-bottom": "0" }}>
        <span>{copy.t("orchestra.workflows.create.name")}</span>
        <input
          ref={(element) => queueMicrotask(() => element.isConnected && element.select())}
          name="name"
          autofocus
          disabled={action.busy()}
          value={name()}
          onInput={(event) => {
            setName(event.currentTarget.value)
            action.setError(undefined)
          }}
        />
      </label>
      <Show when={action.error()}>
        <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
          {action.error()}
        </p>
      </Show>
    </RelayDialog>
  )
}

// LiveRow and AllRuns wait for the run routes (WP17): the library does not render them while runs are hidden.
function LiveRow(props: { run: RelayRun; flows: Map<string, Flow>; source: RelaySource; go: (path: string) => void }) {
  const copy = useRelayCopy()
  const document = () => props.source.list().find((item) => item.id === props.run.documentID)
  const step = () =>
    nodeOf(props.flows.get(props.run.documentID)!, props.run.position)?.name ?? props.run.position ?? ""
  const open = () => props.go(relayPath.history("workflow", props.run.documentID, props.run.runID))
  const parked = () => props.run.status === "parked"
  return (
    <div
      class="mx-row wf-lrow live"
      tabindex="0"
      onClick={open}
      onKeyDown={(event) => event.target === event.currentTarget && event.key === "Enter" && open()}
    >
      <span class="mx-mark">
        <Ic name={parked() ? "wait" : "play"} />
      </span>
      <div class="mx-grow">
        <strong>
          {copy.t("orchestra.workflows.live.run", { id: runHandle(props.run.runID), name: document()?.name ?? "" })}
        </strong>
        <small>
          {[
            copy.t(parked() ? "orchestra.workflows.live.waiting" : "orchestra.workflows.live.running", {
              step: step(),
            }),
            props.run.label,
            props.run.startedAt !== undefined
              ? copy.t("orchestra.workflows.live.started", { time: copy.when(props.run.startedAt) })
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </div>
      <div class="wf-actions">
        <RunBadge run={props.run} />
        <button
          type="button"
          class={parked() ? "mx-btn primary" : "mx-btn"}
          onClick={(event) => (event.stopPropagation(), open())}
        >
          {copy.t(parked() ? "orchestra.workflows.live.review" : "orchestra.workflows.live.view")}
        </button>
      </div>
    </div>
  )
}

const FILTERS = ["all", "running", "parked", "failed", "completed"] as const

// Runs are not available: the server has no run routes yet (WP17), or reading them failed.
export function RunsUnavailable(props: { source: RelaySource }) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.source.runsState() === "error"}
      fallback={
        <p class="mx-empty" role="status" data-slot="relay-runs-unsupported">
          {copy.t(
            props.source.runsState() === "loading"
              ? "orchestra.workflows.runs.loading"
              : "orchestra.workflows.runs.unsupportedBody",
          )}
        </p>
      }
    >
      <p class="mx-error" role="alert">
        {copy.t("orchestra.workflows.runs.error", { reason: String(props.source.runs.error?.message ?? "") })}
      </p>
      <button type="button" class="mx-btn" onClick={() => void props.source.runs.refetch()}>
        {copy.t("orchestra.workflows.retry")}
      </button>
    </Show>
  )
}

export function AllRuns(props: {
  runs: RelayRun[]
  flows: Map<string, Flow>
  source: RelaySource
  go: (path: string) => void
}) {
  const copy = useRelayCopy()
  const [filter, setFilter] = createSignal<"all" | RelayRunStatus>("all")
  const shown = () => newestFirst(props.runs.filter((run) => filter() === "all" || run.status === filter()))
  return (
    <Show
      when={props.runs.length}
      fallback={
        <div class="mx-empty wf-empty">
          <strong>{copy.t("orchestra.workflows.runs.empty")}</strong>
          {copy.t("orchestra.workflows.runs.emptyBody")}
        </div>
      }
    >
      <div class="mx-toolbar">
        <div class="wf-range" role="group" aria-label={copy.t("orchestra.workflows.runs.filter")}>
          <For each={FILTERS}>
            {(value) => (
              <button type="button" aria-pressed={filter() === value} onClick={() => setFilter(value)}>
                {value === "all"
                  ? copy.t("orchestra.workflows.filter.all")
                  : copy.t(`orchestra.workflows.state.${value}`)}
                <span class="wf-count">
                  {value === "all" ? props.runs.length : props.runs.filter((run) => run.status === value).length}
                </span>
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="wf-lhead" aria-hidden="true">
        <span />
        <span>{copy.t("orchestra.workflows.head.run")}</span>
        <span>{copy.t("orchestra.workflows.head.status")}</span>
        <span>{copy.t("orchestra.workflows.head.started")}</span>
        <span />
      </div>
      <Show when={shown().length} fallback={<p class="mx-empty">{copy.t("orchestra.workflows.runs.noMatches")}</p>}>
        <div class="mx-table" role="list" aria-label={copy.t("orchestra.workflows.tab.runs")}>
          <For each={shown()}>
            {(run) => {
              const name = () => props.source.list().find((item) => item.id === run.documentID)?.name ?? ""
              const open = () => props.go(relayPath.history("workflow", run.documentID, run.runID))
              return (
                <div
                  class="mx-row wf-lrow"
                  role="listitem"
                  tabindex="0"
                  data-run={run.runID}
                  onClick={open}
                  onKeyDown={(event) => event.target === event.currentTarget && event.key === "Enter" && open()}
                >
                  <span class="mx-mark">
                    <Ic name="history" />
                  </span>
                  <div class="mx-grow">
                    <strong>
                      #{runHandle(run.runID)} · {name()}
                    </strong>
                    <small>
                      {[run.label, run.version !== undefined ? `v${run.version}` : undefined, run.agent]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <div>
                    <span class={`mx-badge ${badgeTone(RUN_TONE[run.status])}`}>{stateLabel(copy, run)}</span>
                  </div>
                  <div class="wf-state">
                    <span>
                      {copy.clock(run.startedAt)}
                      <small> · {copy.when(run.startedAt)}</small>
                      <small style={{ display: "block", "margin-top": "2px" }}>
                        {span(run.startedAt, run.endedAt, Date.now()) ?? ""}
                      </small>
                    </span>
                  </div>
                  <div class="wf-actions">
                    <button
                      type="button"
                      class="mx-btn icon"
                      aria-label={copy.t("orchestra.workflows.runs.open", { id: runHandle(run.runID) })}
                      onClick={(event) => (event.stopPropagation(), open())}
                    >
                      <Ic name="next" />
                    </button>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </Show>
  )
}
