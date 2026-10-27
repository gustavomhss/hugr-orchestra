import { createEffect, createMemo, For, Match, on, onCleanup, Show, Switch, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createGroupedVirtualizer } from "@/components/grouped-virtualizer"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { Icon } from "../../actions/components"
import { tabKeydown } from "../../actions/entry-routing"
import { groups, kinds, type Finding, type Report, type Rule, type Severity } from "./contract"
import { rules as fixtureRules, scenarios, type Scenario } from "./fixture"
import {
  approvalLabel,
  excerptParts,
  exceptions,
  filterRules,
  groupFindings,
  groupRules,
  ignoreComment,
  ruleName,
  splitPath,
  verdict,
  type Keyed,
  type RuleFilter,
} from "./model"
import "./guardrails.css"

type Source = Scenario | "live" | "idle" | "running" | "disconnected"
type View = "overview" | "rules" | "review"

const views = ["overview", "rules", "review"] as const
const anyFilter: RuleFilter = { query: "", severity: "all", kind: "all", group: "all" }
// Row sizes are fixed so the grouped virtualizer can place every file box up front (guardrails.css).
const size = { header: 40, item: 72, gap: 12 }

// The Guardrails view inside CI/CD. Production runs the real guards on the project through the server and never shows
// fixture findings; dev builds also get a scenario picker over the fixture reports (brief §8).
export default function Guardrails(props: { directory: string; scenario?: Source }) {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  const t = language.t
  const dev = Boolean(import.meta.env?.DEV)
  const [store, setStore] = createStore({
    view: "overview" as View,
    source: props.scenario ?? ((dev ? "blocked" : "idle") as Source),
    live: undefined as Report | undefined,
    liveRules: undefined as readonly Rule[] | undefined,
    failure: undefined as string | undefined,
    selected: undefined as string | undefined,
    rule: undefined as string | undefined,
    filter: { ...anyFilter },
    copied: undefined as string | undefined,
    announce: "",
    scroll: undefined as HTMLDivElement | undefined,
  })
  const elements = {} as { search?: HTMLInputElement; detail?: HTMLHeadingElement; rule?: HTMLHeadingElement }
  const timers = new Set<ReturnType<typeof setTimeout>>()
  onCleanup(() => timers.forEach(clearTimeout))
  const later = (run: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      run()
    }, ms)
    timers.add(timer)
  }

  const report = createMemo(() => {
    if (store.source === "live") return store.live
    if (store.source === "running" || store.source === "disconnected" || store.source === "idle") return
    return scenarios[store.source]
  })
  const result = createMemo(() => {
    const current = report()
    return current && verdict(current)
  })
  const files = createMemo(() => groupFindings(report()?.findings ?? []))
  const order = createMemo(() => files().flatMap((file) => file.items))
  const selected = createMemo(() => order().find((finding) => finding.key === store.selected))
  // One line per rule that fired, gates first, each pointing at its first finding in list order.
  const fired = createMemo(() =>
    [
      ...order()
        .reduce(
          (all, finding) =>
            all.set(finding.rule, {
              rule: finding.rule,
              severity: finding.severity,
              key: all.get(finding.rule)?.key ?? finding.key,
              count: (all.get(finding.rule)?.count ?? 0) + 1,
            }),
          new Map<string, { rule: string; severity: Severity; key: string; count: number }>(),
        )
        .values(),
    ].toSorted((a, b) => Number(b.severity === "gate") - Number(a.severity === "gate") || b.count - a.count),
  )
  // Fixture rules only stand in for the live list in dev; production never shows them.
  const rules = createMemo(() => store.liveRules ?? (dev ? fixtureRules : []))
  const rule = (id: string) => rules().find((item) => item.id === id)
  const shownRules = createMemo(() => groupRules(filterRules(rules(), store.filter)))
  const ruleCount = createMemo(() => shownRules().reduce((total, group) => total + group.items.length, 0))
  const openRule = createMemo(() => (store.rule ? rule(store.rule) : undefined))
  const review = createMemo(() => {
    const current = report()
    const kind = result()?.kind
    if (!current || !kind || !["clean", "warnings", "blocked"].includes(kind)) return
    return exceptions(current)
  })

  const rows = createGroupedVirtualizer({
    groups: () => files().map((file) => ({ category: file.path, items: file.items })),
    key: (finding: Keyed) => finding.key,
    scrollElement: () => store.scroll,
    header: size.header,
    item: size.item,
    gap: size.gap,
    paddingEnd: 12,
    scrollPadding: size.header,
    viewport: 560,
  })

  // A screen reader hears when a run finishes, in the same words as the status.
  createEffect(
    on(
      () => store.source,
      (source, previous) => {
        if (previous !== "running" || source === "running") return
        const kind = result()?.kind
        const done = kind === "clean" || kind === "warnings" || kind === "blocked" ? kind : "unchecked"
        setStore("announce", t(`orchestra.guardrails.done.${done}`))
      },
      { defer: true },
    ),
  )

  // Rules and the run are fetched apart: the Rules tab still works when the engine cannot check the change.
  const checks = new Set<AbortController>()
  onCleanup(() => checks.forEach((check) => check.abort()))
  const check = async () => {
    checks.forEach((item) => item.abort())
    const controller = new AbortController()
    checks.add(controller)
    setStore({ source: "running", selected: undefined, announce: "", failure: undefined })
    const location = { location: { directory: props.directory } }
    const [listed, ran] = await Promise.allSettled([
      sdk().orchestra.guardrail.rules(location, { signal: controller.signal }),
      sdk().orchestra.guardrail.run(location, { signal: controller.signal }),
    ])
    checks.delete(controller)
    if (controller.signal.aborted) return
    if (listed.status === "fulfilled") setStore("liveRules", listed.value.data.rules)
    if (ran.status === "fulfilled") return setStore({ source: "live", live: ran.value.data })
    setStore({ source: "disconnected", live: undefined, failure: engineMessage(ran.reason) })
  }

  const retry = () => {
    if (store.source === "live" || store.source === "idle" || store.source === "disconnected" || (store.source === "running" && checks.size))
      return void check()
    const previous = store.source === "running" ? "blocked" : store.source
    setStore({ source: "running", selected: undefined, announce: "" })
    later(() => setStore("source", previous), 900)
  }

  // The check runs the repository's own script/guards code, so it starts only from the user's Run action.

  const choose = (key: string, focus: "row" | "detail" | "none") => {
    setStore("selected", key)
    if (focus === "none") return
    rows.scrollTo(key, "auto")
    requestAnimationFrame(() => {
      const row = store.scroll?.querySelector<HTMLElement>(`[data-key="${key}"]`)
      // In the single column the list is hidden while a finding is open, so focus lands on the detail instead.
      if (focus === "row" && row?.offsetParent) return row.focus()
      elements.detail?.focus()
    })
  }

  const close = () => {
    const key = store.selected
    if (!key) return false
    setStore("selected", undefined)
    requestAnimationFrame(() => store.scroll?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus())
    return true
  }

  const open = (path: string) => platform.openPath?.(`${props.directory}/${path}`)

  const listKeydown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    const key = event.target instanceof HTMLElement ? event.target.dataset.key : undefined
    if (!key) return
    if (event.key === "Enter" && platform.openPath) {
      event.preventDefault()
      const finding = order().find((item) => item.key === key)
      if (finding) open(finding.path)
      return
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const keys = order().map((item) => item.key)
    const index = keys.indexOf(key)
    const next =
      event.key === "Home" ? 0
      : event.key === "End" ? keys.length - 1
      : Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), keys.length - 1)
    choose(keys[next], "row")
  }

  const rootKeydown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    if (event.key === "Escape") {
      if (store.view === "overview" && close()) return event.preventDefault()
      if (store.view === "rules" && store.rule) {
        setStore("rule", undefined)
        return event.preventDefault()
      }
      return
    }
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target
    if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return
    event.preventDefault()
    setStore("view", "rules")
    requestAnimationFrame(() => elements.search?.focus())
  }

  const copy = (id: string, text: string) => {
    const done = () => {
      setStore("copied", id)
      later(() => setStore("copied", (current) => (current === id ? undefined : current)), 1600)
    }
    navigator.clipboard?.writeText(text).then(done, () => undefined)
  }

  const severity = (value: Severity) => t(value === "gate" ? "orchestra.guardrails.gateWord" : "orchestra.guardrails.warnWord")
  const sentence = (finding: Finding) =>
    t(finding.line === null ? "orchestra.guardrails.sentence.file" : "orchestra.guardrails.sentence.line", {
      severity: severity(finding.severity),
      rule: ruleName(finding.rule),
      path: finding.path,
      line: finding.line ?? 0,
      message: finding.message,
    })

  const Chip = (chip: { severity: Severity }) => (
    <span class="gr-chip" data-severity={chip.severity}>
      {t(chip.severity === "gate" ? "orchestra.guardrails.gate" : "orchestra.guardrails.warn")}
    </span>
  )

  const Path = (path: { value: string }) => {
    const parts = splitPath(path.value)
    return (
      <span class="gr-path" title={path.value} dir="ltr">
        <Show when={parts.dir}>
          <span class="gr-dir">{parts.dir}</span>
        </Show>
        <span class="gr-base">{parts.base}</span>
      </span>
    )
  }

  const CopyLine = (line: { id: string; text: string }) => (
    <div class="gr-copyline">
      <code dir="ltr">{line.text}</code>
      <button
        type="button"
        class="mx-btn"
        aria-label={t("orchestra.guardrails.copyLabel", { text: line.text })}
        onClick={() => copy(line.id, line.text)}
      >
        {store.copied === line.id ? t("orchestra.guardrails.copied") : t("orchestra.guardrails.copy")}
      </button>
    </div>
  )

  const Retry = () => (
    <button type="button" class="mx-btn" onClick={retry}>
      {t("orchestra.guardrails.retry")}
    </button>
  )

  const Status = () => (
    <Switch>
      <Match when={store.source === "running"}>
        <section class="gr-status" data-kind="running" aria-busy="true">
          <span class="gr-status-mark" aria-hidden="true">
            <Icon name="refresh" size={20} />
          </span>
          <div class="gr-status-copy">
            <h3>{t("orchestra.guardrails.running")}</h3>
            <p>{t("orchestra.guardrails.runningDetail")}</p>
          </div>
        </section>
        <div class="gr-skeleton" aria-hidden="true">
          <For each={[0, 1, 2, 3]}>{() => <span />}</For>
        </div>
      </Match>
      <Match when={store.source === "idle"}>
        <div class="mx-empty">
          <strong>{t("orchestra.guardrails.idle.title")}</strong>
          <p>{t("orchestra.guardrails.idle.body")}</p>
          <div class="gr-empty-actions">
            <Retry />
          </div>
        </div>
      </Match>
      <Match when={store.source === "disconnected"}>
        <div class="mx-empty">
          <strong>{t("orchestra.guardrails.disconnected.title")}</strong>
          <p>{t("orchestra.guardrails.disconnected.body")}</p>
          <Show when={store.failure}>{(message) => <pre class="gr-failure">{message()}</pre>}</Show>
          <div class="gr-empty-actions">
            <Retry />
            <button type="button" class="mx-btn" onClick={() => setStore("view", "rules")}>
              {t("orchestra.guardrails.tab.rules")}
            </button>
          </div>
        </div>
      </Match>
      <Match when={result()}>
        {(current) => (
          <Switch>
            <Match when={current().kind === "no-repository" || current().kind === "no-base"}>
              <div class="mx-empty">
                <strong>
                  {t(current().kind === "no-base" ? "orchestra.guardrails.noBase.title" : "orchestra.guardrails.noRepository.title")}
                </strong>
                <p>
                  {t(current().kind === "no-base" ? "orchestra.guardrails.noBase.body" : "orchestra.guardrails.noRepository.body")}
                </p>
                <Show when={current().failure?.message}>{(message) => <pre class="gr-failure">{message()}</pre>}</Show>
                <Retry />
              </div>
            </Match>
            <Match when={current().kind === "unchecked"}>
              <div class="mx-empty gr-unchecked">
                <strong>{t("orchestra.guardrails.unchecked.title")}</strong>
                <p>
                  {t(
                    current().failure?.kind === "no-rules"
                      ? "orchestra.guardrails.unchecked.noRules"
                      : "orchestra.guardrails.unchecked.rulesInvalid",
                  )}
                  {". "}
                  {t("orchestra.guardrails.unchecked.body")}
                </p>
                <Show when={current().failure?.message}>{(message) => <pre class="gr-failure">{message()}</pre>}</Show>
                <Retry />
              </div>
            </Match>
            <Match when={current().kind === "empty"}>
              <div class="mx-empty">
                <strong>{t("orchestra.guardrails.empty.title")}</strong>
                <p>{t("orchestra.guardrails.empty.body")}</p>
                <Retry />
              </div>
            </Match>
            <Match when={current()}>
              <section class="gr-status" data-kind={current().kind}>
                <span class="gr-status-mark" aria-hidden="true">
                  <Icon
                    name={current().kind === "clean" ? "check" : current().kind === "blocked" ? "shield" : "warning"}
                    size={20}
                  />
                </span>
                <div class="gr-status-copy">
                  <h3>
                    <Switch>
                      <Match when={current().kind === "blocked"}>
                        {language.plural("orchestra.guardrails.blocked", current().gates)}
                      </Match>
                      <Match when={current().kind === "warnings"}>{t("orchestra.guardrails.warnings.title")}</Match>
                      <Match when={current().kind === "clean"}>{t("orchestra.guardrails.clean.title")}</Match>
                    </Switch>
                  </h3>
                  <p>
                    <Switch>
                      <Match when={current().kind === "blocked" && current().warnings}>
                        {language.plural("orchestra.guardrails.blocked.bodyWarnings", current().warnings)}
                      </Match>
                      <Match when={current().kind === "blocked"}>{t("orchestra.guardrails.blocked.body")}</Match>
                      <Match when={current().kind === "warnings"}>
                        {language.plural("orchestra.guardrails.warnings", current().warnings)}
                      </Match>
                      <Match when={current().kind === "clean"}>
                        {language.plural("orchestra.guardrails.checked", report()?.files ?? 0, {
                          rules: report()?.rules ?? 0,
                          files: report()?.files ?? 0,
                        })}
                      </Match>
                    </Switch>
                  </p>
                </div>
                <div class="gr-status-actions">
                  <Show when={current().kind === "blocked"}>
                    <button type="button" class="mx-btn primary" onClick={() => order()[0] && choose(order()[0].key, "row")}>
                      {t("orchestra.guardrails.blocked.first")}
                    </button>
                  </Show>
                  <Retry />
                </div>
                <dl class="gr-stats">
                  <div data-tone={current().gates ? "bad" : undefined}>
                    <dt>{t("orchestra.guardrails.stat.gates")}</dt>
                    <dd>{current().gates}</dd>
                  </div>
                  <div data-tone={current().warnings ? "warm" : undefined}>
                    <dt>{t("orchestra.guardrails.stat.warnings")}</dt>
                    <dd>{current().warnings}</dd>
                  </div>
                  <div>
                    <dt>{t("orchestra.guardrails.stat.files")}</dt>
                    <dd>{report()?.files ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{t("orchestra.guardrails.stat.rules")}</dt>
                    <dd>{report()?.rules ?? 0}</dd>
                  </div>
                </dl>
              </section>
            </Match>
          </Switch>
        )}
      </Match>
    </Switch>
  )

  const Detail = (detail: { finding: Keyed }) => {
    const source = () => rule(detail.finding.rule)
    const parts = () => excerptParts(detail.finding)
    return (
      <>
        <div class="gr-detail-top">
          <button type="button" class="mx-link gr-back" onClick={() => close()}>
            {t("orchestra.guardrails.back")}
          </button>
          <Chip severity={detail.finding.severity} />
          <h3 tabindex="-1" ref={(element) => (elements.detail = element)}>
            {ruleName(detail.finding.rule)}
          </h3>
          <code class="gr-id" dir="ltr">{detail.finding.rule}</code>
          <p class="gr-detail-where">
            <Path value={detail.finding.path} />
            <span>
              {detail.finding.line === null
                ? t("orchestra.guardrails.wholeFile")
                : t("orchestra.guardrails.line", { line: detail.finding.line })}
            </span>
          </p>
        </div>
        <Show when={parts()}>
          {(excerpt) => (
            <figure class="gr-excerpt">
              <figcaption>{t("orchestra.guardrails.inChange")}</figcaption>
              <pre dir="ltr">
                <Show when={detail.finding.line !== null}>
                  <span class="gr-excerpt-line" aria-hidden="true">
                    {detail.finding.line}
                  </span>
                </Show>
                {excerpt().before}
                <Show when={excerpt().match}>
                  <mark>{excerpt().match}</mark>
                </Show>
                {excerpt().after}
              </pre>
            </figure>
          )}
        </Show>
        <p class="gr-message">{detail.finding.message}</p>
        <h4 class="gr-label">{t("orchestra.guardrails.way.title")}</h4>
        <ol class="gr-way">
          <li>
            <strong>{t("orchestra.guardrails.way.fix")}</strong>
            <span>{t("orchestra.guardrails.way.fixNote")}</span>
          </li>
          <Show when={source()?.clearedBy === "ignore"}>
            <li>
              <strong>{t("orchestra.guardrails.way.ignore")}</strong>
              <span>{t("orchestra.guardrails.way.ignoreBody")}</span>
              <CopyLine
                id={`ignore:${detail.finding.key}`}
                text={ignoreComment(detail.finding.rule, t("orchestra.guardrails.way.reason"))}
              />
            </li>
          </Show>
          <Show when={source()?.clearedBy === "approval"}>
            <li>
              <strong>{t("orchestra.guardrails.way.approval")}</strong>
              <span>{t("orchestra.guardrails.way.approvalBody")}</span>
              <CopyLine id={`approval:${detail.finding.key}`} text={approvalLabel(detail.finding.rule)} />
            </li>
          </Show>
        </ol>
        <div class="gr-detail-actions">
          <Show when={platform.openPath}>
            <button type="button" class="mx-btn" onClick={() => open(detail.finding.path)}>
              {t("orchestra.guardrails.openFile")}
            </button>
          </Show>
          <button
            type="button"
            class="mx-btn"
            onClick={() => {
              setStore({ view: "rules", rule: detail.finding.rule })
              requestAnimationFrame(() => elements.rule?.focus())
            }}
          >
            {t("orchestra.guardrails.tab.rules")}
          </button>
        </div>
      </>
    )
  }

  const Fired = () => (
    <div class="gr-fired">
      <h3 class="gr-label">{t("orchestra.guardrails.fired")}</h3>
      <p class="gr-summary">{t("orchestra.guardrails.firedHint")}</p>
      <ul>
        <For each={fired()}>
          {(item) => (
            <li>
              <button
                type="button"
                class="gr-fired-row"
                data-severity={item.severity}
                onClick={() => choose(item.key, "row")}
              >
                <span class="gr-fired-top">
                  <Chip severity={item.severity} />
                  <span class="gr-name">{ruleName(item.rule)}</span>
                  <code class="gr-id" dir="ltr">{item.rule}</code>
                  <span class="wf-count">{item.count}</span>
                </span>
                <small>{rule(item.rule)?.summary || rule(item.rule)?.message}</small>
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )

  const Overview = () => (
    <>
      <Status />
      <Show when={report()?.bootstrap}>
        <p class="gr-note">{t("orchestra.guardrails.bootstrap")}</p>
      </Show>
      <Show when={report()?.touchesGuards}>
        <p class="gr-note">{t("orchestra.guardrails.touchesGuards")}</p>
      </Show>
      <Show when={result()?.kind === "blocked" || result()?.kind === "warnings"}>
        <div class="gr-overview" data-open={store.selected ? "" : undefined}>
          <section class="gr-list-wrap" aria-label={t("orchestra.guardrails.findings")}>
            <h3 class="gr-label">
              {t("orchestra.guardrails.findings")}
              <span>{language.plural("orchestra.guardrails.findingsCount", order().length)}</span>
            </h3>
            <div class="gr-list" ref={(element) => setStore("scroll", element)} onKeyDown={listKeydown}>
              <div style={{ position: "relative", height: `${rows.total()}px` }}>
                <For each={rows.groups()}>
                  {(path) => (
                    <Show when={rows.group(path)}>
                      {(box) => (
                        <div
                          class="gr-file"
                          data-gate={files().find((file) => file.path === path)?.gate ? "" : undefined}
                          style={{ top: `${box().start}px`, height: `${box().size}px` }}
                        >
                          <div class="gr-file-head">
                            <span class="gr-file-icon" aria-hidden="true">
                              <Icon name="code" size={13} />
                            </span>
                            <Path value={path} />
                            <span class="wf-count">{box().items.length}</span>
                          </div>
                          <For each={rows.items(path)}>
                            {(key) => (
                              <Show when={rows.row(key)?.item}>
                                {(finding) => (
                                  <button
                                    type="button"
                                    class="gr-row"
                                    data-key={key}
                                    aria-current={store.selected === key ? "true" : undefined}
                                    aria-label={sentence(finding())}
                                    tabindex={store.selected === key || (!store.selected && key === order()[0]?.key) ? 0 : -1}
                                    style={{ top: `${(rows.row(key)?.start ?? 0) - box().start}px` }}
                                    onClick={() => choose(key, "none")}
                                  >
                                    <span class="gr-row-top">
                                      <Chip severity={finding().severity} />
                                      <span class="gr-name">{ruleName(finding().rule)}</span>
                                      <code class="gr-id" dir="ltr">{finding().rule}</code>
                                      <span class="gr-row-line">
                                        {finding().line === null
                                          ? t("orchestra.guardrails.wholeFile")
                                          : t("orchestra.guardrails.line", { line: finding().line ?? 0 })}
                                      </span>
                                    </span>
                                    <span class="gr-row-message">{finding().message}</span>
                                  </button>
                                )}
                              </Show>
                            )}
                          </For>
                        </div>
                      )}
                    </Show>
                  )}
                </For>
              </div>
            </div>
          </section>
          <aside class="gr-detail" aria-live="off">
            <Show when={selected()} fallback={<Fired />}>
              {(finding) => <Detail finding={finding()} />}
            </Show>
          </aside>
        </div>
      </Show>
    </>
  )

  const RulePanel = (panel: { rule: Rule }) => (
    <>
      <div class="gr-detail-top">
        <button type="button" class="mx-link gr-back" onClick={() => setStore("rule", undefined)}>
          {t("orchestra.guardrails.close")}
        </button>
        <Chip severity={panel.rule.severity} />
        <h3 tabindex="-1" ref={(element) => (elements.rule = element)}>
          {ruleName(panel.rule.id)}
        </h3>
        <code class="gr-id" dir="ltr">{panel.rule.id}</code>
        <p class="gr-detail-where">
          <span>{t(`orchestra.guardrails.group.${panel.rule.group}`)}</span>
          <span>{t(`orchestra.guardrails.kind.${panel.rule.kind}`)}</span>
        </p>
      </div>
      <h4 class="gr-label">{t("orchestra.guardrails.rules.message")}</h4>
      <p class="gr-message">{panel.rule.message}</p>
      <Show when={panel.rule.summary}>{(summary) => <p class="gr-summary">{summary()}</p>}</Show>
      <h4 class="gr-label">{t("orchestra.guardrails.rules.clearedBy")}</h4>
      <p class="gr-summary">{t(`orchestra.guardrails.rules.clearedBy.${panel.rule.clearedBy}`)}</p>
      <Show when={panel.rule.positive.length || panel.rule.negative.length}>
        <h4 class="gr-label">{t("orchestra.guardrails.rules.samples")}</h4>
        <div class="gr-samples">
          <figure data-side="flagged">
            <figcaption>{t("orchestra.guardrails.rules.flagged")}</figcaption>
            <pre dir="ltr">
              <For each={panel.rule.positive}>{(sample) => <span>{sample}</span>}</For>
            </pre>
          </figure>
          <figure data-side="passes">
            <figcaption>{t("orchestra.guardrails.rules.passes")}</figcaption>
            <pre dir="ltr">
              <For each={panel.rule.negative}>{(sample) => <span>{sample}</span>}</For>
            </pre>
          </figure>
        </div>
      </Show>
      <h4 class="gr-label">{t("orchestra.guardrails.rules.paths")}</h4>
      <Show
        when={!(panel.rule.paths.length === 0 || (panel.rule.paths.length === 1 && panel.rule.paths[0] === "**"))}
        fallback={<p class="gr-summary">{t("orchestra.guardrails.rules.everyFile")}</p>}
      >
        <ul class="gr-paths" dir="ltr">
          <For each={panel.rule.paths}>{(path) => <li><code>{path}</code></li>}</For>
        </ul>
      </Show>
      <p class="gr-note">{t("orchestra.guardrails.rules.readOnly")}</p>
      <div class="gr-detail-actions">
        <Show
          when={platform.openPath}
          fallback={<code class="gr-rulefile">{`script/guards/rules/${panel.rule.id}.toml`}</code>}
        >
          <button type="button" class="mx-btn" onClick={() => open(`script/guards/rules/${panel.rule.id}.toml`)}>
            {t("orchestra.guardrails.rules.file")}
          </button>
        </Show>
      </div>
    </>
  )

  const Rules = () => (
    <>
      <div class="gr-filters" role="search">
        <label class="gr-search">
          <Icon name="search" size={14} />
          <input
            ref={(element) => (elements.search = element)}
            class="mx-search"
            type="search"
            value={store.filter.query}
            placeholder={t("orchestra.guardrails.rules.search")}
            aria-label={t("orchestra.guardrails.rules.search")}
            title={t("orchestra.guardrails.rules.searchHint")}
            onInput={(event) => setStore("filter", "query", event.currentTarget.value)}
          />
        </label>
        <label class="gr-select-field">
          <span>{t("orchestra.guardrails.rules.severity")}</span>
          <select
            value={store.filter.severity}
            onChange={(event) => setStore("filter", "severity", event.currentTarget.value as RuleFilter["severity"])}
          >
            <option value="all">{t("orchestra.guardrails.rules.all")}</option>
            <option value="gate">{t("orchestra.guardrails.gateWord")}</option>
            <option value="warn">{t("orchestra.guardrails.warnWord")}</option>
          </select>
        </label>
        <label class="gr-select-field">
          <span>{t("orchestra.guardrails.rules.kind")}</span>
          <select
            value={store.filter.kind}
            onChange={(event) => setStore("filter", "kind", event.currentTarget.value as RuleFilter["kind"])}
          >
            <option value="all">{t("orchestra.guardrails.rules.all")}</option>
            <For each={kinds}>{(kind) => <option value={kind}>{t(`orchestra.guardrails.kind.${kind}`)}</option>}</For>
          </select>
        </label>
        <label class="gr-select-field">
          <span>{t("orchestra.guardrails.rules.group")}</span>
          <select
            value={store.filter.group}
            onChange={(event) => setStore("filter", "group", event.currentTarget.value as RuleFilter["group"])}
          >
            <option value="all">{t("orchestra.guardrails.rules.all")}</option>
            <For each={groups}>{(group) => <option value={group}>{t(`orchestra.guardrails.group.${group}`)}</option>}</For>
          </select>
        </label>
        <span class="gr-count" aria-live="polite">
          {language.plural("orchestra.guardrails.rules.count", ruleCount())}
        </span>
      </div>
      <Show
        when={ruleCount()}
        fallback={
          <div class="mx-empty">
            <strong>{t("orchestra.guardrails.rules.none")}</strong>
            <p>{t("orchestra.guardrails.rules.noneBody")}</p>
            <button type="button" class="mx-btn" onClick={() => setStore("filter", { ...anyFilter })}>
              {t("orchestra.guardrails.rules.clear")}
            </button>
          </div>
        }
      >
        <div class="gr-overview gr-rules" data-open={openRule() ? "" : undefined}>
          <div class="gr-list-wrap">
            <For each={shownRules()}>
              {(group) => (
                <section class="gr-rule-group">
                  <h3 class="gr-label">
                    {t(`orchestra.guardrails.group.${group.category}`)}
                    <span>{group.items.length}</span>
                  </h3>
                  <ul class="gr-rule-list">
                    <For each={group.items}>
                      {(item) => (
                        <li>
                          <button
                            type="button"
                            class="gr-rule"
                            aria-current={store.rule === item.id ? "true" : undefined}
                            onClick={() => setStore("rule", item.id)}
                          >
                            <Chip severity={item.severity} />
                            <span class="gr-name">{ruleName(item.id)}</span>
                            <code class="gr-id" dir="ltr">{item.id}</code>
                            <span>{item.message}</span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </div>
          <aside class="gr-detail">
            <Show
              when={openRule()}
              fallback={
                <div class="gr-select">
                  <span class="gr-select-icon" aria-hidden="true">
                    <Icon name="shield" size={18} />
                  </span>
                  <p>{t("orchestra.guardrails.rules.pick")}</p>
                  <small>
                    <kbd>/</kbd> {t("orchestra.guardrails.rules.searchHint")}
                  </small>
                </div>
              }
            >
              {(item) => <RulePanel rule={item()} />}
            </Show>
          </aside>
        </div>
      </Show>
    </>
  )

  const Review = () => (
    <Show
      when={review()}
      fallback={
        <div class="mx-empty">
          <strong>{t("orchestra.guardrails.review.none")}</strong>
          <p>{t("orchestra.guardrails.review.noneBody")}</p>
        </div>
      }
    >
      {(current) => (
        <div class="gr-review">
          <p class="gr-summary">{t("orchestra.guardrails.review.description")}</p>
          <h3 class="mx-section">{t("orchestra.guardrails.review.ignores")}</h3>
          <Show
            when={current().ignores.length}
            fallback={<p class="gr-summary">{t("orchestra.guardrails.review.ignoresEmpty")}</p>}
          >
            <div class="mx-table">
              <For each={current().ignores}>
                {(finding) => {
                  const key = () => order().find((item) => item.path === finding.path && item.line === finding.line && item.rule === finding.rule)?.key
                  return (
                    <button
                      type="button"
                      class="mx-row gr-review-row"
                      onClick={() => {
                        const target = key()
                        setStore("view", "overview")
                        if (target) requestAnimationFrame(() => choose(target, "row"))
                      }}
                    >
                      <span class="mx-grow">
                        <strong>
                          <Path value={finding.path} />
                        </strong>
                        <small>
                          <code dir="ltr">{finding.excerpt?.trim() ?? finding.message}</code>
                        </small>
                      </span>
                      <span class="gr-row-line">
                        {finding.line === null
                          ? t("orchestra.guardrails.wholeFile")
                          : t("orchestra.guardrails.line", { line: finding.line })}
                      </span>
                    </button>
                  )
                }}
              </For>
            </div>
          </Show>
          <h3 class="mx-section">{t("orchestra.guardrails.review.approved")}</h3>
          <Show
            when={current().approved.length}
            fallback={<p class="gr-summary">{t("orchestra.guardrails.review.approvedEmpty")}</p>}
          >
            <div class="gr-approved">
              <For each={current().approved}>
                {(id) => (
                  <button type="button" class="gr-tag" onClick={() => setStore({ view: "rules", rule: id })}>
                    <code>{approvalLabel(id)}</code>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <h3 class="mx-section">{t("orchestra.guardrails.review.guards")}</h3>
          <p class="gr-summary" data-tone={current().touchesGuards ? "notice" : undefined}>
            {t(current().touchesGuards ? "orchestra.guardrails.review.guardsYes" : "orchestra.guardrails.review.guardsNo")}
          </p>
        </div>
      )}
    </Show>
  )

  return (
    <div class="gr-root" onKeyDown={rootKeydown}>
      <header class="gr-head">
        <h2 class="orchestra-sr-only">{t("orchestra.guardrails.title")}</h2>
        <p class="orchestra-sr-only" id="gr-description">
          {t("orchestra.guardrails.description")}
        </p>
        <div
          class="gr-views"
          role="tablist"
          aria-label={t("orchestra.guardrails.tabs")}
          aria-describedby="gr-description"
          onKeyDown={tabKeydown}
        >
          <For each={views}>
            {(view) => (
              <button
                type="button"
                role="tab"
                class="wf-tab"
                aria-selected={store.view === view}
                tabindex={store.view === view ? 0 : -1}
                onClick={() => setStore("view", view)}
              >
                {t(`orchestra.guardrails.tab.${view}`)}
                <Show when={view === "overview" && result()?.gates}>
                  {(gates) => <span class="wf-count gr-count-gate">{gates()}</span>}
                </Show>
              </button>
            )}
          </For>
        </div>
        <Show when={report()?.base}>
          {(base) => (
            <span class="gr-base-chip" dir="ltr" title={base()}>
              <Icon name="branch" size={14} />
              {t("orchestra.guardrails.base", { base: /^[0-9a-f]{40}$/.test(base()) ? base().slice(0, 10) : base() })}
            </span>
          )}
        </Show>
        <Show when={dev}>
          <label class="gr-select-field gr-scenario">
            <span>{t("orchestra.guardrails.scenario")}</span>
            <select
              value={store.source}
              onChange={(event) => {
                const source = event.currentTarget.value as Source
                if (source === "live") return void check()
                setStore({ source, selected: undefined })
              }}
            >
              <For each={["live", "running", "disconnected", ...Object.keys(scenarios)]}>
                {(name) => <option value={name}>{name}</option>}
              </For>
            </select>
          </label>
        </Show>
      </header>
      <div role="tabpanel" class="gr-panel">
        <Switch>
          <Match when={store.view === "overview"}>
            <Overview />
          </Match>
          <Match when={store.view === "rules"}>
            <Rules />
          </Match>
          <Match when={store.view === "review"}>
            <Review />
          </Match>
        </Switch>
      </div>
      <Show when={dev && store.source in scenarios}>
        <p class="mx-note">{t("orchestra.guardrails.fixture")}</p>
      </Show>
      <p class="orchestra-sr-only" role="status" aria-live="polite">
        {store.announce}
      </p>
    </div>
  )
}

// A declared 400 carries the engine's own reason ({ name: "GuardrailError", data: { kind, message } }); anything else,
// such as an unreachable server, has nothing worth showing beyond the disconnected copy.
function engineMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("name" in error) || error.name !== "GuardrailError") return
  if (!("data" in error) || typeof error.data !== "object" || error.data === null || !("message" in error.data)) return
  return typeof error.data.message === "string" ? error.data.message : undefined
}
