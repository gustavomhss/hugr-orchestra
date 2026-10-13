import { createMemo, Show, type JSX } from "solid-js"
import type { LeanMetrics } from "../../../schema/src/lean-metrics"
import { useI18n } from "@orchestra/ui/context/i18n"

export function LeanToolMetrics(props: { metric: LeanMetrics.Decision }): JSX.Element {
  const i18n = useI18n()
  const number = createMemo(() => new Intl.NumberFormat(i18n.locale(), { maximumFractionDigits: 3 }))
  const percent = createMemo(() => new Intl.NumberFormat(i18n.locale(), { style: "percent", maximumFractionDigits: 1 }))
  const estimated = () => props.metric.tokens.kind === "estimated" ? props.metric.tokens : undefined

  return (
    <section
      data-component="lean-tool-metrics"
      aria-label={i18n.t("ui.leanToolMetrics.title", { project: props.metric.owner.projectID })}
      class="text-12-regular text-text-weak px-3 py-2"
    >
      <div class="text-text-strong break-all">{i18n.t("ui.leanToolMetrics.title", { project: props.metric.owner.projectID })}</div>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 break-all">
        <dt>{i18n.t("ui.leanToolMetrics.scope")}</dt>
        <dd>{i18n.t("ui.leanToolMetrics.standardRegistry")}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.bytesBefore")}</dt>
        <dd data-slot="bytes-before" title={i18n.t("ui.leanToolMetrics.exactBytes")}>{number().format(props.metric.bytes.before)}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.bytesAfter")}</dt>
        <dd data-slot="bytes-after" title={i18n.t("ui.leanToolMetrics.exactBytes")}>{number().format(props.metric.bytes.after)}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.bytesSaved")}</dt>
        <dd data-slot="bytes-saved">{number().format(props.metric.bytes.saved)}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.percentSaved")}</dt>
        <dd data-slot="percent-saved">
          {props.metric.bytes.before > 0
            ? percent().format(props.metric.bytes.saved / props.metric.bytes.before)
            : i18n.t("ui.leanToolMetrics.notApplicable")}
        </dd>
        <Show when={estimated()} fallback={<>
          <dt>{i18n.t("ui.leanToolMetrics.estimatedTokens")}</dt>
          <dd data-slot="tokens-unavailable">{i18n.t("ui.leanToolMetrics.unavailable")}</dd>
        </>}>
          {(tokens) => <>
            <dt>{i18n.t("ui.leanToolMetrics.tokensBefore")}</dt>
            <dd data-slot="tokens-before" title={i18n.t("ui.leanToolMetrics.estimateHint")}>{number().format(tokens().before)}</dd>
            <dt>{i18n.t("ui.leanToolMetrics.tokensAfter")}</dt>
            <dd data-slot="tokens-after" title={i18n.t("ui.leanToolMetrics.estimateHint")}>{number().format(tokens().after)}</dd>
            <dt>{i18n.t("ui.leanToolMetrics.tokensSaved")}</dt>
            <dd data-slot="tokens-saved" title={i18n.t("ui.leanToolMetrics.estimateHint")}>{number().format(tokens().saved)}</dd>
            <dt>{i18n.t("ui.leanToolMetrics.counter")}</dt>
            <dd data-slot="token-counter">{tokens().counter}</dd>
          </>}
        </Show>
        <dt>{i18n.t("ui.leanToolMetrics.model")}</dt>
        <dd>{props.metric.model.provider}/{props.metric.model.id}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.status")}</dt>
        <dd data-slot="status">{i18n.t(`ui.leanToolMetrics.status.${props.metric.status}`)}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.reason")}</dt>
        <dd data-slot="reason">{props.metric.reason}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.filterProfile")}</dt>
        <dd data-slot="filter-profile">{props.metric.filterProfile ?? i18n.t("ui.leanToolMetrics.unavailable")}</dd>
        <dt>{i18n.t("ui.leanToolMetrics.latency")}</dt>
        <dd data-slot="duration">{i18n.t("ui.leanToolMetrics.milliseconds", { value: number().format(props.metric.durationMs) })}</dd>
      </dl>
    </section>
  )
}
