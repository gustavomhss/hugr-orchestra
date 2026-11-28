import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import type { ActivityFreeze } from "@orchestra/schema/activity-freeze"
import { For, Show, createEffect, createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { bytes } from "@/orchestra/actions/format"
import { readingAge } from "./reading"
import { applySnapshot } from "./snapshot"

const columns = ["process", "owner", "state", "pid", "supervisorID", "members", "footprint", "age"] as const

export function ActivityTrees(props: { query: string }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const platform = usePlatform()
  const server = useServer()
  const [state, setState] = createStore({
    snapshot: undefined as ActivityMonitor.Snapshot | undefined,
    busy: false,
    failure: undefined as "snapshot" | "inspection" | undefined,
    stopping: false,
    stopResult: undefined as { scope: string; uncertain: boolean } | undefined,
    receivedAt: performance.now(),
    now: performance.now(),
    freeze: undefined as { scope: string; state?: ActivityFreeze.State; result?: string } | undefined,
  })
  const controller = new AbortController()
  const age = (sampledAt: number | undefined) => {
    const value = readingAge({
      sampledAt,
      readAt: state.snapshot?.readAt ?? NaN,
      receivedAt: state.receivedAt,
      now: state.now,
    })
    return value === undefined
      ? language.t("orchestra.monitor.unread")
      : language.t("orchestra.monitor.seconds", { count: Math.floor(value / 1000) })
  }
  const shown = createMemo(() => {
    const needle = props.query.trim().toLowerCase()
    return (
      state.snapshot?.records.filter((row) =>
        [row.executable, row.owner, String(row.pid), ...(row.members?.map((member) => member.name ?? "") ?? [])].some(
          (value) => value.toLowerCase().includes(needle),
        ),
      ) ?? []
    )
  })
  const stateKeys = {
    alive: "orchestra.monitor.state.alive",
    gone: "orchestra.monitor.state.gone",
    unknown: "orchestra.monitor.state.unknown",
  } as const

  const stopScope = () => {
    const current = server.current
    return current?.type === "sidecar" && current.variant === "base" ? current.http.url : undefined
  }
  createEffect(() => {
    const scope = stopScope()
    if (state.freeze && state.freeze.scope !== scope) setState("freeze", undefined)
  })

  async function stop(recordID: string) {
    const scope = stopScope()
    const request = platform.stopActivityTree
    if (!scope || !request || state.stopping || state.busy) return
    const client = sdk()
    setState({ stopping: true, stopResult: undefined })
    try {
      const receipt = await request(scope, { recordID }).catch(() => undefined)
      if (receipt && !controller.signal.aborted && stopScope() === scope && sdk() === client) {
        setState("stopResult", { scope, uncertain: receipt.outcomes.some((outcome) => outcome.state === "unknown") })
        await refresh(recordID)
      }
    } finally {
      if (!controller.signal.aborted) setState("stopping", false)
    }
  }

  async function readFreeze(recordID: string) {
    const scope = stopScope()
    const read = platform.readActivityFreeze
    if (!scope || !read || state.busy || state.stopping) return
    setState("freeze", { scope })
    const value = await read(scope, { recordID }).catch(() => undefined)
    if (stopScope() === scope && !controller.signal.aborted) setState("freeze", { scope, state: value, result: state.freeze?.result })
  }

  async function freeze(recordID: string, action: ActivityFreeze.Action) {
    const scope = stopScope()
    const request = platform.freezeActivityMember
    if (!scope || !request || state.busy || state.stopping || state.freeze?.scope !== scope || state.freeze.state?.recordID !== recordID) return
    setState("stopping", true)
    try {
      const receipt = await request(scope, { recordID, action }).catch(() => undefined)
      if (!controller.signal.aborted && stopScope() === scope) {
        setState("freeze", { scope, result: receipt?.phase ?? "unknown" })
        setState("stopping", false)
        await readFreeze(recordID)
      }
    } finally {
      if (!controller.signal.aborted) setState("stopping", false)
    }
  }

  async function refresh(recordID?: string) {
    if (state.busy || controller.signal.aborted) return
    setState("busy", true)
    await sdk()
      .ready.then(() =>
        recordID
          ? sdk().orchestra.activity.inspect({ recordID }, { signal: controller.signal })
          : sdk().orchestra.activity.snapshot({ signal: controller.signal }),
      )
      .then(
        (snapshot) => {
          if (controller.signal.aborted) return
          const receivedAt = performance.now()
          setState(applySnapshot(snapshot))
          setState({ failure: undefined, receivedAt, now: receivedAt })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          console.error("[activity] process snapshot read failed", error)
          setState("failure", recordID ? "inspection" : "snapshot")
        },
      )
    if (!controller.signal.aborted) setState("busy", false)
  }

  onMount(() => {
    void refresh()
    const poll = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 2000)
    const tick = setInterval(() => setState("now", performance.now()), 1000)
    onCleanup(() => {
      clearInterval(poll)
      clearInterval(tick)
    })
  })
  onCleanup(() => controller.abort())

  return (
    <div aria-busy={state.busy}>
      <div class="activity-section-heading">
        <p class="mx-note">{language.t("orchestra.monitor.processSource")}</p>
        <button type="button" class="mx-btn" disabled={state.busy} onClick={() => void refresh()}>
          {language.t("orchestra.monitor.refresh")}
        </button>
      </div>
      <Show when={state.failure}>
        <p class="activity-error" role="alert">
          {language.t(
            state.failure === "inspection" ? "orchestra.monitor.inspectFailed" : "orchestra.monitor.processFailed",
          )}
        </p>
      </Show>
      <Show when={state.stopResult?.scope === stopScope() && state.stopResult}>
        {(result) => <p role="status">{language.t(result().uncertain ? "orchestra.monitor.stopUncertain" : "orchestra.monitor.stopConfirmed")}</p>}
      </Show>
      <div class="activity-cpu">
        <span>{language.t("orchestra.monitor.cpuLabel")}</span>
        <Show when={state.snapshot?.cpu} fallback={<strong>{language.t("orchestra.monitor.unread")}</strong>}>
          {(cpu) => (
            <>
              <strong>{language.t("orchestra.monitor.cpuPercent", { value: cpu().percent.toFixed(1) })}</strong>
              <span class="mx-note">{cpu().source}</span>
              <span class="mx-note">
                {language.t("orchestra.monitor.cpuWindow", {
                  seconds: (cpu().windowMs / 1000).toFixed(1),
                  age: age(cpu().sampledAt),
                })}
              </span>
            </>
          )}
        </Show>
      </div>
      <Show
        when={state.snapshot}
        fallback={
          <div class="mx-empty" role="status">
            <strong>{language.t("orchestra.monitor.processUnread")}</strong>
          </div>
        }
      >
        <p class="mx-note" role="status">
          {language.t("orchestra.monitor.processCount", { count: state.snapshot?.records.length ?? 0 })}
        </p>
        <Show when={(state.snapshot?.retired ?? 0) > 0}>
          <p class="mx-note">{language.t("orchestra.monitor.retired", { count: state.snapshot?.retired ?? 0 })}</p>
        </Show>
        <Show
          when={shown().length > 0}
          fallback={
            <div class="mx-empty" role="status">
              <strong>
                {language.t(props.query.trim() ? "orchestra.monitor.filterMiss" : "orchestra.monitor.noObserved")}
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
                    <tr>
                      <td>
                        <details>
                          <summary>{row.executable}</summary>
                          <button
                            type="button"
                            class="mx-btn"
                            disabled={state.busy}
                            onClick={() => void refresh(row.recordID)}
                          >
                            {language.t("orchestra.monitor.inspect")}
                          </button>
                          <Show when={platform.stopActivityTree && stopScope() && row.supervisorID && row.members?.length &&
                            row.state === "alive" && !row.inspectionFailed}>
                            <button type="button" class="mx-btn" disabled={state.busy || state.stopping} onClick={() => void stop(row.recordID)}>
                              {language.t("orchestra.monitor.stopMembers")}
                            </button>
                          </Show>
                          <Show when={platform.readActivityFreeze && platform.freezeActivityMember && stopScope() && row.supervisorID && row.members?.length && row.state === "alive" && !row.inspectionFailed}>
                            <button type="button" class="mx-btn" disabled={state.busy || state.stopping} onClick={() => void readFreeze(row.recordID)}>
                              Read member status
                            </button>
                          </Show>
                          <Show when={state.freeze?.scope === stopScope() && state.freeze?.state?.recordID === row.recordID && state.freeze.state.next !== "blocked"}>
                            {(freezeState) => (
                              <>
                                <p role="status">{freezeState().next === "resume" ? "Member suspended" : "Member not suspended"}</p>
                                <button type="button" class="mx-btn" disabled={state.busy || state.stopping} onClick={() => void freeze(row.recordID, freezeState().next)}>
                                  {freezeState().next === "resume" ? "Resume member" : "Suspend member"}
                                </button>
                              </>
                            )}
                          </Show>
                          <Show when={state.freeze?.scope === stopScope() && state.freeze?.result}>
                            <p role="status">{state.freeze?.result === "resumed" ? "Member resumed; it may remain stopped externally." : `Member action: ${state.freeze?.result}`}</p>
                          </Show>
                          <p>
                            {language.t(
                              row.footprint?.hypothesis === "compatible-with-logical-leak"
                                ? "orchestra.monitor.hypothesisCompatible"
                                : "orchestra.monitor.hypothesisInsufficient",
                            )}
                          </p>
                          <p>{language.t("orchestra.monitor.reachabilityUnread")}</p>
                          <Show when={row.source}>
                            <p class="mx-note">{row.source}</p>
                          </Show>
                          <Show when={row.inspectionFailed}>
                            <p class="activity-error" role="alert">
                              {language.t("orchestra.monitor.inspectionFailed")}
                            </p>
                          </Show>
                          <ul class="activity-members">
                            <For each={row.members}>
                              {(member) => (
                                <li>
                                  <code>{member.pid}</code> {member.name ?? language.t("orchestra.monitor.unread")}
                                </li>
                              )}
                            </For>
                          </ul>
                        </details>
                      </td>
                      <td>{row.owner}</td>
                      <td>{language.t(stateKeys[row.state])}</td>
                      <td>
                        <code>{row.pid}</code>
                      </td>
                      <td>
                        <code>{row.supervisorID ?? language.t("orchestra.monitor.unread")}</code>
                      </td>
                      <td>{row.members === undefined ? language.t("orchestra.monitor.unread") : row.members.length}</td>
                      <td>
                        <Show when={row.footprint} fallback={language.t("orchestra.monitor.unread")}>
                          {(footprint) => (
                            <>
                              <span>{bytes(footprint().bytes)}</span>{" "}
                              <span class="mx-note">{footprint().source} · {language.t("orchestra.monitor.footprintAge", { age: age(footprint().sampledAt) })}</span>
                            </>
                          )}
                        </Show>
                      </td>
                      <td>{age(row.sampledAt)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
      <p class="mx-note">{language.t("orchestra.monitor.processCoverage")}</p>
      <p class="mx-note">{language.t("orchestra.monitor.inspectionHint")}</p>
      <p class="mx-note">{language.t("orchestra.monitor.pressureUnread")}</p>
    </div>
  )
}
