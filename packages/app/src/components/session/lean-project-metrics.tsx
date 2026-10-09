import { createMemo, For, type JSX } from "solid-js"
import { LeanSummary } from "@orchestra/schema/lean-summary"
import type { Message, Part, Session } from "@orchestra/sdk/v2/client"
import { useLanguage } from "@/context/language"

/** DirectorySync history is server-wide; select known native project owners before aggregation. */
export function collectLeanProjectRecords(
  data: {
    project: string
    message: Readonly<Record<string, readonly Pick<Message, "id" | "sessionID">[]>>
    part: Readonly<Record<string, readonly Part[] | undefined>>
  },
  session: (id: string) => Pick<Session, "projectID" | "revert"> | undefined,
): unknown[] {
  if (!data.project) return []
  return Object.entries(data.message).flatMap(([id, messages]) => {
    const info = session(id)
    if (!info || info.projectID !== data.project) return []
    return messages.flatMap((message) => {
      if (message.sessionID !== id || (info.revert && message.id >= info.revert.messageID)) return []
      return (data.part[message.id] ?? []).flatMap((part) =>
        part.type === "tool" && part.sessionID === id && part.messageID === message.id && part.state.status === "completed"
          ? [part.state.metadata.lean]
          : [],
      )
    })
  })
}

export function LeanProjectMetrics(props: {
  projectID: string
  records: readonly unknown[]
  coverage: "loaded-history" | "complete-history"
  orchestraProfile?: string
}): JSX.Element {
  const language = useLanguage()
  const summary = createMemo(() => LeanSummary.summarize({ ...props }))
  const number = (value: number | null) => value === null ? language.t("lean.unavailable") : value.toLocaleString(language.intl())
  const stats = () => [
    ["lean.observed", summary().observedCalls],
    ["lean.eligible", summary().eligibleCalls],
    ["lean.applied", summary().appliedCalls],
    ["lean.bytesSaved", summary().bytesSaved],
    ["lean.tokensSaved", summary().estimatedTokenCalls ? summary().estimatedTokensSaved : null],
    ["lean.tokenCalls", summary().estimatedTokenCalls],
    ["lean.latencySamples", summary().latency.samples],
    ["lean.p50", summary().latency.p50],
    ["lean.p95", summary().latency.p95],
    ["lean.p99", summary().latency.p99],
  ] as const
  const groups = () => [
    ["lean.filterProfiles", summary().filterProfiles],
    ["lean.models", summary().models],
    ["lean.orchestraProfiles", summary().orchestraProfiles],
  ] as const
  return (
    <section aria-label={language.t("lean.project.title")} class="flex flex-col gap-4" data-component="lean-project-metrics">
      <h3 class="text-14-medium text-text-strong">{language.t("lean.project.title")}</h3>
      <p class="text-12-regular text-text-weak">{language.t("lean.project.scope", { projectID: props.projectID })}</p>
      <p class="text-12-regular text-text-weak">{language.t(summary().coverage === "loaded-history" ? "lean.loadedHistory" : "lean.completeHistory")}</p>
      <dl class="grid grid-cols-1 @[32rem]:grid-cols-2 gap-4">
        <For each={stats()}>{([label, value]) => (
          <div>
            <dt class="text-12-regular text-text-weak">{language.t(label)}</dt>
            <dd class="text-12-medium text-text-strong">{number(value)}</dd>
          </div>
        )}</For>
      </dl>
      <div>
        <h4>{language.t("lean.reasons")}</h4>
        <dl><For each={Object.entries(summary().reasons)} fallback={<p>{language.t("lean.unavailable")}</p>}>
          {([reason, count]) => <div class="flex justify-between gap-3"><dt>{reason}</dt><dd>{number(count)}</dd></div>}
        </For></dl>
      </div>
      <For each={groups()}>{([label, entries]) => (
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
    </section>
  )
}
