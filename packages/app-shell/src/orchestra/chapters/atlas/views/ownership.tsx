import { createEffect, createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel } from "../atlas-model"
import { type AtlasRoute, withQuery } from "../atlas-route"
import { Icon, TierChip } from "../kit/chips"
import { Btn } from "../kit/controls"
import { num } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { openAtlasSheet } from "../sheets/state"
import type { AtlasViewProps } from "./index"
import { type AtlasOwner, lastFolder, leafOf, owners, pickOwner, skillName } from "./ownership-data"
import { OwnershipFlow } from "./ownership-flow"

// Ownership: what Atlas knows per unit, packaged as skills (specs/atlas-ui/mock/views-own.js).
const STATES = {
  "published-drifted": ["orchestra.atlas.ownership.state.publishedDrifted", "warm"],
  published: ["orchestra.atlas.ownership.state.published", "good"],
  "live-drifted": ["orchestra.atlas.ownership.state.liveDrifted", "warm"],
  live: ["orchestra.atlas.ownership.state.live", ""],
} as const

export default function AtlasOwnershipView(props: AtlasViewProps) {
  const atlas = useAtlas()
  const language = useLanguage()
  createEffect(() => atlas.crumbs([language.t("orchestra.atlas.ownership.crumb")]))
  const snapshot = () => props.model.snapshot
  const list = createMemo(() => owners(props.model))
  const pick = createMemo(() => pickOwner(list(), props.route.query.u, snapshot()))
  return (
    <div class="at-page wide">
      <section class="at-gen-hero">
        <div>
          <div class="mx-eyebrow">{language.t("orchestra.atlas.ownership.eyebrow")}</div>
          <h1>{language.t("orchestra.atlas.ownership.title")}</h1>
          <p>
            <Rich text={language.t("orchestra.atlas.ownership.hero.what")} />
          </p>
          <p>
            <Rich text={language.t("orchestra.atlas.ownership.hero.skill")} />
          </p>
        </div>
        <div class="heading-actions">
          <Btn
            label={language.t("orchestra.atlas.ownership.republish")}
            icon="download"
            cap="R7"
            onClick={() => openAtlasSheet({ kind: "republish" })}
          />
        </div>
      </section>

      <div class="at-own-status">
        <div>
          <span class={`at-sdot ${snapshot().units.length > 1 ? "good" : "warm"}`} />
          <b>
            {language.plural("orchestra.atlas.ownership.published", snapshot().units.length, {
              n: num(snapshot().units.length),
            })}
          </b>
          <small>{snapshot().units.map((unit) => lastFolder(unit)).join(", ")}</small>
        </div>
        <div>
          <span class={`at-sdot ${snapshot().catalog ? "good" : "warm"}`} />
          <b>{language.t("orchestra.atlas.ownership.catalog")}</b>
          <small>
            {language.t(
              snapshot().catalog ? "orchestra.atlas.ownership.catalog.present" : "orchestra.atlas.ownership.catalog.missing",
            )}
          </small>
        </div>
        <div>
          <span class="at-sdot warm" />
          <b>{language.t("orchestra.atlas.ownership.orchestra")}</b>
          <small>{language.t("orchestra.atlas.ownership.orchestra.state")}</small>
        </div>
      </div>

      <section class="at-panel at-arch-block">
        <header class="at-panel-head">
          <div>
            <h3>
              <Icon name="fact" />
              {language.t("orchestra.atlas.ownership.docs.title")}
            </h3>
            <small>
              <Rich text={language.t("orchestra.atlas.ownership.docs.purpose")} />
            </small>
          </div>
        </header>
        <Show when={pick()}>
          {(chosen) => (
            <>
              <div class="at-owners">
                <For each={list()}>
                  {(owner) => (
                    <AtlasLink
                      class={owner.id === chosen().id ? "at-owner on" : "at-owner"}
                      href={withQuery(props.route, { u: owner.id, fact: undefined, why: undefined })}
                    >
                      <div class="at-owner-top">
                        <code>{language.t("orchestra.atlas.ownership.skill", { name: owner.leaf })}</code>
                        <span class={`at-sdot ${STATES[owner.state][1]}`} />
                      </div>
                      <p>{owner.role ?? language.t("orchestra.atlas.ownership.noFacts")}</p>
                      <small>
                        {language.plural("orchestra.atlas.ownership.files", owner.files, { n: num(owner.files) })}
                        {" · "}
                        {language.plural("orchestra.atlas.ownership.rules", owner.rules, { n: num(owner.rules) })}
                        {" · "}
                        {language.plural("orchestra.atlas.ownership.hints", owner.b.adv.length, {
                          n: num(owner.b.adv.length),
                        })}
                      </small>
                      <small class="at-owner-state">{language.t(STATES[owner.state][0])}</small>
                    </AtlasLink>
                  )}
                </For>
              </div>
              <OwnerSheet owner={chosen()} model={props.model} route={props.route} />
            </>
          )}
        </Show>
        <p class="mx-note">
          <Rich text={language.t("orchestra.atlas.ownership.docs.note")} />
        </p>
      </section>

      <OwnershipFlow model={props.model} route={props.route} />
    </div>
  )
}

// The selected unit's ownership doc: the doc itself, then its relations and how an agent uses it
// (mock views-own.js:69-86).
function OwnerSheet(props: { owner: AtlasOwner; model: AtlasModel; route: AtlasRoute }) {
  const language = useLanguage()
  const published = () => props.model.snapshot.units.includes(props.owner.id)
  const committed = () => !!props.model.snapshot.packs[props.owner.id]
  return (
    <div class="at-owner-sheet">
      <div class="at-owner-main at-owndoc">
        <div class="at-owndoc-file">
          <Icon name="fact" />
          <code>
            {published()
              ? language.t("orchestra.atlas.ownership.doc.path", { name: skillName(props.owner.id) })
              : language.t("orchestra.atlas.ownership.doc.command", { id: props.owner.id })}
          </code>
          <span class="at-pill">{language.t(STATES[props.owner.state][0])}</span>
        </div>
        <pre class="at-owndoc-front">
          {language.t("orchestra.atlas.ownership.doc.front", {
            name: published() ? skillName(props.owner.id) : props.owner.leaf,
            id: props.owner.id,
          })}
        </pre>
        <h4>{language.t("orchestra.atlas.ownership.doc.role")}</h4>
        <p>{props.owner.role ?? language.t("orchestra.atlas.ownership.noFacts")}</p>
        <h4>{language.t("orchestra.atlas.ownership.doc.terrain")}</h4>
        <p>
          <b>{props.owner.id}</b>
          {" · "}
          {language.plural("orchestra.atlas.ownership.files", props.owner.files, { n: num(props.owner.files) })}
          <Show when={props.owner.people.length}>
            {" · "}
            {language.t("orchestra.atlas.ownership.doc.owner", { people: props.owner.people.join(", ") })}
          </Show>
        </p>
        <h4>{language.t("orchestra.atlas.ownership.doc.governing")}</h4>
        <Show
          when={props.owner.gov.length}
          fallback={<p class="muted">{language.t("orchestra.atlas.ownership.doc.none")}</p>}
        >
          <For each={props.owner.gov.slice(0, 4)}>
            {(rule) => (
              <p>
                <TierChip tier={rule.tier} /> {rule.claim}
              </p>
            )}
          </For>
        </Show>
        <Show when={props.owner.b.gotchas.length}>
          <h4>{language.t("orchestra.atlas.ownership.doc.gotchas")}</h4>
          <For each={props.owner.b.gotchas.slice(0, 3)}>{(x) => <p>{x.claim}</p>}</For>
        </Show>
        <h4>{language.t("orchestra.atlas.ownership.doc.advisory")}</h4>
        <p>
          {language.plural("orchestra.atlas.ownership.doc.advisory.line", props.owner.b.adv.length, {
            n: num(props.owner.b.adv.length),
          })}
        </p>
      </div>
      <div class="at-owner-side">
        <Show
          when={committed()}
          fallback={
            <>
              <h4>{language.t("orchestra.atlas.ownership.doc.usedBy")}</h4>
              <Show
                when={props.owner.usedBy.length}
                fallback={<p class="muted">{language.t("orchestra.atlas.ownership.doc.usedBy.none")}</p>}
              >
                <For each={props.owner.usedBy}>
                  {(unit) => (
                    <AtlasLink
                      class="at-owner-link"
                      href={withQuery(props.route, { u: unit, fact: undefined, why: undefined })}
                    >
                      <Icon name="arrow" />
                      {language.t("orchestra.atlas.ownership.skill", { name: leafOf(unit) })}
                    </AtlasLink>
                  )}
                </For>
              </Show>
              <h4>{language.t("orchestra.atlas.ownership.doc.finer")}</h4>
              <Show
                when={props.owner.b.pointers.length}
                fallback={<p class="muted">{language.t("orchestra.atlas.ownership.doc.finer.none")}</p>}
              >
                <For each={props.owner.b.pointers.slice(0, 6)}>
                  {(pointer) => <code class="at-owner-ptr">{pointer.name}</code>}
                </For>
                <Show when={props.owner.b.pointerTotal > 6}>
                  <p class="muted">
                    {language.t("orchestra.atlas.ownership.doc.finer.more", { n: num(props.owner.b.pointerTotal - 6) })}
                  </p>
                </Show>
              </Show>
            </>
          }
        >
          <h4>{language.t("orchestra.atlas.ownership.doc.relations")}</h4>
          <p class="muted">{language.t("orchestra.atlas.ownership.doc.committedEmpty")}</p>
          <h4>{language.t("orchestra.atlas.ownership.doc.drill")}</h4>
          <p class="muted">{language.t("orchestra.atlas.ownership.doc.committedEmpty")}</p>
        </Show>
        <div class="at-owner-task">
          <small>{language.t("orchestra.atlas.ownership.doc.used")}</small>
          <p>
            <Rich
              text={
                published()
                  ? language.t("orchestra.atlas.ownership.doc.used.published", { id: props.owner.id })
                  : language.t("orchestra.atlas.ownership.doc.used.live", { id: props.owner.id })
              }
            />
          </p>
        </div>
      </div>
    </div>
  )
}
