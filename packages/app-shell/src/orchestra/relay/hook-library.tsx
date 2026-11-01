import { skipToken, useQuery } from "@tanstack/solid-query"
import { useLocation } from "@solidjs/router"
import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { MxPage } from "../chapters/kit"
import { decisionTime, documentDiagnostics, RelayError, type RelayDocument, type RelayInstall } from "./client"
import { createAction, DeleteDialog } from "./dialogs"
import { profileDrafts } from "./drafts"
import { rememberDocument } from "./cache"
import { type Flow, flowFromDocument, issues, nodeOf, TRIGGER } from "./graph"
import { ActivityRows } from "./hook-activity"
import { OrderDialog, UninstallDialog } from "./hook-dialogs"
import { type InstallChange, installNotice, refreshInstalls } from "./hook-install"
import { HookQueryStatus } from "./hook-status"
import { Chain, VersionBadges } from "./parts"
import { hookDocument, type HookPresetID, hookPresets, presetChain, type PresetKey } from "./presets"
import { type RelayRoute, relayPath } from "./route"
import type { RelaySource } from "./source"
import { Ic, Menu, type MenuItem, RelayDialog, useRelayCopy } from "./ui"

type Props = {
  source: RelaySource
  route: Extract<RelayRoute, { page: "library" }>
  profile: string
  // The folder is outside git: its hooks would apply to every such folder, so nothing new is installed here.
  shared: boolean
  go: (path: string, replace?: boolean) => void
  close: (path: string) => void
}

// A ledger the server cannot read, or an install it no longer has, only hides that hook's activity.
const ledgerIssue = (error: unknown) =>
  error instanceof RelayError && (error.code === "ledger-invalid" || error.code === "install-missing")

export function hookChain(flow: Flow) {
  const trigger = flow.nodes.find((node) => node.type === TRIGGER)
  if (!trigger) return []
  const walk = (id: string, seen: string[]): string[] => {
    const next = flow.edges.find((edge) => edge.from === id && edge.port === 0)?.to
    if (!next || seen.includes(next)) return seen
    return walk(next, [...seen, next])
  }
  return walk(trigger.id, [trigger.id]).map((id) => nodeOf(flow, id)?.name ?? id)
}

export function HookLibrary(props: Props) {
  const copy = useRelayCopy()
  const [menu, setMenu] = createSignal<{ anchor: HTMLElement; document: RelayDocument }>()
  const [remove, setRemove] = createSignal<RelayDocument>()
  const [preset, setPreset] = createSignal<HookPresetID | "blank">("blank")
  const [busy, setBusy] = createSignal(false)
  // `unreadable` holds the installs whose ledger the last activity read could not parse.
  const [layer, setLayer] = createStore({
    uninstall: undefined as { install: RelayInstall; name: string } | undefined,
    ordering: false,
    unreadable: [] as string[],
  })
  const text = (key: PresetKey) => copy.t(`orchestra.hooks.${key}`)
  // Every query is read through its status: the `data` of a pending query suspends the shell instead of showing the
  // page's own loading row.
  const presets = () => hookPresets(props.source.nodeTypes.isSuccess ? props.source.nodeTypes.data.hook : undefined)
  // The list stays on screen when a background refresh fails; only a first load can leave nothing to show.
  const loaded = () => props.source.loaded()
  const installs = () => props.source.installs.isSuccess ? props.source.installs.data ?? [] : []
  const installOf = (id: string) => installs().find((item) => item.document === id)
  const nameOf = (documentID: string | undefined) =>
    props.source.list().find((item) => item.id === documentID)?.name ?? copy.t("orchestra.hooks.editor.missing")
  const decisions = useQuery(
    () => ({
      queryKey: props.source.key(
        "decisions-all",
        installs()
          .map((item) => item.installID)
          .join(","),
      ),
      queryFn: installs().length
        ? async () => {
            const list = installs()
            const results = await Promise.allSettled(list.map((item) => props.source.client.decisions(item.installID)))
            // A server-wide failure is still a failure; one unreadable ledger only marks its own hook.
            const failed = results.find((result) => result.status === "rejected" && !ledgerIssue(result.reason))
            if (failed?.status === "rejected") throw failed.reason
            setLayer(
              "unreadable",
              list.flatMap((item, index) => (results[index]?.status === "rejected" ? [item.installID] : [])),
            )
            return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
          }
        : skipToken,
      retry: false,
    }),
    props.source.queryClient,
  )
  const decided = () => (decisions.isSuccess ? decisions.data : [])
  const unreadableInstalls = () => installs().filter((item) => layer.unreadable.includes(item.installID))
  const lastFire = (id: string) => {
    const install = installOf(id)
    if (!install) return
    return decided()
      .filter((item) => item.install === install.installID)
      .toSorted((a, b) => b.ts - a.ts || b.seq - a.seq)[0]
  }
  const flows = createMemo(
    () => new Map(props.source.list().map((document) => [document.id, flowFromDocument(document, "hook")])),
  )
  // One change at a time across the list: a switch, an update, or a publish that installs. Every row stays locked
  // until the refreshed install list lands, so the next click acts on what is really installed.
  const change = async (kind: InstallChange, run: () => Promise<unknown>) => {
    if (busy() || !props.source.installs.isSuccess) return
    setBusy(true)
    const failed = await run().then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    await refreshInstalls(props.source)
    setBusy(false)
    if (failed) installNotice(copy, kind, failed.error)
  }
  const toggle = (document: RelayDocument, next: boolean) => {
    const current = installOf(document.id)
    return change(current && !next ? "pause" : "install", () =>
      current ? props.source.client.enable(current.installID, next) : props.source.client.install(document.id),
    )
  }
  const publishAndInstall = (document: RelayDocument) =>
    change("install", async () => {
      const published = await props.source.client.publish(document)
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), published)
      await props.source.client.install(document.id)
    })
  // Why a never-published hook cannot be published from the list: the editor holds changes the saved copy lacks, or
  // the editor would flag issues the server then refuses.
  const blocker = (document: RelayDocument) => {
    const draft = profileDrafts(props.source).find((item) => item.state.base.id === document.id)
    if (draft && (draft.state.save.dirty || draft.state.save.state !== "saved")) return "draft"
    return issues(flows().get(document.id)!, [...documentDiagnostics(document)]).length ? "issues" : undefined
  }
  const rowMenu = (document: RelayDocument): MenuItem[] => {
    const install = installOf(document.id)
    return [
      {
        label: copy.t("orchestra.workflows.menu.open"),
        icon: "open",
        run: () => props.go(relayPath.editor("hook", document.id)),
      },
      {
        label: copy.t("orchestra.hooks.tab.activity"),
        icon: "history",
        run: () => props.go(relayPath.history("hook", document.id)),
      },
      ...(install
        ? [
            {
              label: copy.t("orchestra.hooks.menu.uninstall"),
              icon: "close" as const,
              run: () => setLayer("uninstall", { install, name: document.name }),
            },
          ]
        : []),
      "-",
      { label: copy.t("orchestra.workflows.menu.delete"), icon: "trash", danger: true, run: () => setRemove(document) },
    ]
  }
  const pickTemplate = (id: HookPresetID | "blank") => {
    setPreset(id)
    props.go(relayPath.create("hook"))
  }
  // "New hook" never reopens the last template: the pick resets here, and when the dialog closes, so the command
  // palette's route opens Blank too.
  const newHook = () => {
    setPreset("blank")
    props.go(relayPath.create("hook"))
  }
  createEffect(
    on(
      () => props.route.create,
      (create) => {
        if (!create) setPreset("blank")
      },
      { defer: true },
    ),
  )

  return (
    <MxPage
      id="orchestra-hooks"
      eyebrow={copy.t("orchestra.hooks.eyebrow", { profile: props.profile })}
      title={copy.t("orchestra.hooks.title")}
      description={copy.t("orchestra.hooks.description")}
      action={
        <div class="hk-actions">
          <Show when={installs().length > 1}>
            <button
              type="button"
              class="mx-btn"
              title={copy.t("orchestra.hooks.order.openTitle")}
              onClick={() => setLayer("ordering", true)}
            >
              {copy.t("orchestra.hooks.order.open")}
            </button>
          </Show>
          <button type="button" class="mx-btn primary" disabled={!loaded() || props.shared} onClick={newHook}>
            <Ic name="plus" />
            {copy.t("orchestra.hooks.new")}
          </button>
        </div>
      }
    >
      <p class="hk-scope">
        <Show when={!props.shared}>{copy.t("orchestra.hooks.scope", { project: props.profile })} </Show>
        {copy.t("orchestra.hooks.crosslink")}{" "}
        <button type="button" class="mx-link" onClick={() => props.go(relayPath.library("workflow"))}>
          {copy.t("orchestra.hooks.crosslink.open")}
        </button>
      </p>
      <Show when={props.shared}>
        <p class="wf-retained" role="status" data-slot="relay-repository-required">
          <span>{copy.t("orchestra.workflows.scope.repositoryRequired")}</span>
        </p>
        {/* Installs made here earlier keep enforcing in every folder outside git until someone removes them. */}
        <Show when={installs().length}>
          <p class="wf-retained" role="status" data-slot="relay-shared-installs">
            <span>{copy.t("orchestra.hooks.scope.sharedInstalls")}</span>
            <For each={installs()}>
              {(install) => (
                <button
                  type="button"
                  class="mx-btn"
                  onClick={() => setLayer("uninstall", { install, name: nameOf(install.document) })}
                >
                  {copy.t("orchestra.hooks.scope.uninstall", { name: nameOf(install.document) })}
                </button>
              )}
            </For>
          </p>
        </Show>
      </Show>
      <div class="wf-tabs" role="tablist" aria-label={copy.t("orchestra.hooks.tabs")}>
        <button
          type="button"
          class="wf-tab"
          role="tab"
          aria-selected={props.route.tab === "list"}
          onClick={() => props.go(relayPath.library("hook"))}
        >
          {copy.t("orchestra.hooks.tab.list")}
          <span class="wf-count">{props.source.list().length}</span>
        </button>
        <button
          type="button"
          class="wf-tab"
          role="tab"
          aria-selected={props.route.tab === "runs"}
          onClick={() => props.go(relayPath.runs("hook"))}
        >
          {copy.t("orchestra.hooks.tab.activity")}
          <Show when={props.source.installs.isSuccess && (!installs().length || decisions.isSuccess)}>
            <span class="wf-count">{decided().length}</span>
          </Show>
        </button>
      </div>
      <For each={profileDrafts(props.source).filter((draft) => draft.state.flow.kind === "hook" && (draft.state.save.dirty || draft.state.save.state === "saving"))}>
        {(draft) => <p class="mx-note" role="status">
          {copy.t("orchestra.workflows.drafts.retained", { name: draft.state.name })}
          <button type="button" class="mx-btn" onClick={() => props.go(relayPath.editor("hook", draft.state.base.id))}>
            {copy.t("orchestra.workflows.menu.open")}
          </button>
        </p>}
      </For>
      <Show when={loaded() && !props.source.installs.isSuccess}>
        <HookQueryStatus kind="installs" query={props.source.installs} source={props.source} />
      </Show>
      <Show when={props.source.installs.isSuccess && installs().length && !decisions.isSuccess}>
        <HookQueryStatus kind="activity" query={decisions} />
      </Show>
      <Show when={unreadableInstalls().length && decisions.isSuccess}>
        <p class="mx-note" role="status">
          {copy.t("orchestra.hooks.activity.unreadable", {
            names: unreadableInstalls()
              .map((item) => nameOf(item.document))
              .join(", "),
          })}
        </p>
      </Show>
      <Show when={props.source.documents.isError && loaded()}>
        <p class="mx-error" role="alert">
          {copy.t("orchestra.hooks.error", { reason: String(props.source.documents.error?.message ?? "") })}
          <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </p>
      </Show>
      <Switch>
        <Match when={props.source.documents.isPending}>
          <p class="mx-empty" role="status">
            {copy.t("orchestra.hooks.loading")}
          </p>
        </Match>
        <Match when={props.source.documents.isError && !loaded()}>
          <p class="mx-error" role="alert">
            {copy.t("orchestra.hooks.error", { reason: String(props.source.documents.error?.message ?? "") })}
          </p>
          <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </Match>
        <Match when={props.route.tab === "runs" && (!props.source.installs.isSuccess || (installs().length && !decisions.isSuccess))}>
          <></>
        </Match>
        <Match when={props.route.tab === "runs"}>
          <Show
            when={decided().length}
            fallback={
              <div class="mx-empty wf-empty">
                <strong>{copy.t("orchestra.hooks.activity.empty")}</strong>
                {copy.t("orchestra.hooks.activity.emptyAll")}
              </div>
            }
          >
            <ActivityRows
              decisions={decided()}
              hookName={(installID) =>
                props.source
                  .list()
                  .find((item) => item.id === installs().find((install) => install.installID === installID)?.document)
                  ?.name
              }
              onOpen={(installID) => {
                const install = installs().find((item) => item.installID === installID)
                if (install) props.go(relayPath.editor("hook", install.document))
              }}
            />
          </Show>
        </Match>
        <Match when={true}>
          <Show
            when={props.source.list().length}
            fallback={
              <div class="mx-empty wf-empty">
                <strong>{copy.t("orchestra.hooks.empty.title")}</strong>
                {copy.t("orchestra.hooks.empty.body")}
                <br />
                <button type="button" class="mx-btn primary" disabled={props.shared} onClick={newHook}>
                  <Ic name="plus" />
                  {copy.t("orchestra.hooks.new")}
                </button>
              </div>
            }
          >
            <div class="wf-lhead hk" aria-hidden="true">
              <span />
              <span>{copy.t("orchestra.hooks.head.hook")}</span>
              <span>{copy.t("orchestra.workflows.head.version")}</span>
              <span>{copy.t("orchestra.hooks.head.installed")}</span>
              <span />
            </div>
            <div class="mx-table" role="list" aria-label={copy.t("orchestra.hooks.title")}>
              <For each={props.source.list()}>
                {(document) => {
                  const install = () => installOf(document.id)
                  const fired = () => lastFire(document.id)
                  const enabled = () => !!install()?.enabled
                  // Installed, but its document was unpublished: the install stays and does not fire.
                  const withdrawn = () => !!install()?.unpublished
                  const label = () =>
                    withdrawn()
                      ? "orchestra.hooks.row.unpublished"
                      : enabled()
                        ? "orchestra.hooks.installed"
                        : install()
                          ? "orchestra.hooks.row.paused"
                          : "orchestra.hooks.notInstalled"
                  // Never published and never installed: the switch cannot work yet.
                  const unpublished = () => !document.activeVersionId && !install()
                  // A newer publish leaves the install on the version it pinned until it is updated.
                  const stale = () => {
                    const current = install()
                    return current && document.activeVersionId && current.version !== document.activeVersionId
                      ? current
                      : undefined
                  }
                  const summary = () => {
                    const current = install()
                    if (!current) return ""
                    if (layer.unreadable.includes(current.installID))
                      return copy.t("orchestra.hooks.row.activityUnavailable")
                    if (!decisions.isSuccess) return ""
                    const last = fired()
                    return last
                      ? `${copy.t(`orchestra.hooks.outcome.${last.outcome}`)} · ${copy.when(decisionTime(last))}`
                      : copy.t("orchestra.hooks.row.notFired")
                  }
                  const open = () => props.go(relayPath.editor("hook", document.id))
                  return (
                    <div
                      class="mx-row wf-lrow hk"
                      role="listitem"
                      tabindex="0"
                      data-document={document.id}
                      onClick={open}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
                        event.preventDefault()
                        open()
                      }}
                    >
                      <span class="mx-mark">
                        <Ic name="hooks" />
                      </span>
                      <div class="mx-grow">
                        <strong>{document.name}</strong>
                        <Show when={document.description}>
                          <small>{document.description}</small>
                        </Show>
                        <small class="wf-oneline">
                          {(hookChain(flows().get(document.id)!) ?? []).join(" → ") ||
                            copy.t("orchestra.hooks.row.noTrigger")}
                        </small>
                      </div>
                      <div class="wf-badges">
                        <VersionBadges document={document} />
                      </div>
                      <div class="wf-state hk-state" onClick={(event) => event.stopPropagation()}>
                        <Show when={props.source.installs.isSuccess} fallback={<span>{copy.t("orchestra.workflows.hookState.unknown")}</span>}>
                        <button
                          type="button"
                          class="mx-toggle"
                          role="switch"
                          aria-checked={enabled()}
                          aria-label={copy.t("orchestra.hooks.row.install", {
                            name: document.name,
                            profile: props.profile,
                          })}
                          disabled={unpublished() || busy() || (props.shared && !enabled())}
                          onClick={() => void toggle(document, !enabled())}
                        />
                        <span>
                          {copy.t(label())}
                          <Show when={withdrawn()} fallback={<Show when={summary()}><small>{summary()}</small></Show>}>
                            <small>{copy.t("orchestra.hooks.row.unpublishedHint")}</small>
                          </Show>
                          <Show when={stale()}>
                            {(current) => (
                              <StaleInstall
                                source={props.source}
                                document={document}
                                install={current()}
                                busy={busy() || props.shared}
                                onUpdate={() =>
                                  void change("update", () => props.source.client.update(current().installID))
                                }
                              />
                            )}
                          </Show>
                          <Show when={unpublished() && !props.shared}>
                            <small>{copy.t(`orchestra.hooks.row.reason.${blocker(document) ?? "publish"}`)}</small>
                            <Show when={!blocker(document)}>
                              <button
                                type="button"
                                class="mx-btn primary"
                                aria-label={copy.t("orchestra.hooks.row.publishInstallLabel", { name: document.name })}
                                disabled={busy()}
                                onClick={() => void publishAndInstall(document)}
                              >
                                {copy.t("orchestra.hooks.row.publishInstall")}
                              </button>
                            </Show>
                          </Show>
                        </span>
                        </Show>
                      </div>
                      <div class="wf-actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          class="mx-btn icon"
                          aria-haspopup="menu"
                          aria-label={copy.t("orchestra.workflows.row.more", { name: document.name })}
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
          <div class="wf-sub" style={{ "margin-top": "30px" }}>
            <h3 class="mx-section">{copy.t("orchestra.workflows.templates.title")}</h3>
            <span class="mx-meta">{copy.t("orchestra.hooks.templates.meta")}</span>
          </div>
          <div class="wf-tpl-grid four">
            <For each={presets()}>
              {(item) => (
                <button
                  type="button"
                  class="mx-card wf-tpl"
                  data-template={item.id}
                  disabled={props.shared}
                  onClick={() => pickTemplate(item.id)}
                >
                  <div class="mx-card-top">
                    <span class="mx-mark">
                      <Ic name="hooks" />
                    </span>
                    <h3>{copy.t(`orchestra.hooks.preset.${item.id}`)}</h3>
                  </div>
                  <p>{copy.t(`orchestra.hooks.preset.${item.id}.body`)}</p>
                  <Chain names={presetChain(item, text)} />
                </button>
              )}
            </For>
          </div>
        </Match>
      </Switch>
      <Show when={props.route.create && loaded() && !props.shared}>
        <CreateHookDialog
          source={props.source}
          initial={preset()}
          onClose={() => props.close(relayPath.library("hook"))}
          onCreated={(id) => props.go(relayPath.editor("hook", id), true)}
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
      <Show when={remove()} keyed>
        {(document) => (
          <DeleteDialog
            document={document}
            kind="hook"
            source={props.source}
            onClose={() => setRemove(undefined)}
            onDeleted={() => setRemove(undefined)}
          />
        )}
      </Show>
      <Show when={layer.uninstall}>
        {(current) => (
          <UninstallDialog
            install={current().install}
            name={current().name}
            source={props.source}
            onClose={() => setLayer("uninstall", undefined)}
          />
        )}
      </Show>
      <Show when={layer.ordering}>
        <OrderDialog source={props.source} name={(id) => nameOf(id)} onClose={() => setLayer("ordering", false)} />
      </Show>
    </MxPage>
  )
}

// A newer publish leaves an install on the version it pinned, so the row says which one is installed and offers the
// update. Saved versions never change, so the installed version's number is read once.
function StaleInstall(props: {
  source: RelaySource
  document: RelayDocument
  install: RelayInstall
  busy: boolean
  onUpdate: () => void
}) {
  const copy = useRelayCopy()
  const installed = useQuery(
    () => ({
      queryKey: props.source.key("version", props.document.id, props.install.version),
      queryFn: () => props.source.client.version(props.document.id, props.install.version),
      staleTime: Infinity,
      retry: false,
    }),
    props.source.queryClient,
  )
  return (
    <small class="hk-stale">
      {installed.data && props.document.publishedCounter !== undefined
        ? copy.t("orchestra.hooks.row.stale", {
            installed: installed.data.versionCounter,
            published: props.document.publishedCounter,
          })
        : copy.t("orchestra.hooks.row.staleUnnumbered")}
      <button
        type="button"
        class="mx-btn primary"
        aria-label={copy.t("orchestra.hooks.row.updateLabel", { name: props.document.name })}
        disabled={props.busy}
        onClick={props.onUpdate}
      >
        {copy.t("orchestra.hooks.row.update")}
      </button>
    </small>
  )
}

function CreateHookDialog(props: {
  source: RelaySource
  initial: HookPresetID | "blank"
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const copy = useRelayCopy()
  const action = createAction(useLocation())
  const text = (key: PresetKey) => copy.t(`orchestra.hooks.${key}`)
  const presets = () => hookPresets(props.source.nodeTypes.isSuccess ? props.source.nodeTypes.data.hook : undefined)
  const [pick, setPick] = createSignal<HookPresetID | "blank">(props.initial)
  const [name, setName] = createSignal(
    props.initial === "blank"
      ? copy.t("orchestra.hooks.create.defaultName")
      : copy.t(`orchestra.hooks.preset.${props.initial}`),
  )
  const create = () =>
    action.run(async (current) => {
      const preset = presets().find((item) => item.id === pick())
      const created = await props.source.client.create(
        hookDocument(name().trim() || copy.t("orchestra.hooks.create.defaultName"), preset, text),
      )
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), created)
      if (!current()) return
      props.onCreated(created.id)
    })
  return (
    <RelayDialog
      title={copy.t("orchestra.hooks.create.title")}
      description={copy.t("orchestra.hooks.create.description")}
      wide
      busy={action.busy()}
      onClose={props.onClose}
      onSubmit={create}
      foot={
        <>
          <button type="button" class="mx-btn" disabled={action.busy()} onClick={props.onClose}>
            {copy.t("orchestra.workflows.dialog.cancel")}
          </button>
          <button type="submit" class="mx-btn primary" disabled={action.busy()}>
            {copy.t("orchestra.workflows.create.submit")}
          </button>
        </>
      }
    >
      <label class="mx-field">
        <span>{copy.t("orchestra.workflows.create.name")}</span>
        <input
          ref={(element) => queueMicrotask(() => element.select())}
          name="name"
          disabled={action.busy()}
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <div class="mx-field">
        <span id="wf-hook-template">{copy.t("orchestra.workflows.create.template")}</span>
        <div class="wf-tpl-grid two" role="radiogroup" aria-labelledby="wf-hook-template">
          <For each={["blank" as const, ...presets().map((item) => item.id)]}>
            {(id) => (
              <button
                type="button"
                class="mx-card wf-tpl"
                role="radio"
                disabled={action.busy()}
                aria-checked={pick() === id}
                data-template={id}
                onClick={() => {
                  setPick(id)
                  setName(
                    id === "blank"
                      ? copy.t("orchestra.hooks.create.defaultName")
                      : copy.t(`orchestra.hooks.preset.${id}`),
                  )
                }}
              >
                <div class="mx-card-top">
                  <span class="mx-mark">
                    <Ic name={id === "blank" ? "plus" : "hooks"} />
                  </span>
                  <h3>
                    {id === "blank" ? copy.t("orchestra.hooks.create.blank") : copy.t(`orchestra.hooks.preset.${id}`)}
                  </h3>
                </div>
                <p>
                  {id === "blank"
                    ? copy.t("orchestra.hooks.create.blankBody")
                    : copy.t(`orchestra.hooks.preset.${id}.body`)}
                </p>
                <Chain
                  names={
                    id === "blank"
                      ? [text("trigger.before.edit")]
                      : presetChain(presets().find((item) => item.id === id)!, text)
                  }
                />
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={action.error()}>
        <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
          {action.error()}
        </p>
      </Show>
    </RelayDialog>
  )
}
