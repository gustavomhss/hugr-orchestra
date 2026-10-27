import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { MxBadge } from "../kit"
import { clock, inTab, listStatus, minutes, num, type Summary, type Tab } from "./model"
import { Glyph, Note } from "./parts"
import type { useFlight } from "./run"
import type { Meetings } from "./source"

const tabs = ["all", "week", "open"] as const
const pageSize = 25

// Past meetings, newest first. Search and person go to the server; the tabs narrow what is already loaded.
export function MeetingList(props: { meetings: Meetings | undefined; flight: ReturnType<typeof useFlight>; open: (id: string) => void }) {
  const language = useLanguage()
  const t = language.t
  const [store, setStore] = createStore({
    query: "",
    person: "",
    tab: "all" as Tab,
    items: [] as readonly Summary[],
    next: undefined as string | null | undefined,
    loading: true,
    failed: false,
  })
  const [typed, setTyped] = createSignal("")

  // Typing waits a beat so every key press is not a request.
  createEffect(() => {
    const value = typed()
    const timer = setTimeout(() => setStore("query", value), 250)
    onCleanup(() => clearTimeout(timer))
  })

  createEffect(() => {
    const source = props.meetings
    const query = store.query
    const person = store.person
    const abort = new AbortController()
    onCleanup(() => abort.abort())
    if (!source) return setStore({ items: [], next: undefined, loading: false, failed: false })
    setStore({ loading: true, failed: false })
    source
      .list({ query: query || undefined, person: person || undefined, limit: pageSize }, abort.signal)
      .then((page) => setStore({ items: page.items, next: page.next, loading: false }))
      .catch(() => !abort.signal.aborted && setStore({ loading: false, failed: true }))
  })

  const more = async () => {
    const source = props.meetings
    const cursor = store.next
    if (!source || !cursor) return
    setStore("loading", true)
    await source
      .list({ query: store.query || undefined, person: store.person || undefined, limit: pageSize, before: cursor })
      .then((page) => setStore({ items: [...store.items, ...page.items], next: page.next, loading: false }))
      .catch(() => setStore({ loading: false, failed: true }))
  }

  const now = Date.now()
  const shown = createMemo(() => store.items.filter((item) => inTab(item, store.tab, now)))
  const people = createMemo(() => [...new Map(store.items.flatMap((item) => item.people).map((person) => [person.id, person])).values()])
  const when = (time: number) =>
    new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(time)

  return (
    <>
      <div class="mx-toolbar fe-toolbar">
        <div class="fe-tabs" role="group" aria-label={t("orchestra.flightEngineer.meetings.filters")}>
          <For each={tabs}>
            {(tab) => (
              <button type="button" aria-pressed={store.tab === tab} onClick={() => setStore("tab", tab)}>
                {t(`orchestra.flightEngineer.meetings.tab.${tab}`)}
              </button>
            )}
          </For>
        </div>
        <label class="fe-search">
          <Glyph name="search" />
          <input
            type="search"
            placeholder={t("orchestra.flightEngineer.meetings.search")}
            aria-label={t("orchestra.flightEngineer.meetings.search")}
            value={typed()}
            onInput={(event) => setTyped(event.currentTarget.value)}
          />
        </label>
        <Show when={people().length > 0 || store.person}>
          <select
            class="fe-select"
            aria-label={t("orchestra.flightEngineer.meetings.person")}
            value={store.person}
            onChange={(event) => setStore("person", event.currentTarget.value)}
          >
            <option value="">{t("orchestra.flightEngineer.meetings.anyone")}</option>
            <For each={people()}>{(person) => <option value={person.id}>{person.name}</option>}</For>
          </select>
        </Show>
      </div>

      <Show when={props.meetings} fallback={<Note>{t("orchestra.flightEngineer.meetings.noProject")}</Note>}>
        <Show when={!store.failed} fallback={<Note tone="bad">{t("orchestra.flightEngineer.meetings.failed")}</Note>}>
          <Show
            when={shown().length > 0}
            fallback={
              <p class="mx-empty" role="status">
                {store.loading ? t("orchestra.flightEngineer.meetings.loading") : t("orchestra.flightEngineer.meetings.empty")}
              </p>
            }
          >
            <div class="mx-table fe-table" role="list" aria-label={t("orchestra.flightEngineer.meetings.title")}>
              <div class="fe-table-head" aria-hidden="true">
                <span>{t("orchestra.flightEngineer.meetings.col.meeting")}</span>
                <span />
                <span>{t("orchestra.flightEngineer.meetings.col.length")}</span>
                <span>{t("orchestra.flightEngineer.meetings.col.answers")}</span>
              </div>
              <For each={shown()}>
                {(meeting) => {
                  const status = () => listStatus(meeting)
                  return (
                    <div role="listitem" class="fe-table-item">
                    <button type="button" class="fe-table-row" onClick={() => props.open(meeting.id)}>
                      <span class="fe-cell-main">
                        <strong>{meeting.title}</strong>
                        <small>
                          {when(num(meeting.startedAt))}
                          {meeting.people.length > 0 ? ` · ${meeting.people.map((person) => person.name).join(", ")}` : ""}
                        </small>
                      </span>
                      <span class="fe-cell-badge">
                        <Show when={status() === "recording"}>
                          <MxBadge tone="bad">{t("orchestra.flightEngineer.recording")}</MxBadge>
                        </Show>
                        <Show when={status() === "open"}>
                          <MxBadge>{language.plural("orchestra.flightEngineer.meetings.open", num(meeting.counts.openCommitments))}</MxBadge>
                        </Show>
                        <Show when={status() === "ended"}>
                          <MxBadge>{t("orchestra.flightEngineer.meetings.ended")}</MxBadge>
                        </Show>
                      </span>
                      <span class="fe-num">
                        <Show
                          when={status() === "recording"}
                          fallback={t("orchestra.flightEngineer.minutes", { count: minutes(meeting) ?? 0 })}
                        >
                          {props.flight.store.run.running ? clock(props.flight.elapsed()) : "—"}
                        </Show>
                      </span>
                      <span class="fe-num">{num(meeting.counts.answers)}</span>
                    </button>
                    </div>
                  )
                }}
              </For>
            </div>
            <Show when={store.next}>
              <div class="fe-more">
                <button type="button" class="mx-btn" disabled={store.loading} onClick={() => void more()}>
                  {t("orchestra.flightEngineer.meetings.more")}
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </>
  )
}
