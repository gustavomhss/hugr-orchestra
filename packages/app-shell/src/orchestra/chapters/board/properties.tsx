import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { actorKey, stageKey } from "./keys"
import { age, steps, type ExecutionReport, type Page } from "./model"

export function IssueProperties(props: {
  page: Page
  execution?: ExecutionReport
  failed: boolean
  epic?: string
  retry: () => void
  date: (ms: number) => string
  time: (ms: number) => string
}) {
  const t = useLanguage().t
  const issue = () => props.page.issue
  const progress = () => steps(issue())
  const creator = () => props.execution?.creator
  const provenance = () => props.execution ? t("orchestra.board.workspace.unknown") : props.failed ? t("orchestra.board.workspace.readUnavailable") : t("orchestra.board.loading")
  return (
    <aside class="board-rail">
      <h3>{t("orchestra.board.sec.properties")}</h3>
      <Show when={props.failed}><div class="board-execution-status" role="alert"><p>{t("orchestra.board.workspace.failed")}</p><button class="mx-btn" type="button" onClick={props.retry}>{t("orchestra.board.retry")}</button></div></Show>
      <dl class="board-props">
        <dt>{t("orchestra.board.prop.stage")}</dt>
        <dd>
          {t(stageKey[issue().stage])}
          <Show when={progress().current}>
            {(current) => <small>{t("orchestra.board.stage.of", { current: current(), total: progress().total })}</small>}
          </Show>
        </dd>
        <dt>{t("orchestra.board.prop.epic")}</dt>
        <dd>{props.epic ?? t("orchestra.board.none")}</dd>
        <dt>{t("orchestra.board.prop.seat")}</dt>
        <dd>{issue().seat ?? t("orchestra.board.none")}</dd>
        <dt>{t("orchestra.board.workspace.creator")}</dt>
        <dd>{creator()?.writer.kind === "owner" ? t("orchestra.board.actor.owner") : creator()?.writer.kind === "github" ? t(actorKey.github) : creator()?.writer.seat ?? provenance()}</dd>
        <dt>{t("orchestra.board.workspace.creationModel")}</dt>
        <dd>{creator()?.writer.model ? `${creator()!.writer.model!.providerID}/${creator()!.writer.model!.id}${creator()!.writer.model!.variant ? `#${creator()!.writer.model!.variant}` : ""}` : provenance()}</dd>
        <dt>{t("orchestra.board.workspace.creationSession")}</dt>
        <dd class="board-mono">{creator()?.writer.sessionID ?? provenance()}</dd>
        <dt>{t("orchestra.board.workspace.executionModels")}</dt>
        <dd>{props.execution?.models.map((entry) => `${entry.model.providerID}/${entry.model.id}`).join(", ") || provenance()}</dd>
        <dt>{t("orchestra.board.workspace.branch")}</dt>
        <dd class="board-mono">{issue().branch ?? t("orchestra.board.workspace.unknown")}</dd>
        <dt>{t("orchestra.board.workspace.pr")}</dt>
        <dd>{issue().prNumber === null ? t("orchestra.board.workspace.unknown") : `#${issue().prNumber}`}</dd>
        <dt>{t("orchestra.board.prop.type")}</dt>
        <dd>{t(`orchestra.board.type.${issue().type}`)}</dd>
        <dt>{t("orchestra.board.prop.estimate")}</dt>
        <dd>{issue().estimate?.toUpperCase() ?? t("orchestra.board.none")}</dd>
        <dt>{t("orchestra.board.prop.age")}</dt>
        <dd>{t("orchestra.board.day", { day: age(issue(), Date.now()) })}</dd>
      </dl>
      <h3>{t("orchestra.board.sec.dependencies")}</h3>
      <dl class="board-props">
        <dt>{t("orchestra.board.prop.dependsOn")}</dt>
        <dd class="board-mono">{props.page.dependencies.dependsOn.join(", ") || t("orchestra.board.none")}</dd>
        <dt>{t("orchestra.board.prop.blocks")}</dt>
        <dd class="board-mono">{props.page.dependencies.blocks.join(", ") || t("orchestra.board.none")}</dd>
      </dl>
      <Show when={props.page.activity[0]}>
        {(first) => (
          <>
            <h3>{t("orchestra.board.sec.history")}</h3>
            <dl class="board-props">
              <dt>{t("orchestra.board.prop.created")}</dt>
              <dd>{props.date(first().timeCreated)}</dd>
              <dt>{t("orchestra.board.prop.updated")}</dt>
              <dd>{props.time(props.page.activity[props.page.activity.length - 1].timeCreated)}</dd>
            </dl>
          </>
        )}
      </Show>
      <p class="board-footnote">
        <b>{t("orchestra.board.yours")}</b> {t("orchestra.board.yoursBody")}
        <span class="board-keys">
          <span>
            <kbd>J</kbd>
            <kbd>K</kbd>
            {t("orchestra.board.keys.issues")}
          </span>
          <span>
            <kbd>Esc</kbd>
            {t("orchestra.board.keys.board")}
          </span>
        </span>
      </p>
    </aside>
  )
}
