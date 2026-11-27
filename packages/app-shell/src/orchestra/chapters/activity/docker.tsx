import { For, Show, createEffect, createMemo, on, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { createDockerReading } from "./docker-reading"

const columns = ["dockerContainer", "owner", "logical", "unique", "proof", "age", "reading"] as const

export function ActivityDocker(props: { query: string }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const reading = createMemo(() => {
    const server = sdk()
    return createDockerReading({ api: server.orchestra.activity, ready: server.ready })
  })
  const state = () => reading().state
  const snapshot = () => state().snapshot
  const inventory = () => snapshot()?.inventory
  const unread = () => language.t("orchestra.monitor.unread")
  const shown = createMemo(() => {
    const query = props.query.trim().toLowerCase()
    return (inventory()?.containers ?? []).filter(
      (row) => row.containerID.toLowerCase().includes(query) || row.name?.toLowerCase().includes(query),
    )
  })

  function formatAge(anchor: number | undefined) {
    return anchor === undefined
      ? unread()
      : language.t("orchestra.monitor.seconds", { count: Math.floor((state().now - anchor) / 1000) })
  }
  const inventoryAge = createMemo(() => formatAge(state().inventoryAnchor))
  const attemptAge = createMemo(() => formatAge(state().attemptAnchor))

  createEffect(
    on(reading, (current) => {
      const timer = setInterval(() => current.tick(), 1000)
      onCleanup(() => {
        clearInterval(timer)
        current.dispose()
      })
    }),
  )

  return (
    <div aria-busy={state().cache.busy || state().read.busy}>
      <div class="activity-section-heading activity-docker-heading">
        <p class="mx-note">
          {language.t("orchestra.monitor.dockerSource")} <code>{snapshot()?.source ?? unread()}</code>
        </p>
        <div class="activity-docker-actions">
          <button type="button" class="mx-btn" disabled={state().cache.busy} onClick={() => void reading().refresh()}>
            {language.t("orchestra.monitor.refresh")}
          </button>
          <button
            type="button"
            class="mx-btn primary"
            disabled={state().read.busy || state().awaitingCache}
            onClick={() => void reading().read()}
          >
            {language.t("orchestra.monitor.dockerRead")}
          </button>
        </div>
      </div>

      <Show when={state().cache.failed || state().read.failed}>
        <p class="activity-error" role="alert">
          {language.t("orchestra.monitor.dockerRequestFailed")}
        </p>
      </Show>

      <Show when={snapshot()?.attempt}>
        {(attempt) => (
          <div>
            <p class="mx-note">
              <span role="status">
                {language.t("orchestra.monitor.dockerAttempt", {
                  state: language.t(`orchestra.monitor.dockerState.${attempt().state}`),
                })}
              </span>
              {" · "}
              {attemptAge()}
            </p>
            <Show when={attempt().gaps.length > 0}>
              <ul class="activity-members">
                <For each={attempt().gaps}>{(gap) => <li>{language.t(`orchestra.monitor.dockerGap.${gap}`)}</li>}</For>
              </ul>
            </Show>
          </div>
        )}
      </Show>

      <Show
        when={shown().length > 0}
        fallback={
          <div class="mx-empty">
            <strong role="status">
              {language.t(
                !inventory()
                  ? "orchestra.monitor.dockerUnread"
                  : inventory()?.containers.length === 0
                    ? "orchestra.monitor.dockerEmpty"
                    : "orchestra.monitor.filterMiss",
              )}
            </strong>
            <p>{language.t("orchestra.monitor.dockerAge", { age: inventoryAge() })}</p>
          </div>
        }
      >
        <div class="activity-table-scroll">
          <table class="activity-table">
            <thead>
              <tr>
                <For each={columns}>{(column) => <th scope="col">{language.t(`orchestra.monitor.${column}`)}</th>}</For>
              </tr>
            </thead>
            <tbody>
              <For each={shown()}>
                {(row) => (
                  <tr>
                    <td class="activity-path" title={row.containerID}>
                      <Show when={row.name}>{(name) => <div>{name()}</div>}</Show>
                      <code>{row.containerID}</code>
                    </td>
                    <td>{row.owner}</td>
                    <td>{unread()}</td>
                    <td>{row.unique}</td>
                    <td>{language.t("orchestra.monitor.unproved")}</td>
                    <td>{inventoryAge()}</td>
                    <td>
                      <details class="activity-docker-size">
                        <summary>{language.t("orchestra.monitor.reading")}</summary>
                        <p class="mx-note">
                          {language.t("orchestra.monitor.dockerSize", { size: row.sizeText ?? unread() })}
                        </p>
                      </details>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  )
}
