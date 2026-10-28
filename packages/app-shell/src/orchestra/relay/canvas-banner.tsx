import { Show } from "solid-js"
import { decisionTime, type RelayDecision, type RelayDocument, type RelayInstall, type RelayKind } from "./client"
import type { EditorProps } from "./editor"
import { runHandle, RUN_TONE } from "./format"
import { type Flow, nodeOf } from "./graph"
import { stateLabel } from "./parts"
import { relayPath } from "./route"
import type { RelayRun } from "./runs"
import { Ic, type useRelayCopy } from "./ui"

type BannerProps = Pick<EditorProps, "route" | "profile" | "go" | "close"> & {
  kind: RelayKind
  document: RelayDocument
  flow: Flow
  run: RelayRun | undefined
  decision: RelayDecision | undefined
  decisionKnown?: boolean
  installed: RelayInstall | undefined
  test: { path: string[]; result: string; label: string } | undefined
  onClearTest: () => void
  onUpdateInstall: (installID: string) => void
}

// The strip above the canvas and the list views: a hook test in progress, the workflow's latest run, or a hook's install.
// Reads props lazily, so call it from a reactive context.
export function canvasBanner(props: BannerProps, copy: ReturnType<typeof useRelayCopy>) {
  const workflow = props.kind === "workflow"
  if (props.test)
    return (
      <div class="wf-banner">
        <Ic name="test" />
        <span>{copy.t("orchestra.hooks.canvas.test", { label: props.test.label, result: props.test.result })}</span>
        <small>{copy.t("orchestra.hooks.canvas.graphOnly")}</small>
        <button type="button" class="mx-btn" onClick={props.onClearTest}>
          {copy.t("orchestra.hooks.canvas.clear")}
        </button>
      </div>
    )
  if (workflow && props.run) {
    const run = props.run
    const at = nodeOf(props.flow, run.position)?.name ?? run.position ?? ""
    const viewing = !!props.route.view
    const id = runHandle(run.runID)
    const text = viewing
      ? copy.t(
          run.position && run.status !== "completed"
            ? "orchestra.workflows.banner.viewingAt"
            : "orchestra.workflows.banner.viewing",
          { id, state: stateLabel(copy, run), step: at },
        )
      : run.status === "parked"
        ? copy.t("orchestra.workflows.banner.waiting", { id, step: at })
        : run.status === "running"
          ? copy.t("orchestra.workflows.banner.running", { id, step: at })
          : copy.t("orchestra.workflows.banner.last", {
              id,
              state: stateLabel(copy, run),
              when: copy.when(run.startedAt),
            })
    return (
      <div class="wf-banner" classList={{ warm: run.status === "parked" }}>
        <span class={`wf-dot ${RUN_TONE[run.status]}`} />
        <span>{text}</span>
        <Show when={!viewing && run.version !== undefined && run.version !== props.document.versionCounter}>
          <small>v{run.version}</small>
        </Show>
        <button
          type="button"
          class={run.status === "parked" && !viewing ? "mx-btn primary" : "mx-btn"}
          onClick={() =>
            viewing
              ? props.close(relayPath.history("workflow", props.document.id, run.runID))
              : props.go(relayPath.history("workflow", props.document.id, run.runID))
          }
        >
          {copy.t(
            viewing
              ? "orchestra.workflows.banner.back"
              : run.status === "parked"
                ? "orchestra.workflows.live.review"
                : "orchestra.workflows.banner.view",
          )}
        </button>
      </div>
    )
  }
  if (!workflow && props.installed) {
    const installed = props.installed
    // The install pins a versionId; a later publish leaves it on the earlier one until it is updated.
    const current = installed.version === props.document.activeVersionId
    return (
      <div class="wf-banner" classList={{ warm: !current }}>
        <span class={`wf-dot ${current ? "good" : "warm"}`} />
        <span>
          {[
            installed.unpublished
              ? copy.t("orchestra.hooks.canvas.installedUnpublished", { profile: props.profile })
              : current
                ? copy.t("orchestra.hooks.canvas.installed", {
                    profile: props.profile,
                    version: props.document.publishedCounter ?? "",
                  })
                : copy.t("orchestra.hooks.canvas.installedEarlier", { profile: props.profile }),
            props.decision
              ? `${copy.t(`orchestra.hooks.outcome.${props.decision.outcome}`)} ${copy.when(decisionTime(props.decision))}`
              : props.decisionKnown !== false
                ? copy.t("orchestra.hooks.canvas.notFired")
                : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <Show when={!current && props.document.activeVersionId}>
          <button type="button" class="mx-btn primary" onClick={() => props.onUpdateInstall(installed.installID)}>
            {copy.t("orchestra.hooks.canvas.update")}
          </button>
        </Show>
        <button type="button" class="mx-btn" onClick={() => props.go(relayPath.history("hook", props.document.id))}>
          {copy.t("orchestra.hooks.tab.activity")}
        </button>
      </div>
    )
  }
}
