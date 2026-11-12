import { For, Show, createEffect, createMemo, on, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { WorktreeReading } from "./worktree-reading"
import { readingAge } from "./reading"

const columns = ["path", "project", "owner", "logical", "unique", "proof", "state", "age", "reading"] as const

export function ActivityWorktrees(props: { query: string }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const controller = createMemo(() => {
    const server = sdk()
    return WorktreeReading.make({
      api: {
        worktrees: async (options) => {
          await server.ready
          options?.signal?.throwIfAborted()
          return server.orchestra.activity.worktrees(options)
        },
        readWorktree: async (input, options) => {
          await server.ready
          options?.signal?.throwIfAborted()
          return server.orchestra.activity.readWorktree(input, options)
        },
      },
    })
  })
  const state = () => controller().state
  const shown = createMemo(() => WorktreeReading.matching(state().snapshot?.records ?? [], props.query))
  function age(sampledAt?: number) {
    const value = readingAge({
      sampledAt,
      readAt: state().snapshot?.readAt ?? NaN,
      receivedAt: state().receivedAt ?? NaN,
      now: state().now,
    })
    return value === undefined
      ? language.t("orchestra.monitor.unread")
      : language.t("orchestra.monitor.seconds", { count: Math.floor(value / 1000) })
  }
  // Request state cannot recreate the SDK lifetime that owns those requests.
  createEffect(
    on(controller, (current) => {
      void current.refresh()
      const poll = setInterval(() => {
        if (!document.hidden) void current.refresh()
      }, 10_000)
      const timer = setInterval(() => current.tick(), 1000)
      onCleanup(() => {
        clearInterval(poll)
        clearInterval(timer)
        current.dispose()
      })
    }),
  )

  return (
    <div aria-busy={state().inventory.busy}>
      <div class="activity-section-heading">
        <p class="mx-note">
          {language.t("orchestra.monitor.worktreeSource", {
            source: state().snapshot?.source ?? language.t("orchestra.monitor.unread"),
          })}
        </p>
        <button
          type="button"
          class="mx-btn"
          disabled={state().inventory.busy}
          onClick={() => void controller().refresh()}
        >
          {language.t("orchestra.monitor.refresh")}
        </button>
      </div>
      <Show when={state().inventory.failed}>
        <p class="activity-error" role="alert">
          {language.t("orchestra.monitor.loadFailed")}
        </p>
      </Show>
      <Show when={Object.values(state().reads).some((status) => status.failed)}>
        <p class="activity-error" role="alert">
          {language.t("orchestra.monitor.diskFailed")}
        </p>
      </Show>
      <Show
        when={state().snapshot !== undefined}
        fallback={
          <div class="mx-empty" role="status">
            <strong>{language.t("orchestra.monitor.registryUnread")}</strong>
          </div>
        }
      >
        <p class="mx-note" role="status">
          {language.t("orchestra.monitor.registeredCount", { count: state().snapshot?.records.length ?? 0 })}
        </p>
        <Show
          when={shown().length > 0}
          fallback={
            <div class="mx-empty" role="status">
              <strong>
                {language.t(props.query.trim() ? "orchestra.monitor.filterMiss" : "orchestra.monitor.noRegistered")}
              </strong>
            </div>
          }
        >
          <div class="activity-table-scroll">
            <table class="activity-table">
              <thead>
                <tr>
                  <For each={columns}>
                    {(column) => <th scope="col">{language.t(`orchestra.monitor.${column}`)}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={shown()}>
                  {(row) => (
                    <tr aria-busy={state().reads[row.recordID]?.busy}>
                      <td class="activity-path" title={row.directory}>
                        <code>{row.directory}</code>
                      </td>
                      <td title={row.projectID}>{row.projectID}</td>
                      <td>{row.owner}</td>
                      <td>
                        {row.logical
                          ? language.t("orchestra.monitor.bytes", { count: row.logical.bytes })
                          : language.t("orchestra.monitor.unread")}
                        <div class="mx-note">
                          <Show when={row.logical}>
                            <code>{state().snapshot?.source}</code>
                          </Show>
                        </div>
                      </td>
                      <td>{language.t("orchestra.monitor.notCollapsed")}</td>
                      <td>{language.t("orchestra.monitor.unproved")}</td>
                      <td>
                        {row.attempt
                          ? language.t(
                              row.attempt.state === "complete"
                                ? "orchestra.monitor.walkComplete"
                                : "orchestra.monitor.walkPartial",
                            )
                          : language.t("orchestra.monitor.unread")}
                      </td>
                      <td>{age(row.logical?.sampledAt)}</td>
                      <td>
                        <button
                          type="button"
                          class="mx-btn"
                          disabled={state().reads[row.recordID]?.busy}
                          aria-label={language.t("orchestra.monitor.worktreeRead", { path: row.directory })}
                          onClick={() => void controller().read(row.recordID)}
                        >
                          {language.t("orchestra.monitor.measureDisk")}
                        </button>
                        <Show when={state().reads[row.recordID]?.failed}>
                          <p class="activity-error" role="alert">
                            {language.t("orchestra.monitor.diskFailed")}
                          </p>
                        </Show>
                        <Show when={row.attempt}>
                          {(attempt) => (
                            <details class="activity-worktree-attempt">
                              <summary>
                                {language.t("orchestra.monitor.worktreeAttempt", {
                                  age: age(attempt().sampledAt),
                                  issues: attempt().issueCount,
                                })}
                              </summary>
                              <p class="mx-note">
                                {language.t("orchestra.monitor.walkDetails", {
                                  bytes: attempt().observedBytes,
                                  entries: attempt().entries,
                                  age: age(attempt().sampledAt),
                                  issues: attempt().issueCount,
                                })}
                              </p>
                              <Show when={attempt().issueCount > 0}>
                                <p class="mx-note">{language.t("orchestra.monitor.gapsLimit")}</p>
                                <ul class="activity-members">
                                  <For each={attempt().issues}>
                                    {(issue) => (
                                      <li>
                                        <code>{issue.path}</code> ·{" "}
                                        {language.t(`orchestra.monitor.diskIssue.${issue.reason}`)}
                                      </li>
                                    )}
                                  </For>
                                </ul>
                              </Show>
                            </details>
                          )}
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
      <p class="mx-note">{language.t("orchestra.monitor.registryLimit")}</p>
    </div>
  )
}
