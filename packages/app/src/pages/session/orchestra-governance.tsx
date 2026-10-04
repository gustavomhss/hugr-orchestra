import { Icon } from "@opencode-ai/ui/icon"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/v2/dialog-v2"
import { createEffect, createMemo, createUniqueId, For, Match, onCleanup, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerProtocol } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import {
  maestroCapability,
  ownSource,
  readGovernance,
  type ApprovalState,
  type GovernanceKind,
  type GovernanceRecord,
} from "./orchestra-governance-data"
import "./orchestra-governance.css"

const kinds = {
  admission: "orchestra.governance.kind.admission",
  catalog: "orchestra.governance.kind.catalog",
  plan: "orchestra.governance.kind.plan",
  context: "orchestra.governance.kind.context",
  validation: "orchestra.governance.kind.validation",
  review: "orchestra.governance.kind.review",
  lucy: "orchestra.governance.kind.lucy",
  presentation: "orchestra.governance.kind.presentation",
  decision: "orchestra.governance.kind.decision",
  authorization: "orchestra.governance.kind.authorization",
} as const satisfies Record<GovernanceKind, string>

const states = {
  recorded: "orchestra.governance.state.recorded",
  hold: "orchestra.governance.state.hold",
  running: "orchestra.governance.state.running",
} as const

const reasons = {
  unreadable: "orchestra.governance.reason.unreadable",
  foreign: "orchestra.governance.reason.foreign",
  synthetic: "orchestra.governance.reason.synthetic",
  superseded: "orchestra.governance.reason.superseded",
  interrupted: "orchestra.governance.reason.interrupted",
} as const

const approvals = {
  none: "orchestra.governance.approval.none",
  running: "orchestra.governance.approval.running",
  awaiting: "orchestra.governance.approval.awaiting",
  approved: "orchestra.governance.approval.approved",
  declined: "orchestra.governance.approval.declined",
  pending: "orchestra.governance.approval.pending",
  hold: "orchestra.governance.hold.title",
} as const satisfies Record<ApprovalState, string>

// Read-only by contract: Maestro records approval only from the user's own reply in Chat, so this
// surface offers navigation and existing reads, never a decision control.
export function DialogOrchestraGovernance(props: {
  sessionID: string
  current: () => boolean
  dispose: () => void
  onShowMessage: (turnID: string) => void
}) {
  const sync = useSync()()
  const language = useLanguage()
  const protocol = useServerProtocol()
  const id = createUniqueId()
  createEffect(() => {
    if (!props.current()) props.dispose()
  })
  // The shared dialog stack has no trigger for Kobalte to refocus, so return focus to the opener (W09)
  // once the dialog DOM is gone, unless something else has taken focus meanwhile.
  const origin = document.activeElement
  onCleanup(() =>
    requestAnimationFrame(() => {
      if (!props.current()) return
      if (!(origin instanceof HTMLElement) || !origin.isConnected) return
      if (document.activeElement && document.activeElement !== document.body) return
      origin.focus({ preventScroll: true })
    }),
  )
  // Unrelated part updates (streaming text, other tools) re-run the read; only changed records re-render.
  const governance = createMemo(
    () =>
      readGovernance({
        sessionID: props.sessionID,
        working: sync.data.session_working(props.sessionID),
        messages: sync.data.message[props.sessionID] ?? [],
        source: protocol() === "v2" ? sync.data.session_message[props.sessionID] : undefined,
        parts: (messageID) => sync.data.part[messageID],
      }),
    undefined,
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  )
  const session = () => sync.session.get(props.sessionID)
  const capability = createMemo(() => maestroCapability(sync.data.agent, sync.data.load.agent))
  const own = createMemo(() => ownSource(sync.data.config, protocol(), sync.data.load.config))
  const configured = () => {
    const source = own()
    if (source.state === "configured") return source
  }
  const waiting = () =>
    (sync.data.permission[props.sessionID]?.length ?? 0) + (sync.data.question[props.sessionID]?.length ?? 0) > 0
  const loaded = () => sync.data.message[props.sessionID] !== undefined
  const partial = () => sync.session.history.more(props.sessionID)
  const loadingEarlier = () => sync.session.history.loading(props.sessionID)
  const empty = () => language.t(partial() ? "orchestra.governance.emptyLoaded" : "orchestra.governance.empty")
  const unknown = () => language.t("orchestra.governance.unknown")
  const grounding = () => [governance().catalog, governance().context].filter((record) => record !== undefined)
  const plan = () => [governance().admission, governance().plan].filter((record) => record !== undefined)
  const approval = () => governance().approval

  return (
    <Dialog fit containerClass="orchestra-governance-dialog">
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("orchestra.governance.title")}
          description={language.t("orchestra.governance.description")}
        />
      </DialogHeader>
      <DialogBody class="orchestra-governance-body">
        <dl class="orchestra-governance-facts">
          <div>
            <dt>{language.t("orchestra.governance.session")}</dt>
            <dd>
              <Show when={session()?.title}>{(title) => <bdi>{title()}</bdi>}</Show>
              <code dir="ltr" title={props.sessionID}>
                {props.sessionID}
              </code>
            </dd>
          </div>
          <div>
            <dt>{language.t("orchestra.governance.project")}</dt>
            <dd>
              <code dir="ltr" title={session()?.projectID}>
                {session()?.projectID ?? unknown()}
              </code>
            </dd>
          </div>
          <div>
            <dt>{language.t("orchestra.governance.directory")}</dt>
            <dd>
              <code dir="ltr" title={session()?.directory}>
                {session()?.directory ?? unknown()}
              </code>
            </dd>
          </div>
          <Show when={capability() === "available"}>
            <div>
              <dt>{language.t("orchestra.governance.agent")}</dt>
              <dd>{language.t("orchestra.governance.agent.available")}</dd>
            </div>
          </Show>
        </dl>

        <Show when={waiting()}>
          <div class="orchestra-governance-notice" data-tone="warning" role="status">
            <Icon name="warning" size="small" />
            <div>
              <strong>{language.t("orchestra.governance.waiting.title")}</strong>
              <p>{language.t("orchestra.governance.waiting.body")}</p>
            </div>
            <ButtonV2 size="small" variant="neutral" onClick={props.dispose}>
              {language.t("orchestra.governance.waiting.action")}
            </ButtonV2>
          </div>
        </Show>

        <Switch>
          <Match when={capability() === "checking"}>
            <p class="orchestra-governance-empty" role="status">
              {language.t("orchestra.governance.checking")}
            </p>
          </Match>
          <Match when={capability() === "unknown"}>
            <p class="orchestra-governance-empty" role="status">
              {language.t("orchestra.governance.capabilityUnknown")}
            </p>
          </Match>
          <Match when={capability() === "unavailable"}>
            <div class="orchestra-governance-notice" data-tone="unavailable" data-slot="maestro-unavailable">
              <Icon name="circle-ban-sign" size="small" />
              <div>
                <strong>{language.t("orchestra.governance.unavailable.title")}</strong>
                <p>{language.t("orchestra.governance.unavailable.body")}</p>
              </div>
            </div>
          </Match>
        </Switch>

        <div class="orchestra-governance-notice" data-tone="unavailable" data-slot="reader-unavailable">
          <Icon name="circle-ban-sign" size="small" />
          <div>
            <strong>{language.t("orchestra.governance.reader.title")}</strong>
            <p>{language.t("orchestra.governance.reader.body")}</p>
          </div>
        </div>

        <Show
          when={loaded()}
          fallback={
            <p class="orchestra-governance-empty" role="status" aria-busy="true">
              {language.t("orchestra.governance.loading")}
            </p>
          }
        >
          <Show when={partial()}>
            <div class="orchestra-governance-notice" data-tone="partial">
              <Icon name="warning" size="small" />
              <p>{language.t("orchestra.governance.partial")}</p>
              <ButtonV2
                size="small"
                variant="neutral"
                disabled={loadingEarlier()}
                onClick={() => void sync.session.history.loadMore(props.sessionID)}
              >
                {language.t(
                  loadingEarlier() ? "orchestra.governance.loadingEarlier" : "orchestra.governance.loadEarlier",
                )}
              </ButtonV2>
            </div>
          </Show>

          <section class="orchestra-governance-section" aria-labelledby={`${id}-approval`}>
            <h3 id={`${id}-approval`}>{language.t("orchestra.governance.section.approval")}</h3>
            <div class="orchestra-governance-summary" data-state={approval().state}>
              <strong>
                {language.t(
                  approval().state === "none" && partial()
                    ? "orchestra.governance.approval.noneLoaded"
                    : approvals[approval().state],
                )}
              </strong>
              <Show when={approval().record?.state === "hold" ? approval().record : undefined}>
                {(record) => <p>{reasonText(language, record())}</p>}
              </Show>
              <Show when={approval().record?.state === "recorded"}>
                <p>{language.t("orchestra.governance.currentness")}</p>
              </Show>
            </div>
            <p class="orchestra-governance-note">{language.t("orchestra.governance.approval.note")}</p>
            <Show when={governance().trail.length > 0}>
              <Records records={governance().trail} empty={empty()} onShow={props.onShowMessage} />
            </Show>
          </section>

          <section class="orchestra-governance-section" aria-labelledby={`${id}-grounding`}>
            <h3 id={`${id}-grounding`}>{language.t("orchestra.governance.section.grounding")}</h3>
            <dl class="orchestra-governance-facts">
              <div>
                <dt>{language.t("orchestra.governance.own")}</dt>
                <dd>
                  <Switch fallback={language.t("orchestra.governance.own.unknown")}>
                    <Match when={configured()}>
                      {(source) => (
                        <span title={source().directory}>
                          {language.t("orchestra.governance.own.configured", { project: source().projectID })}
                        </span>
                      )}
                    </Match>
                    <Match when={own().state === "missing"}>{language.t("orchestra.governance.own.missing")}</Match>
                    <Match when={own().state === "checking"}>{language.t("orchestra.governance.own.checking")}</Match>
                    <Match when={own().state === "failed"}>{language.t("orchestra.governance.own.failed")}</Match>
                  </Switch>
                </dd>
              </div>
            </dl>
            <Records records={grounding()} empty={empty()} onShow={props.onShowMessage} />
            <Show when={governance().context?.state === "recorded"}>
              <p class="orchestra-governance-note">{language.t("orchestra.governance.currentness")}</p>
            </Show>
          </section>

          <section class="orchestra-governance-section" aria-labelledby={`${id}-plan`}>
            <h3 id={`${id}-plan`}>{language.t("orchestra.governance.section.plan")}</h3>
            <Records records={plan()} empty={empty()} onShow={props.onShowMessage} />
            <p class="orchestra-governance-note">{language.t("orchestra.governance.workCard.unavailable")}</p>
          </section>

          <section class="orchestra-governance-section" aria-labelledby={`${id}-evidence`}>
            <h3 id={`${id}-evidence`}>{language.t("orchestra.governance.section.evidence")}</h3>
            <Records records={governance().evidence} empty={empty()} onShow={props.onShowMessage} />
            <p class="orchestra-governance-note">{language.t("orchestra.governance.evidence.unavailable")}</p>
          </section>
        </Show>
      </DialogBody>
    </Dialog>
  )
}

function Records(props: { records: GovernanceRecord[]; empty: string; onShow: (turnID: string) => void }) {
  return (
    <Show when={props.records.length > 0} fallback={<p class="orchestra-governance-empty">{props.empty}</p>}>
      <ul class="orchestra-governance-records">
        <For each={props.records}>{(record) => <Row record={record} onShow={props.onShow} />}</For>
      </ul>
    </Show>
  )
}

function Row(props: { record: GovernanceRecord; onShow: (turnID: string) => void }) {
  const language = useLanguage()
  const time = createMemo(() =>
    props.record.time === undefined
      ? undefined
      : {
          label: new Intl.DateTimeFormat(language.intl(), { dateStyle: "medium", timeStyle: "short" }).format(
            props.record.time,
          ),
          iso: new Date(props.record.time).toISOString(),
        },
  )
  const kind = () => language.t(kinds[props.record.kind])
  return (
    <li class="orchestra-governance-record" data-kind={props.record.kind} data-state={props.record.state}>
      <Icon
        name={
          props.record.state === "recorded"
            ? "circle-check"
            : props.record.state === "hold"
              ? "warning"
              : "status-active"
        }
        size="small"
      />
      <div class="orchestra-governance-record-main">
        <div class="orchestra-governance-record-head">
          <span class="orchestra-governance-kind">{kind()}</span>
          <span class="orchestra-governance-state">{language.t(states[props.record.state])}</span>
          <Show when={props.record.outcome}>{(outcome) => <code dir="ltr">{outcome()}</code>}</Show>
        </div>
        <For each={[props.record.id, props.record.extra].filter((value) => value !== undefined)}>
          {(value) => (
            <code class="orchestra-governance-id" dir="ltr" title={value}>
              {value}
            </code>
          )}
        </For>
        <Show when={reasonText(language, props.record)}>
          {(text) => (
            <p class="orchestra-governance-reason" dir="auto">
              {text()}
            </p>
          )}
        </Show>
        <Show when={props.record.output}>
          {(output) => (
            <details class="orchestra-governance-output">
              <summary>{language.t("orchestra.governance.output")}</summary>
              <Show when={props.record.partial}>
                <p>{language.t("orchestra.governance.output.partial")}</p>
              </Show>
              <pre dir="auto">{output()}</pre>
            </details>
          )}
        </Show>
        <span class="orchestra-governance-note">{language.t("orchestra.governance.source")}</span>
        <code class="orchestra-governance-id" dir="ltr" title={props.record.messageID}>
          {props.record.messageID}
        </code>
        <Show when={!props.record.turnID}>
          <p class="orchestra-governance-note">{language.t("orchestra.governance.sourceUnavailable")}</p>
        </Show>
      </div>
      <div class="orchestra-governance-side">
        <Show
          when={time()}
          fallback={<span class="orchestra-governance-time">{language.t("orchestra.governance.time.unknown")}</span>}
        >
          {(time) => (
            <time class="orchestra-governance-time" dateTime={time().iso}>
              {time().label}
            </time>
          )}
        </Show>
        <Show when={props.record.turnID}>
          {(turn) => (
            <ButtonV2
              size="small"
              variant="ghost"
              aria-label={language.t("orchestra.governance.showRecord", { record: kind() })}
              onClick={() => props.onShow(turn())}
            >
              {language.t(
                props.record.state === "hold" ? "orchestra.governance.inspect" : "orchestra.governance.showInChat",
              )}
            </ButtonV2>
          )}
        </Show>
      </div>
    </li>
  )
}

function reasonText(language: ReturnType<typeof useLanguage>, record: GovernanceRecord) {
  if (record.reason) return language.t(reasons[record.reason])
  if (record.detail) return record.detail
  if (record.state === "hold") return language.t("orchestra.governance.reason.unknown")
}
