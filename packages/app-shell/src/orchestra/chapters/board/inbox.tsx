import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { answered, inbox, options, refusal, waits, type Activity, type Page, type Snapshot } from "./model"

// The Needs-you inbox (MOCKS.md v6-inbox, J4): every open question across projects, oldest first. The focused one is
// open; 1-9 answer it (Maestro's recommendation is always 1), J and K move, and answers go through the same route as
// the board's Ask card.
export function Inbox(props: { onOpen: (key: string) => void; onClose: () => void }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const t = language.t
  const api = () => sdk().orchestra["server.board"]
  const [store, setStore] = createStore({
    snapshots: undefined as readonly Snapshot[] | undefined,
    failed: false,
    activity: [] as { key: string; rows: readonly Activity[]; labels: Record<string, string> }[],
    busy: false,
    failure: undefined as string | undefined,
    draft: "",
  })
  const [focused, setFocused] = createSignal<string>()
  const [filter, setFilter] = createSignal<string>()
  let root: HTMLElement | undefined
  let controller: AbortController | undefined
  onCleanup(() => controller?.abort())

  // One read per project; the answered list needs each project's activity and the issue pages that name the options.
  const load = async () => {
    controller?.abort()
    const current = new AbortController()
    controller = current
    const signal = current.signal
    const list = await api().list({ signal }).catch(() => undefined)
    if (signal.aborted) return
    if (!list) return setStore("failed", true)
    const snapshots = await Promise.allSettled(list.map((item) => api().get({ key: item.project.key }, { signal })))
    if (signal.aborted) return
    setStore("snapshots", reconcile(snapshots.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []))))
    setStore("failed", false)
    const now = Date.now()
    const activity = await Promise.all(
      list.map(async (item) => {
        const rows = await api().activity({ key: item.project.key }, { signal }).catch(() => [])
        const issues = [...new Set(answered(rows, now).flatMap((entry) => (entry.issue === null ? [] : [entry.issue])))]
        const pages = await Promise.allSettled(
          issues.slice(0, 10).map((number) => api().issue({ key: item.project.key, number: String(number) }, { signal })),
        )
        const labels = Object.fromEntries(
          pages.flatMap((page) => (page.status === "fulfilled" ? optionLabels(page.value) : [])),
        )
        return { key: item.project.key, rows, labels }
      }),
    )
    if (!signal.aborted) setStore("activity", reconcile(activity))
  }
  onMount(() => void load())
  onCleanup(
    sdk().event.listen((event) => {
      if ((event.details as { type: string }).type === "board.changed") void load()
    }),
  )

  const all = createMemo(() => inbox(store.snapshots ?? []))
  const items = createMemo(() => all().filter((item) => !filter() || item.key === filter()))
  const keys = createMemo(() => [...new Set(all().map((item) => item.key))])
  const current = () => items().find((item) => item.question.id === focused()) ?? items()[0]
  const done = createMemo(() =>
    store.activity
      .flatMap((project) => answered(project.rows, Date.now()).map((entry) => ({ ...entry, key: project.key, labels: project.labels })))
      .sort((a, b) => b.at - a.at),
  )
  const ago = (value: number) => {
    const minutes = Math.max(1, Math.round((Date.now() - value) / 60000))
    if (minutes < 60) return t("orchestra.board.inbox.minutes", { count: minutes })
    if (minutes < 60 * 48) return t("orchestra.board.inbox.hours", { count: Math.round(minutes / 60) })
    return t("orchestra.board.inbox.days", { count: Math.round(minutes / 1440) })
  }
  const date = (value: number) => new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(value)

  const answer = (key: string, id: string, option: string) => {
    if (store.busy) return
    setStore({ busy: true, failure: undefined })
    return api()
      .answer({ key, id, option, text: store.draft.trim() || undefined })
      .then(
        () => {
          setStore({ busy: false, draft: "" })
          setFocused(undefined)
          void load()
        },
        (error: unknown) => setStore({ busy: false, failure: refusal(error) ?? t("orchestra.board.write.failed") }),
      )
  }
  const move = (delta: number) => {
    const index = items().findIndex((item) => item === current())
    const next = items()[Math.min(items().length - 1, Math.max(0, index + delta))]
    if (!next) return
    setFocused(next.question.id)
    requestAnimationFrame(() => root?.querySelector<HTMLElement>(`[data-question="${next.question.id}"]`)?.focus())
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") return (event.preventDefault(), props.onClose())
    if ((event.target as HTMLElement).closest("input, textarea, [contenteditable]")) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const key = event.key.toLowerCase()
    if (key === "j" || key === "arrowdown") return (event.preventDefault(), move(1))
    if (key === "k" || key === "arrowup") return (event.preventDefault(), move(-1))
    const item = current()
    const choice = /^[1-9]$/.test(key) && item ? options(item.question)[Number(key) - 1] : undefined
    if (item && choice) return (event.preventDefault(), void answer(item.key, item.question.id, choice.id))
  }

  return (
    <section class="board-page board-inbox" aria-labelledby="board-inbox-title" ref={root} onKeyDown={keydown}>
      <nav class="board-crumb" aria-label={t("orchestra.board.crumb")}>
        <button type="button" class="mx-link" onClick={props.onClose}>
          {t("orchestra.board.title")}
        </button>
        <span aria-hidden="true">/</span>
        <span>{t("orchestra.board.ask.title")}</span>
      </nav>
      <header class="board-head">
        <div>
          <div class="board-title-row">
            <h1 id="board-inbox-title">{t("orchestra.board.ask.title")}</h1>
            <span class="board-chip board-ask-count">{t("orchestra.board.inbox.open", { count: all().length })}</span>
          </div>
          <p class="board-sub">
            <Show when={all()[0]} fallback={t("orchestra.board.inbox.none")}>
              {(oldest) => t("orchestra.board.inbox.oldest", { ago: ago(oldest().question.timeCreated) })}
            </Show>
          </p>
        </div>
      </header>
      <Show when={keys().length > 1}>
        <div class="board-intake-themes" role="group" aria-label={t("orchestra.board.inbox.filter")}>
          <button type="button" class="board-chip board-intake-theme" aria-pressed={!filter()} onClick={() => setFilter(undefined)}>
            {t("orchestra.board.inbox.all")}
            <b>{all().length}</b>
          </button>
          <For each={keys()}>
            {(key) => (
              <button type="button" class="board-chip board-intake-theme" aria-pressed={filter() === key} onClick={() => setFilter(key)}>
                <span class="board-mono">{key}</span>
                <b>{all().filter((item) => item.key === key).length}</b>
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={store.failure}>
        {(failure) => (
          <p class="mx-error" role="alert">
            {failure()}
          </p>
        )}
      </Show>
      <div class="board-top board-inbox-body">
        <div class="board-inbox-list">
          <Show when={store.failed && !store.snapshots}>
            <div class="mx-empty">
              <strong>{t("orchestra.board.listFailed")}</strong>
              <button type="button" class="mx-btn" onClick={() => void load()}>
                {t("orchestra.board.retry")}
              </button>
            </div>
          </Show>
          <Show when={!store.snapshots && !store.failed}>
            <p class="board-quiet board-loading">{t("orchestra.board.loading")}</p>
          </Show>
          <Show when={store.snapshots && items().length === 0}>
            <div class="mx-empty">
              <strong>{t("orchestra.board.inbox.clear")}</strong>
            </div>
          </Show>
          <For each={items()}>
            {(item) => {
              const open = () => current() === item
              return (
                <article
                  class="board-ask board-inbox-item"
                  data-question={item.question.id}
                  data-open={open()}
                  tabindex={open() ? 0 : -1}
                  onFocusIn={() => setFocused(item.question.id)}
                  onClick={() => setFocused(item.question.id)}
                >
                  <div class="board-ask-kicker">
                    <span class="board-mono">
                      {item.key}
                      {item.issue ? ` · ${item.issue.ref}` : ""}
                    </span>
                    <span>{t("orchestra.board.inbox.asked", { ago: ago(item.question.timeCreated) })}</span>
                  </div>
                  <p class="board-ask-text">{item.question.text}</p>
                  <Show
                    when={open()}
                    fallback={
                      <p class="board-quiet">
                        {t("orchestra.board.inbox.recommends", {
                          option: item.question.options.find((option) => option.id === item.question.recommended)?.label ?? "",
                        })}
                      </p>
                    }
                  >
                    <div class="board-meta">
                      <Show when={item.issue?.paused}>
                        <span class="board-held-note">{t("orchestra.board.inbox.paused", { ref: item.issue?.ref ?? "" })}</span>
                      </Show>
                      <Show when={item.blocks.length > 0}>
                        <span>{t("orchestra.board.inbox.blocks", { refs: item.blocks.join(", ") })}</span>
                      </Show>
                      <Show when={item.targetDate}>
                        {(target) => <span>{t("orchestra.board.target", { date: date(target()) })}</span>}
                      </Show>
                    </div>
                    <Show when={item.question.costOfWaiting}>
                      {(cost) => (
                        <p class="board-inbox-cost">
                          <b>{t("orchestra.board.inbox.cost")}</b> {cost()}
                        </p>
                      )}
                    </Show>
                  </Show>
                  <ul class="board-ask-options">
                    <For each={options(item.question)}>
                      {(option, index) => (
                        <li>
                          <button
                            type="button"
                            class="board-option"
                            data-recommended={option.id === item.question.recommended}
                            disabled={store.busy}
                            onClick={(event) => {
                              event.stopPropagation()
                              void answer(item.key, item.question.id, option.id)
                            }}
                          >
                            <Show when={open()}>
                              <kbd>{index() + 1}</kbd>
                            </Show>
                            {option.label}
                            <Show when={open() && option.consequence}>
                              <small class="board-quiet">{option.consequence}</small>
                            </Show>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={open()}>
                    <div class="board-add">
                      <input
                        class="board-input board-inbox-draft"
                        value={store.draft}
                        placeholder={t("orchestra.board.inbox.draft")}
                        aria-label={t("orchestra.board.inbox.draft")}
                        onInput={(event) => setStore("draft", event.currentTarget.value)}
                      />
                      <button type="button" class="mx-link" onClick={() => props.onOpen(item.key)}>
                        {t("orchestra.board.inbox.board")}
                      </button>
                    </div>
                  </Show>
                </article>
              )
            }}
          </For>
          <Show when={done().length > 0}>
            <details class="board-sec board-inbox-done">
              <summary>
                <h3>{language.plural("orchestra.board.inbox.answered", done().length)}</h3>
              </summary>
              <ul class="board-activity">
                <For each={done()}>
                  {(entry) => (
                    <li>
                      <span>
                        <span class="board-mono">{entry.key}</span> {entry.question ?? ""}
                        <br />
                        <b>{t("orchestra.board.inbox.you", { option: entry.labels[`${entry.ask}:${entry.option}`] ?? entry.option ?? "" })}</b>
                        <Show when={entry.next?.reason}>{(reason) => <span class="board-quiet"> · {reason()}</span>}</Show>
                      </span>
                      <span class="board-quiet">{date(entry.at)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </details>
          </Show>
        </div>
        <aside class="board-brief board-inbox-side" aria-labelledby="board-inbox-waits">
          <h3 id="board-inbox-waits" class="board-sec-title">
            {t("orchestra.board.inbox.waits")}
          </h3>
          <ul class="board-inbox-waits">
            <For each={waits(store.snapshots ?? [])} fallback={<li class="board-quiet">{t("orchestra.board.inbox.none")}</li>}>
              {(wait) => (
                <li>
                  <button type="button" class="mx-link" onClick={() => props.onOpen(wait.key)}>
                    {wait.project}
                  </button>
                  <span class="board-quiet">
                    {language.plural("orchestra.board.project.questions", wait.questions)}
                    <Show when={wait.held > 0}> · {language.plural("orchestra.board.inbox.held", wait.held)}</Show>
                    <Show when={wait.targetDate}>{(target) => <> · {t("orchestra.board.target", { date: date(target()) })}</>}</Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
          <p class="board-quiet">{t("orchestra.board.inbox.how")}</p>
          <p class="board-quiet board-inbox-keys">
            <kbd>1</kbd>–<kbd>9</kbd> {t("orchestra.board.inbox.keyAnswer")} · <kbd>J</kbd>
            <kbd>K</kbd> {t("orchestra.board.inbox.keyMove")} · <kbd>Esc</kbd> {t("orchestra.board.inbox.keyBack")}
          </p>
        </aside>
      </div>
    </section>
  )
}

// Answer rows store the option id; the issue page's questions carry the labels, keyed per question.
function optionLabels(page: Page) {
  return page.questions.flatMap((question) => question.options.map((option) => [`${question.id}:${option.id}`, option.label] as const))
}
