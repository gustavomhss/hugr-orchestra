import { useDialog } from "@orchestra/ui/context/dialog"
import { useCommand } from "@/context/command"
import { showToast } from "@/utils/toast"
import { skipToken, useQuery } from "@tanstack/solid-query"
import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from "solid-js"
import { MxPage } from "../chapters/kit"
import type { CanvasApi } from "./canvas"
import { hookOutputs } from "./catalog"
import { rememberDocument } from "./cache"
import { documentDiagnostics, type RelayDocument } from "./client"
import type { RelayRun } from "./runs"
import { createAction, DeleteDialog, failure, PublishDialog, ShortcutsDialog } from "./dialogs"
import { EditorHead } from "./editor-head"
import { openDraft, profileDrafts } from "./drafts"
import { CanvasTab } from "./editor-canvas"
import { Executions } from "./executions"
import { newestFirst, runHandle } from "./format"
import { documentFields, type Flow, flowFromDocument, issueNode, issues, layoutWorkflow } from "./graph"
import { HookActivity, TestDialog } from "./hook-activity"
import { HookQueryStatus } from "./hook-status"
import { runVersion } from "./history"
import { issueText } from "./parts"
import { RunsUnavailable } from "./library"
import { copyDocument } from "./presets"
import { layerBase, type RelayRoute, relayPath } from "./route"
import type { RelaySource } from "./source"
import { type MenuItem, useRelayCopy } from "./ui"

export type EditorProps = {
  source: RelaySource
  directory: string
  route: Extract<RelayRoute, { page: "editor" }>
  profile: string
  go: (path: string, replace?: boolean) => void
  close: (path: string) => void
  openSession: (sessionID: string) => void
  crumbs: (items: string[]) => void
}

export function Editor(props: EditorProps) {
  const copy = useRelayCopy()
  const document = () => props.source.list().find((item) => item.id === props.route.id)
    ?? profileDrafts(props.source).find((draft) => draft.state.base.id === props.route.id)?.state.base
  const library = () => relayPath.library(props.route.kind)
  return (
    <Switch>
      <Match when={props.source.documents.isPending && !document()}>
        <p class="mx-empty" role="status" style={{ margin: "40px" }}>
          {copy.t("orchestra.workflows.loading")}
        </p>
      </Match>
      <Match when={props.source.documents.isError && !document()}>
        <div class="mx-page">
          <p class="mx-error" role="alert">
            {copy.t("orchestra.workflows.error", { reason: failure(props.source.documents.error) })}
          </p>
          <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </div>
      </Match>
      <Match when={!document()}>
        <MxPage
          id="orchestra-relay-missing"
          title={copy.t(
            props.route.kind === "workflow" ? "orchestra.workflows.editor.missing" : "orchestra.hooks.editor.missing",
          )}
          description={copy.t("orchestra.workflows.editor.missingBody")}
        >
          <button type="button" class="mx-btn" onClick={() => props.go(library())}>
            {copy.t("orchestra.workflows.editor.back", {
              name: copy.t(props.route.kind === "workflow" ? "orchestra.workflows.title" : "orchestra.hooks.title"),
            })}
          </button>
        </MxPage>
      </Match>
      <Match when={document()?.id} keyed>
        {(id) => <Frame {...props} id={id} initial={document()!} />}
      </Match>
    </Switch>
  )
}

function Frame(props: EditorProps & { id: string; initial: RelayDocument }) {
  const copy = useRelayCopy()
  const dialogs = useDialog()
  const duplication = createAction()
  const exporting = createAction()
  const kind = props.route.kind
  const server = () => props.source.list().find((item) => item.id === props.id)
  const draft = openDraft(props.source, props.initial, kind)
  if (!draft) return (
    <MxPage id="relay-drafts-full" title={copy.t("orchestra.workflows.drafts.full")} description={copy.t("orchestra.workflows.drafts.resolve")}>
      <For each={profileDrafts(props.source)}>{(pending) => (
        <button type="button" class="mx-btn" onClick={() => props.go(relayPath.editor(pending.state.flow.kind, pending.state.base.id))}>
          {pending.state.name}
        </button>
      )}</For>
    </MxPage>
  )
  const base = () => draft.state.base
  const flow = () => draft.state.flow
  const name = () => draft.state.name
  const save = draft.state.save
  const edit = (next: Flow) => { if (!props.route.view) draft.edit(next) }
  const rename = (next: string) => { if (!props.route.view) draft.rename(next) }
  const flush = draft.flush
  const reload = draft.reload
  onCleanup(draft.release)
  const [selected, setSelected] = createSignal<string[]>([])
  const [dialog, setDialog] = createSignal<"publish" | "delete" | "keys" | "test">()
  const [test, setTest] = createSignal<{ path: string[]; result: string; label: string }>()
  const [install, setInstall] = createSignal(false)
  const outputs = () => (kind === "hook" ? hookOutputs(props.source.nodeTypes.data?.hook) : {})
  const found = createMemo(() => issues(flow(), [...documentDiagnostics(base())]))
  const issueList = () => found().map((issue) => ({ text: issueText(copy, flow(), issue), node: issueNode(issue) }))
  const runs = () => (props.source.runs.data ?? []).filter((run) => run.documentID === props.id)
  const installed = () => props.source.installs.isSuccess
    ? (props.source.installs.data ?? []).find((item) => item.document === props.id)
    : undefined
  const decisions = useQuery(() => {
    const current = installed()
    return {
      queryKey: props.source.key("decisions", current?.installID ?? ""),
      queryFn: current ? () => props.source.client.decisions(current.installID) : skipToken,
      retry: false,
    }
  }, props.source.queryClient)
  const viewed = useQuery(
    () => ({
      queryKey: props.source.key("run", props.route.view ?? ""),
      queryFn:
        props.route.view && !runs().some((run) => run.runID === props.route.view)
          ? () => props.source.runClient.run(props.route.view!)
          : skipToken,
      retry: false,
    }),
    props.source.queryClient,
  )
  const overlayRun = (): RelayRun | undefined => {
    if (kind !== "workflow") return
    if (!props.route.view) return newestFirst(runs())[0]
    const run = runs().find((run) => run.runID === props.route.view) ?? viewed.data
    return run?.documentID === props.id ? run : undefined
  }
  const frozen = useQuery(() => ({
    queryKey: props.source.key("run-version", props.id, overlayRun()?.versionID ?? String(overlayRun()?.version ?? "")),
    queryFn: overlayRun() ? () => runVersion(props.source.client, overlayRun()!) : skipToken,
    retry: false,
    staleTime: Infinity,
  }), props.source.queryClient)
  const frozenFlow = createMemo(() => frozen.data ? flowFromDocument(frozen.data, "workflow") : undefined)
  const canPublish = () =>
    !props.route.view && !found().length && !save.dirty && save.state === "saved" && base().activeVersionId !== base().versionId

  // A newer server version (another window, a publish) replaces the copy when nothing local is pending.
  createEffect(
    on(
      server,
      (document) => {
        if (document) draft.sync(document)
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const run =
      props.route.tab === "runs"
        ? props.route.run
          ? (runs().find((item) => item.runID === props.route.run) ?? { runID: props.route.run })
          : undefined
        : props.route.view
          ? { runID: props.route.view }
          : undefined
    const history = copy.t(kind === "workflow" ? "orchestra.workflows.tab.runs" : "orchestra.hooks.tab.activity")
    props.crumbs([
      name(),
      ...(props.route.tab === "runs" ? [history] : []),
      ...(run && kind === "workflow"
        ? [copy.t("orchestra.workflows.receipt.title", { id: runHandle(run.runID) })]
        : []),
    ])
  })

  const setInstalled = async (next: boolean) => {
    if (install() || !props.source.installs.isSuccess) return
    setInstall(true)
    const current = installed()
    const result = await (
      current ? props.source.client.enable(current.installID, next) : props.source.client.install(props.id)
    ).then(
      () => undefined,
      (error: unknown) => failure(error),
    )
    setInstall(false)
    props.source.invalidate("installs")
    if (result) showToast({ title: copy.t("orchestra.hooks.installFailed"), description: result })
  }

  const repin = async (installID: string) => {
    if (!props.source.installs.isSuccess) return
    const result = await props.source.client.update(installID).then(
      () => undefined,
      (error: unknown) => failure(error),
    )
    props.source.invalidate("installs")
    if (result) showToast({ title: copy.t("orchestra.hooks.installFailed"), description: result })
  }

  const duplicate = () =>
    duplication.run(async () => {
      const created = await props.source.client
        .create(copyDocument(base(), copy.t("orchestra.workflows.create.copyName", { name: name() })))
        .catch(
          (error: unknown) =>
            void showToast({ title: copy.t("orchestra.workflows.menu.duplicateFailed"), description: failure(error) }),
        )
      if (!created) return
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), created)
      props.go(relayPath.editor(kind, created.id))
    })
  const download = () => exporting.run(async () => {
    await flush()
    if (!draft.active()) return
    if (save.dirty || save.state !== "saved") throw new Error(save.error || copy.t("orchestra.workflows.export.unsaved"))
    const version = base().versionId
    const value = await props.source.client.definition(props.id)
    if (!value || !draft.active()) return
    if (save.dirty || save.state !== "saved" || base().versionId !== version)
      throw new Error(copy.t("orchestra.workflows.export.unsaved"))
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    })
    const link = window.document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${name().replace(/[^A-Za-z0-9_.-]+/g, "-") || "relay"}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  })
  let api: CanvasApi | undefined
  let canvasKeys: ((event: KeyboardEvent) => void) | undefined
  const menu = (): MenuItem[] => [
    {
      label: copy.t("orchestra.workflows.menu.fit"),
      icon: "fit",
      disabled: props.route.tab !== "editor",
      run: () => api?.fit(true),
    },
    { label: copy.t("orchestra.workflows.keys.title"), icon: "keys", run: () => setDialog("keys") },
    ...(!props.route.view ? [
    ...(kind === "workflow"
      ? [
          {
            label: copy.t("orchestra.workflows.menu.tidy"),
            icon: "workflows" as const,
            run: () => (edit(layoutWorkflow(flow())), queueMicrotask(() => api?.fit(true))),
          },
        ]
      : []),
    {
      label: copy.t("orchestra.workflows.menu.duplicate"),
      icon: "workflows",
      disabled: duplication.busy(),
      run: () => void duplicate(),
    },
    { label: copy.t("orchestra.workflows.menu.download"), icon: "download", disabled: exporting.busy(), run: () => void download() },
    "-",
    { label: copy.t("orchestra.workflows.menu.delete"), icon: "trash", danger: true, run: () => setDialog("delete") },
    ] satisfies MenuItem[] : []),
  ]

  // Context actions in the command palette while this document is open.
  const command = useCommand()
  command.register("relay.editor", () => {
    const category = copy.t("orchestra.palette.relay")
    const editorTab = props.route.tab === "editor" && !props.route.view
    return [
      ...(editorTab
        ? [
            {
              id: "relay.editor.add",
              title: copy.t(kind === "workflow" ? "orchestra.workflows.add.title" : "orchestra.hooks.add.title"),
              category,
              onSelect: () => props.go(relayPath.add(kind, props.id)),
            },
            {
              id: "relay.editor.fit",
              title: copy.t("orchestra.workflows.menu.fit"),
              category,
              onSelect: () => api?.fit(true),
            },
          ]
        : []),
      {
        id: "relay.editor.publish",
        title: copy.t("orchestra.palette.publish", { name: name() }),
        category,
        disabled: !canPublish(),
        onSelect: () => setDialog("publish"),
      },
      {
        id: "relay.editor.tab",
        title: copy.t(
          editorTab
            ? kind === "workflow"
              ? "orchestra.palette.showExecutions"
              : "orchestra.palette.showActivity"
            : "orchestra.palette.showEditor",
        ),
        category,
        onSelect: () => props.go(editorTab ? relayPath.history(kind, props.id) : relayPath.editor(kind, props.id)),
      },
    ]
  })

  const closeLayer = () => props.close(layerBase(props.route))
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || window.document.querySelector('[role="dialog"][data-component="relay-modal"]') || dialogs.active) return
    const target = event.target instanceof HTMLElement ? event.target : undefined
    const typing = !!target?.closest("input,textarea,select,[contenteditable]")
    const mod = event.metaKey || event.ctrlKey
    if (event.key === "Escape") {
      if (props.route.node) return (event.preventDefault(), closeLayer())
      if (props.route.add && (!typing || target?.closest(".wf-drawer"))) return (event.preventDefault(), closeLayer())
      if (typing) return target?.blur()
      if (test()) return setTest(undefined)
      if (selected().length) return setSelected([])
      return
    }
    if (typing || props.route.node) return
    if (event.key === "?") return (event.preventDefault(), setDialog("keys"))
    if (props.route.tab !== "editor" || target?.closest(".wf-drawer") || mod) {
      if (mod && event.key.toLowerCase() === "a" && props.route.tab === "editor" && !target?.closest(".wf-drawer")) {
        event.preventDefault()
        setSelected(flow().nodes.map((node) => node.id))
      }
      return
    }
    const key = event.key
    if (!props.route.view && (key === "n" || key === "N")) return (event.preventDefault(), props.go(relayPath.add(kind, props.id)))
    if (key === "1") return api?.fit(true)
    if (key === "0") return api?.zoomTo(1)
    if (key === "+" || key === "=") return api?.zoomBy(1.2)
    if (key === "-" || key === "_") return api?.zoomBy(1 / 1.2)
    canvasKeys?.(event)
  }
  onMount(() => window.addEventListener("keydown", keydown))
  onCleanup(() => window.removeEventListener("keydown", keydown))

  return (
    <div class="wf-editor" data-component="relay-editor" data-kind={kind}>
      <EditorHead
        kind={kind}
        document={base()}
        name={props.route.view ? frozen.data?.name ?? name() : name()}
        readOnly={!!props.route.view}
        tab={props.route.tab}
        runCount={
          kind === "workflow"
            ? props.source.runsState() === "ready"
              ? runs().length
              : undefined
            : props.source.installs.isSuccess && (!installed() || decisions.isSuccess)
              ? (decisions.data?.length ?? 0)
              : undefined
        }
        installExists={!!installed()}
        installKnown={props.source.installs.isSuccess}
        save={save}
        issues={props.route.view ? [] : issueList()}
        canPublish={canPublish()}
        installed={!!installed()?.enabled}
        installBusy={install()}
        menu={menu()}
        go={props.go}
        onRename={rename}
        onIssue={(node) => {
          if (!node) return
          if (props.route.tab !== "editor") props.go(relayPath.editor(kind, props.id))
          setSelected([node])
          queueMicrotask(() => api?.center(node))
        }}
        onPublish={() => setDialog("publish")}
        onTest={() => setDialog("test")}
        onInstall={(next) => void setInstalled(next)}
        onReload={() => void reload()}
        onRetry={() => void flush()}
      />
      <div class="wf-body">
        <Show when={exporting.error()}>
          <div class="wf-alert" role="alert" data-slot="relay-export-error">
            <strong>{copy.t("orchestra.workflows.export.failed")}</strong>
            <span>{exporting.error()}</span>
          </div>
        </Show>
        <Show when={kind === "hook" && !props.source.installs.isSuccess}>
          <HookQueryStatus kind="installs" query={props.source.installs} />
        </Show>
        <Show when={kind === "hook" && installed() && !decisions.isSuccess}>
          <HookQueryStatus kind="activity" query={decisions} />
        </Show>
        <Switch>
          <Match when={props.route.view && !frozenFlow()}>
            <div class="mx-page" data-slot="relay-history-unavailable">
              <p role={viewed.isError || frozen.isError ? "alert" : "status"}>
                {copy.t(viewed.isError || frozen.isError
                  ? "orchestra.workflows.history.error"
                  : (!overlayRun() && viewed.isPending) || (overlayRun() && frozen.isPending)
                    ? "orchestra.workflows.history.loading"
                    : "orchestra.workflows.history.unavailable")}
              </p>
              <Show when={viewed.isError || frozen.isError}>
                <button type="button" class="mx-btn" onClick={() => void (viewed.isError ? viewed.refetch() : frozen.refetch())}>{copy.t("orchestra.workflows.retry")}</button>
              </Show>
              <button type="button" class="mx-btn" onClick={() => props.go(relayPath.editor(kind, props.id))}>{copy.t("orchestra.workflows.history.back")}</button>
            </div>
          </Match>
          <Match when={props.route.tab === "editor"}>
            <CanvasTab
              {...props}
              kind={kind}
              document={base()}
              flow={props.route.view ? frozenFlow()! : flow()}
              frozen={frozenFlow()}
              readOnly={!!props.route.view}
              outputs={outputs()}
              issues={props.route.view ? issues(frozenFlow()!, [...(frozen.data?.meta.relay?.diagnostics ?? [])]) : found()}
              selected={selected()}
              run={overlayRun()}
              runs={runs()}
              decision={decisions.isSuccess ? decisions.data.toSorted((a, b) => b.seq - a.seq)[0] : undefined}
              decisionKnown={props.source.installs.isSuccess && (!installed() || decisions.isSuccess)}
              decisionStatus={!props.source.installs.isSuccess
                ? { kind: "installs", query: props.source.installs }
                : installed() && !decisions.isSuccess ? { kind: "activity", query: decisions } : undefined}
              installExists={!!installed()}
              installed={installed()?.enabled ? installed() : undefined}
              test={test()}
              save={save}
              edit={edit}
              select={setSelected}
              api={(value) => (api = value)}
              keys={(handler) => (canvasKeys = handler)}
              onKeys={() => setDialog("keys")}
              onTest={() => setDialog("test")}
              onClearTest={() => setTest(undefined)}
              onUpdateInstall={(installID) => void repin(installID)}
              onRetry={() => void flush()}
              onReload={() => void reload()}
            />
          </Match>
          <Match when={kind === "workflow" && props.source.runsState() !== "ready"}>
            <div class="mx-page">
              <div class="mx-inner" style={{ "padding-top": "28px" }}>
                <RunsUnavailable source={props.source} />
              </div>
            </div>
          </Match>
          <Match when={kind === "workflow"}>
            <Executions
              document={base()}
              flow={flow()}
              runs={runs()}
              selected={props.route.run}
              source={props.source}
              go={props.go}
              onSelect={(run) => props.go(relayPath.history("workflow", props.id, run.runID))}
              onOpenStep={(run, wp) => props.go(relayPath.node("workflow", props.id, wp, run.runID))}
              onCanvas={(run) => props.go(relayPath.view(props.id, run.runID))}
              onSession={props.openSession}
            />
          </Match>
          <Match when={kind === "hook" && (!props.source.installs.isSuccess || (installed() && !decisions.isSuccess))}>
            <></>
          </Match>
          <Match when={true}>
            <HookActivity
              decisions={decisions.data ?? []}
              loading={decisions.isPending && !!installed()}
              installed={!!installed()}
              flow={flow()}
              profile={props.profile}
            />
          </Match>
        </Switch>
      </div>
      <Switch>
        <Match when={dialog() === "publish"}>
          <PublishDialog document={base()} flow={flow()} source={props.source} active={draft.active}
            retain={() => { draft.acquire(); return draft.release }} onClose={() => setDialog(undefined)} />
        </Match>
        <Match when={dialog() === "delete"}>
          <DeleteDialog
            document={base()}
            kind={kind}
            source={props.source}
            onClose={() => setDialog(undefined)}
            onDeleted={() => props.go(relayPath.library(kind))}
          />
        </Match>
        <Match when={dialog() === "keys"}>
          <ShortcutsDialog onClose={() => setDialog(undefined)} />
        </Match>
        <Match when={dialog() === "test"}>
          <TestDialog
            flow={flow()}
            types={props.source.nodeTypes.data?.hook}
            onClose={() => setDialog(undefined)}
            onResult={(result) => {
              setDialog(undefined)
              setTest(result)
              if (props.route.tab !== "editor") props.go(relayPath.editor(kind, props.id))
            }}
          />
        </Match>
      </Switch>
    </div>
  )
}
