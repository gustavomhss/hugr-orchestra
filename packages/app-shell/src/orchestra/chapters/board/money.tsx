import { createEffect, createSignal, For, Match, onMount, Show, Switch, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import {
  against,
  budgetValue,
  chain,
  checkTick,
  costliest,
  dayInput,
  dayValue,
  fill,
  monogram,
  proofChecks,
  shares,
  usd,
  type Decision,
  type Meter,
  type Proof,
  type SpendReport,
} from "./model"
import { budgetKey, checkKey, decidedKey } from "./keys"
import "./money.css"

type Budget = SpendReport["budget"]

// The header's spend chip. It reads as a quiet chip while the budget is fine and turns amber past 80%.
export function SpendChip(props: { spend: SpendReport | undefined; paused: boolean; onOpen: () => void }) {
  const language = useLanguage()
  const t = language.t
  const money = (value: number) => usd(value, language.intl())
  return (
    <Show when={props.spend}>
      {(spend) => (
        <button
          type="button"
          class="board-chip money-chip"
          data-state={spend().budget.state}
          aria-label={t("orchestra.money.chip.label")}
          onClick={props.onOpen}
        >
          <Show
            when={props.paused}
            fallback={
              <Show
                when={spend().budget.budgetUsd !== null}
                fallback={t("orchestra.money.chip.open", { spent: money(spend().budget.spentUsd) })}
              >
                {t("orchestra.money.chip", {
                  spent: money(spend().budget.spentUsd),
                  budget: money(spend().budget.budgetUsd ?? 0),
                })}
              </Show>
            }
          >
            {t("orchestra.money.paused")}
          </Show>
        </button>
      )}
    </Show>
  )
}

// A right-hand sheet shared by the money, decisions and settings panels. It takes focus when it opens.
function Sheet(props: { title: string; wide?: boolean; onClose: () => void; children: JSX.Element }) {
  const t = useLanguage().t
  let sheet: HTMLElement | undefined
  onMount(() => sheet?.focus())
  return (
    <>
      <div class="board-scrim" aria-hidden="true" onClick={props.onClose} />
      <aside
        ref={sheet}
        class="board-peek money-sheet"
        data-wide={props.wide}
        role="dialog"
        aria-label={props.title}
        tabindex="-1"
      >
        <header class="money-sheet-head">
          <h2>{props.title}</h2>
          <button type="button" class="board-icon-button" aria-label={t("orchestra.money.close")} onClick={props.onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        {props.children}
      </aside>
    </>
  )
}

function Amount(props: { value: Meter }) {
  const language = useLanguage()
  const value = () => props.value
  return (
    <Show
      when={(() => {
        const current = value()
        return current.kind === "usd" ? current : undefined
      })()}
      fallback={
        <span class="money-unmetered">
          {language.t("orchestra.money.notMetered", { source: (() => {
            const current = value()
            return current.kind === "not-metered" ? current.source : ""
          })() })}
        </span>
      }
    >
      {(metered) => <b>{usd(metered().usd, language.intl())}</b>}
    </Show>
  )
}

export function MoneyPanel(props: {
  spend: SpendReport
  failed: boolean
  epicTitle: (number: number) => string | undefined
  cardTitle: (number: number) => string | undefined
  onSettings: () => void
  onCard: (ref: string) => void
  onClose: () => void
}) {
  const language = useLanguage()
  const t = language.t
  const money = (value: number) => usd(value, language.intl())
  const budget = () => props.spend.budget
  const models = () => shares(props.spend.project.byModel)
  const seats = () => [...props.spend.seats].sort((a, b) => b.usd - a.usd || a.seat.localeCompare(b.seat))
  const epics = () => [...props.spend.epics].sort((a, b) => b.usd - a.usd || a.epic - b.epic)
  const cards = () => costliest(props.spend.cards).filter((card) => card.usd > 0 || card.models.kind === "not-metered")
  const top = () => Math.max(1, ...models().map((row) => row.usd))
  return (
    <Sheet title={t("orchestra.money.title")} onClose={props.onClose}>
      <div class="money-body">
        <Show when={props.failed}>
          <p class="board-quiet">{t("orchestra.money.failed")}</p>
        </Show>
        <section class="money-hero" data-state={budget().state}>
          <div class="money-figure">
            <strong>{money(budget().spentUsd)}</strong>
            <Show when={budget().budgetUsd !== null}>
              <span>{t("orchestra.money.of", { budget: money(budget().budgetUsd ?? 0) })}</span>
              <span class="money-percent">{t("orchestra.money.percent", { percent: Math.round(budget().percent ?? 0) })}</span>
            </Show>
          </div>
          <Show when={budget().budgetUsd !== null}>
            <div
              class="money-meter"
              role="meter"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(fill(budget().percent))}
              aria-label={t(budgetKey[budget().state])}
            >
              <i style={{ "inline-size": `${fill(budget().percent)}%` }} />
            </div>
          </Show>
          <p class="money-state">{t(budgetKey[budget().state])}</p>
          <Show when={props.spend.project.partial}>
            <p class="money-quiet">{t("orchestra.money.partial")}</p>
          </Show>
          <div class="money-forecast">
            <span>{t("orchestra.money.forecast")}</span>
            <Show
              when={budget().forecastUsd !== null && budget().forecastUsd}
              keyed
              fallback={<span class="money-quiet">{t("orchestra.money.forecast.none")}</span>}
            >
              {(forecast) => (
                <b>
                  {budget().forecastPercent === null
                    ? money(forecast)
                    : t("orchestra.money.forecast.line", {
                        forecast: money(forecast),
                        percent: Math.round(budget().forecastPercent ?? 0),
                      })}
                </b>
              )}
            </Show>
          </div>
        </section>

        <section class="money-bands">
          <div class="money-band">
            <span>{t("orchestra.money.models")}</span>
            <Amount value={props.spend.project.models} />
          </div>
          <div class="money-band">
            <span>{t("orchestra.money.infra")}</span>
            <Amount value={props.spend.project.infra} />
          </div>
        </section>
        <section class="board-sec money-infra">
          <h3>{t("orchestra.money.infraItems")}</h3>
          <div class="money-row">
            <span>{t("orchestra.money.ci")}</span>
            <Amount value={props.spend.project.infra} />
          </div>
          <div class="money-row">
            <span>{t("orchestra.money.sandboxes")}</span>
            <span class="money-unmetered">{t("orchestra.money.notMetered", { source: t("orchestra.money.source.sandboxes") })}</span>
          </div>
          <div class="money-row">
            <span>{t("orchestra.money.hosting")}</span>
            <span class="money-unmetered">{t("orchestra.money.notMetered", { source: t("orchestra.money.source.hosting") })}</span>
          </div>
        </section>
        <Show when={props.spend.infraSyncedAt}>
          {(at) => (
            <p class="money-quiet">
              {t("orchestra.money.synced", {
                time: new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(at()),
              })}
            </p>
          )}
        </Show>

        <Show when={models().length > 0}>
          <section class="board-sec">
            <h3>{t("orchestra.money.byModel")}</h3>
            <For each={models()}>
              {(row) => (
                <div class="money-row">
                  <span>{row.model}</span>
                  <i class="money-share" aria-hidden="true">
                    <i style={{ "inline-size": `${(row.usd / top()) * 100}%` }} />
                  </i>
                  <b>{money(row.usd)}</b>
                </div>
              )}
            </For>
          </section>
        </Show>

        <Show when={seats().length > 0}>
          <section class="board-sec">
            <h3>{t("orchestra.money.bySeat")}</h3>
            <For each={seats()}>
              {(row) => (
                <div class="money-row">
                  <span>
                    <span class="board-seat" aria-hidden="true">
                      {monogram(row.seat)}
                    </span>{" "}
                    {row.seat}
                  </span>
                  <Amount value={{ kind: "usd", usd: row.usd }} />
                </div>
              )}
            </For>
          </section>
        </Show>

        <Show when={epics().length > 0}>
          <section class="board-sec">
            <h3>{t("orchestra.money.byEpic")}</h3>
            <For each={epics()}>
              {(row) => (
                <div class="money-row">
                  <span>{props.epicTitle(row.epic) ?? row.ref}</span>
                  <Amount value={{ kind: "usd", usd: row.usd }} />
                </div>
              )}
            </For>
          </section>
        </Show>

        <section class="board-sec">
          <h3>{t("orchestra.money.byCard")}</h3>
          <Show when={cards().length > 0} fallback={<p class="money-quiet">{t("orchestra.money.none")}</p>}>
            <For each={cards()}>
              {(card) => (
                <button type="button" class="money-card" data-flagged={card.flagged} onClick={() => props.onCard(card.ref)}>
                  <span class="board-id">{card.ref}</span>
                  <span class="money-card-title">{props.cardTitle(card.issue)}</span>
                  <Amount value={card.usd === 0 && card.models.kind === "not-metered" ? card.models : { kind: "usd", usd: card.usd }} />
                  <Show when={card.flagged && card.epicMedianUsd !== null}>
                    <span class="money-quiet money-card-note">
                      {t("orchestra.money.outlier", { median: money(card.epicMedianUsd ?? 0) })}
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </section>

        <div class="money-actions">
          <button type="button" class="mx-btn" onClick={props.onSettings}>
            {t("orchestra.money.edit")}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

export function DecisionsPanel(props: {
  decisions: readonly Decision[] | undefined
  failed: boolean
  focus: string | undefined
  cardRef: (number: number) => string | undefined
  onOverturn: (id: string, option: string, text: string) => Promise<string | undefined>
  onClose: () => void
}) {
  const language = useLanguage()
  const t = language.t
  const day = (at: number) => new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(at)
  const rows = () => chain(props.decisions ?? [])
  const [open, setOpen] = createSignal<string>()
  const [pick, setPick] = createSignal("")
  const [why, setWhy] = createSignal("")
  const [failure, setFailure] = createSignal<string>()
  let list: HTMLDivElement | undefined
  createEffect(() => {
    const id = props.focus
    if (!id || !props.decisions) return
    requestAnimationFrame(() => list?.querySelector(`[data-decision="${id}"]`)?.scrollIntoView?.({ block: "center" }))
  })
  const start = (id: string) => {
    setOpen(id)
    setPick("")
    setWhy("")
    setFailure(undefined)
  }
  const submit = (id: string) => {
    if (!pick()) return
    void props.onOverturn(id, pick(), why()).then((error) => (error ? setFailure(error) : setOpen(undefined)))
  }
  const label = (decision: Decision, option: string) => decision.options.find((item) => item.id === option)?.label ?? option
  return (
    <Sheet title={t("orchestra.decisions.title")} wide onClose={props.onClose}>
      <p class="money-quiet">{t("orchestra.decisions.description")}</p>
      <Switch>
        <Match when={props.failed && !props.decisions}>
          <p class="mx-error" role="alert">
            {t("orchestra.decisions.failed")}
          </p>
        </Match>
        <Match when={props.decisions && props.decisions.length === 0}>
          <p class="board-quiet">{t("orchestra.decisions.empty")}</p>
        </Match>
        <Match when={props.decisions}>
          <div class="money-decisions" ref={list}>
            <For each={rows()}>
              {(row) => (
                <article
                  class="money-decision"
                  data-decision={row.decision.id}
                  data-focus={props.focus === row.decision.id}
                  data-overturned={row.decision.overturnedBy !== null}
                >
                  <header>
                    <span>{day(row.decision.date)}</span>
                    <span class="money-quiet">
                      {t(decidedKey[row.decision.answeredBy])}
                    </span>
                    <Show when={row.decision.issue !== null && props.cardRef(row.decision.issue ?? 0)}>
                      {(ref) => <span class="board-id">{ref()}</span>}
                    </Show>
                    <Show when={row.decision.overturnedBy !== null}>
                      <span class="board-chip">{t("orchestra.decisions.overturned")}</span>
                    </Show>
                  </header>
                  <h3>{row.decision.question}</h3>
                  <ul class="money-options" aria-label={t("orchestra.decisions.options")}>
                    <For each={row.decision.options}>
                      {(option) => (
                        <li data-chosen={option.id === row.decision.chosen} data-recommended={option.id === row.decision.recommended}>
                          <span>{option.label}</span>
                          <Show when={option.id === row.decision.recommended}>
                            <em>{t("orchestra.decisions.recommended")}</em>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                  <p class="money-answer">
                    <span class="money-quiet">{t("orchestra.decisions.answer")}</span> <b>{row.decision.chosenLabel}</b>
                    <Show when={row.decision.text}>{(text) => <> · {text()}</>}</Show>
                  </p>
                  <Show when={against(row.decision)}>
                    <p class="board-held-note">{t("orchestra.decisions.against")}</p>
                  </Show>
                  <p class="money-answer">
                    <span class="money-quiet">{t("orchestra.decisions.outcome")}</span> {row.decision.outcome}
                  </p>
                  <Show when={row.replaces}>
                    {(old) => (
                      <p class="money-link">
                        {t("orchestra.decisions.replaces", { date: day(old().date) })} · {t("orchestra.decisions.before")}:{" "}
                        {old().chosenLabel}
                      </p>
                    )}
                  </Show>
                  <Show when={row.replacedBy}>
                    {(next) => (
                      <p class="money-link">
                        {t("orchestra.decisions.overturnedBy", { date: day(next().date) })} · {t("orchestra.decisions.after")}:{" "}
                        {next().chosenLabel}
                      </p>
                    )}
                  </Show>
                  <Show when={row.decision.overturnedBy === null}>
                    <Show
                      when={open() === row.decision.id}
                      fallback={
                        <button type="button" class="mx-btn" onClick={() => start(row.decision.id)}>
                          {t("orchestra.decisions.overturn")}
                        </button>
                      }
                    >
                      <form
                        class="money-form"
                        onSubmit={(event) => {
                          event.preventDefault()
                          submit(row.decision.id)
                        }}
                      >
                        <fieldset>
                          <legend>{t("orchestra.decisions.overturn.pick")}</legend>
                          <For each={row.decision.options.filter((option) => option.id !== row.decision.chosen)}>
                            {(option) => (
                              <label>
                                <input
                                  type="radio"
                                  name={`overturn-${row.decision.id}`}
                                  checked={pick() === option.id}
                                  onChange={() => setPick(option.id)}
                                />
                                <span>{label(row.decision, option.id)}</span>
                                <span class="money-quiet">{option.consequence}</span>
                              </label>
                            )}
                          </For>
                        </fieldset>
                        <label class="money-field">
                          <span>{t("orchestra.decisions.overturn.text")}</span>
                          <input class="board-input" value={why()} onInput={(event) => setWhy(event.currentTarget.value)} />
                        </label>
                        <Show when={failure()}>
                          {(error) => (
                            <p class="mx-error" role="alert">
                              {error()}
                            </p>
                          )}
                        </Show>
                        <div class="money-actions">
                          <button type="submit" class="mx-btn" disabled={!pick()}>
                            {t("orchestra.decisions.overturn.confirm")}
                          </button>
                          <button type="button" class="mx-btn" onClick={() => setOpen(undefined)}>
                            {t("orchestra.decisions.overturn.cancel")}
                          </button>
                        </div>
                      </form>
                    </Show>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </Match>
        <Match when={true}>
          <p class="board-quiet board-loading">{t("orchestra.board.loading")}</p>
        </Match>
      </Switch>
    </Sheet>
  )
}

export function SettingsPanel(props: {
  targetDate: number | null
  budgetUsd: number | null
  onSave: (input: { target_date?: number | null; budget_usd?: number | null; reason?: string }) => Promise<string | undefined>
  onClose: () => void
}) {
  const t = useLanguage().t
  const [target, setTarget] = createSignal(dayInput(props.targetDate))
  const [budget, setBudget] = createSignal(props.budgetUsd === null ? "" : String(props.budgetUsd))
  const [reason, setReason] = createSignal("")
  const [failure, setFailure] = createSignal<string>()
  const [saved, setSaved] = createSignal(false)
  const submit = (event: Event) => {
    event.preventDefault()
    setSaved(false)
    const day = dayValue(target())
    const money = budgetValue(budget())
    if (day === undefined) return setFailure(t("orchestra.settings.invalid.date"))
    if (money === undefined) return setFailure(t("orchestra.settings.invalid.budget"))
    setFailure(undefined)
    // Only what changed is sent, so saving one field never rewrites the other.
    void props
      .onSave({
        ...(target() === dayInput(props.targetDate) ? {} : { target_date: day }),
        ...(money === props.budgetUsd ? {} : { budget_usd: money }),
        ...(reason().trim() ? { reason: reason().trim() } : {}),
      })
      .then((error) => (error ? setFailure(error) : setSaved(true)))
  }
  return (
    <Sheet title={t("orchestra.settings.title")} onClose={props.onClose}>
      <form class="money-form money-settings" onSubmit={submit}>
        <label class="money-field">
          <span>{t("orchestra.settings.target")}</span>
          <input class="board-input" type="date" value={target()} onInput={(event) => setTarget(event.currentTarget.value)} />
          <small class="money-quiet">{t("orchestra.settings.target.hint")}</small>
        </label>
        <label class="money-field">
          <span>{t("orchestra.settings.budget")}</span>
          <input
            class="board-input"
            inputmode="decimal"
            value={budget()}
            onInput={(event) => setBudget(event.currentTarget.value)}
          />
          <small class="money-quiet">{t("orchestra.settings.budget.hint")}</small>
        </label>
        <label class="money-field">
          <span>{t("orchestra.settings.reason")}</span>
          <input class="board-input" value={reason()} onInput={(event) => setReason(event.currentTarget.value)} />
        </label>
        <Show when={failure()}>
          {(error) => (
            <p class="mx-error" role="alert">
              {error()}
            </p>
          )}
        </Show>
        <div class="money-actions">
          <button type="submit" class="mx-btn">
            {t("orchestra.settings.save")}
          </button>
          <Show when={saved()}>
            <span class="money-quiet" role="status">
              {t("orchestra.settings.saved")}
            </span>
          </Show>
        </div>
      </form>
    </Sheet>
  )
}

// The proof block inside a card's detail: what the PR, the checks and the guardrail say, and which decision led here.
export function ProofPanel(props: { proof: Proof; onDecision: (id: string) => void }) {
  const language = useLanguage()
  const t = language.t
  const checks = () => proofChecks(props.proof)
  const running = () => checks().some((check) => checkTick(check) === "run")
  return (
    <section class="board-sec money-proof">
      <h3>{t("orchestra.proof.title")}</h3>
      <Show when={props.proof.banner}>
        <p class="money-banner" role="status">
          {t("orchestra.proof.banner")}
        </p>
      </Show>
      <div class="money-proof-block">
        <h4>{t("orchestra.proof.pr")}</h4>
        <Show when={props.proof.pr} fallback={<p class="money-quiet">{t("orchestra.proof.pr.none")}</p>}>
          {(pr) => (
            <p>
              <span class="board-mono">#{pr().number}</span>{" "}
              {pr().merged
                ? t("orchestra.proof.pr.merged")
                : t("orchestra.proof.pr.state", { state: pr().state, commits: pr().commits })}
              <Show when={pr().lastSha}>
                {(sha) => (
                  <>
                    {" "}
                    · <span class="money-quiet">{t("orchestra.proof.pr.last")}</span>{" "}
                    <span class="board-mono">{sha().slice(0, 7)}</span>
                  </>
                )}
              </Show>
            </p>
          )}
        </Show>
      </div>
      <div class="money-proof-block">
        <h4>{t("orchestra.proof.ci")}</h4>
        <Show when={checks().length > 0} fallback={<p class="money-quiet">{t("orchestra.proof.ci.none")}</p>}>
          <p class="money-ci-line" data-failing={props.proof.ci?.failing !== null}>
            {props.proof.ci?.failing
              ? t("orchestra.proof.ci.failing", { name: props.proof.ci.failing })
              : running()
                ? t("orchestra.proof.ci.running")
                : t("orchestra.proof.ci.passing")}
          </p>
          <ul class="money-checks">
            <For each={checks()}>
              {(check) => (
                <li data-state={checkTick(check)}>
                  <i aria-hidden="true" />
                  <span>{check.name}</span>
                  <span class="money-quiet">{t(checkKey[checkTick(check)])}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.proof.attempts.n > 0}>
          <p class="money-quiet">{t("orchestra.proof.attempts", { n: props.proof.attempts.n, of: props.proof.attempts.of })}</p>
        </Show>
      </div>
      <Show when={props.proof.guardrail}>
        {(rule) => (
          <div class="money-proof-block">
            <h4>{t("orchestra.proof.guardrail")}</h4>
            <p>
              <span class="board-mono">{rule().rule}</span>
            </p>
            <Show when={rule().summary}>{(summary) => <p class="money-quiet">{summary()}</p>}</Show>
          </div>
        )}
      </Show>
      <Show when={props.proof.crashReason}>
        {(reason) => (
          <div class="money-proof-block">
            <h4>{t("orchestra.proof.crash")}</h4>
            <p class="board-held-note">{reason()}</p>
          </div>
        )}
      </Show>
      <p class="money-quiet">
        {props.proof.verifiedAt === null
          ? t("orchestra.proof.verified.none")
          : t("orchestra.proof.verified", {
              time: new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(props.proof.verifiedAt),
            })}
      </p>
      <Show when={props.proof.decidedBy}>
        {(decision) => (
          <p>
            <span class="money-quiet">{t("orchestra.proof.decided")}</span>{" "}
            <button type="button" class="money-linkbtn" onClick={() => props.onDecision(decision().id)}>
              {t("orchestra.proof.decided.open", { question: decision().question })}
            </button>
          </p>
        )}
      </Show>
    </section>
  )
}
