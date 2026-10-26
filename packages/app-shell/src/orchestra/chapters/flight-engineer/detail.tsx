import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { MxBadge } from "../kit"
import {
  clock,
  hearsay,
  jumpable,
  num,
  pollDelay,
  polling,
  refusal,
  segmentAt,
  speaker,
  visible,
  type Asserter,
  type Detail,
  type Party,
} from "./model"
import { Glyph, Note } from "./parts"
import type { Meetings, PersonVerdict, Receipt, Verdict } from "./source"

type Item = {
  id: string
  text: string
  asserter: Asserter
  quote: string
  startMs?: number | string | null
  status: "claimed" | "confirmed" | "disputed"
  sentToMaestro: boolean
}

// One meeting: the summary and the card the consolidation produced. The card is polled until it settles.
export function MeetingDetail(props: { meetings: Meetings | undefined; id: string; back: () => void }) {
  const language = useLanguage()
  const t = language.t
  const [store, setStore] = createStore({
    detail: undefined as Detail | undefined,
    attempts: 0,
    missing: false,
    failed: false,
    unavailable: false,
    transcript: false,
    focus: undefined as string | undefined,
    editing: false,
    confirmDelete: false,
    deleteRefusal: undefined as "running" | "other" | undefined,
    receipt: undefined as Receipt | undefined,
    sent: 0,
    showHidden: false,
  })
  const [dismissed, setDismissed] = createSignal<ReadonlySet<string>>(new Set())
  let dialog: HTMLDialogElement | undefined

  createEffect(() => {
    const source = props.meetings
    const id = props.id
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    onCleanup(() => {
      abort.abort()
      clearTimeout(timer)
    })
    setStore({ detail: undefined, attempts: 0, missing: false, failed: false, receipt: undefined, unavailable: false })
    setDismissed(new Set())
    if (!source) return
    const load = (attempts: number) =>
      source
        .read(id, abort.signal)
        .then((detail) => {
          setStore({ detail, attempts, failed: false })
          if (polling(detail.card, attempts)) timer = setTimeout(() => load(attempts + 1), pollDelay(attempts))
        })
        .catch((error) => {
          if (abort.signal.aborted) return
          if (refusal(error) === "missing_meeting") return setStore("missing", true)
          setStore("failed", true)
        })
    void load(0)
  })

  const card = () => store.detail?.card
  const stalled = () => card()?.status === "pending" && !polling({ status: "pending" }, store.attempts)
  const hidden = createMemo(() => dismissed().size)
  const owner = (item: { owner: Party }) => item.owner

  const run = async (work: Promise<unknown>) => {
    setStore("unavailable", false)
    await work.catch((error) => {
      if (refusal(error) === "unavailable") return setStore("unavailable", true)
      setStore("failed", true)
    })
  }

  const reload = () =>
    props.meetings
      ?.read(props.id)
      .then((detail) => setStore("detail", detail))
      .catch(() => undefined)

  const verdict = async (id: string, value: Verdict) => {
    if (value === "dismissed") setDismissed(new Set([...dismissed(), id]))
    await run(props.meetings?.confirm(props.id, { items: [{ id, verdict: value }] }).then(reload) ?? Promise.resolve())
  }

  const person = (proposalID: string, value: PersonVerdict) =>
    run(props.meetings?.confirm(props.id, { people: [{ proposalID, verdict: value }] }).then(reload) ?? Promise.resolve())

  const state = (id: string, next: "accepted" | "done" | "dropped") =>
    run(props.meetings?.commitment(id, next).then(reload) ?? Promise.resolve())

  const handoff = (ids: string[]) =>
    run(
      props.meetings?.handoff(props.id, ids).then((sent) => {
        setStore("sent", sent.length)
        return reload()
      }) ?? Promise.resolve(),
    )

  const rename = async (title: string) => {
    setStore("editing", false)
    const clean = title.trim()
    const current = store.detail
    if (!clean || !current || clean === current.meeting.title) return
    await run(props.meetings?.rename(props.id, clean).then(reload) ?? Promise.resolve())
  }

  const erase = async () => {
    setStore("deleteRefusal", undefined)
    const receipt = await props.meetings?.remove(props.id).catch((error) => {
      setStore("deleteRefusal", refusal(error) === "running" ? "running" : "other")
    })
    if (!receipt) return
    dialog?.close()
    setStore({ confirmDelete: false, receipt })
  }

  const openDelete = () => {
    setStore({ confirmDelete: true, deleteRefusal: undefined })
    queueMicrotask(() => dialog?.showModal())
  }

  const jump = (item: Item) => {
    const detail = store.detail
    if (!detail || !jumpable(item)) return
    const found = segmentAt(detail.segments, num(item.startMs))
    if (!found) return
    setStore({ transcript: true, focus: found.id })
    queueMicrotask(() => document.getElementById(`fe-seg-${found.id}`)?.scrollIntoView({ block: "center" }))
  }

  const who = (asserter: Asserter) => {
    const value = speaker(asserter)
    if (value.kind === "me") return t("orchestra.flightEngineer.detail.me")
    if (value.kind === "person") return value.name
    return t("orchestra.flightEngineer.detail.speaker", { number: value.number })
  }

  const party = (value: Party | null | undefined) =>
    value === "me" ? t("orchestra.flightEngineer.detail.me") : (value?.name ?? "")

  const when = (time: number) =>
    new Intl.DateTimeFormat(language.intl(), { dateStyle: "medium", timeStyle: "short" }).format(time)

  const row = (item: Item, extra?: JSX.Element, tag?: JSX.Element) => (
    <li class="fe-item" data-status={item.status}>
      <div class="fe-item-main">
        <p>{item.text}</p>
        <div class="fe-item-meta">
          <span>{who(item.asserter)}</span>
          {tag}
          <Show when={item.status !== "claimed"}>
            <MxBadge tone={item.status === "confirmed" ? "good" : "bad"}>
              {t(`orchestra.flightEngineer.detail.status.${item.status}` as "orchestra.flightEngineer.detail.status.confirmed")}
            </MxBadge>
          </Show>
          <Show when={item.sentToMaestro}>
            <MxBadge>{t("orchestra.flightEngineer.detail.sent")}</MxBadge>
          </Show>
        </div>
        <Show when={item.quote}>
          <blockquote class="fe-quote">
            <Show when={jumpable(item)} fallback={<span>{item.quote}</span>}>
              <button type="button" class="fe-jump" onClick={() => jump(item)} title={t("orchestra.flightEngineer.detail.jump")}>
                {item.quote}
              </button>
            </Show>
            <Show when={jumpable(item)}>
              <small>{clock(num(item.startMs))}</small>
            </Show>
          </blockquote>
        </Show>
      </div>
      <div class="fe-item-actions">
        {extra}
        <Show when={item.status === "claimed"}>
          <button type="button" class="mx-link" onClick={() => void verdict(item.id, "confirmed")}>
            {t("orchestra.flightEngineer.detail.confirm")}
          </button>
          <button type="button" class="mx-link" onClick={() => void verdict(item.id, "disputed")}>
            {t("orchestra.flightEngineer.detail.dispute")}
          </button>
        </Show>
        <button type="button" class="mx-link" onClick={() => void verdict(item.id, "dismissed")}>
          {t("orchestra.flightEngineer.detail.dismiss")}
        </button>
        <Show when={!item.sentToMaestro}>
          <button type="button" class="mx-link" onClick={() => void handoff([item.id])}>
            {t("orchestra.flightEngineer.detail.handoff")}
          </button>
        </Show>
      </div>
    </li>
  )

  const section = (title: string, items: readonly Item[], render: (item: Item) => JSX.Element) => {
    const list = () => (store.showHidden ? items : visible(items, dismissed()))
    return (
      <Show when={items.length > 0}>
        <section class="mx-card fe-section">
          <h3>{title}</h3>
          <Show when={list().length > 0} fallback={<p class="fe-empty">{t("orchestra.flightEngineer.detail.allHidden")}</p>}>
            <ul class="fe-items">
              <For each={list()}>{render}</For>
            </ul>
          </Show>
        </section>
      </Show>
    )
  }

  return (
    <Show when={props.meetings} fallback={<Note>{t("orchestra.flightEngineer.meetings.noProject")}</Note>}>
      <button type="button" class="mx-link fe-back" onClick={props.back}>
        <Glyph name="back" /> {t("orchestra.flightEngineer.detail.back")}
      </button>

      <Show when={!store.receipt} fallback={<Erased receipt={store.receipt!} back={props.back} />}>
        <Show when={!store.missing} fallback={<Note tone="bad">{t("orchestra.flightEngineer.detail.missing")}</Note>}>
          <Show when={store.detail} fallback={<Note tone={store.failed ? "bad" : undefined}>{store.failed ? t("orchestra.flightEngineer.detail.failed") : t("orchestra.flightEngineer.detail.loading")}</Note>}>
            {(detail) => (
              <>
                <header class="fe-detail-head">
                  <div class="mx-grow">
                    <Show
                      when={store.editing}
                      fallback={
                        <h2>
                          {detail().meeting.title}
                          <button type="button" class="mx-link fe-edit" onClick={() => setStore("editing", true)}>
                            {t("orchestra.flightEngineer.rename")}
                          </button>
                        </h2>
                      }
                    >
                      <input
                        class="fe-title-input"
                        value={detail().meeting.title}
                        aria-label={t("orchestra.flightEngineer.rename")}
                        ref={(el) => queueMicrotask(() => el.select())}
                        onBlur={(event) => void rename(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur()
                          if (event.key === "Escape") setStore("editing", false)
                        }}
                      />
                    </Show>
                    <p class="fe-detail-meta">
                      {when(num(detail().meeting.timeStarted))}
                      {" · "}
                      {t("orchestra.flightEngineer.detail.answers", { count: num(detail().summary.counts.answers) })}
                      {" · "}
                      {t(`orchestra.flightEngineer.detail.retention.${detail().summary.retention}` as "orchestra.flightEngineer.detail.retention.kept")}
                    </p>
                  </div>
                  <button type="button" class="mx-btn danger" onClick={openDelete}>
                    {t("orchestra.flightEngineer.detail.delete")}
                  </button>
                </header>

                <Show when={detail().summary.retention === "ephemeral"}>
                  <Note>{t("orchestra.flightEngineer.detail.ephemeral")}</Note>
                </Show>
                <Show when={store.unavailable}>
                  <Note>{t("orchestra.flightEngineer.detail.unavailable")}</Note>
                </Show>
                <Show when={store.failed}>
                  <Note tone="bad">{t("orchestra.flightEngineer.detail.failed")}</Note>
                </Show>
                <Show when={store.sent > 0}>
                  <Note>{language.plural("orchestra.flightEngineer.detail.sentCount", store.sent)}</Note>
                </Show>

                <Show when={detail().card.status === "ready"}>
                  <section class="mx-card fe-section">
                    <h3>{t("orchestra.flightEngineer.detail.summary")}</h3>
                    <p class="fe-summary">{detail().card.summary}</p>
                  </section>
                  {section(t("orchestra.flightEngineer.detail.decisions"), detail().card.decisions, (item) => row(item))}
                  {section(t("orchestra.flightEngineer.detail.commitments"), detail().card.commitments, (item) => {
                    const entry = detail().card.commitments.find((value) => value.id === item.id)!
                    return row(
                      item,
                      <div class="fe-states" role="group" aria-label={t("orchestra.flightEngineer.detail.state")}>
                        <For each={["accepted", "done", "dropped"] as const}>
                          {(next) => (
                            <button type="button" aria-pressed={entry.state === next} onClick={() => void state(item.id, next)}>
                              {t(`orchestra.flightEngineer.detail.state.${next}` as "orchestra.flightEngineer.detail.state.done")}
                            </button>
                          )}
                        </For>
                      </div>,
                      <>
                        <span>
                          {t("orchestra.flightEngineer.detail.owner", { name: party(owner(entry)) })}
                          {entry.due ? ` · ${t("orchestra.flightEngineer.detail.due", { date: entry.due })}` : ""}
                        </span>
                        <Show when={hearsay(entry.asserter, entry.owner)}>
                          <MxBadge>{t("orchestra.flightEngineer.detail.hearsay")}</MxBadge>
                        </Show>
                        <MxBadge tone={entry.state === "overdue" ? "bad" : entry.state === "done" ? "good" : undefined}>
                          {t(`orchestra.flightEngineer.detail.state.${entry.state}` as "orchestra.flightEngineer.detail.state.done")}
                        </MxBadge>
                      </>,
                    )
                  })}
                  {section(t("orchestra.flightEngineer.detail.questions"), detail().card.questions, (item) => row(item))}
                  <Show when={detail().card.suggestions.length > 0}>
                    <For each={["owner", "maestro"] as const}>
                      {(target) =>
                        section(
                          t(`orchestra.flightEngineer.detail.suggestions.${target}` as "orchestra.flightEngineer.detail.suggestions.owner"),
                          detail().card.suggestions.filter((item) => item.for === target),
                          (item) => row(item),
                        )
                      }
                    </For>
                  </Show>
                  <Show when={detail().card.newPeople.length > 0}>
                    <section class="mx-card fe-section">
                      <h3>{t("orchestra.flightEngineer.detail.people")}</h3>
                      <ul class="fe-items">
                        <For each={detail().card.newPeople}>
                          {(proposal) => (
                            <li class="fe-item">
                              <div class="fe-item-main">
                                <p>
                                  {proposal.mergeWith
                                    ? t("orchestra.flightEngineer.detail.people.merge", { name: proposal.name, other: proposal.mergeWith.name })
                                    : t("orchestra.flightEngineer.detail.people.new", { name: proposal.name })}
                                </p>
                              </div>
                              <div class="fe-item-actions">
                                <Show when={proposal.mergeWith}>
                                  <button type="button" class="mx-link" onClick={() => void person(proposal.proposalID, "merge")}>
                                    {t("orchestra.flightEngineer.detail.people.mergeAction")}
                                  </button>
                                </Show>
                                <button type="button" class="mx-link" onClick={() => void person(proposal.proposalID, "new")}>
                                  {t("orchestra.flightEngineer.detail.people.newAction")}
                                </button>
                                <button type="button" class="mx-link" onClick={() => void person(proposal.proposalID, "dismissed")}>
                                  {t("orchestra.flightEngineer.detail.dismiss")}
                                </button>
                              </div>
                            </li>
                          )}
                        </For>
                      </ul>
                    </section>
                  </Show>
                  <div class="fe-foot">
                    <Show when={detail().card.commitments.some((item) => !item.sentToMaestro)}>
                      <button
                        type="button"
                        class="mx-btn"
                        onClick={() => void handoff(detail().card.commitments.filter((item) => !item.sentToMaestro).map((item) => item.id))}
                      >
                        {t("orchestra.flightEngineer.detail.handoffOpen")}
                      </button>
                    </Show>
                    <Show when={hidden() > 0}>
                      <button type="button" class="mx-link" onClick={() => setStore("showHidden", !store.showHidden)}>
                        {store.showHidden
                          ? t("orchestra.flightEngineer.detail.hideHidden")
                          : language.plural("orchestra.flightEngineer.detail.showHidden", hidden())}
                      </button>
                    </Show>
                    <p class="fe-fine">{t("orchestra.flightEngineer.detail.dismissNote")}</p>
                  </div>
                </Show>

                <Show when={detail().card.status === "pending"}>
                  <section class="mx-card fe-section fe-pending" role="status">
                    <h3>{t(stalled() ? "orchestra.flightEngineer.detail.slow" : "orchestra.flightEngineer.detail.pending")}</h3>
                    <p>{t(stalled() ? "orchestra.flightEngineer.detail.slowBody" : "orchestra.flightEngineer.detail.pendingBody")}</p>
                    <Show when={stalled()}>
                      <button type="button" class="mx-btn" onClick={() => void reload()}>
                        {t("orchestra.flightEngineer.detail.checkAgain")}
                      </button>
                    </Show>
                  </section>
                </Show>

                <Show when={detail().card.status === "failed"}>
                  <section class="mx-card fe-section">
                    <h3>{t("orchestra.flightEngineer.detail.cardFailed")}</h3>
                    <p>{detail().card.error ?? t("orchestra.flightEngineer.detail.cardFailedBody")}</p>
                  </section>
                </Show>

                <Show when={detail().segments.length > 0}>
                  <section class="mx-card fe-section">
                    <div class="mx-card-top">
                      <h3 class="mx-grow">{t("orchestra.flightEngineer.detail.transcript")}</h3>
                      <button type="button" class="mx-link" aria-expanded={store.transcript} onClick={() => setStore("transcript", !store.transcript)}>
                        {store.transcript
                          ? t("orchestra.flightEngineer.detail.hideTranscript")
                          : t("orchestra.flightEngineer.detail.showTranscript", { count: detail().segments.length })}
                      </button>
                    </div>
                    <Show when={store.transcript}>
                      <ol class="fe-transcript">
                        <For each={detail().segments}>
                          {(segment) => (
                            <li id={`fe-seg-${segment.id}`} data-focus={store.focus === segment.id} data-track={segment.track}>
                              <small>{clock(num(segment.startMs))}</small>
                              <strong>{t(segment.track === "me" ? "orchestra.flightEngineer.you" : "orchestra.flightEngineer.them")}</strong>
                              <span>{segment.text}</span>
                            </li>
                          )}
                        </For>
                      </ol>
                    </Show>
                  </section>
                </Show>

                <dialog
                  ref={dialog}
                  class="mx-dialog fe-dialog"
                  aria-labelledby="fe-delete-title"
                  onClose={() => setStore("confirmDelete", false)}
                >
                  <Show when={store.confirmDelete}>
                    <div class="mx-dialog-body">
                      <h2 id="fe-delete-title">{t("orchestra.flightEngineer.detail.deleteTitle")}</h2>
                      <p>{t("orchestra.flightEngineer.detail.deleteBody")}</p>
                      <Show when={store.deleteRefusal}>
                        <Note tone="bad">
                          {store.deleteRefusal === "running"
                            ? t("orchestra.flightEngineer.detail.deleteRunning")
                            : t("orchestra.flightEngineer.detail.deleteFailed")}
                        </Note>
                      </Show>
                    </div>
                    <div class="mx-dialog-foot">
                      <button type="button" class="mx-btn" onClick={() => dialog?.close()}>
                        {t("orchestra.flightEngineer.cancel")}
                      </button>
                      <button type="button" class="mx-btn danger" onClick={() => void erase()}>
                        {t("orchestra.flightEngineer.detail.deleteConfirm")}
                      </button>
                    </div>
                  </Show>
                </dialog>
              </>
            )}
          </Show>
        </Show>
      </Show>
    </Show>
  )
}

function Erased(props: { receipt: Receipt; back: () => void }) {
  const t = useLanguage().t
  return (
    <section class="mx-card fe-section fe-receipt" role="status">
      <h2>{t("orchestra.flightEngineer.receipt.title")}</h2>
      <p>{t("orchestra.flightEngineer.receipt.body")}</p>
      <dl>
        <dt>{t("orchestra.flightEngineer.receipt.segments")}</dt>
        <dd>{num(props.receipt.segments)}</dd>
        <dt>{t("orchestra.flightEngineer.receipt.claims")}</dt>
        <dd>{num(props.receipt.claims)}</dd>
        <dt>{t("orchestra.flightEngineer.receipt.commitments")}</dt>
        <dd>{num(props.receipt.commitments)}</dd>
        <dt>{t("orchestra.flightEngineer.receipt.people")}</dt>
        <dd>{num(props.receipt.people)}</dd>
      </dl>
      <button type="button" class="mx-btn" onClick={props.back}>
        {t("orchestra.flightEngineer.receipt.done")}
      </button>
    </section>
  )
}
