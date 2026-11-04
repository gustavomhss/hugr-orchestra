import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ExecutionReport, Page } from "./model"
import { IssueDiscussion } from "./discussion"
import { stageKey } from "./keys"
import "./executions.css"

type Metrics = ExecutionReport["metrics"]

/** Measured categories stay separate: reasoning and cache counters are not safely additive across providers. */
export function ExecutionMetrics(props: { metrics: Metrics }) {
  const language = useLanguage()
  const t = language.t
  const number = (value: number | null | undefined) => value == null ? t("orchestra.board.workspace.unknown") : new Intl.NumberFormat(language.intl(), { maximumFractionDigits: 3 }).format(value)
  const money = (value: number) => t("orchestra.board.workspace.usd", { value: new Intl.NumberFormat(language.intl(), { maximumSignificantDigits: 6 }).format(value) })
  return (
    <div class="board-execution-metrics">
      <dl>
        <div><dt>{t("orchestra.board.workspace.input")}</dt><dd>{number(props.metrics.tokens?.input)}</dd></div>
        <div><dt>{t("orchestra.board.workspace.output")}</dt><dd>{number(props.metrics.tokens?.output)}</dd></div>
        <div><dt>{t("orchestra.board.workspace.reasoning")}</dt><dd>{number(props.metrics.tokens?.reasoning)}</dd></div>
        <div><dt>{t("orchestra.board.workspace.cacheRead")}</dt><dd>{number(props.metrics.tokens?.cacheRead)}</dd></div>
        <div><dt>{t("orchestra.board.workspace.cacheWrite")}</dt><dd>{number(props.metrics.tokens?.cacheWrite)}</dd></div>
        <div><dt>{t("orchestra.board.workspace.modelUsd")}</dt><dd>{props.metrics.modelUsd === null ? t("orchestra.board.workspace.unmetered") : money(props.metrics.modelUsd)}</dd></div>
        <div><dt>{t("orchestra.board.workspace.providerTime")}</dt><dd>{props.metrics.providerMs === null ? t("orchestra.board.workspace.unknown") : t("orchestra.board.workspace.seconds", { value: number(props.metrics.providerMs / 1000) })}</dd></div>
        <div><dt>{t("orchestra.board.workspace.tools")}</dt><dd>{number(props.metrics.toolUses)}</dd></div>
        <Show when={props.metrics.ciRuns > 0}>
          <div><dt>{t("orchestra.board.workspace.ciUsd")}</dt><dd>{props.metrics.ciUsd === null ? t("orchestra.board.workspace.unmetered") : money(props.metrics.ciUsd)}</dd></div>
          <div><dt>{t("orchestra.board.workspace.ciTime")}</dt><dd>{t("orchestra.board.workspace.seconds", { value: number(props.metrics.ciMs === null ? null : props.metrics.ciMs / 1000) })}</dd></div>
        </Show>
      </dl>
      <Show when={props.metrics.partial}><p class="board-quiet">{t("orchestra.board.workspace.partial")}</p></Show>
    </div>
  )
}

export function ExecutionReceipt(props: { report: ExecutionReport; stage: Page["issue"]["stage"]; stageEnteredAt: number; time: (at: number) => string }) {
  const language = useLanguage()
  const t = language.t
  const latest = () => props.report.receipts.toReversed().find((receipt) => receipt.stage === props.stage && receipt.closedAt >= props.stageEnteredAt)
  return (
    <Show when={props.stage === "shipped" || props.stage === "cut"}>
      <section class="board-receipt" aria-label={t("orchestra.board.workspace.receipt")}>
        <header><h3>{t("orchestra.board.workspace.receipt")}</h3>
          <Show when={latest()}>{(receipt) => <time>{props.time(receipt().closedAt)}</time>}</Show>
        </header>
        <Show when={latest()} fallback={<p class="board-quiet">{t("orchestra.board.workspace.noReceipt")}</p>}>
          {(receipt) => <>
            <div class="board-receipt-summary"><b>{t(stageKey[receipt().stage])}</b>
              <span>{t("orchestra.board.workspace.attempts", { count: receipt().attempts })}</span>
              <span>{t("orchestra.board.workspace.leadTime", { value: new Intl.NumberFormat(language.intl(), { maximumFractionDigits: 1 }).format(receipt().leadTimeMs / 1000) })}</span>
            </div>
            <ExecutionMetrics metrics={receipt().metrics} />
          </>}
        </Show>
      </section>
    </Show>
  )
}

export function IssueExecutions(props: { report?: ExecutionReport; failed: boolean; page: Page; time: (at: number) => string; retry: () => void }) {
  const language = useLanguage()
  const t = language.t
  const loose = () => props.page.notes.filter((note) => note.kind != null && note.attempt == null)
  const unmatched = () => [...new Set(props.page.notes.flatMap((note) =>
    note.kind != null && note.attempt != null && !props.report?.attempts.some((attempt) => attempt.n === note.attempt) ? [note.attempt] : [],
  ))]
  return <section class="board-executions" aria-label={t("orchestra.board.workspace.executions")}>
    <Show when={props.failed}><div class="board-execution-status" role="alert"><p>{t("orchestra.board.workspace.failed")}</p><button type="button" class="mx-btn" onClick={props.retry}>{t("orchestra.board.retry")}</button></div></Show>
    <Show when={props.report} fallback={<Show when={!props.failed}><p class="board-quiet" role="status">{t("orchestra.board.loading")}</p></Show>}>
      {(report) => <>
        <section class="board-execution-total"><h3>{t("orchestra.board.workspace.allAttempts")}</h3><p class="board-quiet">{t("orchestra.board.workspace.timeHint")}</p><ExecutionMetrics metrics={report().metrics} /></section>
        <Show when={report().unassignedSessions.length > 0}>
          <section class="board-execution-status"><p>{t("orchestra.board.workspace.unassigned")}</p>
            <ExecutionPeople people={report().participants.filter((person) => report().unassignedSessions.includes(person.sessionID))} />
          </section>
        </Show>
        <Show when={report().unattributedSessions.length > 0}>
          <p class="board-execution-status">{t("orchestra.board.workspace.shared")} <span class="board-mono">{report().unattributedSessions.join(", ")}</span></p>
        </Show>
        <Show when={report().attempts.length > 0} fallback={<p class="board-quiet">{t("orchestra.board.workspace.noAttempts")}</p>}>
          <For each={[...report().attempts].reverse()}>{(attempt, index) => (
            <details class="board-execution" data-attempt={attempt.n} open={index() === 0}>
              <summary><span><b>{t("orchestra.board.workspace.attempt", { n: attempt.n })}</b><span>{attempt.seat ?? t("orchestra.board.workspace.unknown")}</span></span>
                <span>{t(`orchestra.board.workspace.outcome.${attempt.outcome ?? "open"}`)}</span>
              </summary>
              <div class="board-execution-content">
                <dl class="board-execution-facts">
                  <dt>{t("orchestra.board.workspace.started")}</dt><dd>{props.time(attempt.startedAt)}</dd>
                  <dt>{t("orchestra.board.workspace.ended")}</dt><dd>{attempt.endedAt === null ? t("orchestra.board.workspace.outcome.open") : props.time(attempt.endedAt)}</dd>
                  <dt>{t("orchestra.board.workspace.session")}</dt><dd class="board-mono">{attempt.sessionID ?? t("orchestra.board.workspace.unknown")}</dd>
                  <dt>{t("orchestra.board.workspace.branch")}</dt><dd class="board-mono">{attempt.branch ?? t("orchestra.board.workspace.unknown")}</dd>
                  <dt>{t("orchestra.board.workspace.pr")}</dt><dd>{attempt.prNumber === null ? t("orchestra.board.workspace.unknown") : `#${attempt.prNumber}`}</dd>
                </dl>
                <Show when={attempt.cause}><p class="board-execution-cause">{attempt.cause}</p></Show>
                <ExecutionMetrics metrics={attempt.metrics} />
                <ExecutionPeople people={attempt.participants} />
                <IssueDiscussion channel="execution" issueID={props.page.issue.id} notes={props.page.notes.filter((note) => note.attempt === attempt.n)} time={props.time} />
              </div>
            </details>
          )}</For>
        </Show>
        <Show when={report().receipts.length > 0}><details class="board-execution"><summary>{t("orchestra.board.workspace.previousReceipts")}</summary><div class="board-execution-content">
          <For each={report().receipts}>{(receipt) => <section class="board-receipt"><header><h4>{t(stageKey[receipt.stage])}</h4><time>{props.time(receipt.closedAt)}</time></header><ExecutionMetrics metrics={receipt.metrics} /></section>}</For>
        </div></details></Show>
      </>}
    </Show>
    <For each={unmatched()}>{(n) => <details class="board-execution" data-recorded-attempt={n}>
      <summary>{t("orchestra.board.workspace.attempt", { n })}</summary>
      <div class="board-execution-content">
        <p class="board-quiet">{t("orchestra.board.workspace.attemptUnavailable")}</p>
        <IssueDiscussion channel="execution" issueID={props.page.issue.id} notes={props.page.notes.filter((note) => note.attempt === n)} time={props.time} />
      </div>
    </details>}</For>
    <Show when={loose().length > 0}><details class="board-execution board-execution-unassociated"><summary>{t("orchestra.board.workspace.unassociated")}</summary><div class="board-execution-content">
      <p class="board-quiet">{t("orchestra.board.workspace.unassociatedHint")}</p>
      <IssueDiscussion channel="execution" issueID={props.page.issue.id} notes={loose()} time={props.time} />
    </div></details></Show>
  </section>
}

function ExecutionPeople(props: { people: ExecutionReport["participants"] }) {
  const language = useLanguage()
  const t = language.t
  return <section class="board-execution-people"><h4>{t("orchestra.board.workspace.participants")}</h4>
    <For each={props.people}>{(person) => <div class="board-execution-person">
      <header><b>{person.seats.join(", ") || t("orchestra.board.workspace.unknown")}</b><span>{t(`orchestra.board.workspace.role.${person.role}`)}</span></header>
      <span class="board-mono">{person.sessionID}</span>
      <For each={person.models}>{(entry) => <div class="board-execution-model"><span>{entry.model.id}<small>{entry.model.providerID}{entry.model.variant ? ` · ${entry.model.variant}` : ""}</small></span>
        <span>{entry.billing === "subscription" ? t("orchestra.board.workspace.subscription") : entry.usd === null ? t("orchestra.board.workspace.unmetered") : t("orchestra.board.workspace.usd", { value: new Intl.NumberFormat(language.intl(), { maximumSignificantDigits: 6 }).format(entry.usd) })}</span>
      </div>}</For>
    </div>}</For>
  </section>
}
