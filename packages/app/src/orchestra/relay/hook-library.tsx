import { skipToken, useQuery } from "@tanstack/solid-query"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { showToast } from "@/utils/toast"
import { MxPage } from "../chapters/kit"
import { decisionTime, type RelayDocument } from "./client"
import { createAction, DeleteDialog, failure } from "./dialogs"
import { type Flow, flowFromDocument, nodeOf, TRIGGER } from "./graph"
import { ActivityRows } from "./hook-activity"
import { Chain, VersionBadges } from "./parts"
import { hookDocument, type HookPresetID, hookPresets, presetChain, type PresetKey } from "./presets"
import { type RelayRoute, relayPath } from "./route"
import type { RelaySource } from "./source"
import { Ic, Menu, type MenuItem, RelayDialog, useRelayCopy } from "./ui"

type Props = {
  source: RelaySource
  route: Extract<RelayRoute, { page: "library" }>
  profile: string
  go: (path: string) => void
  close: (path: string) => void
}

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
  const [busy, setBusy] = createSignal<string>()
  const text = (key: PresetKey) => copy.t(`orchestra.hooks.${key}`)
  const presets = () => hookPresets(props.source.nodeTypes.data?.hook)
  const installs = () => props.source.installs.data ?? []
  const installOf = (id: string) => installs().find((item) => item.document === id)
  const decisions = useQuery(
    () => ({
      queryKey: props.source.key(
        "decisions-all",
        installs()
          .map((item) => item.installID)
          .join(","),
      ),
      queryFn: installs().length
        ? () =>
            Promise.all(installs().map((item) => props.source.client.decisions(item.installID))).then((lists) =>
              lists.flat(),
            )
        : skipToken,
      retry: false,
    }),
    props.source.queryClient,
  )
  const lastFire = (id: string) => {
    const install = installOf(id)
    if (!install) return
    return (decisions.data ?? [])
      .filter((item) => item.install === install.installID)
      .toSorted((a, b) => b.ts - a.ts || b.seq - a.seq)[0]
  }
  const flows = createMemo(
    () => new Map(props.source.list().map((document) => [document.id, flowFromDocument(document, "hook")])),
  )
  const toggle = async (document: RelayDocument, next: boolean) => {
    if (busy()) return
    setBusy(document.id)
    const current = installOf(document.id)
    const result = await (
      current ? props.source.client.enable(current.installID, next) : props.source.client.install(document.id)
    ).then(
      () => undefined,
      (error: unknown) => failure(error),
    )
    setBusy(undefined)
    props.source.invalidate("installs")
    if (result) showToast({ title: copy.t("orchestra.hooks.installFailed"), description: result })
  }
  const rowMenu = (document: RelayDocument): MenuItem[] => [
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
    "-",
    { label: copy.t("orchestra.workflows.menu.delete"), icon: "trash", danger: true, run: () => setRemove(document) },
  ]
  const pickTemplate = (id: HookPresetID | "blank") => {
    setPreset(id)
    props.go(relayPath.create("hook"))
  }

  return (
    <MxPage
      id="orchestra-hooks"
      eyebrow={copy.t("orchestra.workflows.eyebrow", { profile: props.profile })}
      title={copy.t("orchestra.hooks.title")}
      description={copy.t("orchestra.hooks.description")}
      action={
        <button
          type="button"
          class="mx-btn primary"
          disabled={!props.source.documents.isSuccess}
          onClick={() => props.go(relayPath.create("hook"))}
        >
          <Ic name="plus" />
          {copy.t("orchestra.hooks.new")}
        </button>
      }
    >
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
          <span class="wf-count">{decisions.data?.length ?? 0}</span>
        </button>
      </div>
      <Switch>
        <Match when={props.source.documents.isPending}>
          <p class="mx-empty" role="status">
            {copy.t("orchestra.hooks.loading")}
          </p>
        </Match>
        <Match when={props.source.documents.isError}>
          <p class="mx-error" role="alert">
            {copy.t("orchestra.hooks.error", { reason: String(props.source.documents.error?.message ?? "") })}
          </p>
          <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </Match>
        <Match when={props.route.tab === "runs"}>
          <Show
            when={decisions.data?.length}
            fallback={
              <div class="mx-empty wf-empty">
                <strong>{copy.t("orchestra.hooks.activity.empty")}</strong>
                {copy.t("orchestra.hooks.activity.emptyAll")}
              </div>
            }
          >
            <ActivityRows
              decisions={decisions.data ?? []}
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
                <button type="button" class="mx-btn primary" onClick={() => props.go(relayPath.create("hook"))}>
                  <Ic name="plus" />
                  {copy.t("orchestra.hooks.new")}
                </button>
              </div>
            }
          >
            <div class="wf-lhead" aria-hidden="true">
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
                  const on = () => !!install()?.enabled
                  const open = () => props.go(relayPath.editor("hook", document.id))
                  return (
                    <div
                      class="mx-row wf-lrow"
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
                      <div class="wf-state" style={{ gap: "10px" }} onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          class="mx-toggle"
                          role="switch"
                          aria-checked={on()}
                          aria-label={copy.t("orchestra.hooks.row.install", {
                            name: document.name,
                            profile: props.profile,
                          })}
                          title={
                            document.activeVersionId || install() ? undefined : copy.t("orchestra.hooks.publishFirst")
                          }
                          disabled={(!document.activeVersionId && !install()) || busy() === document.id}
                          onClick={() => void toggle(document, !on())}
                        />
                        <span>
                          {copy.t(on() ? "orchestra.hooks.installed" : "orchestra.hooks.off")}
                          <small style={{ display: "block", "margin-top": "2px" }}>
                            {fired()
                              ? `${copy.t(`orchestra.hooks.outcome.${fired()!.outcome}`)} · ${copy.when(decisionTime(fired()!))}`
                              : decisions.isSuccess || !install()
                                ? copy.t("orchestra.hooks.row.notFired")
                                : ""}
                          </small>
                        </span>
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
      <Show when={props.route.create && props.source.documents.isSuccess}>
        <CreateHookDialog
          source={props.source}
          initial={preset()}
          onClose={() => props.close(relayPath.library("hook"))}
          onCreated={(id) => props.go(relayPath.editor("hook", id))}
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
    </MxPage>
  )
}

function CreateHookDialog(props: {
  source: RelaySource
  initial: HookPresetID | "blank"
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const copy = useRelayCopy()
  const action = createAction()
  const text = (key: PresetKey) => copy.t(`orchestra.hooks.${key}`)
  const presets = () => hookPresets(props.source.nodeTypes.data?.hook)
  const [pick, setPick] = createSignal<HookPresetID | "blank">(props.initial)
  const [name, setName] = createSignal(
    props.initial === "blank"
      ? copy.t("orchestra.hooks.create.defaultName")
      : copy.t(`orchestra.hooks.preset.${props.initial}`),
  )
  const create = () =>
    action.run(async () => {
      const preset = presets().find((item) => item.id === pick())
      const created = await props.source.client.create(
        hookDocument(name().trim() || copy.t("orchestra.hooks.create.defaultName"), preset, text),
      )
      props.source
        .queryClient()
        .setQueryData(props.source.key("documents"), (list: RelayDocument[] | undefined) => [created, ...(list ?? [])])
      props.onCreated(created.id)
    })
  return (
    <RelayDialog
      title={copy.t("orchestra.hooks.create.title")}
      description={copy.t("orchestra.hooks.create.description")}
      wide
      onClose={props.onClose}
      onSubmit={create}
      foot={
        <>
          <button type="button" class="mx-btn" onClick={props.onClose}>
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
