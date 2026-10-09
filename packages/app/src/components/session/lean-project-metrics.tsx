import { createMemo, For, Show, type JSX } from "solid-js"
import { unwrap } from "solid-js/store"
import { LeanSummary } from "@orchestra/schema/lean-summary"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import type { Message, Part, Session } from "@orchestra/sdk/v2/client"
import { useLanguage } from "@/context/language"

/** DirectorySync history is server-wide; select known native project owners before aggregation. */
export function collectLeanProjectRecords(
  data: {
    project: string
    message: Readonly<Record<string, readonly Pick<Message, "id" | "sessionID">[]>>
    part: Readonly<Record<string, readonly Part[] | undefined>>
  },
  session: (id: string) => Pick<Session, "id" | "projectID" | "directory" | "revert"> | undefined,
): LeanMetrics.Decision[] {
  if (!data.project) return []
  return Object.entries(data.message).flatMap(([id, messages]) => {
    const info = session(id)
    if (!info || info.id !== id || info.projectID !== data.project) return []
    const boundary = info.revert ? messages.findIndex((message) => message.id === info.revert?.messageID) : messages.length
    if (boundary < 0) return []
    return messages.flatMap((message, index) => {
      if (message.sessionID !== id || index > boundary || (index === boundary && !info.revert?.partID)) return []
      const parts = data.part[message.id] ?? []
      const partBoundary = index === boundary ? parts.findIndex((part) => part.id === info.revert?.partID) : parts.length
      // A missing part boundary excludes only that message; its known earlier prefix remains visible.
      return (partBoundary < 0 ? [] : parts.slice(0, partBoundary)).flatMap((part) => {
        if (part.type !== "tool" || part.sessionID !== id || part.messageID !== message.id || part.state.status !== "completed") return []
        const metric = LeanMetrics.decode(snapshotLeanRecord(part.state.metadata.lean))
        if (!metric || metric.owner.projectID !== info.projectID || metric.owner.sessionID !== id
          || metric.owner.callID !== part.callID || metric.owner.location !== info.directory) return []
        return [metric]
      })
    })
  })
}

function snapshotLeanRecord(value: unknown): unknown {
  try {
    // Read through proxies to track nested updates; clone the wire data without Solid's own symbols.
    JSON.stringify(value)
    return structuredClone(unwrap(value))
  } catch {
    return value
  }
}

export function LeanProjectMetrics(props: {
  projectID: string
  records: readonly unknown[]
  coverage: "loaded-history" | "complete-history"
  orchestraProfile?: string
}): JSX.Element {
  const language = useLanguage()
  const records = createMemo(() => props.records.map(snapshotLeanRecord))
  const summary = createMemo(() => LeanSummary.summarize({ ...props, records: records() }))
  const available = createMemo(() => {
    const value = summary()
    return value.unavailable === undefined ? value : undefined
  })
  const number = (value: number | null) => value === null ? language.t("lean.unavailable") : value.toLocaleString(language.intl())
  const stats = (value: LeanMetrics.AvailableSummary) => [
    ["lean.observed", value.observedCalls],
    ["lean.eligible", value.eligibleCalls],
    ["lean.applied", value.appliedCalls],
    ["lean.bytesSaved", value.bytesSaved],
    ["lean.tokensSaved", value.estimatedTokenCalls ? value.estimatedTokensSaved : null],
    ["lean.tokenCalls", value.estimatedTokenCalls],
    ["lean.latencySamples", value.latency.samples],
    ["lean.p50", value.latency.p50],
    ["lean.p95", value.latency.p95],
    ["lean.p99", value.latency.p99],
  ] as const
  const groups = (value: LeanMetrics.AvailableSummary) => [
    ["lean.filterProfiles", value.filterProfiles],
    ["lean.models", value.models],
    ["lean.orchestraProfiles", value.orchestraProfiles],
  ] as const
  return (
    <section aria-label={language.t("lean.project.title")} class="flex flex-col gap-4" data-component="lean-project-metrics">
      <h3 class="text-14-medium text-text-strong">{language.t("lean.project.title")}</h3>
      <p class="text-12-regular text-text-weak">{language.t("lean.project.scope", { projectID: props.projectID })}</p>
      <p class="text-12-regular text-text-weak">{language.t(summary().coverage === "loaded-history" ? "lean.loadedHistory" : "lean.completeHistory")}</p>
      <Show when={available()} fallback={<p role="status">{language.t(summary().unavailable === "overflow" ? "lean.overflow" : "lean.invalidScope")}</p>}>
      {(metrics) => <>
      <dl class="grid grid-cols-1 @[32rem]:grid-cols-2 gap-4">
        <For each={stats(metrics())}>{([label, value]) => (
          <div>
            <dt class="text-12-regular text-text-weak">{language.t(label)}</dt>
            <dd class="text-12-medium text-text-strong">{number(value)}</dd>
          </div>
        )}</For>
      </dl>
      <div>
        <h4>{language.t("lean.reasons")}</h4>
        <dl><For each={Object.entries(metrics().reasons)} fallback={<p>{language.t("lean.unavailable")}</p>}>
          {([reason, count]) => <div class="flex justify-between gap-3"><dt>{reason}</dt><dd>{number(count)}</dd></div>}
        </For></dl>
      </div>
      <For each={groups(metrics())}>{([label, entries]) => (
        <div>
          <h4>{language.t(label)}</h4>
          <dl><For each={Object.entries(entries)} fallback={<p>{language.t("lean.unavailable")}</p>}>
            {([name, group]) => (
              <div class="flex justify-between gap-3">
                <dt>{name}</dt>
                <dd>{language.t("lean.group", {
                  calls: number(group.calls),
                  bytes: number(group.bytesSaved),
                  tokens: number(group.estimatedTokenCalls ? group.estimatedTokensSaved : null),
                  tokenCalls: number(group.estimatedTokenCalls),
                })}</dd>
              </div>
            )}
          </For></dl>
        </div>
      )}</For>
      </>}
      </Show>
    </section>
  )
}
