import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { createStore } from "solid-js/store"
import { For, Show, createEffect, createMemo, on, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { WorktreeReading } from "./worktree-reading"

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
  const proof = createMemo(() => {
    const server = sdk()
    const current = controller()
    const [reports, setReports] = createStore({} as Record<string, {
      proof?: ActivityMonitor.WorktreeUseProof
      busy: boolean
      failed: boolean
      instanceID: string
      registrationID: string
    }>)
    const pending = new Map<string, AbortController>()
    function prune() {
      const snapshot = current.state.snapshot
      Object.entries(reports).forEach(([recordID, entry]) => {
        const row = snapshot?.records.find((record) => record.recordID === recordID)
        if (snapshot?.instanceID === entry.instanceID && row?.registrationID === entry.registrationID) return
        pending.get(recordID)?.abort()
        pending.delete(recordID)
        setReports(recordID, undefined!)
      })
    }
    async function read(recordID: string) {
      const snapshot = current.state.snapshot
      const row = snapshot?.records.find((record) => record.recordID === recordID)
      if (!snapshot || !row || pending.has(recordID)) return
      const request = new AbortController()
      pending.set(recordID, request)
      setReports(recordID, { ...reports[recordID], busy: true, failed: false, instanceID: snapshot.instanceID, registrationID: row.registrationID })
      try {
        await server.ready
        request.signal.throwIfAborted()
        const result = await server.orchestra.activity.proveWorktreeUse({ recordID }, { signal: request.signal })
        const active = current.state.snapshot
        if (request.signal.aborted || pending.get(recordID) !== request || result.recordID !== recordID ||
          active?.instanceID !== snapshot.instanceID ||
          !active.records.some((item) => item.recordID === recordID && item.registrationID === row.registrationID)) return
        setReports(recordID, { proof: result, busy: false, failed: false, instanceID: snapshot.instanceID, registrationID: row.registrationID })
      } catch {
        if (!request.signal.aborted && pending.get(recordID) === request) setReports(recordID, "failed", true)
      } finally {
        if (pending.get(recordID) === request) {
          pending.delete(recordID)
          setReports(recordID, "busy", false)
        }
      }
    }
    return { reports, read, prune, dispose: () => pending.forEach((request) => request.abort()) }
  })
  createEffect(() => {
    state().snapshot
    proof().prune()
  })
  createEffect(on(proof, (current) => onCleanup(() => current.dispose())))
  const shown = createMemo(() => WorktreeReading.matching(state().snapshot?.records ?? [], props.query))
  function age(recordID: string, kind: "logical" | "attempt") {
    const value = controller().age(recordID, kind)
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
                      <td>
                        <Show when={proof().reports[row.recordID]?.proof} fallback={language.t("orchestra.monitor.unproved")}>
                          {(report) => (
                            <>
                              <p>{language.t(`orchestra.monitor.useProof.${report().state}`)}</p>
                              <Show when={Number.isFinite(new Date(report().sampledAt).getTime())}>
                                <p>
                                  {language.t("orchestra.monitor.useProofObservedAt")}: {" "}
                                  <time dateTime={new Date(report().sampledAt).toISOString()}>
                                    {new Date(report().sampledAt).toLocaleString(language.intl())}
                                  </time>
                                </p>
                              </Show>
                              <ul>
                                <For each={report().checks}>
                                  {(check) => (
                                    <li>
                                      {language.t(`orchestra.monitor.useMethod.${check.method}`)}: {language.t(`orchestra.monitor.useOutcome.${check.outcome}`)}
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </>
                          )}
                        </Show>
                        <button type="button" class="mx-btn" disabled={proof().reports[row.recordID]?.busy} onClick={() => void proof().read(row.recordID)}>
                          {language.t("orchestra.monitor.readUseProof")}
                        </button>
                        <Show when={proof().reports[row.recordID]?.failed}>
                          <p class="activity-error" role="alert">{language.t("orchestra.monitor.useProofFailed")}</p>
                        </Show>
                      </td>
                      <td>
                        {row.attempt
                          ? language.t(
                              row.attempt.state === "complete"
                                ? "orchestra.monitor.walkComplete"
                                : "orchestra.monitor.walkPartial",
                            )
                          : language.t("orchestra.monitor.unread")}
                      </td>
                      <td>{age(row.recordID, "logical")}</td>
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
                                  age: age(row.recordID, "attempt"),
                                  issues: attempt().issueCount,
                                })}
                              </summary>
                              <p class="mx-note">
                                {language.t("orchestra.monitor.walkDetails", {
                                  bytes: attempt().observedBytes,
                                  entries: attempt().entries,
                                  age: age(row.recordID, "attempt"),
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
