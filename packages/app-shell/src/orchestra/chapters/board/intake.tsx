import { createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { age, intake, type Issue, type Snapshot } from "./model"

// The intake strip (MOCKS.md v7-watch, J31): issues GitHub brought in wait above the board until the owner accepts or
// declines them. Nothing joins the plan on its own unless the project auto-accepts.
export function Intake(props: {
  snapshot: Snapshot
  busy: boolean
  onAccept: (number: number) => void
  onDecline: (number: number) => void
}) {
  const language = useLanguage()
  const t = language.t
  const queue = createMemo(() => intake(props.snapshot))
  const [open, setOpen] = createSignal<string>()
  const project = () => props.snapshot.project
  // A repository that is linked but not syncing cannot bring new issues in, so the strip says so instead of looking empty.
  const unsynced = () => project().githubRepo !== null && project().githubState !== "ok" && project().githubState !== "off"
  const date = (value: number) => new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(value)
  const shown = () => {
    if (!queue().themes.length) return queue().items
    return queue().themes.find((theme) => theme.id === open())?.issues ?? []
  }

  const Card = (card: { issue: Issue }) => (
    <article class="board-intake-card" data-intake={card.issue.ref}>
      <span class="board-card-top">
        <span class="board-id">
          {card.issue.githubNumber === null
            ? card.issue.ref
            : t("orchestra.board.intake.github", { number: card.issue.githubNumber })}
        </span>
        <span class="board-quiet">{t("orchestra.board.day", { day: age(card.issue, Date.now()) })}</span>
      </span>
      <span class="board-card-title">{card.issue.title}</span>
      <Show when={card.issue.body.trim()}>{(body) => <span class="board-quiet board-intake-body">{body()}</span>}</Show>
      <span class="board-intake-actions">
        <button type="button" class="mx-btn" disabled={props.busy} onClick={() => props.onAccept(card.issue.number)}>
          {t("orchestra.board.intake.accept")}
        </button>
        <button type="button" class="mx-btn" disabled={props.busy} onClick={() => props.onDecline(card.issue.number)}>
          {t("orchestra.board.intake.decline")}
        </button>
      </span>
    </article>
  )

  return (
    <Show when={queue().items.length > 0 || unsynced()}>
      <section class="board-intake-strip" aria-labelledby="board-intake-title">
        <header class="board-intake-head">
          <b id="board-intake-title">{t("orchestra.board.stage.intake")}</b>
          <span class="board-count">{queue().items.length}</span>
          <span class="board-quiet">{t("orchestra.board.intake.waiting")}</span>
          <span class="board-quiet board-intake-rule">
            {project().autoAcceptIntake ? t("orchestra.board.intake.auto") : t("orchestra.board.intake.manual")}
          </span>
        </header>
        <Show when={unsynced()}>
          <p class="board-held-note" role="status">
            <b>{t("orchestra.board.trail.signedOut")}</b>
            {" · "}
            {project().githubError ??
              (project().githubSyncedAt === null
                ? t("orchestra.board.intake.never")
                : t("orchestra.board.intake.since", { date: date(project().githubSyncedAt ?? 0) }))}
          </p>
        </Show>
        <Show when={queue().themes.length > 0}>
          <div class="board-intake-themes" role="group" aria-label={t("orchestra.board.intake.themes")}>
            <For each={queue().themes}>
              {(theme) => (
                <button
                  type="button"
                  class="board-chip board-intake-theme"
                  aria-pressed={open() === theme.id}
                  onClick={() => setOpen(open() === theme.id ? undefined : theme.id)}
                >
                  {"epic" in theme ? theme.epic : t(`orchestra.board.type.${theme.type}`)}
                  <b>{theme.issues.length}</b>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={shown().length > 0}>
          <div class="board-intake-list">
            <For each={shown()}>{(issue) => <Card issue={issue} />}</For>
          </div>
        </Show>
      </section>
    </Show>
  )
}
