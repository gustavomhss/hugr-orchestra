import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { actorKey } from "./keys"
import { age, type ExecutionReport, type Page } from "./model"

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
  const creator = () => props.execution?.creator
  const provenance = () => props.execution ? t("orchestra.board.workspace.unknown") : props.failed ? t("orchestra.board.workspace.readUnavailable") : t("orchestra.board.loading")
  return (
    <aside class="board-rail board-issue-properties" aria-labelledby={`${issue().id}-properties`}>
      <header class="board-properties-header">
        <h3 id={`${issue().id}-properties`}>{t("orchestra.board.sec.properties")}</h3>
      </header>
      <Show when={props.failed}>
        <div class="board-execution-status" role="alert">
          <p>{t("orchestra.board.workspace.failed")}</p>
          <button class="mx-btn" type="button" onClick={props.retry}>{t("orchestra.board.retry")}</button>
        </div>
      </Show>
      <dl class="board-props">
        <div class="board-property-row">
          <dt>{t("orchestra.board.prop.type")}</dt>
          <dd>{t(`orchestra.board.type.${issue().type}`)}</dd>
        </div>
        <div class="board-property-row">
          <dt>{t("orchestra.board.prop.age")}</dt>
          <dd>{t("orchestra.board.day", { day: age(issue(), Date.now()) })}</dd>
        </div>
        <Show when={props.epic}>
          <div class="board-property-row">
            <dt>{t("orchestra.board.prop.epic")}</dt>
            <dd>{props.epic}</dd>
          </div>
        </Show>
        <Show when={issue().seat}>
          <div class="board-property-row">
            <dt>{t("orchestra.board.prop.seat")}</dt>
            <dd>{issue().seat}</dd>
          </div>
        </Show>
        <Show when={issue().estimate}>
          <div class="board-property-row">
            <dt>{t("orchestra.board.prop.estimate")}</dt>
            <dd>{issue().estimate?.toUpperCase()}</dd>
          </div>
        </Show>
        <Show when={issue().prNumber !== null}>
          <div class="board-property-row">
            <dt>{t("orchestra.board.workspace.pr")}</dt>
            <dd>#{issue().prNumber}</dd>
          </div>
        </Show>
      </dl>
      <Show when={issue().branch}>
        {(branch) => (
          <details class="board-issue-property-group board-issue-branch-details">
            <summary>
              <span>{t("orchestra.board.workspace.branch")}</span>
              <code class="board-mono board-issue-branch-preview" aria-hidden="true">{branch()}</code>
            </summary>
            <code class="board-mono board-issue-branch">{branch()}</code>
          </details>
        )}
      </Show>
      <Show when={props.page.dependencies.dependsOn.length || props.page.dependencies.blocks.length}>
        <section class="board-issue-property-group">
          <h4>{t("orchestra.board.sec.dependencies")}</h4>
          <dl class="board-props">
            <Show when={props.page.dependencies.dependsOn.length}>
              <div class="board-property-row">
                <dt>{t("orchestra.board.prop.dependsOn")}</dt>
                <dd>
                  <ul class="board-property-refs">
                    <For each={props.page.dependencies.dependsOn}>{(ref) => <li class="board-mono">{ref}</li>}</For>
                  </ul>
                </dd>
              </div>
            </Show>
            <Show when={props.page.dependencies.blocks.length}>
              <div class="board-property-row">
                <dt>{t("orchestra.board.prop.blocks")}</dt>
                <dd>
                  <ul class="board-property-refs">
                    <For each={props.page.dependencies.blocks}>{(ref) => <li class="board-mono">{ref}</li>}</For>
                  </ul>
                </dd>
              </div>
            </Show>
          </dl>
        </section>
      </Show>
      <details class="board-issue-property-group">
        <summary>{t("orchestra.board.workspace.provenance")}</summary>
        <dl class="board-props">
          <div class="board-property-row">
            <dt>{t("orchestra.board.workspace.creator")}</dt>
            <dd>{creator()?.writer.kind === "owner" ? t("orchestra.board.actor.owner") : creator()?.writer.kind === "github" ? t(actorKey.github) : creator()?.writer.seat ?? provenance()}</dd>
          </div>
          <div class="board-property-row">
            <dt>{t("orchestra.board.workspace.creationModel")}</dt>
            <dd>{creator()?.writer.model ? `${creator()!.writer.model!.providerID}/${creator()!.writer.model!.id}${creator()!.writer.model!.variant ? `#${creator()!.writer.model!.variant}` : ""}` : provenance()}</dd>
          </div>
          <div class="board-property-row">
            <dt>{t("orchestra.board.workspace.creationSession")}</dt>
            <dd class="board-mono">{creator()?.writer.sessionID ?? provenance()}</dd>
          </div>
          <div class="board-property-row">
            <dt>{t("orchestra.board.workspace.executionModels")}</dt>
            <dd>{props.execution?.models.map((entry) => `${entry.model.providerID}/${entry.model.id}`).join(", ") || provenance()}</dd>
          </div>
        </dl>
        <Show when={props.page.activity[0]}>
          {(first) => (
            <dl class="board-props">
              <div class="board-property-row">
                <dt>{t("orchestra.board.prop.created")}</dt>
                <dd>{props.date(first().timeCreated)}</dd>
              </div>
              <div class="board-property-row">
                <dt>{t("orchestra.board.prop.updated")}</dt>
                <dd>{props.time(props.page.activity[props.page.activity.length - 1].timeCreated)}</dd>
              </div>
            </dl>
          )}
        </Show>
      </details>
    </aside>
  )
}
