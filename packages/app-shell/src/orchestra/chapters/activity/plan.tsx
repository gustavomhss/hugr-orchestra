import type { ActivityArm } from "@orchestra/schema/activity-arm"
import type { ActivityApply } from "@orchestra/schema/activity-apply"
import { createMemo, createEffect, on, onCleanup, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"

type PlanRow = {
  target: ActivityArm.Target
  state: "Ready" | "Armed" | ActivityApply.Result["outcome"]
  approvalID?: string
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
    applyState: undefined as ActivityApply.State | undefined,
    applyScope: undefined as string | undefined,
    applyingTarget: undefined as string | undefined,
    applyFailed: false,
  })
  let requestID = 0
  let pending: AbortController | undefined
  let inspectID = 0
  let inspectController: AbortController | undefined
  let armID = 0
  let applyID = 0
  const scope = () => server.current?.http.url
  const ownedScope = () => {
    const current = server.current
    return current?.type === "sidecar" && current.variant === "base" ? current.http.url : undefined
  }
  const rows = createMemo<PlanRow[]>(() => {
    const snapshot = state.verified ?? state.snapshot
    if (!snapshot) return []
    const applied = state.applyScope === scope() ? state.applyState?.results : undefined
    return [
      ...snapshot.ready.map((target) => ({ target, state: "Ready" as const })),
      ...snapshot.approvals.flatMap(({ receipt, changed }) =>
        receipt.targets.map((target) => {
          const outcome = applied?.find((item) => item.approvalID === receipt.approvalID &&
            item.targetID === target.targetID && item.generation === target.generation)?.outcome
          return { target, approvalID: receipt.approvalID, state: outcome ?? (changed ? "Refused" as const : "Armed" as const) }
        }),
      ),
    ]
  })
  const counts = createMemo(() => {
    const result = { Ready: 0, Armed: 0, Refused: 0, Out: 0, Unknown: 0 }
    for (const row of rows()) result[row.state]++
    return result
  })
  const shown = createMemo(() => {
    const needle = props.query.trim().toLowerCase()
    return needle
      ? rows().filter((row) => `${row.target.targetID}\n${row.target.label}\n${row.target.owner}\n${row.state}`.toLowerCase().includes(needle))
      : rows()
  })

  async function refresh() {
    const serverURL = scope()
    if (!serverURL || state.applyingTarget) return
    inspectID++
    inspectController?.abort()
    inspectController = undefined
    const currentSDK = sdk()
    pending?.abort()
    applyID++
    const request = new AbortController()
    pending = request
    const id = ++requestID
    const applyRead = platform.readActivityApply
    const ownedURL = ownedScope()
    setState("applyFailed", false)
    if (applyRead && ownedURL === serverURL) {
      void applyRead(serverURL).then((applyState) => {
        if (applyState && requestID === id && scope() === serverURL && ownedScope() === serverURL && sdk() === currentSDK) {
          setState({ applyState, applyScope: serverURL })
        }
      }).catch(() => {})
    }
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
    const id = ++armID
    const armIsCurrent = () => armID === id && ownedScope() === serverURL && sdk() === currentSDK
    setState({ armTarget: target.targetID, armFailed: false })
    try {
      await approve(serverURL, {
        targets: [{ targetID: target.targetID, generation: target.generation }],
      })
      if (!armIsCurrent()) return
      await refresh()
    } catch {
      if (armIsCurrent()) setState("armFailed", true)
    } finally {
      if (armIsCurrent()) setState("armTarget", undefined)
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

  async function apply(row: PlanRow) {
    const serverURL = ownedScope()
    const applyObjects = platform.applyActivityQuarantine
    const binding = applyBinding(row)
    if (!serverURL || !applyObjects || !binding || state.applyingTarget) return
    const currentSDK = sdk()
    const id = ++applyID
    const isCurrent = () => applyID === id && scope() === serverURL && ownedScope() === serverURL && sdk() === currentSDK
    setState({ applyingTarget: binding.targetID, applyFailed: false })
    try {
      const receipt = await applyObjects(serverURL, {
        approvalID: binding.approvalID, targetID: binding.targetID, generation: binding.generation,
      })
      if (!isCurrent()) return
      if (receipt && (receipt.targetID !== binding.targetID || receipt.generation !== binding.generation || receipt.approvalID !== binding.approvalID)) {
        setState("applyFailed", true)
        return
      }
      const persisted = await platform.readActivityApply?.(serverURL)
      if (!isCurrent()) return
      if (persisted) setState({ applyState: persisted, applyScope: serverURL })
      else setState("applyFailed", true)
    } catch {
      if (isCurrent()) setState("applyFailed", true)
    } finally {
      if (isCurrent()) setState("applyingTarget", undefined)
    }
  }

  createEffect(
    on(
      () => ({ serverURL: scope(), ownedURL: ownedScope(), client: sdk() }),
      ({ serverURL }) => {
        armID++
        applyID++
        requestID++
        pending?.abort()
        pending = undefined
        inspectID++
        inspectController?.abort()
        inspectController = undefined
        setState({ scope: serverURL, snapshot: undefined, verified: undefined, verifiedScope: undefined, inspecting: false, inspectFailed: false,
          busy: Boolean(serverURL), failed: false, armTarget: undefined, armFailed: false })
        setState({ applyState: undefined, applyScope: undefined, applyingTarget: undefined, applyFailed: false })
        if (serverURL) void refresh()
      },
      { defer: false },
    ),
  )
  onCleanup(() => {
    armID++
    applyID++
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
      !state.busy && !state.failed && !state.armTarget && !state.applyingTarget &&
      state.verified?.ready.some((ready) => ready.targetID === target.targetID && ready.generation === target.generation)
  }
  function applyBinding(row: PlanRow) {
    if (row.state !== "Armed" || state.busy || state.failed || state.inspecting || state.armTarget ||
      !ownedScope() || state.applyScope !== ownedScope() || !state.applyState?.available || !platform.applyActivityQuarantine) return undefined
    return state.applyState.eligible.find((item) => item.approvalID === row.approvalID &&
      item.targetID === row.target.targetID && item.generation === row.target.generation)
  }

  return (
    <section aria-busy={state.busy}>
      <div class="activity-section-heading">
        <p class="mx-note">{language.t(state.verified ? "orchestra.monitor.planVerifiedSource" : "orchestra.monitor.planSource")}</p>
        <button type="button" class="mx-btn" disabled={state.busy || Boolean(state.applyingTarget)} onClick={() => void refresh()}>
          {language.t("orchestra.monitor.refresh")}
        </button>
        <Show when={platform.platform === "desktop" && platform.os === "linux" && Boolean(ownedScope() && platform.inspectActivityArm)}>
          <button type="button" class="mx-btn" disabled={state.inspecting || state.busy || Boolean(state.armTarget || state.applyingTarget)} onClick={() => void inspect()}>
            {language.t(state.inspecting ? "orchestra.monitor.planVerifying" : "orchestra.monitor.planVerify")}
          </button>
        </Show>
      </div>
      <Show when={(state.verified ?? state.snapshot)?.partial || state.applyState?.partial}>
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
      <Show when={state.applyFailed}>
        <p class="activity-error" role="alert">{language.t("orchestra.monitor.applyFailed")}</p>
      </Show>
      <Show when={state.verified ?? state.snapshot} fallback={
        <div class="mx-empty" role={state.failed ? "alert" : "status"}>
          <strong>{language.t(state.busy ? "orchestra.monitor.planLoading" : "orchestra.monitor.planUnread")}</strong>
        </div>
      }>
        {(snapshot) => (
          <>
            <Show when={!snapshot().partial && !state.applyState?.partial}>
              <p class="mx-note" role="status">
                {language.t("orchestra.monitor.planCounts", {
                  ready: counts().Ready,
                  armed: counts().Armed,
                  refused: counts().Refused,
                  out: counts().Out,
                  unknown: counts().Unknown,
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
                            <Show when={row.state === "Ready" && armAvailable(row.target)}>
                              <button type="button" class="mx-btn" disabled={Boolean(state.armTarget)} onClick={() => void arm(row.target)}>
                                {language.t(state.armTarget === row.target.targetID ? "orchestra.monitor.planArming" : "orchestra.monitor.planArm")}
                              </button>
                            </Show>
                            <Show when={applyBinding(row)}>
                              <button type="button" class="mx-btn" disabled={Boolean(state.applyingTarget)} onClick={() => void apply(row)}>
                                {language.t(state.applyingTarget === row.target.targetID ? "orchestra.monitor.applying" : "orchestra.monitor.apply")}
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
