import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { createEffect, createMemo, For, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useSettingsDialog } from "@/components/settings-dialog"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import { MxToggle } from "./kit"
import {
  activityEdges,
  addDays,
  allRange,
  change,
  compact,
  dayStart,
  firstGitDay,
  heights,
  hours,
  parseActivity,
  parseGit,
  PERIODS,
  periodRange,
  summarizeActivity,
  summarizeGit,
  usageCsv,
  type Period,
  type Range,
  type Totals,
} from "./kpis-data"
import "./kpis.css"

export const TILES = ["tokens", "hours", "messages", "commits", "pullRequests", "merges", "models", "failed"] as const
type Tile = (typeof TILES)[number]
type Load = "loading" | "complete" | "error" | "unavailable"

export function KpiDashboard(props: {
  directory: string
  sdk: ServerSDK
  name: string
  running: (sessionID: string) => boolean
  openSession: (sessionID: string) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const openModels = useSettingsDialog("models")
  const client = props.sdk.createClient({ directory: props.directory })
  const [prefs, setPrefs, , ready] = persisted(
    Persist.serverWorkspace(props.sdk.scope, props.directory, "orchestra-home"),
    createStore({ period: "30d" as Period, hidden: [] as Tile[] }),
  )
  const [state, setState] = createStore({
    activity: {
      status: "loading" as Load,
      range: undefined as Range | undefined,
      summary: undefined as ReturnType<typeof summarizeActivity> | undefined,
    },
    git: {
      status: "loading" as Load | "none",
      summary: undefined as ReturnType<typeof summarizeGit> | undefined,
      since: undefined as number | undefined,
    },
    branch: undefined as string | undefined,
    expanded: false,
  })
  const lifecycle = { abort: new AbortController() }
  onCleanup(() => lifecycle.abort.abort())

  const numbers = (digits: number) =>
    new Intl.NumberFormat(language.intl(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const number = (value: number, digits = 0) => numbers(digits).format(value)
  const date = (time: number) => new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(time)
  const since = (time: number) =>
    language.t("orchestra.home.note.since", {
      date: new Intl.DateTimeFormat(language.intl(), { year: "numeric", month: "short", day: "numeric" }).format(time),
    })
  const tokens = (value: number) => {
    const scaled = compact(value)
    return { text: number(scaled.value, scaled.digits), unit: scaled.unit }
  }

  function load(period: Period) {
    lifecycle.abort.abort()
    lifecycle.abort = new AbortController()
    const signal = lifecycle.abort.signal
    setState({
      activity: { status: "loading", range: undefined, summary: undefined },
      git: { status: "loading", summary: undefined, since: undefined },
      expanded: false,
    })
    void loadActivity(period, signal)
    void loadGit(period, signal)
    void client.vcs
      .get({ directory: props.directory }, { signal })
      .then((result) => {
        if (!signal.aborted && typeof result.data?.branch === "string") setState("branch", result.data.branch)
      })
      .catch(() => undefined)
  }

  async function loadActivity(period: Period, signal: AbortSignal) {
    const now = Date.now()
    const fetch = (edges: readonly number[]) =>
      outcome(client.session.activity({ directory: props.directory, edges: edges.join(",") }, { signal }), parseActivity)
    const first =
      period === "all" ? await fetch([0, addDays(dayStart(now), 1)]) : ({ status: "complete", data: undefined } as const)
    if (signal.aborted) return
    if (first.status !== "complete") return setState("activity", "status", first.status)
    // "All" starts on the creation day of the oldest session with recorded messages.
    const range =
      period === "all"
        ? allRange(Math.min(now, ...(first.data?.sessions.map((session) => session.created) ?? [])), now)
        : periodRange(period, now)
    const result = await fetch(activityEdges(range))
    if (signal.aborted) return
    if (result.status !== "complete") return setState("activity", "status", result.status)
    setState("activity", { status: "complete", range, summary: summarizeActivity(result.data, range) })
  }

  async function loadGit(period: Period, signal: AbortSignal) {
    const now = Date.now()
    const fixed = period === "all" ? undefined : periodRange(period, now)
    const from = fixed?.previous ?? 0
    const result = await outcome(
      client.vcs.activity({ directory: props.directory, since: from, until: now }, { signal }),
      parseGit,
    )
    if (signal.aborted) return
    if (result.status !== "complete") return setState("git", "status", result.status)
    if (!result.data.repository) return setState("git", "status", "none")
    const range = fixed ?? allRange(firstGitDay(result.data), now)
    setState("git", {
      status: "complete",
      summary: summarizeGit(result.data, range),
      // The server clamps long windows; the tile then says where its history starts.
      since: result.data.since > from ? result.data.since : undefined,
    })
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

  const changeView = (current: number, previous: number | undefined) => {
    const result = change(current, previous)
    if (!result) return
    if (result.percent === undefined) return { text: language.t("orchestra.home.change.new"), trend: "up", percent: "" }
    const text =
      result.trend === "flat"
        ? language.t("orchestra.home.change.flat")
        : language.t(result.trend === "up" ? "orchestra.home.change.up" : "orchestra.home.change.down", {
            percent: number(Math.abs(result.percent)),
          })
    return { text, trend: result.trend as string, percent: String(result.percent) }
  }

  const tiles = createMemo(() => {
    const summary = state.activity.status === "complete" ? state.activity.summary : undefined
    const git = state.git.status === "complete" ? state.git.summary : undefined
    const all = prefs.period === "all"
    const activity = (
      id: Tile,
      read: (totals: Totals) => number,
      view: (value: number) => { text: string; unit: string; csv: string; raw?: number },
      note: (totals: Totals) => string,
      delta = true,
    ) => {
      if (!summary) return { id, state: activityState(), note: "", bars: [] as number[] }
      const current = read(summary.current)
      return {
        id,
        value: { raw: current, ...view(current) },
        change: delta ? changeView(current, summary.previous && read(summary.previous)) : undefined,
        note: note(summary.current),
        bars: heights(summary.bars.map(read)),
      }
    }
    const repository = (id: Tile, read: (totals: { commits: number; merges: number }) => number, note: string) => {
      if (!git) return { id, state: gitState(), note: gitNote(), bars: [] as number[] }
      // A scan cut short by the server's limits undercounts; it is not shown as a number.
      if (git.truncated) return { id, state: "partial", note: language.t("orchestra.home.note.partial"), bars: [] }
      const current = read(git.current)
      return {
        id,
        value: { text: number(current), unit: "", csv: language.t("orchestra.home.unit.count"), raw: current },
        change: id === "commits" ? changeView(current, git.previous && read(git.previous)) : undefined,
        note: [note, state.git.since === undefined ? "" : since(state.git.since)].filter(Boolean).join(" · "),
        bars: heights(git.bars.map(read)),
      }
    }
    const count = (value: number) => ({ text: number(value), unit: "", csv: language.t("orchestra.home.unit.count") })
    const list = [
      activity(
        "tokens",
        (totals) => totals.tokens,
        (value) => ({ ...tokens(value), csv: language.t("orchestra.home.unit.tokens") }),
        () =>
          all && state.activity.range
            ? since(state.activity.range.start)
            : language.t("orchestra.home.note.tokens"),
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
      repository(
        "commits",
        (totals) => totals.commits,
        state.branch
          ? language.t("orchestra.home.note.commits", { branch: state.branch })
          : language.t("orchestra.home.note.commitsCurrent"),
      ),
      { id: "pullRequests" as Tile, state: "notConnected", note: language.t("orchestra.home.note.notConnected"), bars: [] },
      repository("merges", (totals) => totals.merges, language.t("orchestra.home.note.merges")),
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
      failedTile(summary),
    ]
    return list
      .filter((tile) => !prefs.hidden.includes(tile.id))
      .map((tile) => ({ ...tile, label: language.t(`orchestra.home.tile.${tile.id}`) }))
  })

  function failedTile(summary: ReturnType<typeof summarizeActivity> | undefined) {
    if (!summary) return { id: "failed" as Tile, state: activityState(), note: "", bars: [] as number[] }
    const current = summary.current
    return {
      id: "failed" as Tile,
      value: { text: number(current.failed), unit: "", csv: language.t("orchestra.home.unit.count"), raw: current.failed },
      // The mock puts the run total in the change slot.
      change: { text: language.t("orchestra.home.note.failedOf", { count: number(current.runs) }), trend: "", percent: "" },
      note:
        current.runs > 0
          ? language.t("orchestra.home.note.failedRate", { percent: number((current.failed / current.runs) * 100, 1) })
          : "",
      bars: heights(summary.bars.map((totals) => totals.failed)),
    }
  }

  function activityState() {
    return state.activity.status === "loading" ? "loading" : "unavailable"
  }

  function gitState() {
    if (state.git.status === "loading") return "loading"
    if (state.git.status === "none") return "noRepository"
    return "unavailable"
  }

  function gitNote() {
    if (state.git.status === "none") return language.t("orchestra.home.note.noRepository")
    if (state.git.status === "unavailable") return language.t("orchestra.home.note.gitUnavailable")
    if (state.git.status === "error") return language.t("orchestra.home.note.gitError")
    return ""
  }

  const stateText = (value: string | undefined) => {
    if (value === "notConnected") return language.t("orchestra.home.state.notConnected")
    if (value === "noRepository") return language.t("orchestra.home.state.noRepository")
    if (value === "unavailable") return language.t("orchestra.home.state.unavailable")
    if (value === "partial") return language.t("orchestra.home.state.partial")
    return ""
  }

  const sessions = createMemo(() => {
    const list = state.activity.summary?.sessions ?? []
    return state.expanded ? list : list.slice(0, 5)
  })
  const models = createMemo(() => state.activity.summary?.models ?? [])
  const sessionSub = (session: ReturnType<typeof sessions>[number]) =>
    [
      date(session.updated),
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

  function exportCsv() {
    const range = state.activity.range
    if (state.activity.status !== "complete" || !range) return
    const day = (time: number) => new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
    const rows = [
      [language.t("orchestra.home.csv.period"), language.t(`orchestra.home.period.${prefs.period}`)],
      [language.t("orchestra.home.csv.from"), day(range.start)],
      [language.t("orchestra.home.csv.to"), day(addDays(range.end, -1))],
      [
        language.t("orchestra.home.csv.metric"),
        language.t("orchestra.home.csv.value"),
        language.t("orchestra.home.csv.unit"),
        language.t("orchestra.home.csv.change"),
      ],
      ...tiles().map((tile) =>
        "value" in tile && tile.value
          ? [tile.label, tile.value.raw, tile.value.csv, tile.id === "failed" ? "" : (tile.change?.percent ?? "")]
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
        session.title,
        session.tokens,
        session.messages,
        session.files ?? "",
        session.additions ?? "",
        session.deletions ?? "",
      ]),
      [language.t("orchestra.home.csv.model"), language.t("orchestra.home.csv.tokens"), language.t("orchestra.home.csv.runs")],
      ...models().map((model) => [`${model.providerID}/${model.modelID}`, model.tokens, model.runs]),
    ]
    const url = URL.createObjectURL(new Blob([usageCsv(rows)], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = language.t("orchestra.home.filename", { name: props.name, period: prefs.period })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function configure() {
    void dialog.show(() => (
      <Dialog
        title={language.t("orchestra.home.configure")}
        description={language.t("orchestra.home.configureDescription")}
      >
        <div class="home-tracking" data-slot="home-tracking">
          <For each={TILES}>
            {(id) => (
              <label>
                <span>{language.t(`orchestra.home.tile.${id}`)}</span>
                <MxToggle
                  checked={!prefs.hidden.includes(id)}
                  label={language.t(`orchestra.home.tile.${id}`)}
                  onChange={(next) =>
                    setPrefs("hidden", (hidden) => (next ? hidden.filter((item) => item !== id) : [...hidden, id]))
                  }
                />
              </label>
            )}
          </For>
        </div>
      </Dialog>
    ))
  }

  const peak = (values: readonly number[]) => Math.max(...values, 1)

  return (
    <section
      class="orchestra-home-dashboard"
      data-component="orchestra-kpis"
      aria-labelledby="orchestra-home-title"
      aria-busy={state.activity.status === "loading" || state.git.status === "loading"}
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
                <button
                  type="button"
                  aria-pressed={prefs.period === period}
                  onClick={() => setPrefs("period", period)}
                >
                  {language.t(`orchestra.home.period.${period}`)}
                </button>
              )}
            </For>
          </div>
        </header>
        <Show when={state.activity.status === "loading"}>
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
                  when={"value" in tile && tile.value}
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
                  <Show when={"change" in tile && tile.change}>
                    {(change) => (
                      <span class="home-delta" data-trend={change().trend || undefined}>
                        {change().text}
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
        <Show when={state.activity.status === "error"}>
          <p class="home-status" role="alert">
            <span>{language.t("orchestra.home.error")}</span>
            <button type="button" onClick={() => load(prefs.period)}>
              {language.t("orchestra.home.retry")}
            </button>
          </p>
        </Show>
        <Show when={state.activity.status === "unavailable"}>
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
                disabled={(state.activity.summary?.sessions.length ?? 0) <= 5}
                onClick={() => setState("expanded", (value) => !value)}
              >
                {language.t(state.expanded ? "orchestra.home.viewTop" : "orchestra.home.viewAll")}
              </button>
            </header>
            <div class="home-rows">
              <Show when={state.activity.status === "complete" && sessions().length === 0}>
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
                        <bdi>{session.title}</bdi>
                        <Show when={props.running(session.id)}>
                          <span class="home-live">{language.t("orchestra.home.running")}</span>
                        </Show>
                      </div>
                      <div class="home-row-sub">{sessionSub(session)}</div>
                      <div class="home-track">
                        <i style={{ width: `${Math.round((session.tokens / peak(sessions().map((item) => item.tokens))) * 100)}%` }} />
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
              <Show when={state.activity.status === "complete" && models().length === 0}>
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
                        <i style={{ width: `${Math.round((model.tokens / peak(models().map((item) => item.tokens))) * 100)}%` }} />
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
            <button type="button" disabled={state.activity.status !== "complete"} onClick={exportCsv}>
              {language.t("orchestra.home.export")}
            </button>
            {" · "}
            <button type="button" onClick={configure}>
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
) {
  const result = await call.catch(() => undefined)
  const status = result?.response?.status
  if (status !== undefined && [404, 405, 501].includes(status)) return { status: "unavailable" as const }
  const data = result?.response?.ok ? parse(result.data) : undefined
  if (!data) return { status: "error" as const }
  return { status: "complete" as const, data }
}
