import { Show } from "solid-js"
import type { Translate } from "./contract"

export type IconName = "workflow" | "play" | "retry" | "stop" | "logs" | "code" | "box" | "settings" | "refresh" | "plus" | "search" | "branch" | "arrow" | "check" | "close" | "warning" | "github" | "gitlab" | "local"

export function Icon(props: { name: IconName; size?: number }) {
  const size = () => props.size ?? 16
  const content = () => {
    switch (props.name) {
      case "workflow": return <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6h2a4 4 0 0 1 4 4v4"/></>
      case "play": return <path d="m8 5 10 7-10 7z"/>
      case "retry": return <path d="M20 11a8 8 0 0 0-14-3L4 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14 3l2-2m0 0v5m0-5h-5"/>
      case "stop": return <rect x="5" y="5" width="14" height="14" rx="2"/>
      case "logs": return <path d="M5 6h14M5 10h14M5 14h9M5 18h7"/>
      case "code": return <path d="m8 6-5 6 5 6M16 6l5 6-5 6"/>
      case "box": return <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9"/>
      case "settings": return <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L8 17l.1-.1A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.6-1h-.1v-2.4h.1a1.7 1.7 0 0 0 1.6-1A1.7 1.7 0 0 0 8.1 8L8 7.9l1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.1h2.4V5a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L20 7.9l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1V13.3h-.1a1.7 1.7 0 0 0-1.6 1.7Z"/></>
      case "refresh": return <path d="M20 11a8 8 0 0 0-14-4L4 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14 4l2-3"/>
      case "plus": return <path d="M12 5v14M5 12h14"/>
      case "search": return <><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></>
      case "branch": return <><circle cx="7" cy="5" r="2"/><circle cx="17" cy="19" r="2"/><circle cx="7" cy="19" r="2"/><path d="M7 7v10M9 7c5 0 8 2 8 10"/></>
      case "arrow": return <path d="M4 12h16m-6-6 6 6-6 6"/>
      case "check": return <path d="m5 12 4 4L19 6"/>
      case "close": return <path d="m6 6 12 12M18 6 6 18"/>
      case "warning": return <path d="m12 3 9 17H3zM12 9v5m0 3v.1"/>
      case "github": return <path d="M12 3a9 9 0 0 0-9 9c0 4 2.6 7.4 6.2 8.6.5.1.7-.2.7-.5v-1.7c-2.5.5-3-.9-3-.9-.4-1-.9-1.2-.9-1.2-.8-.5.1-.5.1-.5.9.1 1.4.9 1.4.9.8 1.4 2.1 1 2.6.8.1-.6.3-1 .6-1.2-2-.2-4.1-1-4.1-4.4 0-1 .4-1.8.9-2.4-.1-.2-.4-1.1.1-2.3 0 0 .8-.2 2.5.9a8.5 8.5 0 0 1 4.6 0c1.7-1.1 2.5-.9 2.5-.9.5 1.2.2 2.1.1 2.3.6.6.9 1.4.9 2.4 0 3.4-2.1 4.2-4.1 4.4.3.3.6.8.6 1.6v2.4c0 .3.2.6.7.5A9 9 0 0 0 21 12a9 9 0 0 0-9-9Z"/>
      case "gitlab": return <><path d="M12 21 3 14 5.5 3 9 10h6l3.5-7L21 14Z"/><path d="M3 14l6-4 3 11 3-11 6 4M9 10h6"/></>
      case "local": return <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8v8H8z"/></>
    }
  }
  return <svg class={`actions-icon actions-icon-${props.name}`} width={size()} height={size()} viewBox="0 0 24 24" aria-hidden="true">{content()}</svg>
}

export function Status(props: { status?: string | null; conclusion?: string | null; t: Translate }) {
  const rawStatus = () => props.status?.trim()
  const rawConclusion = () => props.conclusion?.trim()
  const normalizedStatus = () => rawStatus()?.toLowerCase()
  const normalizedConclusion = () => rawConclusion()?.toLowerCase()
  const live = ["queued", "pending", "running", "in_progress", "waiting", "manual", "preparing", "waiting_for_resource", "scheduled", "created"]
  const refinement = ["success", "passed", "failure", "failed", "error", "canceled", "cancelled", "skipped", "timed_out", "timeout", "timedout", "action_required", "startup_failure"]
  const selected = () => {
    const status = normalizedStatus()
    const conclusion = normalizedConclusion()
    if (status && live.includes(status)) return status
    if (status === "completed" && refinement.includes(conclusion ?? "")) return conclusion
    if (status === "completed") return conclusion || status
    return status || conclusion
  }
  const labels: Record<string, Parameters<Translate>[0]> = { queued: "orchestra.actions.queued", pending: "orchestra.actions.queued", running: "orchestra.actions.running", in_progress: "orchestra.actions.running", preparing: "orchestra.actions.running", waiting_for_resource: "orchestra.actions.waiting", scheduled: "orchestra.actions.queued", created: "orchestra.actions.queued", waiting: "orchestra.actions.waiting", manual: "orchestra.actions.waiting", success: "orchestra.actions.passed", passed: "orchestra.actions.passed", failure: "orchestra.actions.failed", failed: "orchestra.actions.failed", error: "orchestra.actions.failed", startup_failure: "orchestra.actions.failed", timed_out: "orchestra.actions.failed", timeout: "orchestra.actions.failed", timedout: "orchestra.actions.failed", action_required: "orchestra.actions.waiting", canceled: "orchestra.actions.canceled", cancelled: "orchestra.actions.canceled", skipped: "orchestra.actions.skipped" }
  const selectedRaw = () => {
    const status = normalizedStatus()
    if (status === "completed") return rawConclusion() || rawStatus()
    return rawStatus() || rawConclusion()
  }
  const key = () => {
    const value = selected() ?? ""
    return Object.hasOwn(labels, value) ? labels[value] : undefined
  }
  const kind = () => {
    const current = selected()
    if (["success", "passed"].includes(current ?? "")) return "good"
    if (["failure", "failed", "error", "startup_failure", "timed_out", "timeout", "timedout"].includes(current ?? "")) return "bad"
    if (["queued", "pending", "running", "in_progress", "preparing", "waiting_for_resource", "scheduled", "created", "waiting", "manual", "action_required"].includes(current ?? "")) return "warm"
    return "neutral"
  }
  // `idle` is a load-slot state, not a provider status: there is nothing to report yet.
  return <Show when={selected() !== "idle"}><span class={`actions-status ${kind()}`} role="status" title={key() ? undefined : props.t("orchestra.actions.unknown")}><i aria-hidden="true"/><bdi>{key() ? props.t(key()!) : selectedRaw() || props.t("orchestra.actions.unknown")}</bdi></span></Show>
}

// A failure state passes `retry` so the user can re-run the failed load from the same place.
export function Empty(props: { title: string; detail?: string; busy?: boolean; error?: string; retry?: { label: string; run: () => void } }) {
  return <section class="actions-empty" role="status" aria-live="polite" aria-busy={props.busy === true}>
    <strong>{props.title}</strong><Show when={props.detail}><p>{props.detail}</p></Show>
    <Show when={props.busy}><span class="actions-empty-progress" aria-hidden="true"/></Show>
    <Show when={props.error}><p class="actions-error" role="alert">{props.error}</p></Show>
    <Show when={props.retry}>{(retry) => <button type="button" class="mx-btn" data-slot="actions-retry" onClick={retry().run}>{retry().label}</button>}</Show>
  </section>
}
