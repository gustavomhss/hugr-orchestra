import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useCommand } from "@/context/command"
import { showToast } from "@/utils/toast"
import { skipToken, useQuery } from "@tanstack/solid-query"
import { createEffect, createMemo, createSignal, Match, on, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { MxPage } from "../chapters/kit"
import type { CanvasApi } from "./canvas"
import { hookOutputs } from "./catalog"
import { documentDiagnostics, type RelayDocument, RelayError, type RelayRun } from "./client"
import { DeleteDialog, failure, PublishDialog, RunDialog, ShortcutsDialog } from "./dialogs"
import { EditorHead, type SaveState } from "./editor-head"
import { CanvasTab } from "./editor-canvas"
import { Executions } from "./executions"
import { newestFirst, runHandle } from "./format"
import { documentFields, type Flow, flowFromDocument, issueNode, issues, layoutWorkflow } from "./graph"
import { HookActivity, TestDialog } from "./hook-activity"
import { issueText } from "./parts"
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
  const library = () => relayPath.library(props.route.kind)
  return (
    <Switch>
      <Match when={props.source.documents.isPending}>
        <p class="mx-empty" role="status" style={{ margin: "40px" }}>
          {copy.t("orchestra.workflows.loading")}
        </p>
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
  const kind = props.route.kind
  const server = () => props.source.list().find((item) => item.id === props.id)
  const [base, setBase] = createSignal(props.initial)
  const [flow, setFlow] = createSignal<Flow>(flowFromDocument(props.initial, kind))
  const [name, setName] = createSignal(props.initial.name)
  const [save, setSave] = createStore<SaveState>({ state: "saved", dirty: false, error: "" })
  const [selected, setSelected] = createSignal<string[]>([])
  const [dialog, setDialog] = createSignal<"publish" | "run" | "delete" | "keys" | "test">()
  const [test, setTest] = createSignal<{ path: string[]; result: string; label: string }>()
  const [install, setInstall] = createSignal(false)
  const outputs = () => (kind === "hook" ? hookOutputs(props.source.nodeTypes.data?.hook) : {})
  const found = createMemo(() => issues(flow(), documentDiagnostics(base())))
  const issueList = () => found().map((issue) => ({ text: issueText(copy, flow(), issue), node: issueNode(issue) }))
  const runs = () => (props.source.runs.data ?? []).filter((run) => run.documentID === props.id)
  const installed = () => (props.source.installs.data ?? []).find((item) => item.document === props.id)
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
          ? () => props.source.client.run(props.route.view!)
          : skipToken,
      retry: false,
    }),
    props.source.queryClient,
  )
  const overlayRun = (): RelayRun | undefined => {
    if (kind !== "workflow") return
    if (!props.route.view) return newestFirst(runs())[0]
    return runs().find((run) => run.runID === props.route.view) ?? viewed.data
  }
  const canPublish = () =>
    !found().length && !save.dirty && save.state === "saved" && base().activeVersionId !== base().versionId

  // Autosave: every edit marks the draft dirty and saves shortly after; a save in flight finishes first.
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = async () => {
    clearTimeout(timer)
    if (save.state === "saving" || !save.dirty || save.state === "conflict") return
    setSave({ state: "saving", dirty: false, error: "" })
    const result = await props.source.client.save(base(), { name: name(), ...documentFields(flow()) }).then(
      (document) => ({ document }),
      (error: unknown) => ({ error }),
    )
    if ("error" in result) {
      setSave({
        state: result.error instanceof RelayError && result.error.status === 409 ? "conflict" : "error",
        dirty: true,
        error: failure(result.error),
      })
      return
    }
    setBase(result.document)
    props.source
      .queryClient()
      .setQueryData(props.source.key("documents"), (list: RelayDocument[] | undefined) =>
        list?.map((item) => (item.id === result.document.id ? result.document : item)),
      )
    setSave("state", "saved")
    if (save.dirty) schedule()
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 600)
  }
  const edit = (next: Flow) => {
    setFlow(next)
    setSave({ dirty: true, state: save.state === "error" ? "saved" : save.state })
    schedule()
  }
  const rename = (value: string) => {
    setName(value)
    setSave({ dirty: true, state: save.state === "error" ? "saved" : save.state })
    schedule()
  }
  const reload = async () => {
    const fresh = await props.source.client.document(props.id).catch(() => undefined)
    if (!fresh) return
    setBase(fresh)
    setFlow(flowFromDocument(fresh, kind))
    setName(fresh.name)
    setSave({ state: "saved", dirty: false, error: "" })
  }
  onCleanup(() => {
    clearTimeout(timer)
    if (save.dirty && save.state !== "conflict")
      void props.source.client.save(base(), { name: name(), ...documentFields(flow()) }).then(
        () => props.source.invalidate("documents"),
        () => undefined,
      )
  })
  // A newer server version (another window, a publish) replaces the copy when nothing local is pending.
  createEffect(
    on(
      server,
      (document) => {
        if (!document || save.dirty || save.state === "saving") return
        if (document.versionId === base().versionId && document.activeVersionId === base().activeVersionId) return
        const changed = document.versionId !== base().versionId
        setBase(document)
        if (!changed) return
        setFlow(flowFromDocument(document, kind))
        setName(document.name)
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
    if (install()) return
    setInstall(true)
    const current = installed()
    const result = await (
      current ? props.source.client.enable(current.installID, next) : props.source.client.install(base())
    ).then(
      () => undefined,
      (error: unknown) => failure(error),
    )
    setInstall(false)
    props.source.invalidate("installs")
    if (result) showToast({ title: copy.t("orchestra.hooks.installFailed"), description: result })
  }

  const duplicate = async () => {
    const created = await props.source.client
      .create(copyDocument(base(), copy.t("orchestra.workflows.create.copyName", { name: name() })))
      .catch(
        (error: unknown) =>
          void showToast({ title: copy.t("orchestra.workflows.menu.duplicateFailed"), description: failure(error) }),
      )
    if (!created) return
    props.source.invalidate("documents")
    props.go(relayPath.editor(kind, created.id))
  }
  const download = async () => {
    const value = await props.source.client.definition(props.id).catch(() => undefined)
    const blob = new Blob([JSON.stringify(value ?? { name: name(), ...documentFields(flow()) }, null, 2)], {
      type: "application/json",
    })
    const link = window.document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${name().replace(/[^A-Za-z0-9_.-]+/g, "-") || "relay"}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }
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
    ...(kind === "workflow"
      ? [
          {
            label: copy.t("orchestra.workflows.menu.tidy"),
            icon: "workflows" as const,
            run: () => (edit(layoutWorkflow(flow())), queueMicrotask(() => api?.fit(true))),
          },
        ]
      : []),
    { label: copy.t("orchestra.workflows.menu.duplicate"), icon: "workflows", run: () => void duplicate() },
    { label: copy.t("orchestra.workflows.menu.download"), icon: "download", run: () => void download() },
    "-",
    { label: copy.t("orchestra.workflows.menu.delete"), icon: "trash", danger: true, run: () => setDialog("delete") },
  ]

  // Context actions in the command palette while this document is open.
  const command = useCommand()
  command.register("relay.editor", () => {
    const category = copy.t("orchestra.palette.relay")
    const editorTab = props.route.tab === "editor"
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
      ...(kind === "workflow"
        ? [
            {
              id: "relay.editor.run",
              title: copy.t("orchestra.workflows.run.title", { name: name() }),
              category,
              disabled: !base().activeVersionId,
              onSelect: () => setDialog("run"),
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
    if (event.defaultPrevented || window.document.querySelector("dialog[open]") || dialogs.active) return
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
    if (mod && event.key === "Enter" && kind === "workflow" && base().activeVersionId)
      return (event.preventDefault(), setDialog("run"))
    if (event.key === "?") return (event.preventDefault(), setDialog("keys"))
    if (props.route.tab !== "editor" || target?.closest(".wf-drawer") || mod) {
      if (mod && event.key.toLowerCase() === "a" && props.route.tab === "editor" && !target?.closest(".wf-drawer")) {
        event.preventDefault()
        setSelected(flow().nodes.map((node) => node.id))
      }
      return
    }
    const key = event.key
    if (key === "n" || key === "N") return (event.preventDefault(), props.go(relayPath.add(kind, props.id)))
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
        name={name()}
        tab={props.route.tab}
        runCount={kind === "workflow" ? runs().length : (decisions.data?.length ?? 0)}
        save={save}
        issues={issueList()}
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
        onRun={() => setDialog("run")}
        onTest={() => setDialog("test")}
        onInstall={(next) => void setInstalled(next)}
        onReload={() => void reload()}
      />
      <div class="wf-body">
        <Switch>
          <Match when={props.route.tab === "editor"}>
            <CanvasTab
              {...props}
              kind={kind}
              document={base()}
              flow={flow()}
              outputs={outputs()}
              issues={found()}
              selected={selected()}
              run={overlayRun()}
              runs={runs()}
              decision={(decisions.data ?? []).toSorted((a, b) => (b.at ?? 0) - (a.at ?? 0))[0]}
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
            />
          </Match>
          <Match when={kind === "workflow"}>
            <Executions
              document={base()}
              flow={flow()}
              runs={runs()}
              selected={props.route.run}
              source={props.source}
              go={props.go}
              onRun={() => setDialog("run")}
              onSelect={(run) => props.go(relayPath.history("workflow", props.id, run.runID))}
              onOpenStep={(run, wp) => props.go(relayPath.node("workflow", props.id, wp, run.runID))}
              onCanvas={(run) => props.go(relayPath.view(props.id, run.runID))}
              onSession={props.openSession}
            />
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
          <PublishDialog document={base()} flow={flow()} source={props.source} onClose={() => setDialog(undefined)} />
        </Match>
        <Match when={dialog() === "run"}>
          <RunDialog
            document={base()}
            source={props.source}
            onClose={() => setDialog(undefined)}
            onStarted={(run) => {
              setDialog(undefined)
              props.source.invalidate("runs")
              props.go(relayPath.history("workflow", props.id, run.runID))
            }}
          />
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
            outputs={outputs()}
            types={props.source.nodeTypes.data?.hook}
            onClose={() => setDialog(undefined)}
            onResult={(result) => {
              setDialog(undefined)
              setTest(result)
              if (props.route.node || props.route.tab !== "editor") props.go(relayPath.editor(kind, props.id))
            }}
          />
        </Match>
      </Switch>
    </div>
  )
}
