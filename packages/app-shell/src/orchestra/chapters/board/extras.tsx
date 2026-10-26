import { createComputed, Match, on, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import type { useLanguage } from "@/context/language"
import type { useServerSDK } from "@/context/server-sdk"
import { DecisionsPanel, MoneyPanel, ProofPanel, SettingsPanel, SpendChip } from "./money"
import { refusal, type Decision, type Issue, type Proof, type Snapshot, type SpendReport } from "./model"

type Api = ReturnType<ReturnType<typeof useServerSDK>>["orchestra"]["server.board"]
type Translate = ReturnType<typeof useLanguage>["t"]
type Extras = ReturnType<typeof createBoardExtras>

// Spend, decisions, proof and the money/decisions/settings sheets of the Projects board (slice F). Spend,
// decisions and proof are extra reads: a failure leaves the board as it was and never replaces it.
export function createBoardExtras(deps: {
  api: () => Api
  t: Translate
  key: () => string | undefined
  issue: (ref: string) => Issue | undefined
  refresh: (key: string) => void
  enter: () => void
}) {
  const [state, setState] = createStore({
    spend: undefined as SpendReport | undefined,
    spendFailed: false,
    decisions: undefined as readonly Decision[] | undefined,
    decisionsFailed: false,
    proof: undefined as Proof | undefined,
    panel: undefined as "money" | "decisions" | "settings" | undefined,
    decisionFocus: undefined as string | undefined,
  })
  const channels: Partial<Record<"spend" | "decisions" | "proof", AbortController>> = {}
  const begin = (name: keyof typeof channels) => {
    channels[name]?.abort()
    const controller = new AbortController()
    channels[name] = controller
    return controller
  }
  onCleanup(() => Object.values(channels).forEach((controller) => controller?.abort()))
  // Another project (or none) starts from nothing: a late answer for the old one must not land.
  createComputed(
    on(
      deps.key,
      () => {
        Object.values(channels).forEach((controller) => controller?.abort())
        setState({ spend: undefined, decisions: undefined, proof: undefined, panel: undefined })
      },
      { defer: true },
    ),
  )
  const loadSpend = (key: string) => {
    const controller = begin("spend")
    return deps
      .api()
      .spend({ key }, { signal: controller.signal })
      .then(
        (result) => !controller.signal.aborted && setState({ spend: result, spendFailed: false }),
        () => !controller.signal.aborted && setState({ spendFailed: true }),
      )
  }
  const loadDecisions = (key: string) => {
    const controller = begin("decisions")
    return deps
      .api()
      .decisions({ key }, { signal: controller.signal })
      .then(
        (result) => !controller.signal.aborted && setState({ decisions: result, decisionsFailed: false }),
        () => !controller.signal.aborted && setState({ decisionsFailed: true }),
      )
  }
  const loadProof = (ref: string) => {
    const issue = deps.issue(ref)
    const key = deps.key()
    if (!issue || !key) return
    const controller = begin("proof")
    return deps
      .api()
      .proof({ key, number: String(issue.number) }, { signal: controller.signal })
      .then(
        (result) => !controller.signal.aborted && setState({ proof: result }),
        () => undefined,
      )
  }
  const openPanel = (panel: "money" | "decisions" | "settings", focus?: string) => {
    deps.enter()
    setState({ panel, decisionFocus: focus })
    const key = deps.key()
    if (panel === "decisions" && key) void loadDecisions(key)
  }
  const closePanel = () => setState({ panel: undefined, decisionFocus: undefined })
  // Settings and overturns answer with the server's own words when it refuses; undefined means it went through.
  const settle = (run: (key: string) => Promise<unknown>, failed: string) => {
    const key = deps.key()
    if (!key) return Promise.resolve(failed)
    return run(key).then(
      () => {
        deps.refresh(key)
        return undefined
      },
      (error: unknown) => refusal(error) ?? failed,
    )
  }
  return {
    state,
    loadSpend,
    loadDecisions,
    loadProof,
    openPanel,
    closePanel,
    // A refreshed board re-reads the spend, and the decisions while their sheet is open.
    sync: (key: string) => {
      void loadSpend(key)
      if (state.panel === "decisions") void loadDecisions(key)
    },
    saveSettings: (input: { target_date?: number | null; budget_usd?: number | null; reason?: string }) =>
      settle((key) => deps.api().settings({ key, ...input }), deps.t("orchestra.settings.failed")),
    overturn: (id: string, option: string, text: string) =>
      settle(
        (key) => deps.api().decisionChange({ key, id, option, text: text.trim() || undefined }),
        deps.t("orchestra.decisions.failed"),
      ),
  }
}

export function ExtrasHeader(props: { extras: Extras; t: Translate }) {
  return (
    <>
      <SpendChip
        spend={props.extras.state.spend}
        paused={props.extras.state.spend?.budget.state === "paused"}
        onOpen={() => props.extras.openPanel("money")}
      />
      <button type="button" class="mx-btn" onClick={() => props.extras.openPanel("decisions")}>
        {props.t("orchestra.decisions.open")}
      </button>
      <button type="button" class="mx-btn" onClick={() => props.extras.openPanel("settings")}>
        {props.t("orchestra.settings.open")}
      </button>
    </>
  )
}

export function ExtrasProof(props: { extras: Extras; cardRef: string }) {
  return (
    <Show when={props.extras.state.proof && props.extras.state.proof.ref === props.cardRef && props.extras.state.proof}>
      {(proof) => <ProofPanel proof={proof()} onDecision={(id) => props.extras.openPanel("decisions", id)} />}
    </Show>
  )
}

export function ExtrasPanels(props: {
  extras: Extras
  snapshot: Snapshot
  epicTitle: (number: number) => string | undefined
  onCard: (ref: string) => void
}) {
  const state = props.extras.state
  return (
    <Switch>
      <Match when={state.panel === "money" && state.spend}>
        {(spend) => (
          <MoneyPanel
            spend={spend()}
            failed={state.spendFailed}
            epicTitle={props.epicTitle}
            cardTitle={(number) => props.snapshot.issues.find((item) => item.number === number)?.title}
            onSettings={() => props.extras.openPanel("settings")}
            onCard={(ref) => (props.extras.closePanel(), props.onCard(ref))}
            onClose={props.extras.closePanel}
          />
        )}
      </Match>
      <Match when={state.panel === "decisions"}>
        <DecisionsPanel
          decisions={state.decisions}
          failed={state.decisionsFailed}
          focus={state.decisionFocus}
          cardRef={(number) => props.snapshot.issues.find((item) => item.number === number)?.ref}
          onOverturn={props.extras.overturn}
          onClose={props.extras.closePanel}
        />
      </Match>
      <Match when={state.panel === "settings"}>
        <SettingsPanel
          targetDate={props.snapshot.project.targetDate}
          budgetUsd={props.snapshot.project.budgetUsd}
          onSave={props.extras.saveSettings}
          onClose={props.extras.closePanel}
        />
      </Match>
    </Switch>
  )
}
