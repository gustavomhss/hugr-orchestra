import type { QueryClient } from "@tanstack/solid-query"
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useSettingsDialog } from "@/components/settings-dialog"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import {
  change,
  compact,
  dayDate,
  gitWindow,
  heights,
  hours,
  localEnd,
  parseActivity,
  parseGit,
  PERIODS,
  summarizeActivity,
  summarizeGit,
  usageCsv,
  type Activity,
  type GitActivity,
  type Period,
  type Totals,
} from "./kpis-data"
import "./kit.css"
import "./kpis.css"

type Tile = "tokens" | "hours" | "messages" | "commits" | "pullRequests" | "merges" | "models" | "failed"
type TileView = {
  id: Tile
  state?: string
  value?: { text: string; unit: string; csv: string; raw: number }
  change?: { text: string; trend: string; percent: number | undefined }
  note: string
  bars: number[]
}
type Outcome<T> =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "complete"; data: T }

// Reads stay fresh this long per profile and period, so switching periods back and forth is instant.
const STALE_MS = 30_000

export function KpiDashboard(props: {
  directory: string
  sdk: ServerSDK
  queryClient: QueryClient
  name: string
  // Live titles win over the cached read so a rename shows at once.
  title: (sessionID: string, fallback: string) => string
  running: (sessionID: string) => boolean
  openSession: (sessionID: string) => void
  openProviders: () => void
}) {
  const language = useLanguage()
  const openModels = useSettingsDialog("models")
  const client = props.sdk.createClient({ directory: props.directory })
  const [prefs, setPrefs, , ready] = persisted(
    Persist.serverWorkspace(props.sdk.scope, props.directory, "orchestra-home"),
    createStore({ period: "30d" as Period }),
  )
  const [activity, setActivity] = createSignal<Outcome<Activity>>({ status: "loading" })
  const [repository, setRepository] = createSignal<Outcome<GitActivity>>({ status: "loading" })
  const [state, setState] = createStore({ branch: undefined as string | undefined, expanded: false })
  const lifecycle = { abort: new AbortController() }
  onCleanup(() => lifecycle.abort.abort())

  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(language.intl(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
      value,
    )
  const shortDate = (time: number) =>
    new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(time)
  const sinceDay = (day: string) =>
    language.t("orchestra.home.note.since", {
      date: new Intl.DateTimeFormat(language.intl(), {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(dayDate(day)),
    })
  const sinceTime = (time: number) =>
    language.t("orchestra.home.note.since", {
      date: new Intl.DateTimeFormat(language.intl(), { year: "numeric", month: "short", day: "numeric" }).format(time),
    })
  const tokens = (value: number) => {
    const scaled = compact(value)
    return { text: number(scaled.value, scaled.digits), unit: scaled.unit }
  }

  // One cached read per profile, period and day. Only complete reads stay cached.
  async function cached<T>(name: string, period: Period, read: (signal: AbortSignal) => Promise<Outcome<T>>) {
    const queryKey = ["orchestra-home", props.directory, name, period, localEnd(Date.now())]
    const result = await props.queryClient
      .fetchQuery({ queryKey, queryFn: ({ signal }) => read(signal), staleTime: STALE_MS, retry: false })
      .catch(() => ({ status: "error" }) as const)
    if (result.status !== "complete") props.queryClient.removeQueries({ queryKey, exact: true })
    return result
  }

  function load(period: Period) {
    lifecycle.abort.abort()
    lifecycle.abort = new AbortController()
    const signal = lifecycle.abort.signal
    setActivity({ status: "loading" })
    setRepository({ status: "loading" })
    setState("expanded", false)
    void cached("activity", period, (abort) =>
      outcome(client.session.activity({ directory: props.directory, period }, { signal: abort }), parseActivity),
    ).then((result) => {
      if (!signal.aborted) setActivity(result)
    })
    // The git read covers the previous window in any time zone; days outside the window are not counted.
    const now = Date.now()
    const days = { "7d": 7, "30d": 30, "90d": 90, all: undefined }[period]
    void cached("vcs", period, (abort) =>
      outcome(
        client.vcs.activity(
          { directory: props.directory, since: days === undefined ? 0 : now - (2 * days + 2) * 86_400_000, until: now },
          { signal: abort },
        ),
        parseGit,
      ),
    ).then((result) => {
      if (!signal.aborted) setRepository(result)
    })
    void client.vcs
      .get({ directory: props.directory }, { signal })
      .then((result) => {
        if (!signal.aborted && typeof result.data?.branch === "string") setState("branch", result.data.branch)
      })
      .catch(() => undefined)
  }

  function retry() {
    props.queryClient.removeQueries({ queryKey: ["orchestra-home", props.directory] })
    load(prefs.period)
  }

  createEffect(
    on(
      () => (ready() ? prefs.period : undefined),
      (period) => {
        if (!period) return
        // Let Home paint before requesting activity.
        const frame = requestAnimationFrame(() => load(period))
        onCleanup(() => cancelAnimationFrame(frame))
      },
    ),
  )

  const loaded = () => {
    const current = activity()
    return current.status === "complete" ? current.data : undefined
  }
  const repositoryData = () => {
    const current = repository()
    return current.status === "complete" ? current.data : undefined
  }
  const summary = createMemo(() => {
    const data = loaded()
    return data ? summarizeActivity(data) : undefined
  })
  const git = createMemo(() => {
    const data = repositoryData()
    // A directory outside git has no commit counts, whatever days the response carries.
    if (!data?.repository) return
    // Git days and activity buckets are both the server's local days.
    return summarizeGit(data, gitWindow(prefs.period, loaded()?.days.at(-1) ?? localEnd(Date.now()), data))
  })
  const truncated = () => loaded()?.truncated === true

  const changeView = (current: number, previous: number | undefined) => {
    const result = change(current, previous)
    if (!result) return
    if (result.percent === undefined)
      return { text: language.t("orchestra.home.change.new"), trend: "up", percent: undefined as number | undefined }
    const text =
      result.trend === "flat"
        ? language.t("orchestra.home.change.flat")
        : language.t(result.trend === "up" ? "orchestra.home.change.up" : "orchestra.home.change.down", {
            percent: number(Math.abs(result.percent)),
          })
    return { text, trend: result.trend as string, percent: result.percent as number | undefined }
  }

  const count = (value: number) => ({ text: number(value), unit: "", csv: language.t("orchestra.home.unit.count") })

  const tiles = createMemo(() => {
    const current = summary()
    const repository = git()
    const activity = (
      id: Tile,
      read: (totals: Totals) => number,
      view: (value: number) => { text: string; unit: string; csv: string; raw?: number },
      note: (totals: Totals) => string,
      delta = true,
    ): TileView => {
      if (!current || truncated()) return blank(id, activityState(), truncated() ? partialNote() : "")
      const value = read(current.current)
      return {
        id,
        value: { raw: value, ...view(value) },
        change: delta ? changeView(value, current.previous && read(current.previous)) : undefined,
        note: note(current.current),
        bars: heights(current.bars.map(read)),
      }
    }
    const commits = (
      id: Tile,
      read: (totals: { commits: number; merges: number }) => number,
      note: string,
    ): TileView => {
      if (!repository) return blank(id, gitState(), gitNote())
      // A scan cut short by the server's limits undercounts; it is not shown as a number.
      if (repository.partial) return blank(id, "partial", partialNote())
      const value = read(repository.current)
      return {
        id,
        value: { ...count(value), raw: value },
        change: id === "commits" ? changeView(value, repository.previous && read(repository.previous)) : undefined,
        note: [note, prefs.period === "all" && repositoryData()?.since ? sinceTime(repositoryData()!.since) : ""]
          .filter(Boolean)
          .join(" · "),
        bars: heights(repository.bars.map(read)),
      }
    }
    return [
      activity(
        "tokens",
        (totals) => totals.tokens,
        (value) => ({ ...tokens(value), csv: language.t("orchestra.home.unit.tokens") }),
        () => (prefs.period === "all" && current ? sinceDay(current.start) : language.t("orchestra.home.note.tokens")),
      ),
      activity(
        "hours",
        (totals) => totals.activeMs,
        (value) => {
          const scaled = hours(value)
          return {
            text: number(scaled.value, scaled.digits),
            unit: "h",
            csv: language.t("orchestra.home.unit.hours"),
            raw: Math.round(scaled.value * 100) / 100,
          }
        },
        () => language.t("orchestra.home.note.hours"),
      ),
      activity(
        "messages",
        (totals) => totals.messages,
        count,
        () => language.t("orchestra.home.note.messages"),
      ),
      commits(
        "commits",
        (totals) => totals.commits,
        state.branch
          ? language.t("orchestra.home.note.commits", { branch: state.branch })
          : language.t("orchestra.home.note.commitsCurrent"),
      ),
      blank("pullRequests", "notConnected", language.t("orchestra.home.note.notConnected")),
      commits("merges", (totals) => totals.merges, language.t("orchestra.home.note.merges")),
      activity(
        "models",
        (totals) => totals.models,
        count,
        (totals) =>
          language.t(totals.providers === 1 ? "orchestra.home.note.provider" : "orchestra.home.note.providers", {
            count: number(totals.providers),
          }),
        false,
      ),
      failedTile(),
    ].map((tile) => ({ ...tile, label: language.t(`orchestra.home.tile.${tile.id}`) }))
  })

  function failedTile(): TileView {
    const current = summary()
    if (!current || truncated()) return blank("failed", activityState(), truncated() ? partialNote() : "")
    const totals = current.current
    return {
      id: "failed" as Tile,
      value: { ...count(totals.failed), raw: totals.failed },
      // The mock puts the run total in the change slot.
      change: {
        text: language.t("orchestra.home.note.failedOf", { count: number(totals.runs) }),
        trend: "",
        percent: undefined,
      },
      note:
        totals.runs > 0
          ? language.t("orchestra.home.note.failedRate", { percent: number((totals.failed / totals.runs) * 100, 1) })
          : "",
      bars: heights(current.bars.map((bar) => bar.failed)),
    }
  }

  function blank(id: Tile, tileState: string, note: string): TileView {
    return { id, state: tileState, note, bars: [] }
  }

  function activityState() {
    if (truncated()) return "partial"
    return activity().status === "loading" ? "loading" : "unavailable"
  }

  function gitState() {
    if (repository().status === "loading") return "loading"
    if (repositoryData()?.repository === false) return "noRepository"
    return "unavailable"
  }

  function gitNote() {
    if (repositoryData()?.repository === false) return language.t("orchestra.home.note.noRepository")
    if (repository().status === "unavailable") return language.t("orchestra.home.note.gitUnavailable")
    if (repository().status === "error") return language.t("orchestra.home.note.gitError")
    return ""
  }

  const partialNote = () => language.t("orchestra.home.note.partial")

  const stateText = (value: string | undefined) => {
    if (value === "notConnected") return language.t("orchestra.home.state.notConnected")
    if (value === "noRepository") return language.t("orchestra.home.state.noRepository")
    if (value === "unavailable") return language.t("orchestra.home.state.unavailable")
    if (value === "partial") return language.t("orchestra.home.state.partial")
    return ""
  }

  const ranked = createMemo(() => (truncated() ? [] : (summary()?.sessions ?? [])))
  const sessions = createMemo(() => (state.expanded ? ranked() : ranked().slice(0, 5)))
  const models = createMemo(() => (truncated() ? [] : (summary()?.models ?? [])))
  const sessionSub = (session: ReturnType<typeof sessions>[number]) =>
    [
      shortDate(session.updated),
      session.files
        ? language.t("orchestra.home.sessionFiles", {
            count: number(session.files),
            additions: number(session.additions ?? 0),
            deletions: number(session.deletions ?? 0),
          })
        : language.t(session.messages === 1 ? "orchestra.home.sessionMessage" : "orchestra.home.sessionMessages", {
            count: number(session.messages),
          }),
    ].join(" · ")
  const peak = (values: readonly number[]) => values.reduce((max, value) => Math.max(max, value), 1)
  const exportable = () => activity().status === "complete" && !truncated()

  function exportCsv() {
    const data = loaded()
    if (!data || truncated()) return
    const days = data.days
    const offset = data.previous ? 1 : 0
    const rows = [
      [language.t("orchestra.home.csv.period"), language.t(`orchestra.home.period.${prefs.period}`)],
      [language.t("orchestra.home.csv.from"), days[offset]!],
      [language.t("orchestra.home.csv.to"), new Date(dayDate(days.at(-1)!) - 86_400_000).toISOString().slice(0, 10)],
      [
        language.t("orchestra.home.csv.metric"),
        language.t("orchestra.home.csv.value"),
        language.t("orchestra.home.csv.unit"),
        language.t("orchestra.home.csv.change"),
      ],
      ...tiles().map((tile) =>
        tile.value
          ? [tile.label, tile.value.raw, tile.value.csv, tile.change?.percent ?? ""]
          : [tile.label, stateText(tile.state), "", ""],
      ),
      [
        language.t("orchestra.home.csv.session"),
        language.t("orchestra.home.csv.tokens"),
        language.t("orchestra.home.csv.messages"),
        language.t("orchestra.home.csv.files"),
        language.t("orchestra.home.csv.additions"),
        language.t("orchestra.home.csv.deletions"),
      ],
      ...sessions().map((session) => [
        props.title(session.id, session.title),
        session.tokens,
        session.messages,
        session.files ?? "",
        session.additions ?? "",
        session.deletions ?? "",
      ]),
      [
        language.t("orchestra.home.csv.model"),
        language.t("orchestra.home.csv.tokens"),
        language.t("orchestra.home.csv.runs"),
      ],
      ...models().map((model) => [`${model.providerID}/${model.modelID}`, model.tokens, model.runs]),
    ]
    const url = URL.createObjectURL(new Blob([usageCsv(rows)], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = language.t("orchestra.home.filename", { name: props.name, period: prefs.period })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <section
      class="orchestra-home-dashboard"
      data-component="orchestra-kpis"
      aria-labelledby="orchestra-home-title"
      aria-busy={activity().status === "loading" || repository().status === "loading"}
    >
      <div class="home-inner">
        <header class="home-mast">
          <div>
            <div class="home-kicker">{language.t("orchestra.home.eyebrow", { name: props.name })}</div>
            <h1 id="orchestra-home-title">
              {language.t("orchestra.home.titleLead")}
              <br />
              <span>{language.t("orchestra.home.titleTail")}</span>
            </h1>
          </div>
          <div class="home-range" role="group" aria-label={language.t("orchestra.home.period")}>
            <For each={PERIODS}>
              {(period) => (
                <button type="button" aria-pressed={prefs.period === period} onClick={() => setPrefs("period", period)}>
                  {language.t(`orchestra.home.period.${period}`)}
                </button>
              )}
            </For>
          </div>
        </header>
        <Show when={activity().status === "loading"}>
          <p class="orchestra-sr-only" role="status">
            {language.t("orchestra.home.loading")}
          </p>
        </Show>
        <div class="home-grid" data-slot="home-kpis">
          <For each={tiles()}>
            {(tile) => (
              <article class="home-kpi" data-tile={tile.id}>
                <div class="home-kpi-label">{tile.label}</div>
                <Show
                  when={tile.value}
                  fallback={
                    <div class="home-kpi-value" data-state={tile.state}>
                      {stateText(tile.state)}
                    </div>
                  }
                >
                  {(value) => (
                    <div class="home-kpi-value">
                      {value().text}
                      <Show when={value().unit}>
                        <small>{value().unit}</small>
                      </Show>
                    </div>
                  )}
                </Show>
                <div class="home-kpi-foot">
                  <Show when={tile.change}>
                    {(delta) => (
                      <span class="home-delta" data-trend={delta().trend || undefined}>
                        {delta().text}
                      </span>
                    )}
                  </Show>
                  <span>{tile.note}</span>
                </div>
                <div class="home-bars" aria-hidden="true">
                  <For each={tile.bars}>{(height) => <i style={{ height: `${height}%` }} />}</For>
                </div>
              </article>
            )}
          </For>
        </div>
        <Show when={activity().status === "error"}>
          <p class="home-status" role="alert">
            <span>{language.t("orchestra.home.error")}</span>
            <button type="button" onClick={retry}>
              {language.t("orchestra.home.retry")}
            </button>
          </p>
        </Show>
        <Show when={activity().status === "unavailable"}>
          <p class="home-status" role="status">
            {language.t("orchestra.home.unavailable")}
          </p>
        </Show>
        <div class="home-split">
          <section class="home-block" aria-labelledby="orchestra-home-sessions">
            <header class="home-block-head">
              <h2 id="orchestra-home-sessions">{language.t("orchestra.home.sessions")}</h2>
              <button
                type="button"
                aria-expanded={state.expanded}
                disabled={ranked().length <= 5}
                onClick={() => setState("expanded", (value) => !value)}
              >
                {language.t(state.expanded ? "orchestra.home.viewTop" : "orchestra.home.viewAll")}
              </button>
            </header>
            <div class="home-rows">
              <Show when={exportable() && sessions().length === 0}>
                <p class="home-empty">{language.t("orchestra.home.sessionsEmpty")}</p>
              </Show>
              <For each={sessions()}>
                {(session) => (
                  <button
                    type="button"
                    class="home-row"
                    data-component="home-impact-row"
                    data-session-id={session.id}
                    onClick={() => props.openSession(session.id)}
                  >
                    <div>
                      <div class="home-row-title">
                        <bdi>{props.title(session.id, session.title)}</bdi>
                        <Show when={props.running(session.id)}>
                          <span class="home-live">{language.t("orchestra.home.running")}</span>
                        </Show>
                      </div>
                      <div class="home-row-sub">{sessionSub(session)}</div>
                      <div class="home-track">
                        <i
                          style={{
                            width: `${Math.round((session.tokens / peak(sessions().map((item) => item.tokens))) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div class="home-row-value">
                      {language.t("orchestra.home.sessionTokens", {
                        value: `${tokens(session.tokens).text}${tokens(session.tokens).unit}`,
                      })}
                    </div>
                  </button>
                )}
              </For>
            </div>
          </section>
          <section class="home-block" aria-labelledby="orchestra-home-models">
            <header class="home-block-head">
              <h2 id="orchestra-home-models">{language.t("orchestra.home.models")}</h2>
              <button type="button" onClick={openModels}>
                {language.t("orchestra.home.manage")}
              </button>
            </header>
            <div class="home-rows">
              <Show when={exportable() && models().length === 0}>
                <p class="home-empty">{language.t("orchestra.home.modelsEmpty")}</p>
              </Show>
              <For each={models()}>
                {(model) => (
                  <div class="home-row" data-component="home-model-row" title={`${model.providerID}/${model.modelID}`}>
                    <div>
                      <div class="home-row-title">
                        <span class="home-chip">
                          <i />
                          {model.modelID}
                        </span>
                      </div>
                      <div class="home-track">
                        <i
                          style={{
                            width: `${Math.round((model.tokens / peak(models().map((item) => item.tokens))) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div class="home-row-value">{`${tokens(model.tokens).text}${tokens(model.tokens).unit}`}</div>
                  </div>
                )}
              </For>
            </div>
          </section>
        </div>
        <footer class="home-foot">
          <span>
            {language.t("orchestra.home.footer", { name: props.name })} ·{" "}
            <b>{language.t("orchestra.home.footerSource")}</b> {language.t("orchestra.home.footerDetail")}
          </span>
          <span>
            <button type="button" disabled={!exportable()} onClick={exportCsv}>
              {language.t("orchestra.home.export")}
            </button>
            {" · "}
            <button type="button" onClick={props.openProviders}>
              {language.t("orchestra.home.configure")}
            </button>
          </span>
        </footer>
      </div>
    </section>
  )
}

// Maps a legacy SDK call to complete data, a missing endpoint, or an error. Malformed data is an error.
async function outcome<T>(
  call: Promise<{ data?: unknown; response?: Response }>,
  parse: (value: unknown) => T | undefined,
): Promise<Outcome<T>> {
  const result = await call.catch(() => undefined)
  const status = result?.response?.status
  if (status !== undefined && [404, 405, 501].includes(status)) return { status: "unavailable" }
  const data = result?.response?.ok ? parse(result.data) : undefined
  if (!data) return { status: "error" }
  return { status: "complete", data }
}
