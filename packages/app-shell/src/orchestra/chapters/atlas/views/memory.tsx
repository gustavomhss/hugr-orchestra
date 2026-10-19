import { createEffect, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasMemberId } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Help, Icon } from "../kit/chips"
import { Acc, Kpi, Tech } from "../kit/controls"
import { num, seatName } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import type { AtlasViewProps } from "./index"
import {
  MEMORY_STATUS,
  MEMORY_STATUSES,
  type MemoryMemberProps,
  type MemoryStatus,
  projectMemory,
  taskLog,
  taskStatus,
} from "./memory-data"
import { ProjectMemory } from "./memory-project"
import { MemoryTask } from "./memory-task"

// Memory, per member (specs/atlas-ui/mock/views-memory.js): project memory (scoped rules carried into every turn,
// proposed then indexed) and the memory log (one entry per task or PR), from .atlas/memory.jsonl.
const MEMBERS: readonly AtlasMemberId[] = ["backend", "jimmy", "archie", "maestro"]
const ROLES = {
  backend: "orchestra.atlas.memory.role.backend",
  jimmy: "orchestra.atlas.memory.role.jimmy",
  archie: "orchestra.atlas.memory.role.archie",
  maestro: "orchestra.atlas.memory.role.maestro",
} as const
const FILTERS = [
  ["", "orchestra.atlas.memory.status.all"],
  ["done", "orchestra.atlas.memory.status.done"],
  ["paused", "orchestra.atlas.memory.status.paused"],
  ["blocked", "orchestra.atlas.memory.status.blocked"],
] as const

export default function AtlasMemoryView(props: AtlasViewProps) {
  // The route is memory/<seat>[/task/<id>[/transcript]]; the transcript route shows the task page (issue 10).
  const parts = () => props.route.param.split("/")
  const member = () => MEMBERS.find((id) => id === parts()[0]) ?? "backend"
  const unit = () => (parts()[1] === "task" ? (parts()[2] ?? "") : "")
  // Dismissed proposals live in this page only, per member (mock app.js:494).
  const [dismissed, setDismissed] = createStore<Partial<Record<AtlasMemberId, string[]>>>({})
  return (
    <Show
      when={unit()}
      fallback={
        <Show when={member()} keyed>
          {(id) => (
            <MemberPage
              model={props.model}
              route={props.route}
              member={id}
              dismissed={dismissed[id] ?? []}
              onDismiss={(lesson) => setDismissed(id, [...(dismissed[id] ?? []), lesson])}
            />
          )}
        </Show>
      }
    >
      <MemoryTask model={props.model} member={member()} unit={unit()} />
    </Show>
  )
}

function MemberPage(props: MemoryMemberProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  const name = () => seatName(props.member)
  createEffect(() => atlas.crumbs([name()]))
  return (
    <div class="at-page narrow">
      <div class="at-agent-head">
        <span class="at-avatar">{name()[0]}</span>
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.memory.eyebrow")}</div>
          <h1>{name()}</h1>
          <p>{language.t(ROLES[props.member])}</p>
        </div>
        <span class="grow" />
        <Show
          when={props.model.memory[props.member].bound}
          fallback={
            <span class="at-pill">
              <Icon name="minusc" />
              {language.t("orchestra.atlas.memory.off")}
            </span>
          }
        >
          <span class="at-pill good">
            <Icon name="checkc" />
            {language.t("orchestra.atlas.memory.on")}
          </span>
        </Show>
      </div>
      <Show
        when={props.model.memory[props.member].bound}
        fallback={
          <>
            <div class="at-clear">
              <Icon name="memory" />
              <strong>{language.t("orchestra.atlas.memory.unbound.title")}</strong>
              <p>{language.t("orchestra.atlas.memory.unbound.body", { name: name() })}</p>
            </div>
            <Tech
              rows={[
                [language.t("orchestra.atlas.memory.unbound.entry.label"), language.t("orchestra.atlas.memory.unbound.entry")],
                [
                  language.t("orchestra.atlas.memory.unbound.who.label"),
                  <Rich text={language.t("orchestra.atlas.memory.unbound.who")} />,
                ],
                [
                  language.t("orchestra.atlas.memory.unbound.corrections.label"),
                  language.t("orchestra.atlas.memory.unbound.corrections"),
                ],
              ]}
            />
          </>
        }
      >
        <BoundMember {...props} />
      </Show>
    </div>
  )
}

function BoundMember(props: MemoryMemberProps) {
  const language = useLanguage()
  const name = () => seatName(props.member)
  const log = () => taskLog(props.model.memory[props.member])
  const prs = () => props.model.memory[props.member].prs
  const records = () => props.model.memory[props.member].tasks.length
  const pm = () => projectMemory(props.model, props.member, props.dismissed)
  const count = (status: MemoryStatus) => log().filter((task) => taskStatus(task.latest) === status).length
  return (
    <>
      <p class="at-subline at-memwhere">
        <Icon name="folder" />
        {language.t("orchestra.atlas.memory.where")}
        <Help text={language.t("orchestra.atlas.memory.where.help", { name: name() })} />
      </p>
      <div class="at-kpis three">
        <Kpi
          label={language.t("orchestra.atlas.memory.kpi.project")}
          value={
            <>
              {num(pm().used)}
              <small>
                {" "}
                {language.t("orchestra.atlas.memory.tokensWord")}
              </small>
            </>
          }
          foot={
            <>
              {language.plural("orchestra.atlas.memory.rules", pm().indexed.length, { n: num(pm().indexed.length) })}
              <Show when={pm().proposals.length}>
                {" · "}
                {language.t("orchestra.atlas.memory.kpi.proposals", { n: num(pm().proposals.length) })}
              </Show>
            </>
          }
        />
        <Kpi
          label={language.t("orchestra.atlas.memory.kpi.log")}
          value={num(log().length)}
          foot={
            <Show when={log().length} fallback={language.t("orchestra.atlas.memory.kpi.log.empty")}>
              <For each={MEMORY_STATUSES}>
                {(status) => (
                  <Show when={count(status)}>
                    <span class={`at-kdot ${MEMORY_STATUS[status][0]}`}>
                      <i />
                      {language.t(MEMORY_STATUS[status][3], { n: num(count(status)) })}
                    </span>
                  </Show>
                )}
              </For>
            </Show>
          }
        />
        <Kpi
          label={language.t("orchestra.atlas.memory.kpi.checkpoints")}
          value={num(records())}
          foot={records() ? language.t("orchestra.atlas.memory.kpi.checkpoints.foot") : "—"}
        />
      </div>
      <Acc
        id={`${props.member}-project`}
        icon="shield"
        title={language.t("orchestra.atlas.memory.project.title")}
        purpose={
          <>
            {language.t("orchestra.atlas.memory.project.purpose", { name: name() })}{" "}
            <Help text={language.t("orchestra.atlas.memory.project.help")} />
          </>
        }
        summary={language.plural("orchestra.atlas.memory.tokens", pm().used, { n: num(pm().used) })}
        open
      >
        <ProjectMemory {...props} />
      </Acc>
      <Acc
        id={`${props.member}-log`}
        icon="history"
        title={language.t("orchestra.atlas.memory.log.title")}
        purpose={language.t("orchestra.atlas.memory.log.purpose")}
        summary={
          <Show when={log().length || prs().length} fallback={language.t("orchestra.atlas.memory.log.summary.empty")}>
            {language.plural("orchestra.atlas.memory.log.tasks", log().length, { n: num(log().length) })}
            <Show when={prs().length}>
              {" · "}
              {language.t("orchestra.atlas.memory.log.prs", { n: num(prs().length) })}
            </Show>
          </Show>
        }
        open
      >
        <MemoryLog {...props} />
      </Acc>
    </>
  )
}

function MemoryLog(props: MemoryMemberProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  const name = () => seatName(props.member)
  const log = () => taskLog(props.model.memory[props.member])
  const prs = () => props.model.memory[props.member].prs
  const filter = () => FILTERS.find((item) => item[0] === props.route.query.status)?.[0] ?? ""
  const count = (status: "" | MemoryStatus) =>
    log().filter((task) => !status || taskStatus(task.latest) === status).length
  const rows = () =>
    [...log()].reverse().filter((task) => !filter() || taskStatus(task.latest) === filter())
  return (
    <Show
      when={log().length || prs().length}
      fallback={<div class="at-band-empty">{language.t("orchestra.atlas.memory.log.empty", { name: name() })}</div>}
    >
      <div class="at-acc-tools">
        <div class="wf-range">
          <For each={FILTERS}>
            {(item) => (
              <button
                type="button"
                aria-pressed={filter() === item[0]}
                onClick={() => atlas.setQuery({ status: item[0] || undefined })}
              >
                {language.t(item[1])}
                <span class="wf-count">{num(count(item[0]))}</span>
              </button>
            )}
          </For>
        </div>
        <span class="grow" />
        <span class="at-hint" data-tip={language.t("orchestra.atlas.memory.log.hint.tip")}>
          {language.t("orchestra.atlas.memory.log.hint", { name: name() })}
        </span>
      </div>
      <Show
        when={rows().length}
        fallback={
          <Show when={log().length}>
            <div class="at-band-empty">{language.t("orchestra.atlas.memory.log.filter.empty")}</div>
          </Show>
        }
      >
        <For each={rows()}>
          {(task) => (
            <AtlasLink class="at-task" href={atlasHref("memory", `${props.member}/task/${task.taskId}`)}>
              <span class={`at-state ${MEMORY_STATUS[taskStatus(task.latest)][0]}`}>
                <Icon name={MEMORY_STATUS[taskStatus(task.latest)][1]} />
                {language.t(MEMORY_STATUS[taskStatus(task.latest)][2])}
              </span>
              <span class="at-task-main">
                <span class="at-task-title">
                  <span class="at-kindtag">{language.t("orchestra.atlas.memory.kind.task")}</span>
                  <code>{task.taskId}</code>
                </span>
                <small class="clamp1">{task.latest.stoppedAt}</small>
              </span>
              <Icon name="arrow" />
            </AtlasLink>
          )}
        </For>
      </Show>
      <For each={prs()}>
        {(pr) => (
          <details class="at-ckpt pr">
            <summary>
              <span class="at-kindtag">{language.t("orchestra.atlas.memory.kind.pr")}</span>
              <code class="at-mono">{pr.prId}</code>
              <span class="grow">{pr.title}</span>
              <small>
                {language.plural("orchestra.atlas.memory.pr.decisions", pr.decisions.length, { n: num(pr.decisions.length) })}
              </small>
            </summary>
            <div class="at-panel-body">
              <dl class="at-kv wide">
                <dt>{language.t("orchestra.atlas.memory.pr.decisions.label")}</dt>
                <dd>
                  <For each={pr.decisions}>{(line) => <div>{line}</div>}</For>
                </dd>
                <dt>{language.t("orchestra.atlas.memory.pr.review")}</dt>
                <dd>
                  <For each={pr.reviewOutcomes}>{(line) => <div>{line}</div>}</For>
                </dd>
                <dt>
                  {language.t("orchestra.atlas.memory.pr.delta")}{" "}
                  <Help text={language.t("orchestra.atlas.memory.pr.delta.help")} />
                </dt>
                <dd>
                  <For each={pr.knowledgeDelta}>
                    {(delta) => (
                      <div>
                        <Rich
                          text={language.plural("orchestra.atlas.memory.pr.delta.line", delta.facts, {
                            change: delta.change,
                            unit: delta.unit,
                            n: num(delta.facts),
                          })}
                        />
                      </div>
                    )}
                  </For>
                </dd>
                <dt>{language.t("orchestra.atlas.memory.pr.diff.label")}</dt>
                <dd>{language.t("orchestra.atlas.memory.pr.diff")}</dd>
              </dl>
            </div>
          </details>
        )}
      </For>
    </Show>
  )
}
