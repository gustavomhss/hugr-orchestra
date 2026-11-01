import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import type { AtlasMemoryRule, AtlasModel } from "../atlas-model"
import { atlasHref } from "../atlas-route"
import { Help, Icon } from "../kit/chips"
import { Btn, rememberOpen, Tech } from "../kit/controls"
import { num, seatName } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { openAtlasSheet } from "../sheets/state"
import { tabKeydown } from "../../../tab-keys"
import { type MemoryMemberProps, projectMemory } from "./memory-data"

// The member page's Project memory section (specs/atlas-ui/mock/views-memory.js:75-92): the Proposals and Indexed
// tabs, the rules out of the header, and the header block Orchestra sends with every request.
const FACETS = {
  mission: "orchestra.atlas.memory.facet.mission",
  constitution: "orchestra.atlas.memory.facet.constitution",
  terrain: "orchestra.atlas.memory.facet.terrain",
  ontology: "orchestra.atlas.memory.facet.ontology",
  taste: "orchestra.atlas.memory.facet.taste",
} as const

export function ProjectMemory(props: MemoryMemberProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  const name = () => seatName(props.member)
  const pm = () => projectMemory(props.model, props.member, props.dismissed)
  const tab = () => props.route.query.pm ?? (pm().indexed.length ? "indexed" : "proposals")
  const tokens = (n: number) => language.plural("orchestra.atlas.memory.tokens", n, { n: num(n) })
  // R1 (D18, D30): the rules this member proposed wait in the review log until a person indexes or discards them.
  const proposed = () =>
    (atlas.controller.state.review?.memoryProposals ?? []).filter((proposal) => proposal.member === props.member)
  const busy = () => atlas.controller.state.pending.includes("memoryDecide")
  const discard = async (proposalId: string) => {
    const result = await atlas.controller.memoryDecide({ proposalId, verdict: "discarded" })
    if (!result || isAtlasEmpty(result)) return
    if (!result.ok)
      return atlas.toast(language.t("orchestra.atlas.memory.refused", { reason: result.rejected ?? "unknown" }), "xc")
    atlas.toast(language.t("orchestra.atlas.memory.discarded"), "minusc")
  }
  return (
    <>
      <div class="at-acc-tools">
        <div class="wf-range" role="tablist" onKeyDown={tabKeydown}>
          <button
            type="button"
            role="tab"
            aria-selected={tab() === "proposals"}
            tabindex={tab() === "proposals" ? 0 : -1}
            onClick={() => atlas.setQuery({ pm: "proposals" })}
          >
            {language.t("orchestra.atlas.memory.tab.proposals")}
            <span class="wf-count">{num(pm().proposals.length + proposed().length)}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab() === "indexed"}
            tabindex={tab() === "indexed" ? 0 : -1}
            onClick={() => atlas.setQuery({ pm: "indexed" })}
          >
            {language.t("orchestra.atlas.memory.tab.indexed")}
            <span class="wf-count">{num(pm().indexed.length)}</span>
          </button>
        </div>
        <Help text={language.t("orchestra.atlas.memory.project.r1", { name: name() })} />
        <span class="grow" />
        <Show when={tab() === "indexed"}>
          <Btn
            label={language.t("orchestra.atlas.memory.addRule")}
            icon="plus"
            cap="R1"
            disabled
            tip={language.t("orchestra.atlas.memory.addRule.later")}
          />
        </Show>
      </div>
      <Show
        when={tab() === "indexed"}
        fallback={
          <Show
            when={pm().proposals.length + proposed().length}
            fallback={
              <div class="at-band-empty">{language.t("orchestra.atlas.memory.proposals.empty", { name: name() })}</div>
            }
          >
            <p class="at-stew-intro">{language.t("orchestra.atlas.memory.proposals.intro", { name: name() })}</p>
            <For each={proposed()}>
              {(proposal) => (
                <div class="at-rule-row">
                  <span class="rank">
                    <Icon name="sparkle" />
                  </span>
                  <div class="grow">
                    <div>{proposal.rule}</div>
                    <small>
                      <code data-tip={language.t("orchestra.atlas.memory.scope.tip")}>[{proposal.scope}]</code>
                      {" · "}
                      {language.t("orchestra.atlas.memory.proposal.by", { by: proposal.by })}
                    </small>
                  </div>
                  <Btn
                    label={language.t("orchestra.atlas.memory.discard")}
                    disabled={busy()}
                    onClick={() => void discard(proposal.id)}
                  />
                  <Btn
                    label={language.t("orchestra.atlas.memory.index")}
                    primary
                    disabled={busy()}
                    onClick={() =>
                      openAtlasSheet({
                        kind: "rule",
                        member: props.member,
                        proposalId: proposal.id,
                        rule: proposal.rule,
                        scope: proposal.scope,
                      })
                    }
                  />
                </div>
              )}
            </For>
            <For each={pm().proposals}>
              {(proposal) => (
                <div class="at-rule-row">
                  <span class="rank">
                    <Icon name="sparkle" />
                  </span>
                  <div class="grow">
                    <div>{proposal.lesson}</div>
                    <small>
                      {language.t("orchestra.atlas.memory.proposal.from", { tokens: tokens(props.model.words(proposal.lesson)) })}{" "}
                      <AtlasLink class="mx-link" href={atlasHref("memory", `${props.member}/task/${proposal.unit}`)}>
                        {proposal.unit}
                      </AtlasLink>
                    </small>
                  </div>
                  <Btn
                    label={language.t("orchestra.atlas.memory.dismiss")}
                    onClick={() => {
                      props.onDismiss(proposal.lesson)
                      atlas.toast(language.t("orchestra.atlas.memory.dismissed"), "minusc")
                    }}
                  />
                  <Btn
                    label={language.t("orchestra.atlas.memory.index")}
                    primary
                    cap="R1"
                    disabled
                    tip={language.t("orchestra.atlas.memory.lesson.later", { name: name() })}
                  />
                </div>
              )}
            </For>
          </Show>
        }
      >
        <div class="at-tokens">
          <div>
            <b>{num(pm().used)}</b>
            <span>{language.t("orchestra.atlas.memory.tokensWord")}</span>
            <small>{language.plural("orchestra.atlas.memory.rules", pm().indexed.length, { n: num(pm().indexed.length) })}</small>
          </div>
          <small class="at-tok-note">
            {language.t("orchestra.atlas.memory.shared", { n: num(pm().shared) })}{" "}
            <Help text={language.t("orchestra.atlas.memory.shared.help")} />
          </small>
        </div>
        <Show
          when={pm().indexed.length}
          fallback={
            <div class="at-band-empty">
              {pm().proposals.length
                ? language.t("orchestra.atlas.memory.indexed.empty.hint", { name: name() })
                : language.t("orchestra.atlas.memory.indexed.empty")}
            </div>
          }
        >
          <For each={pm().indexed}>{(rule, index) => <RuleRow model={props.model} rule={rule} rank={index() + 1} />}</For>
        </Show>
        <Show when={pm().archived.length}>
          <details class="at-sub-acc">
            <summary>
              <Icon name="chev" />
              <span>{language.t("orchestra.atlas.memory.archived")}</span>
              <span class="wf-count">{num(pm().archived.length)}</span>
            </summary>
            <For each={pm().archived}>
              {(rule) => (
                <div class="at-rule-row muted">
                  <span class="rank">·</span>
                  <div class="grow">
                    <div>{rule.rule}</div>
                    <small>{language.plural("orchestra.atlas.memory.archived.note", rule.age, { n: num(rule.age) })}</small>
                  </div>
                </div>
              )}
            </For>
          </details>
        </Show>
        <details class="at-sub-acc" ref={rememberOpen(`${props.member}-header`)}>
          <summary>
            <Icon name="chev" />
            <span>{language.t("orchestra.atlas.memory.header.title")}</span>
            <span class="wf-count">{tokens(pm().used + pm().shared)}</span>
          </summary>
          <div class="at-facets">
            <For each={props.model.awareness}>
              {(facet) => (
                <div class="at-linkrow static">
                  <span>{language.t(FACETS[facet.facet])}</span>
                  <span class="grow" />
                  <Show when={facet.state === "UN-SEEDED"} fallback={<small>{language.t(facet.source)}</small>}>
                    <Show
                      when={facet.facet === "constitution" || facet.facet === "taste"}
                      fallback={
                        <small class="muted" data-tip={language.t("orchestra.atlas.memory.facet.nothing.tip")}>
                          {language.t("orchestra.atlas.memory.facet.nothing")}
                        </small>
                      }
                    >
                      <small>{language.t("orchestra.atlas.memory.facet.notSetUp")}</small>
                    </Show>
                  </Show>
                </div>
              )}
            </For>
            <div class="at-linkrow static">
              <span>{language.t("orchestra.atlas.memory.facet.where")}</span>
              <span class="grow" />
              <small class="muted" data-tip={language.t("orchestra.atlas.memory.facet.where.tip")}>
                {language.t("orchestra.atlas.memory.facet.nothing")}
              </small>
            </div>
          </div>
          <Tech
            rows={[
              [language.t("orchestra.atlas.memory.tech.rendered.label"), language.t("orchestra.atlas.memory.tech.rendered")],
              // The header block is machine text the agent receives: shown verbatim, never translated.
              [language.t("orchestra.atlas.memory.tech.text.label"), <pre class="at-raw">{pm().text}</pre>],
              [
                language.t("orchestra.atlas.memory.tech.partial.label"),
                <Rich text={language.t("orchestra.atlas.memory.tech.partial")} />,
              ],
              [
                language.t("orchestra.atlas.memory.tech.unavailable.label"),
                <>
                  <pre class="at-raw">{language.t("orchestra.atlas.memory.tech.unavailable.text", { member: props.member })}</pre>
                  <Show when={props.member === "backend"}>
                    {language.t("orchestra.atlas.memory.tech.blocker", { name: name() })}
                  </Show>
                </>,
              ],
            ]}
          />
        </details>
      </Show>
    </>
  )
}

function RuleRow(props: { model: AtlasModel; rule: AtlasMemoryRule; rank: number }) {
  const language = useLanguage()
  const recency = () => props.model.frecency(props.rule)
  return (
    <div class="at-rule-row">
      <span class="rank">{props.rank}</span>
      <div class="grow">
        <div>{props.rule.rule}</div>
        <small>
          <code data-tip={language.t("orchestra.atlas.memory.scope.tip")}>[{props.rule.scope}]</code>
          <Show when={props.rule.grounding}>
            {(grounding) => (
              <>
                {" · "}
                <Rich text={language.t("orchestra.atlas.memory.grounded", { grounding: grounding() })} />
              </>
            )}
          </Show>
        </small>
      </div>
      <span
        class="at-frec"
        data-tip={language.t("orchestra.atlas.memory.recency.tip", { value: recency().toFixed(2), age: props.rule.age })}
      >
        <i style={{ "inline-size": `${Math.min(100, recency() * 100)}%` }} />
      </span>
      <span class="at-tok">{language.t("orchestra.atlas.memory.tok", { n: num(props.model.words(props.rule.rule)) })}</span>
    </div>
  )
}