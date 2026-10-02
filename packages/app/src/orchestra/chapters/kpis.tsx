import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createMemo, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { ClientError } from "@opencode-ai/client/promise"
import { aggregateUsage, loadUsage, usageCsv, UsageUnavailable } from "./kpis-data"
import "./kpis.css"

export function RecordedUsage(props: { directory: string; sdk: ServerSDK }) {
  const language = useLanguage()
  const [state, setState] = createStore({
    status: "loading" as "loading" | "complete" | "error" | "unavailable",
    count: 0,
    usage: undefined as ReturnType<typeof aggregateUsage>,
  })
  const lifecycle = { abort: new AbortController() }
  onCleanup(() => lifecycle.abort.abort())
  const numbers = createMemo(() => new Intl.NumberFormat(language.intl()))
  const currency = createMemo(() => new Intl.NumberFormat(language.intl(), { style: "currency", currency: "USD" }))
  const number = (amount: number, raw: boolean) => (raw ? String(amount) : numbers().format(amount))
  const cost = (amount: number | undefined, raw: boolean) =>
    amount === undefined
      ? language.t("orchestra.kpis.unavailableSpend")
      : raw
        ? String(amount)
        : currency().format(amount)
  const metrics = (raw = false) => {
    const usage = state.usage
    if (!usage) return []
    return [
      [language.t("orchestra.kpis.sessions"), number(usage.sessions, raw)],
      [language.t("orchestra.kpis.input"), number(usage.tokens.input, raw)],
      [language.t("orchestra.kpis.output"), number(usage.tokens.output, raw)],
      [language.t("orchestra.kpis.reasoning"), number(usage.tokens.reasoning, raw)],
      [language.t("orchestra.kpis.read"), number(usage.tokens.read, raw)],
      [language.t("orchestra.kpis.write"), number(usage.tokens.write, raw)],
      [language.t("orchestra.kpis.total"), number(usage.total, raw)],
      [language.t("orchestra.kpis.spend"), cost(usage.cost, raw)],
    ]
  }
  const ranking = (raw = false) =>
    state.usage?.top.map((session) => [session.title, number(session.total, raw), cost(session.cost, raw)]) ?? []
  const headers = () => [
    language.t("orchestra.kpis.session"),
    language.t("orchestra.kpis.total"),
    language.t("orchestra.kpis.spend"),
  ]
  function download() {
    if (state.status !== "complete") return
    const url = URL.createObjectURL(
      new Blob(
        [
          usageCsv([
            [language.t("orchestra.kpis.title")],
            [language.t("orchestra.kpis.description")],
            ...metrics(true),
            [language.t("orchestra.kpis.top")],
            headers(),
            ...ranking(true),
            [language.t("orchestra.kpis.costNote")],
          ]),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = language.t("orchestra.kpis.filename")
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  function load() {
    lifecycle.abort.abort()
    lifecycle.abort = new AbortController()
    const signal = lifecycle.abort.signal
    setState({ status: "loading", count: 0, usage: undefined })
    void props.sdk.protocol
      .then(async (protocol) => {
        if (signal.aborted) return
        if (protocol !== "v2") {
          setState("status", "unavailable")
          return
        }
        const usage = await loadUsage({
          directory: props.directory,
          list: (query, options) => props.sdk.currentApi.session.list(query, options),
          signal,
          progress: (count) => {
            if (!signal.aborted) setState("count", count)
          },
        })
        if (!signal.aborted) setState({ status: "complete", usage })
      })
      .catch((cause: unknown) => {
        if (signal.aborted) return
        const unavailable =
          cause instanceof UsageUnavailable ||
          (cause instanceof ClientError &&
            typeof cause.cause === "object" &&
            cause.cause !== null &&
            "status" in cause.cause &&
            [404, 405, 501].includes(Number(cause.cause.status)))
        setState("status", unavailable ? "unavailable" : "error")
      })
  }
  onMount(load)

  return (
    <section
      class="orchestra-kpis"
      data-component="orchestra-kpis"
      aria-labelledby="orchestra-kpis-title"
      aria-busy={state.status === "loading"}
    >
      <header class="orchestra-kpis-heading">
        <div>
          <h2 id="orchestra-kpis-title">{language.t("orchestra.kpis.title")}</h2>
          <p>{language.t("orchestra.kpis.description")}</p>
        </div>
        <ButtonV2 variant="outline" size="small" disabled={state.status !== "complete"} onClick={download}>
          {language.t("orchestra.kpis.export")}
        </ButtonV2>
      </header>
      <Show when={state.status === "loading"}>
        <p role="status">{language.t("orchestra.kpis.loading", { count: numbers().format(state.count) })}</p>
      </Show>
      <Show when={state.status === "error"}>
        <div role="alert">
          <p>{language.t("orchestra.kpis.error")}</p>
          <ButtonV2 size="small" onClick={load}>
            {language.t("orchestra.kpis.retry")}
          </ButtonV2>
        </div>
      </Show>
      <Show when={state.status === "unavailable"}>
        <p role="status">{language.t("orchestra.kpis.unavailable")}</p>
      </Show>
      <Show when={state.status === "complete"}>
        <Show when={state.usage?.sessions === 0}>
          <p>{language.t("orchestra.kpis.empty")}</p>
        </Show>
        <dl class="orchestra-kpis-metrics">
          <For each={metrics()}>
            {(row) => (
              <div data-slot="usage-metric">
                <dt>{row[0]}</dt>
                <dd>{row[1]}</dd>
              </div>
            )}
          </For>
        </dl>
        <h3>{language.t("orchestra.kpis.top")}</h3>
        <div class="orchestra-kpis-ranking">
          <table>
            <thead>
              <tr>
                <For each={headers()}>{(label) => <th scope="col">{label}</th>}</For>
              </tr>
            </thead>
            <tbody>
              <For each={ranking()}>
                {(row) => (
                  <tr>
                    <For each={row}>{(value) => <td>{value}</td>}</For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p>{language.t("orchestra.kpis.costNote")}</p>
      </Show>
    </section>
  )
}
