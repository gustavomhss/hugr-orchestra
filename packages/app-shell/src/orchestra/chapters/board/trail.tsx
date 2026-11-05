import { For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { ticks, type Trail } from "./model"
import { narrow, Seat } from "./parts"

export function Ticks(props: { trail: Trail | undefined; compact?: boolean }) {
  const t = useLanguage().t
  return (
    <Show when={props.trail && narrow(props.trail, "ok")}>
      {(trail) => {
        const ci = () => ticks(trail().pr.checks)
        return (
          <Show when={ci().total > 0} fallback={<span class="board-quiet">{t("orchestra.board.ci.none")}</span>}>
            <span class="board-ticks" aria-label={t("orchestra.board.ci.label", { passed: ci().passed, total: ci().total })}>
              <span class="board-tick-run" aria-hidden="true">
                <For each={ci().states}>{(state) => <i data-state={state} />}</For>
              </span>
              <b>{ci().passed}</b>
              {t("orchestra.board.ci.of", { total: ci().total })}
            </span>
          </Show>
        )
      }}
    </Show>
  )
}

export function TrailView(props: { trail: Trail; branch: string | null }) {
  const t = useLanguage().t
  return (
    <Switch>
      <Match when={narrow(props.trail, "signed_out")}>
        {(trail) => (
          <div class="board-trail-note">
            <strong>{t("orchestra.board.trail.signedOut")}</strong>
            <p>{trail().message}</p>
          </div>
        )}
      </Match>
      <Match when={narrow(props.trail, "error")}>
        {(trail) => (
          <div class="board-trail-note">
            <strong>{t("orchestra.board.trail.error")}</strong>
            <p>{trail().message}</p>
          </div>
        )}
      </Match>
      <Match when={props.trail.state === "none"}>
        <div class="board-trail-note">
          <Show when={props.branch} fallback={<p>{t("orchestra.board.trail.none")}</p>}>
            {(branch) => (
              <p>
                {t("orchestra.board.trail.branchOnly")} <span class="board-mono">{branch()}</span>
              </p>
            )}
          </Show>
        </div>
      </Match>
      <Match when={narrow(props.trail, "ok")}>
        {(trail) => (
          <div class="board-trail">
            <div class="board-trail-head">
              <span class="board-mono board-strong">#{trail().pr.number}</span>
              <span class="board-chip">
                {trail().pr.merged
                  ? t("orchestra.board.pr.merged")
                  : trail().pr.state.toLowerCase() === "closed"
                    ? t("orchestra.board.pr.closed")
                    : t("orchestra.board.pr.open")}
              </span>
              <span class="board-trail-title">{trail().pr.title}</span>
            </div>
            <div class="board-trail-facts">
              <span>
                {t("orchestra.board.trail.branch")} <span class="board-mono">{trail().branch}</span>
              </span>
              <Ticks trail={trail()} />
              <Show when={trail().pr.reviewDecision}>
                {(decision) => <span>{t("orchestra.board.trail.review", { state: decision().toLowerCase().replaceAll("_", " ") })}</span>}
              </Show>
              <Show when={trail().pr.mergeCommit}>
                {(hash) => (
                  <span>
                    {t("orchestra.board.trail.merge")} <span class="board-mono">{hash().slice(0, 7)}</span>
                  </span>
                )}
              </Show>
            </div>
            <Show when={trail().commits.length > 0}>
              <ol class="board-commits">
                <For each={trail().commits}>
                  {(commit) => (
                    <li>
                      <span class="board-mono">{commit.hash.slice(0, 7)}</span>
                      <span class="board-commit-message">{commit.message}</span>
                      <Seat seat={commit.seat} />
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  )
}
