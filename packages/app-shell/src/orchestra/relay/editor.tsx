import { useDialog } from "@orchestra/ui/context/dialog"
import { useLocation } from "@solidjs/router"
import { useCommand } from "@/context/command"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { modalActive } from "@/utils/modal-active"
import { skipToken, useQuery } from "@tanstack/solid-query"
import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from "solid-js"
import { MxPage } from "../chapters/kit"
import type { CanvasApi } from "./canvas"
import { hookOutputs } from "./catalog"
import { rememberDocument } from "./cache"
import { documentDiagnostics, type RelayDocument } from "./client"
import type { RelayRun } from "./runs"
import { ConfirmDialog, createAction, DeleteDialog, failure, PublishDialog, ShortcutsDialog } from "./dialogs"
import { EditorHead } from "./editor-head"
import { DraftScope, openDraft, profileDrafts } from "./drafts"
import { CanvasTab } from "./editor-canvas"
import { Executions } from "./executions"
import { newestFirst, runHandle } from "./format"
import { documentFields, emptiedPhases, type Flow, flowFromDocument, issueNode, issues, layoutWorkflow } from "./graph"
import { workflowFile } from "./import"
import { HookActivity, TestDialog } from "./hook-activity"
import { installNotice, refreshInstalls } from "./hook-install"
import { HookQueryStatus } from "./hook-status"
import { runVersion } from "./history"
import { issueText } from "./parts"
import { RunsUnavailable } from "./library"
import { copyDocument } from "./presets"
import { useWorkflowChat } from "./chat"
import { layerBase, type RelayRoute, relayPath } from "./route"
import { SERVER_ISSUES } from "./server-issues"
import { StudioScope } from "./studio"
import type { RelaySource } from "./source"
import { Ic, type MenuItem, useRelayCopy } from "./ui"

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

const DRAFT_REASON = {
  error: "orchestra.workflows.drafts.reason.error",
  conflict: "orchestra.workflows.drafts.reason.conflict",
  saving: "orchestra.workflows.drafts.reason.saving",
  saved: "orchestra.workflows.drafts.reason.unsaved",
} as const

export function Editor(props: EditorProps) {
  const copy = useRelayCopy()
  const document = () =>
    props.source.list().find((item) => item.id === props.route.id) ??
    profileDrafts(props.source).find((draft) => draft.state.base.id === props.route.id)?.state.base
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
  const serverSDK = useServerSDK()
  const duplication = createAction(useLocation())
  const exporting = createAction()
  const kind = props.route.kind
  const server = () => props.source.list().find((item) => item.id === props.id)
  const draft = openDraft(props.source, props.initial, kind)
  if (!draft)
    return (
      <MxPage
        id="relay-drafts-full"
        title={copy.t("orchestra.workflows.drafts.full")}
        description={copy.t("orchestra.workflows.drafts.resolve")}
      >
        <For each={profileDrafts(props.source)}>
          {(pending) => (
            <button
              type="button"
              class="mx-btn"
              onClick={() => props.go(relayPath.editor(pending.state.flow.kind, pending.state.base.id))}
            >
              {pending.state.name}
              <small class="wf-draft-reason">{copy.t(DRAFT_REASON[pending.state.save.state])}</small>
            </button>
          )}
        </For>
        <button type="button" class="mx-btn" onClick={() => props.go(relayPath.library(kind))}>
          {copy.t("orchestra.workflows.editor.back", {
            name: copy.t(kind === "workflow" ? "orchestra.workflows.title" : "orchestra.hooks.title"),
          })}
        </button>
      </MxPage>
    )
  const base = () => draft.state.base
  const flow = () => draft.state.flow
  const name = () => draft.state.name
  const description = () => draft.state.description
  const save = draft.state.save
  // A phase left without steps is not kept, and its instructions go with it, so an edit that would do that asks first.
  const [emptying, setEmptying] = createSignal<{ flow: Flow; names: string }>()
  const edit = (next: Flow) => {
    if (props.route.view) return
    const lost = emptiedPhases(flow(), next)
    if (!lost.length) return draft.edit(next)
    setEmptying({ flow: next, names: lost.map((phase) => phase.name).join("”, “") })
  }
  // The selection may name nodes that the step removed.
  const travel = (step: () => void) => {
    if (props.route.view) return
    step()
    setSelected((ids) => ids.filter((id) => flow().nodes.some((node) => node.id === id)))
  }
  const undo = () => travel(draft.undo)
  const redo = () => travel(draft.redo)
  const rename = (next: string) => {
    if (!props.route.view) draft.rename(next)
  }
  const describe = (next: string) => {
    if (!props.route.view) draft.describe(next)
  }
  const flush = draft.flush
  const reload = draft.reload
  onCleanup(draft.release)
  const [selected, setSelected] = createSignal<string[]>([])
  const [dialog, setDialog] = createSignal<"publish" | "unpublish" | "revert" | "delete" | "keys" | "test">()
  const [test, setTest] = createSignal<{ path: string[]; result: string; label: string }>()
  const [install, setInstall] = createSignal(false)
  const outputs = () =>
    kind === "hook" ? hookOutputs(props.source.nodeTypes.isSuccess ? props.source.nodeTypes.data.hook : undefined) : {}
  // A workflow from a shipped profile whose tools are missing cannot run, so Publish stays off for it.
  const unrunnable = () => kind === "workflow" && base().runnable === false
  // The skills a step can name. Skills are read when Maestro runs the workflow, so one that is gone stops the step.
  const skills = useQuery(
    () => ({
      queryKey: props.source.key("skills"),
      queryFn:
        kind === "workflow"
          ? () =>
              serverSDK()
                .currentApi.skill.list({ location: { directory: props.directory } })
                .then((result) => result.data.map((skill) => skill.name))
          : skipToken,
      retry: false,
      staleTime: 60_000,
    }),
    props.source.queryClient,
  )
  const found = createMemo(() =>
    issues(
      flow(),
      [...(unrunnable() ? [copy.t("orchestra.workflows.editor.notRunnable")] : []), ...documentDiagnostics(base())],
      skills.isSuccess ? skills.data : undefined,
    ),
  )
  const issueList = () => {
    const codes = new Set<string>(found().map((issue) => issue.code))
    return found().flatMap((issue): { text: string; node?: string }[] => {
      if (issue.code !== "server") return [{ text: issueText(copy, flow(), issue), node: issueNode(issue) }]
      const known = SERVER_ISSUES.find((entry) => entry.match.test(issue.text))
      if (!known) return [{ text: issue.text }]
      if (known.covered?.some((code) => codes.has(code))) return []
      return [{ text: copy.t(known.key) }]
    })
  }
  // The server's words for a draft that cannot be used yet, in plain copy where there is some.
  const plain = (text: string) => {
    const known = SERVER_ISSUES.find((entry) => entry.match.test(text))
    return known ? copy.t(known.key) : text
  }
  const runs = () =>
    (props.source.runs.isSuccess ? props.source.runs.data : []).filter((run) => run.documentID === props.id)
  const installed = () =>
    props.source.installs.isSuccess
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
    const run = runs().find((run) => run.runID === props.route.view) ?? (viewed.isSuccess ? viewed.data : undefined)
    return run?.documentID === props.id ? run : undefined
  }
  const frozen = useQuery(
    () => ({
      queryKey: props.source.key(
        "run-version",
        props.id,
        overlayRun()?.versionID ?? String(overlayRun()?.version ?? ""),
      ),
      queryFn: overlayRun() ? () => runVersion(props.source.client, overlayRun()!) : skipToken,
      retry: false,
      staleTime: Infinity,
    }),
    props.source.queryClient,
  )
  // A query without data suspends the shell's Suspense when its `data` is read, and its options change on every runs
  // poll, so every read here goes through `isSuccess` or the page would redraw and drop focus every ten seconds.
  const frozenDocument = () => (frozen.isSuccess ? frozen.data : undefined)
  const frozenFlow = createMemo(() => {
    const document = frozenDocument()
    return document ? flowFromDocument(document, "workflow") : undefined
  })
  // Nothing to discard when the draft already says what the published version says.
  const sameAsPublished = () => {
    const version = base().activeVersion
    if (!version) return false
    return (
      version.name === name() &&
      (version.description ?? "") === description() &&
      JSON.stringify(documentFields(flow())) === JSON.stringify(documentFields(flowFromDocument(version, kind)))
    )
  }
  const clean = () => !save.dirty && save.state === "saved"
  const canPublish = () =>
    !props.route.view && !found().length && clean() && base().activeVersionId !== base().versionId
  const canDiscard = () =>
    !props.route.view && !!base().activeVersionId && base().activeVersionId !== base().versionId && !sameAsPublished()
  // Dialogs act on the saved version, so pending edits (a rename just committed, say) reach the server first.
  const openPublish = async () => {
    await flush()
    if (canPublish()) setDialog("publish")
  }
  const openUnpublish = async () => {
    await flush()
    if (clean()) setDialog("unpublish")
  }

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
    const failed = await (
      current ? props.source.client.enable(current.installID, next) : props.source.client.install(props.id)
    ).then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    // The switch stays locked until the refreshed list lands; a click before then would install again.
    await refreshInstalls(props.source)
    setInstall(false)
    if (failed) installNotice(copy, current && !next ? "pause" : "install", failed.error)
  }

  const repin = async (installID: string) => {
    if (!props.source.installs.isSuccess) return
    const failed = await props.source.client.update(installID).then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    props.source.invalidate("installs")
    if (failed) installNotice(copy, "update", failed.error)
  }

  const openChat = useWorkflowChat(props.directory, copy.t)

  const unpublish = () => {
    draft.acquire()
    return props.source.client
      .unpublish(base())
      .then((item) => rememberDocument(props.source.queryClient(), props.source.key("documents"), item, draft.active))
      .then(() => kind === "hook" && props.source.invalidate("installs"))
      .finally(draft.release)
  }

  // Goes through the draft like any edit, so it saves as usual and Undo brings the discarded changes back.
  const revert = () => {
    const version = base().activeVersion
    if (!version) return
    if (version.name !== name()) rename(version.name)
    if ((version.description ?? "") !== description()) describe(version.description ?? "")
    edit(flowFromDocument(version, kind))
    setSelected([])
  }

  const duplicate = () =>
    duplication.run(async (current) => {
      await flush()
      // Copy what is on screen, even when the last save did not go through.
      const created = await props.source.client
        .create(
          copyDocument(
            { ...base(), description: description(), ...documentFields(flow()) },
            copy.t("orchestra.workflows.create.copyName", { name: name() }),
          ),
        )
        .catch(
          (error: unknown) =>
            void showToast({ title: copy.t("orchestra.workflows.menu.duplicateFailed"), description: failure(error) }),
        )
      if (!created) return
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), created)
      if (!current()) return
      props.go(relayPath.editor(kind, created.id))
    })
  const download = () =>
    exporting.run(async () => {
      await flush()
      if (!draft.active()) return
      if (save.dirty || save.state !== "saved")
        throw new Error(save.error || copy.t("orchestra.workflows.export.unsaved"))
      const version = base().versionId
      const value =
        kind === "workflow"
          ? workflowFile({ ...base(), description: description(), ...documentFields(flow()) })
          : await props.source.client.definition(props.id)
      if (!value || !draft.active()) return
      if (save.dirty || save.state !== "saved" || base().versionId !== version)
        throw new Error(copy.t("orchestra.workflows.export.unsaved"))
      const blob = new Blob([JSON.stringify(value, null, 2)], {
        type: "application/json",
      })
      const link = window.document.createElement("a")
      link.href = URL.createObjectURL(blob)
      // A name with no ASCII letters or digits would leave nothing but dashes.
      const stem = name()
        .replace(/[^A-Za-z0-9_.-]+/g, "-")
        .replace(/^-+|-+$/g, "")
      link.download = `${/[A-Za-z0-9]/.test(stem) ? stem : "relay"}.json`
      link.click()
      URL.revokeObjectURL(link.href)
    })
  let api: CanvasApi | undefined
  let canvasKeys: ((event: KeyboardEvent) => void) | undefined
  // Notices sit above the canvas. The canvas fits itself once, when it is first measured; a notice that comes or goes
  // resizes it afterwards, so it is fitted again once the browser has laid the new size out.
  const noticed = () =>
    !!exporting.error() ||
    (kind === "hook" && (!props.source.installs.isSuccess || (!!installed() && !decisions.isSuccess)))
  let frame: number | undefined
  createEffect(
    on(
      noticed,
      () => {
        if (props.route.tab !== "editor") return
        if (frame !== undefined) cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => api?.fit())))
      },
      { defer: true },
    ),
  )
  onCleanup(() => frame !== undefined && cancelAnimationFrame(frame))
  const menu = (): MenuItem[] => [
    {
      label: copy.t("orchestra.workflows.menu.fit"),
      icon: "fit",
      disabled: props.route.tab !== "editor",
      run: () => api?.fit(true),
    },
    { label: copy.t("orchestra.workflows.keys.title"), icon: "keys", run: () => setDialog("keys") },
    ...(!props.route.view
      ? ([
          {
            label: copy.t("orchestra.workflows.menu.undo"),
            disabled: props.route.tab !== "editor" || !draft.canUndo(),
            run: undo,
          },
          {
            label: copy.t("orchestra.workflows.menu.redo"),
            disabled: props.route.tab !== "editor" || !draft.canRedo(),
            run: redo,
          },
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
          {
            label: copy.t("orchestra.workflows.menu.download"),
            icon: "download",
            disabled: exporting.busy(),
            run: () => void download(),
          },
          "-",
          ...(canDiscard()
            ? [{ label: copy.t("orchestra.workflows.editor.discardChanges"), run: () => setDialog("revert") }]
            : []),
          ...(base().activeVersionId
            ? [{ label: copy.t("orchestra.workflows.editor.unpublish"), run: () => void openUnpublish() }]
            : []),
          ...(canDiscard() || base().activeVersionId ? ["-" as const] : []),
          {
            label: copy.t("orchestra.workflows.menu.delete"),
            icon: "trash",
            danger: true,
            run: () => setDialog("delete"),
          },
        ] satisfies MenuItem[])
      : []),
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
        onSelect: () => void openPublish(),
      },
      // Workflow runs are hidden until the server has run routes, so only a hook has a second tab to switch to.
      ...(kind === "hook"
        ? [
            {
              id: "relay.editor.tab",
              title: copy.t(editorTab ? "orchestra.palette.showActivity" : "orchestra.palette.showEditor"),
              category,
              onSelect: () =>
                props.go(editorTab ? relayPath.history(kind, props.id) : relayPath.editor(kind, props.id)),
            },
          ]
        : []),
    ]
  })

  const closeLayer = () => props.close(layerBase(props.route))
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || modalActive() || dialogs.active) return
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
    // Undo and redo also work with the step dialog open, while no text field (with its own undo) has focus.
    if (typing || (props.route.node && !(mod && /^[yz]$/i.test(event.key)))) return
    // The single-character keys (? N 1 0 + -) act only while focus is on the canvas, so dictation or typing meant for
    // another control never triggers them (WCAG 2.1.4).
    const onCanvas = !!target?.closest(".wf-canvas")
    if (event.key === "?" && onCanvas) return (event.preventDefault(), setDialog("keys"))
    if (props.route.tab !== "editor" || target?.closest(".wf-drawer") || mod) {
      if (mod && props.route.tab === "editor" && !target?.closest(".wf-drawer")) {
        const letter = event.key.toLowerCase()
        if (letter === "a") {
          event.preventDefault()
          setSelected(flow().nodes.map((node) => node.id))
        }
        // Text fields returned above, so they keep their own native undo.
        if (letter === "z" && !event.altKey) return (event.preventDefault(), event.shiftKey ? redo() : undo())
        if (letter === "y" && event.ctrlKey && !event.altKey) return (event.preventDefault(), redo())
      }
      return
    }
    const key = onCanvas ? event.key : ""
    if (!props.route.view && (key === "n" || key === "N"))
      return (event.preventDefault(), props.go(relayPath.add(kind, props.id)))
    if (key === "1") return api?.fit(true)
    if (key === "0") return api?.zoomTo(1)
    if (key === "+" || key === "=") return api?.zoomBy(1.2)
    if (key === "-" || key === "_") return api?.zoomBy(1 / 1.2)
    canvasKeys?.(event)
  }
  onMount(() => window.addEventListener("keydown", keydown))
  onCleanup(() => window.removeEventListener("keydown", keydown))

  return (
    <DraftScope draft={draft} go={props.go}>
      <div class="wf-editor" data-component="relay-editor" data-kind={kind}>
        <EditorHead
          kind={kind}
          document={base()}
          name={props.route.view ? (frozenDocument()?.name ?? name()) : name()}
          readOnly={!!props.route.view}
          tab={props.route.tab}
          runCount={
            kind === "workflow"
              ? props.source.runsState() === "ready"
                ? runs().length
                : undefined
              : props.source.installs.isSuccess && (!installed() || decisions.isSuccess)
                ? decisions.isSuccess
                  ? decisions.data.length
                  : 0
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
            // A row about a step opens that step; one about the workflow as a whole opens the Add panel.
            if (!node) return props.go(relayPath.add(kind, props.id))
            props.go(relayPath.node(kind, props.id, node))
            setSelected([node])
            queueMicrotask(() => api?.center(node))
          }}
          onPublish={() => void openPublish()}
          onRun={() => openChat("run", base())}
          onUseInChat={() => openChat("use", base())}
          onTest={() => setDialog("test")}
          onInstall={(next) => void setInstalled(next)}
          onReload={() => void reload()}
          onRetry={() => void flush()}
        />
        <div class="wf-body">
          <Show when={noticed()}>
            <div class="wf-notices">
              <Show when={exporting.error()}>
                {(message) => (
                  <div class="wf-alert wf-notice" role="alert" data-slot="relay-export-error">
                    <Ic name="warn" />
                    <div>
                      <strong>{copy.t("orchestra.workflows.export.failed")}</strong>
                      <span>{plain(message())}</span>
                    </div>
                    <button
                      type="button"
                      class="mx-btn icon"
                      aria-label={copy.t("orchestra.workflows.dialog.close")}
                      title={copy.t("orchestra.workflows.dialog.close")}
                      onClick={() => exporting.setError(undefined)}
                    >
                      <Ic name="close" />
                    </button>
                  </div>
                )}
              </Show>
              <Show when={kind === "hook" && !props.source.installs.isSuccess}>
                <HookQueryStatus kind="installs" query={props.source.installs} />
              </Show>
              <Show when={kind === "hook" && installed() && !decisions.isSuccess}>
                <HookQueryStatus kind="activity" query={decisions} />
              </Show>
            </div>
          </Show>
          <div class="wf-stage">
            <Switch>
              <Match when={props.route.view && !frozenFlow()}>
                <div class="mx-page" data-slot="relay-history-unavailable">
                  <p role={viewed.isError || frozen.isError ? "alert" : "status"}>
                    {copy.t(
                      viewed.isError || frozen.isError
                        ? "orchestra.workflows.history.error"
                        : (!overlayRun() && viewed.isPending) || (overlayRun() && frozen.isPending)
                          ? "orchestra.workflows.history.loading"
                          : "orchestra.workflows.history.unavailable",
                    )}
                  </p>
                  <Show when={viewed.isError || frozen.isError}>
                    <button
                      type="button"
                      class="mx-btn"
                      onClick={() => void (viewed.isError ? viewed.refetch() : frozen.refetch())}
                    >
                      {copy.t("orchestra.workflows.retry")}
                    </button>
                  </Show>
                  <button type="button" class="mx-btn" onClick={() => props.go(relayPath.editor(kind, props.id))}>
                    {copy.t("orchestra.workflows.history.back")}
                  </button>
                </div>
              </Match>
              <Match when={props.route.tab === "editor"}>
                <StudioScope
                  source={props.source}
                  id={props.id}
                  enabled={kind === "workflow" && !props.route.view}
                  fields={() => ({ name: name(), description: description(), ...documentFields(flow()) })}
                >
                <CanvasTab
                  {...props}
                  kind={kind}
                  document={base()}
                  flow={props.route.view ? frozenFlow()! : flow()}
                  frozen={frozenFlow()}
                  description={props.route.view ? (frozenDocument()?.description ?? "") : description()}
                  readOnly={!!props.route.view || save.state === "conflict"}
                  outputs={outputs()}
                  issues={
                    props.route.view
                      ? issues(frozenFlow()!, [...(frozenDocument()?.meta.relay?.diagnostics ?? [])])
                      : found()
                  }
                  selected={selected()}
                  run={overlayRun()}
                  runs={runs()}
                  skills={{
                    names: skills.isSuccess ? skills.data : undefined,
                    error: skills.isError,
                    retry: () => void skills.refetch(),
                  }}
                  decision={decisions.isSuccess ? decisions.data.toSorted((a, b) => b.seq - a.seq)[0] : undefined}
                  decisionKnown={props.source.installs.isSuccess && (!installed() || decisions.isSuccess)}
                  decisionStatus={
                    !props.source.installs.isSuccess
                      ? { kind: "installs", query: props.source.installs }
                      : installed() && !decisions.isSuccess
                        ? { kind: "activity", query: decisions }
                        : undefined
                  }
                  installExists={!!installed()}
                  installed={installed()?.enabled ? installed() : undefined}
                  test={test()}
                  save={save}
                  edit={edit}
                  describe={describe}
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
                </StudioScope>
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
              <Match
                when={kind === "hook" && (!props.source.installs.isSuccess || (installed() && !decisions.isSuccess))}
              >
                <></>
              </Match>
              <Match when={true}>
                <HookActivity
                  decisions={decisions.isSuccess ? decisions.data : []}
                  loading={decisions.isPending && !!installed()}
                  installed={!!installed()}
                  flow={flow()}
                  profile={props.profile}
                />
              </Match>
            </Switch>
          </div>
        </div>
        <Show when={emptying()}>
          {(pending) => (
            <ConfirmDialog
              title={copy.t("orchestra.workflows.phaseEmpty.title", { name: pending().names })}
              body={copy.t("orchestra.workflows.phaseEmpty.body")}
              confirm={copy.t("orchestra.workflows.phaseEmpty.confirm")}
              onConfirm={() => draft.edit(pending().flow)}
              onClose={() => setEmptying(undefined)}
            />
          )}
        </Show>
        <Switch>
          <Match when={dialog() === "publish"}>
            <PublishDialog
              document={base()}
              flow={flow()}
              source={props.source}
              active={draft.active}
              install={kind === "hook" ? installed()?.installID : undefined}
              retain={() => {
                draft.acquire()
                return draft.release
              }}
              onClose={() => setDialog(undefined)}
              onPublished={(item) => {
                if (kind !== "workflow") return
                showToast({
                  variant: "success",
                  title: copy.t("orchestra.workflows.publish.done", { name: item.name }),
                  actions: [
                    { label: copy.t("orchestra.workflows.editor.useInChat"), onClick: () => openChat("use", item) },
                  ],
                })
              }}
            />
          </Match>
          <Match when={dialog() === "unpublish"}>
            <ConfirmDialog
              title={copy.t("orchestra.workflows.unpublish.title", { name: name() })}
              body={copy.t(kind === "hook" ? "orchestra.hooks.unpublish.body" : "orchestra.workflows.unpublish.body")}
              confirm={copy.t("orchestra.workflows.unpublish.confirm")}
              onConfirm={unpublish}
              onClose={() => setDialog(undefined)}
            />
          </Match>
          <Match when={dialog() === "revert"}>
            <ConfirmDialog
              title={copy.t("orchestra.workflows.revert.title", { name: name() })}
              body={copy.t("orchestra.workflows.revert.body")}
              confirm={copy.t("orchestra.workflows.revert.confirm")}
              onConfirm={revert}
              onClose={() => setDialog(undefined)}
            />
          </Match>
          <Match when={dialog() === "delete"}>
            <DeleteDialog
              document={base()}
              kind={kind}
              source={props.source}
              onClose={() => setDialog(undefined)}
              onDeleted={() => props.go(relayPath.library(kind), true)}
            />
          </Match>
          <Match when={dialog() === "keys"}>
            <ShortcutsDialog onClose={() => setDialog(undefined)} />
          </Match>
          <Match when={dialog() === "test"}>
            <TestDialog
              flow={flow()}
              types={props.source.nodeTypes.isSuccess ? props.source.nodeTypes.data.hook : undefined}
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
    </DraftScope>
  )
}
