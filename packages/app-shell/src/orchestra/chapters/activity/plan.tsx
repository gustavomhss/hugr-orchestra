import type { ActivityArm } from "@orchestra/schema/activity-arm"
import { createMemo, createEffect, on, onCleanup, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"

type PlanRow = {
  target: ActivityArm.Target
  state: "Ready" | "Armed" | "Refused"
  armable: boolean
}

export function ActivityPlan(props: { query: string }) {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const sdk = useServerSDK()
  const [state, setState] = createStore({
    scope: undefined as string | undefined,
    snapshot: undefined as ActivityArm.PlanSnapshot | undefined,
    verified: undefined as ActivityArm.PlanSnapshot | undefined,
    verifiedScope: undefined as string | undefined,
    inspecting: false,
    inspectFailed: false,
    busy: false,
    failed: false,
    armTarget: undefined as string | undefined,
    armFailed: false,
  })
  let requestID = 0
  let pending: AbortController | undefined
  let inspectID = 0
  let inspectController: AbortController | undefined
  const scope = () => server.current?.http.url
  const ownedScope = () => {
    const current = server.current
    return current?.type === "sidecar" && current.variant === "base" ? current.http.url : undefined
  }
  const rows = createMemo<PlanRow[]>(() => {
    const snapshot = state.verified ?? state.snapshot
    if (!snapshot) return []
    return [
      ...snapshot.ready.map((target) => ({ target, state: "Ready" as const, armable: true })),
      ...snapshot.approvals.flatMap(({ receipt, changed }) =>
        receipt.targets.map((target) => ({ target, state: changed ? "Refused" as const : "Armed" as const, armable: false })),
      ),
    ]
  })
  const shown = createMemo(() => {
    const needle = props.query.trim().toLowerCase()
    return needle
      ? rows().filter((row) => `${row.target.targetID}\n${row.target.label}\n${row.target.owner}\n${row.state}`.toLowerCase().includes(needle))
      : rows()
  })

  async function refresh() {
    const serverURL = scope()
    if (!serverURL) return
    inspectID++
    inspectController?.abort()
    inspectController = undefined
    const currentSDK = sdk()
    pending?.abort()
    const request = new AbortController()
    pending = request
    const id = ++requestID
    setState({ scope: serverURL, busy: true, failed: false, verified: undefined, verifiedScope: undefined,
      inspecting: false, inspectFailed: false })
    try {
      await currentSDK.ready
      request.signal.throwIfAborted()
      const snapshot = await currentSDK.orchestra.activity.plan({ signal: request.signal })
      if (request.signal.aborted || requestID !== id || scope() !== serverURL || sdk() !== currentSDK) return
      setState("snapshot", snapshot)
    } catch {
      if (!request.signal.aborted && requestID === id && scope() === serverURL && sdk() === currentSDK) setState("failed", true)
    } finally {
      if (pending === request) {
        pending = undefined
        if (requestID === id && scope() === serverURL && sdk() === currentSDK) setState("busy", false)
      }
    }
  }

  async function arm(target: ActivityArm.Target) {
    const current = server.current
    const serverURL = current?.http.url
    const approve = platform.armActivityQuarantine
    if (
      !serverURL || current?.type !== "sidecar" || current.variant !== "base" ||
      platform.platform !== "desktop" || platform.os !== "linux" || !approve || state.armTarget || state.busy || state.failed ||
      scope() !== serverURL || ownedScope() !== serverURL || !armAvailable(target)
    ) return
    const currentSDK = sdk()
    setState({ armTarget: target.targetID, armFailed: false })
    try {
      await approve(serverURL, {
        targets: [{ targetID: target.targetID, generation: target.generation }],
      })
      if (scope() !== serverURL || sdk() !== currentSDK) return
      await refresh()
    } catch {
      if (scope() === serverURL && sdk() === currentSDK) setState("armFailed", true)
    } finally {
      if (scope() === serverURL && sdk() === currentSDK) setState("armTarget", undefined)
    }
  }

  async function inspect() {
    const serverURL = ownedScope()
    const inspectObjects = platform.inspectActivityArm
    if (!serverURL || platform.platform !== "desktop" || platform.os !== "linux" || !inspectObjects || state.inspecting || state.armTarget) return
    const client = sdk()
    const id = ++inspectID
    inspectController?.abort()
    const request = new AbortController()
    inspectController = request
    setState({ scope: serverURL, inspecting: true, inspectFailed: false, verified: undefined })
    try {
      await client.ready
      request.signal.throwIfAborted()
      const snapshot = await inspectObjects(serverURL)
      if (request.signal.aborted || inspectID !== id || scope() !== serverURL || ownedScope() !== serverURL || server.current?.type !== "sidecar" ||
        server.current.variant !== "base" || sdk() !== client) return
      if (snapshot) setState({ verified: snapshot, verifiedScope: serverURL })
      else setState("inspectFailed", true)
    } catch {
      if (!request.signal.aborted && inspectID === id && scope() === serverURL && ownedScope() === serverURL && sdk() === client) {
        setState("inspectFailed", true)
      }
    } finally {
      if (inspectController === request) {
        inspectController = undefined
        if (inspectID === id && scope() === serverURL && sdk() === client) setState("inspecting", false)
      }
    }
  }

  createEffect(
    on(
      () => ({ serverURL: scope(), ownedURL: ownedScope(), client: sdk() }),
      ({ serverURL }) => {
        requestID++
        pending?.abort()
        pending = undefined
        inspectID++
        inspectController?.abort()
        inspectController = undefined
        setState({ scope: serverURL, snapshot: undefined, verified: undefined, verifiedScope: undefined, inspecting: false, inspectFailed: false,
          busy: Boolean(serverURL), failed: false, armTarget: undefined, armFailed: false })
        if (serverURL) void refresh()
      },
      { defer: false },
    ),
  )
  onCleanup(() => {
    requestID++
    pending?.abort()
    inspectID++
    inspectController?.abort()
  })

  const completeEmpty = () => {
    const plan = state.verified ?? state.snapshot
    return !props.query.trim() && plan && !plan.partial && plan.ready.length === 0 && plan.approvals.length === 0
  }
  const filterMiss = () => Boolean(props.query.trim()) && shown().length === 0
  const armAvailable = (target: ActivityArm.Target) => {
    const current = server.current
    return platform.platform === "desktop" && platform.os === "linux" && current?.type === "sidecar" && current.variant === "base" &&
      state.verifiedScope === current.http.url && Boolean(platform.armActivityQuarantine) &&
      !state.busy && !state.failed && !state.armTarget &&
      state.verified?.ready.some((ready) => ready.targetID === target.targetID && ready.generation === target.generation)
  }

  return (
    <section aria-busy={state.busy}>
      <div class="activity-section-heading">
        <p class="mx-note">{language.t(state.verified ? "orchestra.monitor.planVerifiedSource" : "orchestra.monitor.planSource")}</p>
        <button type="button" class="mx-btn" disabled={state.busy} onClick={() => void refresh()}>
          {language.t("orchestra.monitor.refresh")}
        </button>
        <Show when={platform.platform === "desktop" && platform.os === "linux" && Boolean(ownedScope() && platform.inspectActivityArm)}>
          <button type="button" class="mx-btn" disabled={state.inspecting || state.busy || Boolean(state.armTarget)} onClick={() => void inspect()}>
            {language.t(state.inspecting ? "orchestra.monitor.planVerifying" : "orchestra.monitor.planVerify")}
          </button>
        </Show>
      </div>
      <Show when={(state.verified ?? state.snapshot)?.partial}>
        <p class="mx-note" role="status">{language.t("orchestra.monitor.planPartial")}</p>
      </Show>
      <Show when={state.failed}>
        <p class="activity-error" role="alert">{language.t("orchestra.monitor.planFailed")}</p>
      </Show>
      <Show when={state.armFailed}>
        <p class="activity-error" role="alert">{language.t("orchestra.monitor.planArmFailed")}</p>
      </Show>
      <Show when={state.inspectFailed}>
        <p class="activity-error" role="alert">{language.t("orchestra.monitor.planVerifyFailed")}</p>
      </Show>
      <Show when={state.verified ?? state.snapshot} fallback={
        <div class="mx-empty" role={state.failed ? "alert" : "status"}>
          <strong>{language.t(state.busy ? "orchestra.monitor.planLoading" : "orchestra.monitor.planUnread")}</strong>
        </div>
      }>
        {(snapshot) => (
          <>
            <Show when={!snapshot().partial}>
              <p class="mx-note" role="status">
                {language.t("orchestra.monitor.planCounts", {
                  ready: snapshot().ready.length,
                  armed: snapshot().approvals.reduce((count, item) => count + (item.changed ? 0 : item.receipt.targets.length), 0),
                  refused: snapshot().approvals.reduce((count, item) => count + (item.changed ? item.receipt.targets.length : 0), 0),
                })}
              </p>
            </Show>
            <Show when={completeEmpty()}>
              <div class="mx-empty" role="status"><strong>{language.t("orchestra.monitor.planEmpty")}</strong></div>
            </Show>
            <Show when={!completeEmpty()}>
                <Show when={shown().length > 0} fallback={
                <Show when={filterMiss()} fallback={<div class="mx-empty" role="status"><strong>{language.t(snapshot().partial ? "orchestra.monitor.planPartialNoRows" : "orchestra.monitor.planNoRows")}</strong></div>}>
                  <div class="mx-empty" role="status"><strong>{language.t("orchestra.monitor.filterMiss")}</strong></div>
                </Show>
              }>
                <div class="activity-table-scroll">
                  <table class="activity-table">
                    <thead><tr>
                      <th scope="col">{language.t("orchestra.monitor.id")}</th>
                      <th scope="col">{language.t("orchestra.monitor.path")}</th>
                      <th scope="col">{language.t("orchestra.monitor.owner")}</th>
                      <th scope="col">{language.t("orchestra.monitor.state")}</th>
                      <th scope="col">{language.t("orchestra.monitor.planAction")}</th>
                    </tr></thead>
                    <tbody>
                      <For each={shown()}>{(row) => (
                        <tr>
                          <td><code>{row.target.targetID}</code></td>
                          <td class="activity-path" title={row.target.label}><code>{row.target.label}</code></td>
                          <td>{row.target.owner}</td>
                          <td>{language.t(`orchestra.monitor.planState.${row.state}`)}</td>
                          <td>
                            <Show when={row.armable && armAvailable(row.target)}>
                              <button type="button" class="mx-btn" disabled={Boolean(state.armTarget)} onClick={() => void arm(row.target)}>
                                {language.t(state.armTarget === row.target.targetID ? "orchestra.monitor.planArming" : "orchestra.monitor.planArm")}
                              </button>
                            </Show>
                          </td>
                        </tr>
                      )}</For></tbody>
                  </table>
                </div>
              </Show>
            </Show>
          </>
        )}
      </Show>
    </section>
  )
}
