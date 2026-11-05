import { createComputed, createMemo, For, lazy, on, Show, Suspense, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { actorKey } from "./keys"
import type { Page } from "./model"
import "./discussion.css"

const Document = lazy(() => import("./document"))

const kindKey = {
  brief: "orchestra.board.discussion.brief",
  question: "orchestra.board.discussion.question",
  answer: "orchestra.board.discussion.answer",
  return: "orchestra.board.discussion.return",
  review: "orchestra.board.discussion.review",
  rework: "orchestra.board.discussion.rework",
} as const

// Note.kind is the wire's distinction between comments and execution documents. Never infer a type or a summary
// from an author's name or the prose. The list renders bounded, verbatim excerpts; only the reader loads Markdown.
export function IssueDiscussion(props: {
  issueID: string
  notes: Page["notes"]
  time: (value: number) => string
  children?: JSX.Element
  channel?: "comments" | "execution"
}) {
  const language = useLanguage()
  const t = language.t
  const platform = usePlatform()
  const initial = () =>
    props.channel ?? (props.notes.toSorted((a, b) => b.timeCreated - a.timeCreated)[0]?.kind == null ? "comments" : "execution")
  const [state, setState] = createStore({
    channel: initial(),
    visible: 4,
    reading: undefined as string | undefined,
    source: false,
    linkUnavailable: false,
  })
  let root: HTMLElement | undefined
  const comments = createMemo(() => props.notes.filter((note) => note.kind == null))
  const execution = createMemo(() => props.notes.filter((note) => note.kind != null))
  const records = createMemo(() =>
    ((props.channel ?? state.channel) === "comments" ? comments() : execution()).toSorted((a, b) => b.timeCreated - a.timeCreated),
  )
  const selected = createMemo(() => records().find((note) => note.id === state.reading))
  const author = (note: Page["notes"][number]) =>
    note.author === "owner" || note.author === "maestro"
      ? t(actorKey[note.author])
      : note.author.replace(/^github:/, "@")
  const label = (note: Page["notes"][number]) =>
    note.kind == null ? t("orchestra.board.discussion.comment") : t(kindKey[note.kind])
  const switchTo = (channel: "comments" | "execution") => setState({ channel, visible: 4, reading: undefined })
  const read = (id: string) => {
    setState({ reading: id, source: false, linkUnavailable: false })
    queueMicrotask(() => {
      const document = root?.querySelector<HTMLElement>(".board-discussion-document")
      document?.focus({ preventScroll: true })
      document?.scrollIntoView?.({ block: "nearest" })
    })
  }
  const back = () => {
    const id = state.reading
    const index = records().findIndex((note) => note.id === id)
    setState({ reading: undefined, visible: Math.max(state.visible, index + 1) })
    queueMicrotask(() => {
      const row = [...(root?.querySelectorAll<HTMLElement>("[data-note-id]") ?? [])].find(
        (row) => row.dataset.noteId === id,
      )
      const button = row?.querySelector<HTMLButtonElement>("button")
      button?.focus({ preventScroll: true })
      button?.scrollIntoView?.({ block: "nearest" })
    })
  }
  createComputed(() => {
    if (!state.reading || selected()) return
    setState("reading", undefined)
    queueMicrotask(() => root?.querySelector<HTMLElement>(".board-discussion-list")?.focus({ preventScroll: true }))
  })
  const link = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (!anchor) return
    event.preventDefault()
    event.stopPropagation()
    if (event.type === "auxclick" && event.button !== 1) return
    const url = anchor.getAttribute("href") ?? ""
    if (/^(https?:\/\/|mailto:)/i.test(url)) {
      setState("linkUnavailable", false)
      platform.openExternal(url)
      return
    }
    if (url.startsWith("#") && url.length > 1) {
      const target = [...(root?.querySelectorAll<HTMLElement>("[id]") ?? [])].find((node) => `#${node.id}` === url)
      if (target) return target.scrollIntoView?.({ block: "nearest" })
    }
    setState("linkUnavailable", true)
  }
  createComputed(
    on(
      () => props.issueID,
      () => {
        setState({
          channel: initial(),
          visible: 4,
          reading: undefined,
        })
      },
      { defer: true },
    ),
  )

  return (
    <section class="board-sec board-discussion" ref={root} aria-label={t("orchestra.board.discussion.title")}>
      <Show when={!props.channel}><h3>{t("orchestra.board.discussion.title")}</h3></Show>
      <Show when={props.children}><div class="board-discussion-compose">
        {props.children}
      </div></Show>
      <div class="board-discussion-toolbar">
        <Show when={!props.channel}><div class="board-discussion-channels" role="group" aria-label={t("orchestra.board.discussion.filter")}>
          <For each={["comments", "execution"] as const}>
            {(channel) => (
              <button
                type="button"
                data-channel={channel}
                aria-label={t(
                  channel === "comments"
                    ? "orchestra.board.discussion.comments"
                    : "orchestra.board.discussion.execution",
                )}
                aria-pressed={state.channel === channel}
                onClick={() => switchTo(channel)}
              >
                {t(
                  channel === "comments"
                    ? "orchestra.board.discussion.comments"
                    : "orchestra.board.discussion.execution",
                )}
                <span>{channel === "comments" ? comments().length : execution().length}</span>
              </button>
            )}
          </For>
        </div></Show>
        <span class="board-discussion-order">{t("orchestra.board.discussion.recent")}</span>
      </div>
      <Show
        when={selected()}
        fallback={
          <Show
            when={records().length > 0}
            fallback={
              <div class="board-discussion-empty">
                <b>
                  {t(
                    state.channel === "comments"
                      ? "orchestra.board.discussion.emptyComments"
                      : "orchestra.board.discussion.emptyExecution",
                  )}
                </b>
                <Show when={(props.channel ?? state.channel) === "comments"}><p>{t("orchestra.board.discussion.separation")}</p></Show>
              </div>
            }
          >
            <ol class="board-discussion-list" tabIndex={-1}>
              <For each={records().slice(0, state.visible)}>
                {(note, index) => (
                  <li data-note-id={note.id} data-kind={note.kind ?? "comment"} data-latest={index() === 0}>
                    <Show
                      when={note.kind != null}
                      fallback={
                        <article class="board-discussion-comment">
                          <header>
                            <b>{author(note)}</b>
                            <time dateTime={new Date(note.timeCreated).toISOString()}>
                              {props.time(note.timeCreated)}
                            </time>
                          </header>
                          <p dir="auto">
                            {note.body.slice(0, 280)}
                            {note.body.length > 280 ? "…" : ""}
                          </p>
                          <button type="button" class="mx-link" aria-label={t("orchestra.board.discussion.open", { kind: label(note), author: author(note), time: props.time(note.timeCreated) })} onClick={() => read(note.id)}>
                            {t("orchestra.board.discussion.read")}
                          </button>
                        </article>
                      }
                    >
                      <button
                        type="button"
                        class="board-discussion-record"
                        aria-label={t("orchestra.board.discussion.open", {
                          kind: label(note),
                          author: author(note),
                          time: props.time(note.timeCreated),
                        })}
                        onClick={() => read(note.id)}
                      >
                        <span class="board-discussion-glyph" aria-hidden="true">
                          <svg viewBox="0 0 20 20" fill="none">
                            <path d="M5 3h7l3 3v11H5zM11 3v4h4M8 10h4M8 13h4" />
                          </svg>
                        </span>
                        <span class="board-discussion-record-main">
                          <span class="board-discussion-record-meta">
                            <b>{label(note)}</b>
                            <span>{author(note)}</span>
                            <time dateTime={new Date(note.timeCreated).toISOString()}>
                              {props.time(note.timeCreated)}
                            </time>
                          </span>
                          <Show when={index() === 0}>
                            <span class="board-discussion-latest">{t("orchestra.board.discussion.latest")}</span>
                          </Show>
                          <span class="board-discussion-excerpt" dir="auto">
                            {note.body.trim().slice(0, index() === 0 ? 500 : 160)}
                            {note.body.trim().length > (index() === 0 ? 500 : 160) ? "…" : ""}
                          </span>
                        </span>
                        <span class="board-discussion-arrow" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </Show>
                  </li>
                )}
              </For>
            </ol>
            <Show when={records().length > state.visible}>
              <button
                type="button"
                class="board-discussion-older"
                onClick={() => {
                  const next = records()[state.visible]?.id
                  setState("visible", (visible) => Math.min(visible + 4, records().length))
                  queueMicrotask(() => {
                    const row = [...(root?.querySelectorAll<HTMLElement>("[data-note-id]") ?? [])].find((node) => node.dataset.noteId === next)
                    row?.querySelector<HTMLButtonElement>("button")?.focus()
                  })
                }}
              >
                {language.plural("orchestra.board.discussion.older", Math.min(4, records().length - state.visible))}
              </button>
            </Show>
          </Show>
        }
      >
        {(note) => (
          <section
            class="board-discussion-reader"
            tabindex="-1"
            aria-label={label(note())}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key !== "Escape") return
              event.preventDefault()
              back()
            }}
          >
            <header class="board-discussion-reader-head">
              <button type="button" class="mx-link" onClick={back}>
                {t(note().kind == null ? "orchestra.board.discussion.backComments" : "orchestra.board.discussion.back")}
              </button>
              <b>{label(note())}</b>
              <span>{author(note())}</span>
              <time dateTime={new Date(note().timeCreated).toISOString()}>{props.time(note().timeCreated)}</time>
              <Show when={note().kind != null}><button type="button" class="mx-link" aria-pressed={state.source} onClick={() => setState("source", (source) => !source)}>{t("orchestra.board.discussion.source")}</button></Show>
            </header>
            <Show when={state.linkUnavailable}><p class="board-quiet" role="status">{t("orchestra.board.discussion.linkUnavailable")}</p></Show>
            <div
              class="board-discussion-document"
              tabIndex={0}
              role="region"
              aria-label={t("orchestra.board.discussion.open", { kind: label(note()), author: author(note()), time: props.time(note().timeCreated) })}
              dir="auto"
              onClick={link}
              onAuxClick={link}
            >
              <Show when={note().kind != null && !state.source} fallback={<p class="board-discussion-source">{note().body}</p>}>
              <Suspense fallback={<p class="board-discussion-source">{note().body}</p>}>
                <Document text={note().body} />
              </Suspense>
              </Show>
            </div>
          </section>
        )}
      </Show>
    </section>
  )
}
