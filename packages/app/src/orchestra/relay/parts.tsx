import { createSignal, For, Show } from "solid-js"
import { documentProfile, type RelayDocument, type RelayKind } from "./client"
import { profileDrafts } from "./drafts"
import type { RelayRun } from "./runs"
import { badgeTone, RUN_TONE, runHandle } from "./format"
import { checkCount, type Flow, type Issue, nodeOf, START, steps } from "./graph"
import { relayPath } from "./route"
import type { RelaySource } from "./source"
import { Ic, useRelayCopy } from "./ui"

// The draft has edits Maestro does not see yet: it was published, and the draft moved on.
export const unpublishedChanges = (document: RelayDocument) =>
  !!document.activeVersionId && document.activeVersionId !== document.versionId

// States, not counters: every autosave is a version, so a number would mean nothing to the user. The counters stay in a tooltip.
export function VersionBadges(props: { document: RelayDocument }) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.document.activeVersionId}
      fallback={
        <span
          class="mx-badge warm"
          title={copy.t("orchestra.workflows.badge.versionTitle", { version: props.document.versionCounter })}
        >
          {copy.t("orchestra.workflows.badge.unpublished")}
        </span>
      }
    >
      <span class="mx-badge good" title={publishedTitle(copy, props.document)}>
        {copy.t("orchestra.workflows.badge.published")}
      </span>
      <Show when={unpublishedChanges(props.document)}>
        <span class="mx-badge" title={aheadTitle(copy, props.document)}>
          {copy.t("orchestra.workflows.badge.draft")}
        </span>
      </Show>
    </Show>
  )
}

// The editor head shows one badge: unpublished, ahead of the published version, or published.
export function HeadBadge(props: { document: RelayDocument }) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.document.activeVersionId}
      fallback={
        <span
          class="mx-badge warm"
          title={copy.t("orchestra.workflows.badge.versionTitle", { version: props.document.versionCounter })}
        >
          {copy.t("orchestra.workflows.badge.unpublished")}
        </span>
      }
    >
      <Show
        when={unpublishedChanges(props.document)}
        fallback={
          <span class="mx-badge good" title={publishedTitle(copy, props.document)}>
            {copy.t("orchestra.workflows.badge.published")}
          </span>
        }
      >
        <span class="mx-badge wf-badge-full" title={aheadTitle(copy, props.document)}>
          {copy.t("orchestra.workflows.badge.publishedAhead")}
        </span>
        {/* Narrow windows keep the part that asks for action. */}
        <span class="mx-badge wf-badge-compact" title={aheadTitle(copy, props.document)}>
          {copy.t("orchestra.workflows.badge.draft")}
        </span>
      </Show>
    </Show>
  )
}

function publishedTitle(copy: ReturnType<typeof useRelayCopy>, document: RelayDocument) {
  if (document.publishedCounter === undefined) return undefined
  return copy.t("orchestra.workflows.badge.publishedTitle", { version: document.publishedCounter })
}

function aheadTitle(copy: ReturnType<typeof useRelayCopy>, document: RelayDocument) {
  return [
    copy.t("orchestra.workflows.badge.aheadTitle"),
    copy.t("orchestra.workflows.badge.versionTitle", { version: document.versionCounter }),
    publishedTitle(copy, document),
  ]
    .filter(Boolean)
    .join("\n")
}

export function stateLabel(copy: ReturnType<typeof useRelayCopy>, run: RelayRun) {
  return copy.t(`orchestra.workflows.state.${run.status}`)
}

export function RunState(props: { run: RelayRun | undefined; flow: Flow | undefined }) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.run}
      fallback={
        <span class="wf-state">
          <span class="wf-dot" />
          <small>{copy.t("orchestra.workflows.last.none")}</small>
        </span>
      }
    >
      {(run) => {
        const step = () => (props.flow ? nodeOf(props.flow, run().position)?.name : undefined) ?? run().position
        return (
          <span class="wf-state wf-last">
            <span class={`wf-dot ${RUN_TONE[run().status]}`} />
            <span>
              <span>
                {stateLabel(copy, run())} · #{runHandle(run().runID)}
              </span>
              <small>
                {[run().status !== "completed" ? step() : undefined, copy.when(run().startedAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
          </span>
        )
      }}
    </Show>
  )
}

export function RunBadge(props: { run: RelayRun }) {
  const copy = useRelayCopy()
  return <span class={`mx-badge ${badgeTone(RUN_TONE[props.run.status])}`}>{stateLabel(copy, props.run)}</span>
}

export function Chain(props: { names: string[] }) {
  return (
    <div class="wf-chain">
      <For each={props.names}>
        {(name, index) => (
          <>
            <Show when={index() > 0}>
              <i aria-hidden="true">→</i>
            </Show>
            <span>{name}</span>
          </>
        )}
      </For>
    </div>
  )
}

export function phaseNames(flow: Flow) {
  const order = steps(flow).map((node) => node.id)
  return flow.phases
    .filter((phase) => phase.nodeIds.length)
    .toSorted((a, b) => order.indexOf(a.nodeIds[0]) - order.indexOf(b.nodeIds[0]))
    .map((phase) => phase.name)
}

// Drafts that could not be saved and are kept in memory, with why and a way out.
export function RetainedDrafts(props: { source: RelaySource; kind: RelayKind; go: (path: string) => void }) {
  const copy = useRelayCopy()
  const [confirming, setConfirming] = createSignal<string>()
  return (
    <For
      each={profileDrafts(props.source).filter(
        (draft) =>
          draft.state.flow.kind === props.kind && draft.state.save.dirty && draft.state.save.state !== "saving",
      )}
    >
      {(draft) => (
        <p class="mx-note wf-retained" role="status">
          <span>
            {draft.state.save.state === "error"
              ? copy.t("orchestra.workflows.drafts.error", { name: draft.state.name })
              : draft.state.save.state === "conflict"
                ? copy.t("orchestra.workflows.drafts.conflict", { name: draft.state.name })
                : copy.t("orchestra.workflows.drafts.retained", { name: draft.state.name })}
          </span>
          <button
            type="button"
            class="mx-btn"
            onClick={() => props.go(relayPath.editor(props.kind, draft.state.base.id))}
          >
            {copy.t("orchestra.workflows.menu.open")}
          </button>
          <Show
            when={confirming() === draft.state.base.id}
            fallback={
              <button type="button" class="mx-btn" onClick={() => setConfirming(draft.state.base.id)}>
                {copy.t("orchestra.workflows.drafts.discard")}
              </button>
            }
          >
            <button type="button" class="mx-btn danger" onClick={() => draft.discard()}>
              {copy.t("orchestra.workflows.drafts.discardConfirm")}
            </button>
            <button type="button" class="mx-btn" onClick={() => setConfirming(undefined)}>
              {copy.t("orchestra.workflows.drafts.keep")}
            </button>
          </Show>
        </p>
      )}
    </For>
  )
}

const PROFILE_NAMES = {
  tdd_feature: "orchestra.workflows.template.tddFeature",
  "wp-execute": "orchestra.workflows.template.wpExecute",
} as const

// A shipped profile's name for people. A profile without one keeps the name the server gave it.
export function templateName(copy: ReturnType<typeof useRelayCopy>, document: RelayDocument) {
  const profile = documentProfile(document)
  const key =
    profile && Object.hasOwn(PROFILE_NAMES, profile) ? PROFILE_NAMES[profile as keyof typeof PROFILE_NAMES] : undefined
  return key ? copy.t(key) : document.name
}

// A seeded profile's objective without its "name vX — " prefix, which the card title already says.
export function templateSummary(document: RelayDocument) {
  const brief = document.nodes.find((node) => node.type === START)?.parameters.relayBrief
  const text = typeof brief === "string" ? brief.replace(/^[\w-]+ v[\d.]+ — /, "") : ""
  return text || document.description
}

export function TemplateCard(props: {
  id: string
  flows: Map<string, Flow>
  documents: RelayDocument[]
  selected?: boolean
  radio?: boolean
  disabled?: boolean
  tabstop?: boolean
  onPick: (id: string) => void
}) {
  const copy = useRelayCopy()
  const document = () => props.documents.find((item) => item.id === props.id)
  const flow = () => props.flows.get(props.id)
  return (
    <button
      type="button"
      class="mx-card wf-tpl"
      role={props.radio ? "radio" : undefined}
      aria-checked={props.radio ? !!props.selected : undefined}
      aria-disabled={props.disabled ? "true" : undefined}
      disabled={props.disabled}
      tabindex={props.radio ? (props.selected || props.tabstop ? 0 : -1) : undefined}
      data-template={props.id}
      onClick={() => !props.disabled && props.onPick(props.id)}
    >
      <div class="mx-card-top">
        <span class="mx-mark">
          <Ic name={props.id === "blank" ? "plus" : "workflows"} />
        </span>
        <h3>{document() ? templateName(copy, document()!) : copy.t("orchestra.workflows.template.blank")}</h3>
      </div>
      <p>
        {document()
          ? templateSummary(document()!) || copy.t("orchestra.workflows.template.copy")
          : copy.t("orchestra.workflows.template.blankBody")}
      </p>
      <Chain names={flow() ? phaseNames(flow()!) : [copy.t("orchestra.workflows.type.start")]} />
      <div class="mx-meta" style={{ "margin-top": "10px" }}>
        <Show when={flow()} fallback={<span class="mx-badge">{copy.t("orchestra.workflows.template.empty")}</span>}>
          {(current) => (
            <>
              <span class="mx-badge">
                {copy.count(
                  phaseNames(current()).length,
                  "orchestra.workflows.count.phase.one",
                  "orchestra.workflows.count.phase.other",
                )}
              </span>
              <span class="mx-badge">
                {copy.count(
                  steps(current()).length,
                  "orchestra.workflows.count.step.one",
                  "orchestra.workflows.count.step.other",
                )}
              </span>
              <span class="mx-badge">
                {copy.count(
                  checkCount(current()),
                  "orchestra.workflows.count.check.one",
                  "orchestra.workflows.count.check.other",
                )}
              </span>
            </>
          )}
        </Show>
      </div>
    </button>
  )
}

export function issueText(copy: ReturnType<typeof useRelayCopy>, flow: Flow, issue: Issue) {
  if (issue.code === "server") return issue.text
  const name = "node" in issue ? (nodeOf(flow, issue.node)?.name ?? "") : ""
  return copy.t(`orchestra.workflows.issue.${issue.code}`, { name })
}
