import { createEffect, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasMemberId, AtlasMemoryTask, AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { HashV, Icon, OutcomeChip } from "../kit/chips"
import { Acc, Btn, Empty, Kpi, Tech } from "../kit/controls"
import { num, seatName } from "../kit/format"
import { openAtlasSheet } from "../sheets/state"
import { MEMORY_STATUS, taskLog, taskStatus } from "./memory-data"

// One task's memory (specs/atlas-ui/mock/views-memory.js:118-157): its checkpoints in .atlas/memory.jsonl. Session
// transcripts are not served (D12), so the mock's Calls, Time, Files changed, Transcript button and transcript page
// are not ported; memory/<seat>/task/<id>/transcript shows this page.
export function MemoryTask(props: { model: AtlasModel; member: AtlasMemberId; unit: string }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const name = () => seatName(props.member)
  createEffect(() => atlas.crumbs([name(), props.unit]))
  const task = () => taskLog(props.model.memory[props.member]).find((entry) => entry.taskId === props.unit)
  return (
    <div class="at-page narrow">
      <Show
        when={task()}
        fallback={
          <Empty
            title={language.t("orchestra.atlas.memory.task.missing.title")}
            action={
              <Btn
                label={language.t("orchestra.atlas.memory.task.back")}
                onClick={() => atlas.go(atlasHref("memory", props.member))}
              />
            }
          >
            {language.t("orchestra.atlas.memory.task.missing.body")}
          </Empty>
        }
      >
        {(entry) => {
          const status = () => MEMORY_STATUS[taskStatus(entry().latest)]
          return (
            <>
              <div class="at-agent-head">
                <span class="at-avatar">{name()[0]}</span>
                <div>
                  <div class="mx-eyebrow">{language.t("orchestra.atlas.memory.task.eyebrow", { name: name() })}</div>
                  <h1 class="mono">{props.unit}</h1>
                  <p>{entry().latest.stoppedAt}</p>
                </div>
                <span class="grow" />
                <Btn
                  label={language.t("orchestra.atlas.memory.task.resume")}
                  icon="play"
                  primary
                  cap="R5"
                  onClick={() => openAtlasSheet({ kind: "respawn", member: props.member, unit: props.unit })}
                />
              </div>
              <div class="at-kpis">
                <Kpi
                  label={language.t("orchestra.atlas.memory.task.kpi.status")}
                  value={
                    <span class={`at-state ${status()[0]}`}>
                      <Icon name={status()[1]} />
                      {language.t(status()[2])}
                    </span>
                  }
                  foot={language.t("orchestra.atlas.memory.task.kpi.status.foot")}
                />
                <Kpi
                  label={language.t("orchestra.atlas.memory.kpi.checkpoints")}
                  value={num(entry().records.length)}
                  foot={language.t("orchestra.atlas.memory.kpi.checkpoints.foot")}
                />
              </div>
              <Acc
                id="task-latest"
                icon="memory"
                title={language.t("orchestra.atlas.memory.task.latest.title")}
                purpose={language.t("orchestra.atlas.memory.task.latest.purpose")}
                summary={`${entry().latest.stoppedAt.slice(0, 60)}…`}
                open
              >
                <Fold record={entry().latest} />
              </Acc>
              <Acc
                id="task-ckpts"
                icon="stack"
                title={language.t("orchestra.atlas.memory.task.history.title")}
                purpose={language.t("orchestra.atlas.memory.task.history.purpose")}
                summary={language.t("orchestra.atlas.memory.task.history.summary", { n: num(entry().records.length) })}
              >
                <For each={entry().records}>
                  {(record, index) => (
                    <details class="at-ckpt admitted">
                      <summary>
                        <OutcomeChip outcome="admitted" />
                        <span class="grow">{record.stoppedAt}</span>
                        <Show when={index() === entry().records.length - 1}>
                          <span class="at-pill warm">{language.t("orchestra.atlas.memory.task.latest.pill")}</span>
                        </Show>
                      </summary>
                      <div class="at-panel-body">
                        <Fold record={record} />
                      </div>
                    </details>
                  )}
                </For>
              </Acc>
              <Tech
                rows={[
                  [language.t("orchestra.atlas.memory.task.tech.ref"), <HashV hash={entry().latest.ref} />],
                  [language.t("orchestra.atlas.memory.task.tech.source"), <code>{entry().latest.source}</code>],
                  [language.t("orchestra.atlas.memory.task.tech.log.label"), language.t("orchestra.atlas.memory.task.tech.log")],
                ]}
              />
            </>
          )
        }}
      </Show>
    </div>
  )
}

// What one checkpoint holds (mock views-memory.js:130).
function Fold(props: { record: AtlasMemoryTask }) {
  const language = useLanguage()
  return (
    <dl class="at-kv wide">
      <dt>{language.t("orchestra.atlas.memory.fold.tried")}</dt>
      <dd>
        <Show when={props.record.attempted.length} fallback="—">
          <For each={props.record.attempted}>{(line) => <div>{line}</div>}</For>
        </Show>
      </dd>
      <dt>{language.t("orchestra.atlas.memory.fold.failed")}</dt>
      <dd>
        <Show
          when={props.record.failedWith.length}
          fallback={<small>{language.t("orchestra.atlas.memory.fold.nothing")}</small>}
        >
          <For each={props.record.failedWith}>{(line) => <div>{line}</div>}</For>
        </Show>
      </dd>
      <dt>{language.t("orchestra.atlas.memory.fold.stopped")}</dt>
      <dd>{props.record.stoppedAt || "—"}</dd>
      <dt>{language.t("orchestra.atlas.memory.fold.lesson")}</dt>
      <dd class="at-lesson-text">{props.record.lesson || "—"}</dd>
    </dl>
  )
}
