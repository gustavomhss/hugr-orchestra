import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogBody, DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { createEffect, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import type { EvidenceComposerActions, EvidenceOwner, ReplayResult } from "./composer/session-evidence-actions"
import type { ExecutionEvidence } from "./orchestra-evidence-data"

type ActionProps = { evidence: ExecutionEvidence; result: string; actions: EvidenceComposerActions }

// Actions act on the run this card belongs to, captured when clicked; a session switch
// while a confirmation is open cancels it instead of acting on the newly selected session.
export function EvidenceActions(props: ActionProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const restore = (trigger: HTMLElement) => () =>
    requestAnimationFrame(() => {
      if (trigger.isConnected) trigger.focus()
    })

  const replay = (event: MouseEvent) => {
    const owner = props.actions.capture()
    const evidence = props.evidence
    const result = props.result
    dialog.show(
      () => <ReplayDialog evidence={evidence} result={result} actions={props.actions} owner={owner} />,
      restore(event.currentTarget as HTMLElement),
    )
  }

  const prepare = (event: MouseEvent) => {
    const owner = props.actions.capture()
    const context = { source: props.evidence.source, result: props.result }
    const state = props.actions.pullRequestState()
    if (state === "shell") return showToast({ title: language.t("orchestra.pr.shell") })
    if (state === "ready") {
      if (!props.actions.preparePullRequest(context, owner))
        showToast({ title: language.t("orchestra.evidence.sessionChanged") })
      return
    }
    dialog.show(
      () => (
        <AppendDialog
          owner={owner}
          onConfirm={() => {
            dialog.close()
            if (!props.actions.preparePullRequest(context, owner))
              showToast({ title: language.t("orchestra.evidence.sessionChanged") })
          }}
        />
      ),
      restore(event.currentTarget as HTMLElement),
    )
  }

  return (
    <div data-slot="evidence-actions">
      <button type="button" onClick={replay}>
        <Icon name="reset" size="small" aria-hidden="true" />
        <bdi>{language.t("orchestra.output.rerun")}</bdi>
      </button>
      <button type="button" title={language.t("orchestra.pr.explanation")} onClick={prepare}>
        <Icon name="branch" size="small" aria-hidden="true" />
        <bdi>{language.t("orchestra.pr.prepare")}</bdi>
      </button>
    </div>
  )
}

function useSessionGuard(owner: EvidenceOwner, notify: boolean) {
  const dialog = useDialog()
  const language = useLanguage()
  createEffect(() => {
    if (owner.current()) return
    dialog.close()
    if (notify) showToast({ title: language.t("orchestra.evidence.sessionChanged") })
  })
}

function ReplayDialog(props: ActionProps & { owner: EvidenceOwner }) {
  const dialog = useDialog()
  const language = useLanguage()
  const [state, setState] = createStore<{
    request: "idle" | "sending" | Extract<ReplayResult, { status: "unknown" }>
    copied: boolean
    copyFailed: boolean
    disposed: boolean
  }>({ request: "idle", copied: false, copyFailed: false, disposed: false })
  onCleanup(() => setState("disposed", true))
  const source = props.evidence.source
  const blocked = () => props.actions.replayBlocked(source)
  const failure = () => {
    const value = state.request
    return typeof value === "object" ? value : undefined
  }
  useSessionGuard(props.owner, false)

  const run = async () => {
    // Locked until the request settles: a double click never sends twice.
    if (state.request !== "idle" || blocked()) return
    setState("request", "sending")
    const result = await props.actions.replay(source, props.owner)
    if (state.disposed || !props.owner.current()) return
    if (result.status === "sent") return dialog.close()
    if (result.status === "blocked") return setState("request", "idle")
    setState("request", result)
  }

  const copy = async () => {
    const copied = await navigator.clipboard?.writeText(source.command).then(
      () => true,
      () => false,
    )
    setState({ copied: !!copied, copyFailed: !copied })
  }

  return (
    <DialogV2 fit class="orchestra-evidence-dialog">
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("orchestra.output.rerunTitle")}
          description={language.t("orchestra.output.rerunBody")}
        />
      </DialogHeader>
      <DialogBody class="px-4">
        <dl data-slot="evidence-replay">
          <dt>{language.t("orchestra.evidence.rerun.command")}</dt>
          <dd>
            <code dir="ltr">{source.command}</code>
          </dd>
          <dt>{language.t("orchestra.evidence.rerun.directory")}</dt>
          <dd dir="ltr">{source.workdir ?? source.directory}</dd>
          <dt>{language.t("orchestra.evidence.rerun.session")}</dt>
          <dd>
            {props.actions.sessionTitle(source.sessionID) ?? source.sessionID} · {props.actions.server()}
          </dd>
          <dt>{language.t("orchestra.evidence.rerun.origin")}</dt>
          <dd>{props.result}</dd>
        </dl>
        <p data-slot="evidence-replay-note">{language.t("orchestra.evidence.rerun.warning")}</p>
        <Show when={blocked()}>
          {(reason) => (
            <p data-slot="evidence-replay-block" role="status">
              {language.t(`orchestra.evidence.rerun.block.${reason()}`)}
            </p>
          )}
        </Show>
        <Show when={failure()}>
          {(failure) => (
            <p data-slot="evidence-replay-block" role="alert">
              {language.t("orchestra.evidence.rerun.unknown", { detail: failure().detail })}
            </p>
          )}
        </Show>
        <Show when={state.copyFailed}>
          <p role="status">{language.t("orchestra.evidence.copyFailed")}</p>
        </Show>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={copy}>
          <bdi>{language.t(state.copied ? "orchestra.evidence.rerun.copied" : "orchestra.evidence.rerun.copy")}</bdi>
        </ButtonV2>
        <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
          <bdi>{language.t("common.cancel")}</bdi>
        </ButtonV2>
        <ButtonV2 variant="contrast" disabled={state.request !== "idle" || !!blocked()} onClick={run}>
          <bdi>
            {language.t(
              state.request === "sending" ? "orchestra.evidence.rerun.sending" : "orchestra.evidence.rerun.confirm",
            )}
          </bdi>
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}

function AppendDialog(props: { owner: EvidenceOwner; onConfirm: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  useSessionGuard(props.owner, true)
  return (
    <DialogV2 fit class="orchestra-evidence-dialog">
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("orchestra.pr.append.title")}
          description={language.t("orchestra.pr.append.body")}
        />
      </DialogHeader>
      <DialogFooter>
        <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
          <bdi>{language.t("common.cancel")}</bdi>
        </ButtonV2>
        <ButtonV2 variant="contrast" onClick={props.onConfirm}>
          <bdi>{language.t("orchestra.pr.append.confirm")}</bdi>
        </ButtonV2>
      </DialogFooter>
    </DialogV2>
  )
}
