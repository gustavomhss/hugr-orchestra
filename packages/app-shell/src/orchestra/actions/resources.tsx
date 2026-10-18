import type { Actions } from "@orchestra/schema/actions"
import { For, Match, Show, Switch } from "solid-js"
import { Empty, Icon } from "./components"
import type { Model, State, Translate, ViewProps } from "./contract"
import { bytes, relative } from "./format"
import { ArtifactRow } from "./output-views"
import { canRequest } from "./request-policy"
import { ResourceScopeField } from "./resource-scopes-field"

type Item = Actions.Resource
type Data = Record<string, unknown>
type Kind = Extract<Actions.ResourceKind, "artifacts" | "environments" | "variables" | "runners" | "caches" | "schedules">
type CreateKind = "create-variable" | "create-environment" | "create-runner" | "create-schedule"
type Run = Actions.Run
const kinds = ["artifacts", "environments", "variables", "runners", "caches", "schedules"] as const

// The context sidebar is the only resource navigation, as in the approved mock.
export function Resources(props: ViewProps) {
  const state = () => props.model.state
  const kind = () => kinds.find((item) => item === state().route.resourceKind) ?? "artifacts"
  const page = () => state().resources
  const items = () => (page().value?.items ?? []).filter(
    (item) => item.kind === kind() && item.bindingID === state().binding?.id,
  )
  const ready = () => page().status === "ready" && Boolean(state().binding) && !state().unsupported
  // Getters keep spread props reactive.
  const rp: RP = { get model() { return props.model }, get t() { return props.t }, get state() { return state() }, get items() { return items() } }
  const head = () => headFor(rp, kind())

  return (
    <div class="actions-resources resources-layout">
      <Show when={state().binding && !state().unsupported} fallback={
        <Empty title={props.t(state().unsupported ? "orchestra.actions.unsupported" : "orchestra.actions.noConnection")} />}>
        <Show keyed when={`${state().binding?.id ?? ""}:${state().binding?.revision ?? ""}:${kind()}`}>
          {(_owner) => (
            <section class={`ar-surface ar-${kind()}`}>
              <Show when={head()}>{(copy) => <Head {...rp} title={copy().title} detail={copy().detail} glyph={copy().glyph}
                summary={ready() ? copy().summary : ""} create={copy().create} createKind={copy().createKind}
                topAction={copy().topAction} topPath={copy().topPath} />}</Show>
              <Show when={kind() === "variables"}>
                <ResourceScopeField {...props} filter value={state().filters.scope} disabled={state().submitting}
                  onChange={(scope) => props.model.filter({ scope: scope || undefined })} />
              </Show>
              <Show when={ready()} fallback={<Pending {...rp} title={head()?.title ?? props.t("orchestra.actions.artifacts")} />}>
                <Switch>
                  <Match when={kind() === "artifacts"}><Artifacts {...rp} /></Match>
                  <Match when={kind() === "environments"}><Environments {...rp} /></Match>
                  <Match when={kind() === "variables"}><Variables {...rp} /></Match>
                  <Match when={kind() === "runners"}><Runners {...rp} /></Match>
                  <Match when={kind() === "caches"}><Caches {...rp} /></Match>
                  <Match when={kind() === "schedules"}><Schedules {...rp} /></Match>
                </Switch>
              </Show>
            </section>
          )}
        </Show>
      </Show>
    </div>
  )
}

type RP = { model: Model; t: Translate; state: State; items: readonly Item[] }
type HeadCopy = {
  title: string
  detail: string
  summary: string
  glyph: GlyphName
  create?: string
  createKind?: CreateKind
  topAction?: string
  topPath?: string
}
type SurfaceProps = RP & {
  kind: Kind
  label: string
  noteTitle: string
  note: string
  emptyTitle: string
  emptyDetail: string
  headers: readonly string[]
  waiting?: Run
}

// Idle and loading both read as loading; the internal slot state is never page content.
function Pending(p: RP & { title: string }) {
  const message = () => p.state.resources.error?.message
  return <Show when={p.state.resources.status === "error"} fallback={<Empty title={p.t("orchestra.actions.loading")} busy />}>
    <section class="actions-empty ar-state" role="alert">
      <strong>{p.t("orchestra.actions.resources.failed", { resource: p.title })}</strong>
      <Show when={message() === "orchestra.actions.unavailable" ? undefined : message()}>
        {(key) => <p>{p.t(key())}</p>}
      </Show>
      <p>{p.t("orchestra.actions.resources.failedDetail")}</p>
      <button type="button" class="mx-btn" disabled={p.state.submitting} onClick={() => void p.model.refresh()}>
        <Icon name="refresh" size={16} />{p.t("orchestra.actions.refresh")}
      </button>
    </section>
  </Show>
}

function headFor(p: RP, kind: Kind): HeadCopy | undefined {
  const github = p.state.binding?.provider.kind === "github"
  if (kind === "environments") return { title: p.t("orchestra.actions.environments"), detail: p.t("orchestra.actions.environments.detail"),
    summary: p.t("orchestra.actions.environments.summary", { count: p.items.length }), glyph: "write",
    create: p.t("orchestra.actions.newEnvironment"), createKind: "create-environment" }
  if (kind === "variables") {
    const secrets = p.items.filter((r) => sensitive(r, json(r.data))).length
    return { title: p.t("orchestra.actions.variables"), detail: p.t("orchestra.actions.variables.detail"),
      summary: p.t("orchestra.actions.variables.summary", { sensitive: secrets, readable: p.items.length - secrets }), glyph: "verify",
      create: p.t("orchestra.actions.newSecretVariable"), createKind: "create-variable" }
  }
  if (kind === "runners") {
    const inherited = p.items.filter((r) => {
      const d = json(r.data)
      return d.inherited === true || text(d, "origin").startsWith("Inherited")
    }).length
    return { title: p.t("orchestra.actions.runners"), detail: p.t("orchestra.actions.runners.detail"),
      summary: p.t("orchestra.actions.runners.summary", { project: p.items.length - inherited, inherited }), glyph: "execute",
      create: p.t("orchestra.actions.addRunner"), createKind: "create-runner" }
  }
  if (kind === "caches" && !github) return { title: p.t("orchestra.actions.runnerCaches"), detail: p.t("orchestra.actions.runnerCaches.detail"),
    summary: p.t("orchestra.actions.runnerCaches.summary"), glyph: "read" }
  if (kind === "caches") return { title: p.t("orchestra.actions.dependencyCaches"), detail: p.t("orchestra.actions.caches.detail"),
    summary: p.t("orchestra.actions.caches.summary", { count: p.items.length }), glyph: "read" }
  // GitHub schedules live in workflow YAML: the mock offers a source edit there, never a separate schedule object.
  if (kind === "schedules") return { title: p.t("orchestra.actions.schedules"),
    detail: p.t(github ? "orchestra.actions.schedules.githubDetail" : "orchestra.actions.schedules.gitlabDetail"),
    summary: p.t("orchestra.actions.schedules.summary", { count: p.items.length, provider: p.t(github ? "orchestra.actions.workflowYaml" : "orchestra.actions.projectOwned") }),
    glyph: "command", ...(github
      ? { topAction: p.t("orchestra.actions.editScheduleInYaml"), topPath: p.items.map((r) => text(json(r.data), "path")).find(Boolean) }
      : { create: p.t("orchestra.actions.newSchedule"), createKind: "create-schedule" as const }) }
  return undefined
}

function Artifacts(p: RP) {
  return <section class="actions-detail detail-artifacts" aria-label={p.t("orchestra.actions.artifacts")}>
    <header class="section-title collection-section">
      <div><h2>{p.t("orchestra.actions.artifacts")}</h2><small>{p.t("orchestra.actions.artifacts.detail")}</small></div>
      <Badge value={p.t("orchestra.actions.outputs", { count: p.items.length })} />
    </header>
    <Show when={p.items.length} fallback={<Empty title={p.t("orchestra.actions.emptyArtifacts")} detail={p.t("orchestra.actions.artifacts.emptyDetail")} />}>
      <div class="mx-table ar-table" role="table" aria-label={p.t("orchestra.actions.artifacts")}>
        <For each={p.items}>{(item) => <ArtifactRow model={p.model} t={p.t} item={item} />}</For>
      </div>
    </Show>
  </section>
}

function Environments(p: RP) {
  const github = () => p.state.binding?.provider.kind === "github"
  return <Surface {...p} kind="environments" label={p.t("orchestra.actions.environments")} noteTitle={p.t("orchestra.actions.environments.noteTitle")} note={p.t(github() ? "orchestra.actions.environments.githubNote" : "orchestra.actions.environments.gitlabNote")} emptyTitle={p.t("orchestra.actions.emptyEnvironments")} emptyDetail={p.t("orchestra.actions.emptyEnvironments.detail")} headers={[p.t("orchestra.actions.environments.header"), p.t("orchestra.actions.deploymentState"), p.t("orchestra.actions.manage")]} waiting={waitingRun(p.state)} />
}
function Variables(p: RP) {
  const github = () => p.state.binding?.provider.kind === "github"
  return <Surface {...p} kind="variables" label={p.t("orchestra.actions.variables")} noteTitle={p.t("orchestra.actions.variables.noteTitle")} note={p.t(github() ? "orchestra.actions.variables.githubNote" : "orchestra.actions.variables.gitlabNote")} emptyTitle={p.t("orchestra.actions.emptyVariables")} emptyDetail={p.t("orchestra.actions.emptyVariables.detail")} headers={[p.t("orchestra.actions.variables.header"), p.t("orchestra.actions.valueControls"), p.t("orchestra.actions.manage")]} />
}
function Runners(p: RP) {
  return <Surface {...p} kind="runners" label={p.t("orchestra.actions.runners")} noteTitle={p.t("orchestra.actions.runners.noteTitle")} note={p.t("orchestra.actions.runners.note")} emptyTitle={p.t("orchestra.actions.emptyRunners")} emptyDetail={p.t("orchestra.actions.emptyRunners.detail")} headers={[p.t("orchestra.actions.runners.header"), p.t("orchestra.actions.statusOwnership"), p.t("orchestra.actions.manage")]} />
}
function Caches(p: RP) {
  if (p.state.binding?.provider.kind === "gitlab") return <article class="mx-card ar-cache-card">
    <div class="mx-card-top"><span class="mx-mark ar-mark"><Glyph name="read" size={24} /></span><div><h3>{p.t("orchestra.actions.freshCacheNamespace")}</h3><small>{p.t("orchestra.actions.gitlabRunnerCaches")}</small></div><Badge value={p.t("orchestra.actions.projectWide")} tone="warm" /></div>
    <p>{p.t("orchestra.actions.clearCaches.detail")}</p>
    <dl class="wf-kv ar-facts"><dt>{p.t("orchestra.actions.scope")}</dt><dd>{p.t("orchestra.actions.everyCacheKey")}</dd><dt>{p.t("orchestra.actions.storage")}</dt><dd>{p.t("orchestra.actions.existingBlobsRetained")}</dd><dt>{p.t("orchestra.actions.inventory")}</dt><dd>{p.t("orchestra.actions.cacheInventoryUnavailable")}</dd></dl>
    <div class="mx-card-foot"><small>{p.t("orchestra.actions.futureJobs")}</small><ActionButton action="clear" icon="refresh" label={p.t("orchestra.actions.clearProjectRunnerCaches")} disabled={!allowedState(p.state, "cache.clear")} onClick={() => p.model.dialog({ kind: "clear-caches" })} /></div>
  </article>
  // Prefer GitHub's repository-wide usage; otherwise total the listed keys only when every size is native.
  const usage = () => json(json(p.items[0]?.data).usage)
  const sizes = () => p.items.map((r) => amount(json(r.data).sizeInBytes))
  const total = () => {
    const native = amount(usage().sizeInBytes)
    const count = amount(usage().count)
    if (native !== undefined && count !== undefined)
      return p.t(count === 1 ? "orchestra.actions.cacheUsage.totalOne" : "orchestra.actions.cacheUsage.total", { size: bytes(native), count })
    const known = sizes().filter((size): size is number => size !== undefined)
    return known.length && known.length === sizes().length
      ? p.t("orchestra.actions.cacheUsage.listed", { size: bytes(known.reduce((sum, size) => sum + size, 0)) }) : ""
  }
  return <Surface {...p} kind="caches" label={p.t("orchestra.actions.dependencyCaches")} noteTitle={p.t("orchestra.actions.cacheUsage")} note={[total(), p.t("orchestra.actions.cacheUsage.note")].filter(Boolean).join(" ")} emptyTitle={p.t("orchestra.actions.emptyCaches")} emptyDetail={p.t("orchestra.actions.emptyCaches.detail")} headers={[p.t("orchestra.actions.cacheKeyRef"), p.t("orchestra.actions.storageLastUsed"), p.t("orchestra.actions.manage")]} />
}
function Schedules(p: RP) {
  const github = () => p.state.binding?.provider.kind === "github"
  return <>
    <Table {...p} kind="schedules" label={p.t("orchestra.actions.schedules")} headers={[p.t("orchestra.actions.schedules.header"), p.t("orchestra.actions.refExecutionIdentity"), p.t("orchestra.actions.manage")]} emptyTitle={p.t("orchestra.actions.emptySchedules")} emptyDetail={p.t(github() ? "orchestra.actions.emptySchedules.githubDetail" : "orchestra.actions.emptySchedules.gitlabDetail")} />
    <aside class="ar-note"><Glyph name={github() ? "code" : "lock"} size={16} /><div><strong>{p.t(github() ? "orchestra.actions.schedules.githubNoteTitle" : "orchestra.actions.schedules.gitlabNoteTitle")}</strong><p>{p.t(github() ? "orchestra.actions.schedules.githubNote" : "orchestra.actions.schedules.gitlabNote")}</p></div></aside>
  </>
}
function Surface(p: SurfaceProps) {
  return (
    <>
      <aside class="ar-note">
        <Glyph name={p.kind === "runners" ? "server" : p.kind === "caches" ? "box" : "lock"} size={16} />
        <div>
          <strong>{p.noteTitle}</strong>
          <p>{p.note}</p>
        </div>
      </aside>
      <Table {...p} />
    </>
  )
}
function Head(p: RP & HeadCopy) {
  return (
    <header class="ar-head">
      <span class="mx-mark ar-mark"><Glyph name={p.glyph} size={24} /></span>
      <div class="ar-head-copy">
        <h2>{p.title}</h2>
        <p>{p.detail}</p>
        <Show when={p.summary}><div class="ar-summary">{p.summary}</div></Show>
      </div>
      <Show when={p.createKind}>
        <ActionButton
          action="create"
          icon="plus"
          label={p.create ?? ""}
          disabled={!createAllowed(p.state, p.createKind)}
          onClick={() => p.createKind && p.model.dialog({ kind: p.createKind })}
        />
      </Show>
      <Show when={p.topAction}>
        <ActionButton
          action="source"
          icon="code"
          label={p.topAction ?? ""}
          primary
          disabled={!p.topPath}
          onClick={() => p.topPath && p.model.navigate({ view: "source", path: p.topPath })}
        />
      </Show>
    </header>
  )
}
function Table(p: RP & { kind: Kind; label: string; headers: readonly string[]; emptyTitle: string; emptyDetail: string; waiting?: Run }) {
  return (
    <Show when={p.items.length} fallback={<Empty title={p.emptyTitle} detail={p.emptyDetail} />}>
      <div class="mx-table ar-table" role="table" aria-label={p.label}>
        <div class="ar-table-head" role="row">
          <For each={p.headers}>{(h) => <span role="columnheader">{h}</span>}</For>
        </div>
        <For each={p.items}>
          {(resource) => <Row {...p} resource={resource} />}
        </For>
      </div>
    </Show>
  )
}
function Row(p: RP & { kind: Kind; waiting?: Run; resource: Item; headers: readonly string[]; emptyTitle: string; emptyDetail: string }) {
  const resource = p.resource
  const data = () => json(resource.data)
  const status = () => resource.status || text(data(), "status") || text(data(), "state")
  const waiting = () => p.kind === "environments" && p.waiting && (text(data(), "runID") === p.waiting.id || text(data(), "run") === p.waiting.id) ? p.waiting : undefined
  const redacted = () => sensitive(resource, data())
  const inherited = () => data().inherited === true || text(data(), "origin").startsWith("Inherited")
  const identity = () => identityFor(p, resource, data(), redacted())
  return (
    <div class="mx-row ar-row" role="row">
      <div class="ar-identity" role="cell">
        <span class="mx-mark"><Glyph name={identity().glyph} size={16} /></span>
        <div>
          <strong title={p.kind === "caches" ? resource.name : undefined} tabIndex={p.kind === "caches" ? 0 : undefined}><bdi>{resource.name}</bdi></strong>
          <small><bdi>{identity().detail}</bdi></small>
          <div class="ar-tags">{identity().tags}</div>
        </div>
      </div>
      <div class="ar-row-meta" role="cell">
        <Meta
          {...p}
          resource={resource}
          data={data()}
          status={status()}
          redacted={redacted()}
          waiting={waiting()}
        />
      </div>
      <div class="ar-operations" role="cell">
        <Operations
          {...p}
          resource={resource}
          data={data()}
          inherited={inherited()}
          redacted={redacted()}
          waiting={waiting()}
        />
      </div>
    </div>
  )
}
function identityFor(p: { kind: Kind; state: State; t: Translate }, r: Item, d: Data, secret: boolean) {
  if (p.kind === "environments") {
    return {
      glyph: "upload" as const,
      detail: text(d, "description"),
      tags: <Badge value={p.t("orchestra.actions.projectEnvironment")} />,
    }
  }
  if (p.kind === "variables") {
    const scope = r.scope || text(d, "scope")
    const shown = scope === "Repository" && p.state.binding?.provider.kind === "gitlab"
      ? p.t("orchestra.actions.project")
      : scope === "Repository"
        ? p.t("orchestra.actions.repositoryScope")
      : scope
    const type = text(d, "type")
    return {
      glyph: secret ? "lock" as const : "code" as const,
      detail: p.t("orchestra.actions.projectOwnedConfiguration"),
      tags: <><Badge value={type === "Secret" ? p.t("orchestra.actions.secret") : type === "Variable" ? p.t("orchestra.actions.variable") : type} /><Badge value={shown} /></>,
    }
  }
  if (p.kind === "runners") {
    return {
      glyph: "server" as const,
      detail: text(d, "labels") || text(d, "tags"),
      tags: <Badge value={p.t(p.state.binding?.provider.kind === "gitlab"
        ? "orchestra.actions.tagRouting"
        : "orchestra.actions.labelRouting")} />,
    }
  }
  if (p.kind === "caches") {
    return {
      glyph: "box" as const,
      detail: text(d, "ref"),
      tags: <Badge value={p.t("orchestra.actions.repositoryCache")} />,
    }
  }
  return {
    glyph: "clock" as const,
    detail: text(d, "cron") ? [text(d, "cron"), text(d, "zone")].filter(Boolean).join(" · ") : "",
    tags: unreadable(d, r.status) ? <Badge value={p.t("orchestra.actions.unavailable")} tone="warm" /> : <Badge value={p.t(enabled(d, r.status)
      ? "orchestra.actions.active"
      : "orchestra.actions.paused")} tone={enabled(d, r.status) ? "good" : ""} />,
  }
}
function Meta(p: RP & { kind: Kind; resource: Item; data: Data; status: string; redacted: boolean; waiting?: Run }) {
  if (p.kind === "environments") return <><Badge value={p.status} tone={p.waiting ? "warm" : "good"} /><small>{p.t(p.waiting ? "orchestra.actions.reviewRequiredBeforeDeployment" : "orchestra.actions.policyAppliesToTarget")}</small></>
  if (p.kind === "variables") return <>{p.redacted ? <><span class="ar-redacted"><Glyph name="lock" size={16} />{p.t("orchestra.actions.valueRedacted")}</span><small>{p.t(p.state.binding?.provider.kind === "github" ? "orchestra.actions.replaceOnly" : "orchestra.actions.replaceValue")}</small></> : <><code dir="ltr">{text(p.data, "value")}</code><small>{p.t("orchestra.actions.readableVariable")}</small></>}{p.state.binding?.provider.kind === "gitlab" && <div class="ar-tags">{flags(p.data).map((flag) => <Badge value={p.t(flagKey(flag))} />)}</div>}</>
  if (p.kind === "runners") {
    const tone = p.status === "Online" || p.status === "Available" ? "good" : p.status === "Busy" ? "blue" : "warm"
    return <><Badge value={p.status} tone={tone} /><small>{text(p.data, "origin")}</small></>
  }
  if (p.kind === "caches") return <><strong>{bytes(amount(p.data.sizeInBytes) ?? amount(p.data.size))}</strong><small>{p.t("orchestra.actions.lastUsed", { age: relative(text(p.data, "lastAccessedAt") || text(p.data, "age")) })}</small></>
  // A schedule whose workflow could not be read keeps its row and states the problem there.
  if (p.kind === "schedules" && unreadable(p.data, p.resource.status))
    return <><strong>{p.t("orchestra.actions.scheduleUnreadable")}</strong><small><bdi>{problem(p.data)}</bdi></small></>
  const owner = p.resource.owner || text(p.data, "owner") || text(p.data, "actor")
  if (p.kind === "schedules" && p.state.binding?.provider.kind === "github") {
    return <><code dir="ltr">{text(p.data, "ref")}</code><small>{p.t("orchestra.actions.defaultBranchWorkflowSource")}</small></>
  }
  return <><code dir="ltr">{text(p.data, "ref")}</code><small>{p.t("orchestra.actions.ownerIdentity", { owner })}</small></>
}
function Operations(p: RP & { kind: Kind; resource: Item; data: Data; inherited: boolean; redacted: boolean; waiting?: Run }) {
  const r = p.resource
  if (p.kind === "environments") return <><ActionButton action="configure" label={p.t("orchestra.actions.configure")} disabled={!allowed(p.state, "resource.update", r)} onClick={() => p.model.dialog({ kind: "edit-environment", id: r.id, scope: r.scope })} /><Show when={p.waiting}><ActionButton action="review" icon="play" label={p.t("orchestra.actions.reviewDeployment")} onClick={() => p.waiting && p.model.navigate({ view: "run", runID: p.waiting.id })} /></Show><ActionButton action="delete" icon="trash" label={p.t("orchestra.actions.delete")} disabled={!allowed(p.state, "resource.delete", r)} onClick={() => p.model.dialog({ kind: "delete-environment", id: r.id, scope: r.scope })} /></>
  if (p.kind === "variables") return <><ActionButton action="edit" label={p.t(p.redacted ? "orchestra.actions.replace" : "orchestra.actions.edit")} disabled={!allowed(p.state, "resource.update", r)} onClick={() => p.model.dialog({ kind: "edit-variable", id: r.id, scope: r.scope })} /><ActionButton action="delete" icon="trash" label={p.t("orchestra.actions.delete")} disabled={!allowed(p.state, "resource.delete", r)} onClick={() => p.model.dialog({ kind: "delete-variable", id: r.id, scope: r.scope })} /></>
  if (p.kind === "runners") return <><ActionButton action="edit" label={p.t(p.state.binding?.provider.kind === "gitlab" ? "orchestra.actions.configure" : "orchestra.actions.editLabels")} disabled={p.inherited || !allowed(p.state, "resource.update", r)} title={p.inherited ? p.t("orchestra.actions.inheritedRunnerReason") : undefined} onClick={() => p.model.dialog({ kind: "edit-runner", id: r.id, scope: r.scope })} /><ActionButton action="remove" icon="trash" label={p.t("orchestra.actions.removeRunner")} disabled={p.inherited || !allowed(p.state, "runner.remove", r)} title={p.inherited ? p.t("orchestra.actions.inheritedRunnerRemoveReason") : undefined} onClick={() => p.model.dialog({ kind: "delete-runner", id: r.id, scope: r.scope })} /></>
  if (p.kind === "caches") return <ActionButton action="delete" icon="trash" label={p.t("orchestra.actions.delete")} disabled={!allowed(p.state, "resource.delete", r)} onClick={() => p.model.dialog({ kind: "delete-cache", id: r.id, scope: r.scope })} />
  const github = p.state.binding?.provider.kind === "github"
  const path = text(p.data, "path")
  const workflowID = text(p.data, "workflowID") || text(p.data, "workflowId")
  const ref = text(p.data, "ref")
  if (github) return <ActionButton action="source" icon="code" label={p.t("orchestra.actions.editYaml")} disabled={!path} onClick={() => path && p.model.navigate({ view: "source", path, workflowID, ref: ref || undefined })} />
  const active = enabled(p.data, r.status)
  return <><ActionButton action="edit" icon="settings" label={p.t("orchestra.actions.edit")} disabled={!allowed(p.state, "resource.update", r)} onClick={() => p.model.dialog({ kind: "edit-schedule", id: r.id, scope: r.scope })} /><ActionButton action="run" icon="play" label={p.t("orchestra.actions.runNow")} disabled={!allowed(p.state, "schedule.play", r)} onClick={() => p.model.resourceAction("play", r)} /><ActionButton action={active ? "pause" : "resume"} label={p.t(active ? "orchestra.actions.pause" : "orchestra.actions.resume")} disabled={!allowed(p.state, "resource.update", r)} onClick={() => p.model.resourceAction("pause", r)} /><ActionButton action="delete" icon="trash" label={p.t("orchestra.actions.delete")} disabled={!allowed(p.state, "resource.delete", r)} onClick={() => p.model.dialog({ kind: "delete-schedule", id: r.id, scope: r.scope })} /></>
}

type IconName = "workflow" | "play" | "retry" | "stop" | "logs" | "code" | "box" | "settings" | "refresh" | "plus" | "search" | "branch" | "arrow" | "check" | "close" | "warning" | "github" | "gitlab" | "local"
function ActionButton(p: { action: string; icon?: string; label: string; primary?: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  const shared = p.icon ? iconName(p.icon) : undefined
  const primary = p.primary || p.action === "create"
  return <button type="button" class={`mx-btn${primary ? " primary" : ""}`} data-action={p.action} disabled={p.disabled} title={p.title} onClick={p.onClick}>{p.action === "review" ? <Glyph name="lock" size={16} /> : p.icon === "trash" ? <Glyph name="trash" size={16} /> : <Show when={shared}>{(name) => <Icon name={name()} size={16} />}</Show>}{p.label}</button>
}
function iconName(value: string): IconName | undefined {
  switch (value) {
    case "workflow": case "play": case "retry": case "stop": case "logs": case "code": case "box": case "settings": case "refresh": case "plus": case "search": case "branch": case "arrow": case "check": case "close": case "warning": case "github": case "gitlab": case "local": return value
    default: return undefined
  }
}
function allowed(s: State, op: string, r: Item) { const data = json(r.data); return s.resources.status === "ready" && canRequest(s, op, r.scope) && data.readOnly !== true && data.readonly !== true && data.inherited !== true && (op !== "resource.update" || data.editable !== false) }
function allowedState(s: State, op: string) { return s.resources.status === "ready" && canRequest(s, op) }
function createAllowed(s: State, k?: CreateKind) { return Boolean(k) && allowedState(s, k === "create-runner" ? "runner.register" : "resource.create") }
function waitingRun(s: State): Run | undefined { return s.run.status === "ready" && s.run.value?.status === "waiting" && Boolean(s.binding && s.run.value.bindingID === s.binding.id) ? s.run.value : undefined }
function enabled(d: Data, status?: string) { return d.enabled === true || status === "Active" }
function flags(d: Data) { const value = d.flags; const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? value.split(/[·,\s]+/).filter(Boolean) : []; return [...new Set(values.filter((item) => ["Protected", "Masked", "Hidden"].includes(item)))] }
function flagKey(flag: string) { return flag === "Protected" ? "orchestra.actions.protected" : flag === "Masked" ? "orchestra.actions.masked" : "orchestra.actions.hidden" }
function sensitive(r: Item, d: Data) { return r.sensitive === true || text(d, "type") === "Secret" || flags(d).some((flag) => flag === "Masked" || flag === "Hidden") }
// A workflow whose YAML could not be read keeps its row; the problem replaces cron and ref.
function unreadable(d: Data, status?: string) { return d.unreadable === true || status === "Unreadable" || Boolean(problem(d)) }
function problem(d: Data) { return text(d, "problem") || text(d, "error") || text(json(d.error), "message") }
function amount(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined }
function json(value: unknown): Data { return isData(value) ? value : {} }
function isData(value: unknown): value is Data { return typeof value === "object" && value !== null && !Array.isArray(value) }
function text(data: Data, key: string) { const value = data[key]; if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(" · ") : "" }
type GlyphName = "box" | "upload" | "write" | "lock" | "trash" | "server" | "clock" | "read" | "verify" | "execute" | "command" | "code"
function Badge(p: { value: string; tone?: string }) { return <span class={`mx-badge ${p.tone ?? ""}`}>{p.value}</span> }
function Glyph(p: { name: GlyphName; size: 16 | 24 }) {
  const paths: Record<GlyphName, string> = {
    box: '<path d="m2 4 6-3 6 3v8l-6 3-6-3ZM2 4l6 3 6-3M8 7v8"/>',
    code: '<path d="m5 4-4 4 4 4M11 4l4 4-4 4"/>',
    upload: '<path d="M8 11V1m-4 4 4-4 4 4M2 10v4h12v-4"/>',
    write: '<path d="M7 3h7l4 4v14H7zM14 3v4h4M12.5 11v6M9.5 14h6"/>',
    lock: '<rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2M8 10v2"/>',
    trash: '<path d="M3 4h10M6 4V2h4v2m-6 0 1 10h6l1-10M7 7v4m2-4v4"/>',
    server: '<rect x="2" y="2" width="12" height="5" rx="1"/><rect x="2" y="9" width="12" height="5" rx="1"/><path d="M4 4.5h1M4 11.5h1M9 4.5h3M9 11.5h3"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
    read: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    verify: '<path d="M12 3 4.6 6v5.4c0 4.6 3.1 8.2 7.4 9.6 4.3-1.4 7.4-5 7.4-9.6V6z"/><path d="m8.8 12.1 2.3 2.3 4.2-4.5"/>',
    execute: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15.5H17"/>',
    command: '<path d="m5 7 5 5-5 5M12 18h7"/>',
  }
  const node = ["read", "verify", "execute", "command", "write"].includes(p.name)
  return <svg class="wf-ic" width={p.size} height={p.size} viewBox={node ? "0 0 24 24" : "0 0 16 16"} aria-hidden="true" innerHTML={paths[p.name]} />
}
