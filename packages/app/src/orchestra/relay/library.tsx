import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { MxPage } from "../chapters/kit"
import type { RelayDocument, RelayRun, RelayRunStatus } from "./client"
import { CreateWorkflowDialog, templateID } from "./create"
import { DeleteDialog, RunDialog } from "./dialogs"
import { badgeTone, liveRuns, newestFirst, RUN_TONE, runHandle, span } from "./format"
import { type Flow, flowFromDocument, nodeOf, steps } from "./graph"
import { phaseNames, RunBadge, RunState, stateLabel, TemplateCard, VersionBadges } from "./parts"
import { type RelayRoute, relayPath } from "./route"
import type { RelaySource } from "./source"
import { Ic, Menu, type MenuItem, useRelayCopy } from "./ui"

type Props = {
  source: RelaySource
  route: Extract<RelayRoute, { page: "library" }>
  profile: string
  go: (path: string) => void
  close: (path: string) => void
}

export function WorkflowLibrary(props: Props) {
  const copy = useRelayCopy()
  const [query, setQuery] = createSignal("")
  const [filter, setFilter] = createSignal<"all" | "published" | "draft">("all")
  const [template, setTemplate] = createSignal<string>()
  const [menu, setMenu] = createSignal<{ anchor: HTMLElement; document: RelayDocument }>()
  const [dialog, setDialog] = createSignal<{ type: "run" | "delete"; document: RelayDocument }>()
  const flows = createMemo(
    () => new Map(props.source.list().map((document) => [document.id, flowFromDocument(document, "workflow")])),
  )
  const runs = () => props.source.runs.data ?? []
  const lastRun = (id: string) => newestFirst(runs().filter((run) => run.documentID === id))[0]
  const shown = createMemo(() => {
    const text = query().trim().toLowerCase()
    return props.source.list().filter((document) => {
      const published = !!document.activeVersionId
      if (filter() === "published" && !published) return false
      if (filter() === "draft" && published) return false
      return !text || `${document.name} ${document.description}`.toLowerCase().includes(text)
    })
  })
  const live = createMemo(() => liveRuns(runs()).filter((run) => flows().has(run.documentID)))
  const waiting = () => live().filter((run) => run.status === "parked").length
  const running = () => live().filter((run) => run.status === "running").length
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
      label: copy.t("orchestra.workflows.menu.executions"),
      icon: "history",
      run: () => props.go(relayPath.history("workflow", document.id)),
    },
    { label: copy.t("orchestra.workflows.menu.duplicate"), icon: "workflows", run: () => openTemplate(document.id) },
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
          disabled={!props.source.documents.isSuccess}
          onClick={() => props.go(relayPath.create("workflow"))}
        >
          <Ic name="plus" />
          {copy.t("orchestra.workflows.new")}
        </button>
      }
    >
      <div class="wf-tabs" role="tablist" aria-label={copy.t("orchestra.workflows.tabs")}>
        <button
          type="button"
          class="wf-tab"
          role="tab"
          aria-selected={props.route.tab === "list"}
          onClick={() => props.go(relayPath.library("workflow"))}
        >
          {copy.t("orchestra.workflows.tab.list")}
          <span class="wf-count">{props.source.list().length}</span>
        </button>
        <button
          type="button"
          class="wf-tab"
          role="tab"
          aria-selected={props.route.tab === "runs"}
          onClick={() => props.go(relayPath.runs("workflow"))}
        >
          {copy.t("orchestra.workflows.tab.runs")}
          <span class="wf-count">{runs().filter((run) => flows().has(run.documentID)).length}</span>
        </button>
      </div>
      <Switch>
        <Match when={props.source.documents.isPending}>
          <p class="mx-empty" role="status">
            {copy.t("orchestra.workflows.loading")}
          </p>
        </Match>
        <Match when={props.source.documents.isError}>
          <p class="mx-error" role="alert">
            {copy.t("orchestra.workflows.error", { reason: String(props.source.documents.error?.message ?? "") })}
          </p>
          <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </Match>
        <Match when={props.route.tab === "runs"}>
          <AllRuns
            runs={runs().filter((run) => flows().has(run.documentID))}
            flows={flows()}
            source={props.source}
            go={props.go}
          />
        </Match>
        <Match when={true}>
          <Show when={live().length}>
            <div class="wf-sub">
              <h3 class="mx-section">{copy.t("orchestra.workflows.live.title")}</h3>
              <span class="mx-meta">
                {copy.t("orchestra.workflows.live.meta", { waiting: waiting(), running: running() })}
              </span>
            </div>
            <div class="mx-table wf-attn">
              <For each={live()}>
                {(run) => <LiveRow run={run} flows={flows()} source={props.source} go={props.go} />}
              </For>
            </div>
          </Show>
          <Show
            when={props.source.list().length}
            fallback={
              <div class="mx-empty wf-empty">
                <strong>{copy.t("orchestra.workflows.empty.title")}</strong>
                {copy.t("orchestra.workflows.empty.body")}
                <br />
                <button type="button" class="mx-btn primary" onClick={() => props.go(relayPath.create("workflow"))}>
                  <Ic name="plus" />
                  {copy.t("orchestra.workflows.new")}
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
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
              <div class="wf-range" role="group" aria-label={copy.t("orchestra.workflows.filter.label")}>
                <For each={["all", "published", "draft"] as const}>
                  {(value) => (
                    <button type="button" aria-pressed={filter() === value} onClick={() => setFilter(value)}>
                      {copy.t(`orchestra.workflows.filter.${value}`)}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="wf-lhead" aria-hidden="true">
              <span />
              <span>{copy.t("orchestra.workflows.head.workflow")}</span>
              <span>{copy.t("orchestra.workflows.head.version")}</span>
              <span>{copy.t("orchestra.workflows.head.last")}</span>
              <span />
            </div>
            <Show when={shown().length} fallback={<p class="mx-empty">{copy.t("orchestra.workflows.noMatches")}</p>}>
              <div class="mx-table" role="list" aria-label={copy.t("orchestra.workflows.title")}>
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
                          <RunState run={lastRun(document.id)} flow={flow()} />
                        </div>
                        <div class="wf-actions" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            class="mx-btn icon"
                            aria-label={copy.t("orchestra.workflows.row.run", { name: document.name })}
                            title={copy.t(
                              document.activeVersionId
                                ? "orchestra.workflows.row.runTitle"
                                : "orchestra.workflows.row.publishFirst",
                            )}
                            disabled={!document.activeVersionId}
                            onClick={() => setDialog({ type: "run", document })}
                          >
                            <Ic name="play" />
                          </button>
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
          <div class="wf-sub" style={{ "margin-top": "30px" }}>
            <h3 class="mx-section">{copy.t("orchestra.workflows.templates.title")}</h3>
            <span class="mx-meta">{copy.t("orchestra.workflows.templates.meta")}</span>
          </div>
          <div class="wf-tpl-grid">
            <TemplateCard id="blank" flows={flows()} documents={props.source.list()} onPick={openTemplate} />
            <For each={props.source.list().slice(0, 5)}>
              {(document) => (
                <TemplateCard id={document.id} flows={flows()} documents={props.source.list()} onPick={openTemplate} />
              )}
            </For>
          </div>
        </Match>
      </Switch>
      <Show when={props.route.create && props.source.documents.isSuccess}>
        <CreateWorkflowDialog
          source={props.source}
          flows={flows()}
          initial={template() ?? templateID(props.source.list())}
          onClose={() => props.close(relayPath.library("workflow"))}
          onCreated={(id) => props.go(relayPath.editor("workflow", id))}
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
          current.type === "run" ? (
            <RunDialog
              document={current.document}
              source={props.source}
              onClose={() => setDialog(undefined)}
              onStarted={(run) => {
                setDialog(undefined)
                props.source.invalidate("runs")
                props.go(relayPath.history("workflow", current.document.id, run.runID))
              }}
            />
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
