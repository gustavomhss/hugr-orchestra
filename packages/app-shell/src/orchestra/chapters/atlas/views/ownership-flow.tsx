import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasModel } from "../atlas-model"
import { type AtlasRoute, withQuery } from "../atlas-route"
import { Icon, TierChip, useAtlasWords } from "../kit/chips"
import { Btn, Tech } from "../kit/controls"
import { num, seatName } from "../kit/format"
import { AtlasLink, Rich } from "../kit/text"
import { firstPublished, lastFolder, otherUnit, SAMPLE_UNIT, skillName } from "./ownership-data"

// The Own protocol's publishing flow and its demos (specs/atlas-ui/mock/views-own.js:15-23, 89-131). Badges say how
// far each part is: Designed (spec only), Built (code exists), Runs (something actually calls it today).
const BADGES = {
  D: ["orchestra.atlas.ownership.badge.designed", ""],
  B: ["orchestra.atlas.ownership.badge.built", "blue"],
  R: ["orchestra.atlas.ownership.badge.runs", "good"],
} as const

const STEPS = [
  {
    id: "know",
    actor: "orchestra.atlas.ownership.step.know.actor",
    icon: "atlas",
    title: "orchestra.atlas.ownership.step.know.title",
    line: "orchestra.atlas.ownership.step.know.line",
    state: "R",
    detail: [
      "orchestra.atlas.ownership.step.know.detail.1",
      "orchestra.atlas.ownership.step.know.detail.2",
      "orchestra.atlas.ownership.step.know.detail.3",
    ],
    code: "retrieval/src/own.ts:161 · adapter-io/src/own-source.ts:150",
  },
  {
    id: "review",
    actor: "orchestra.atlas.ownership.step.review.actor",
    icon: "eye",
    title: "orchestra.atlas.ownership.step.review.title",
    line: "orchestra.atlas.ownership.step.review.line",
    state: "D",
    detail: ["orchestra.atlas.ownership.step.review.detail.1", "orchestra.atlas.ownership.step.review.detail.2"],
    code: "retrieval/src/own-snapshot.ts:192",
  },
  {
    id: "publish",
    actor: "orchestra.atlas.ownership.step.publish.actor",
    icon: "download",
    title: "orchestra.atlas.ownership.step.publish.title",
    line: "orchestra.atlas.ownership.step.publish.line",
    state: "R",
    detail: ["orchestra.atlas.ownership.step.publish.detail.1", "orchestra.atlas.ownership.step.publish.detail.2"],
    code: "scripts/materialize-own-snapshot.mjs:117",
  },
  {
    id: "guard",
    actor: "orchestra.atlas.ownership.step.guard.actor",
    icon: "shield",
    title: "orchestra.atlas.ownership.step.guard.title",
    line: "orchestra.atlas.ownership.step.guard.line",
    state: "R",
    detail: ["orchestra.atlas.ownership.step.guard.detail.1", "orchestra.atlas.ownership.step.guard.detail.2"],
    code: "own-snapshot.ts:235 · .github/workflows/test.yml:129",
  },
  {
    id: "verify",
    actor: "orchestra.atlas.ownership.step.verify.actor",
    icon: "lock",
    title: "orchestra.atlas.ownership.step.verify.title",
    line: "orchestra.atlas.ownership.step.verify.line",
    state: "R",
    detail: ["orchestra.atlas.ownership.step.verify.detail.1", "orchestra.atlas.ownership.step.verify.detail.2"],
    code: "orchestra maestro/atlas-source.ts:53",
  },
  {
    id: "use",
    actor: "orchestra.atlas.ownership.step.use.actor",
    icon: "agents",
    title: "orchestra.atlas.ownership.step.use.title",
    line: "orchestra.atlas.ownership.step.use.line",
    state: "R",
    detail: ["orchestra.atlas.ownership.step.use.detail.1", "orchestra.atlas.ownership.step.use.detail.2"],
    code: "maestro/plan-revision.ts:153 · context-record.ts:106 · tool/atlas-context.ts:40",
  },
] as const

// [title, text, badge] of the parts planned around the flow.
const GHOST = [
  ["orchestra.atlas.ownership.catalog", "orchestra.atlas.ownership.ghost.catalog.text", "B"],
  ["orchestra.atlas.ownership.ghost.impact", "orchestra.atlas.ownership.ghost.impact.text", "B"],
  ["orchestra.atlas.ownership.ghost.reclassify", "orchestra.atlas.ownership.ghost.reclassify.text", "D"],
] as const

// The simulated HOLD chain: [title, state when the bytes match, state after the edit, the hold's code].
const CHAIN = [
  [
    "orchestra.atlas.ownership.chain.source",
    "orchestra.atlas.ownership.chain.source.ok",
    "orchestra.atlas.ownership.chain.source.bad",
    "artifacts-invalid",
  ],
  [
    "orchestra.atlas.ownership.chain.skill",
    "orchestra.atlas.ownership.chain.skill.ok",
    "orchestra.atlas.ownership.chain.skill.bad",
    "artifacts-invalid",
  ],
  [
    "orchestra.atlas.ownership.chain.plan",
    "orchestra.atlas.ownership.chain.plan.ok",
    "orchestra.atlas.ownership.chain.plan.bad",
    "plan-grounding-stale",
  ],
  [
    "orchestra.atlas.ownership.chain.gates",
    "orchestra.atlas.ownership.chain.gates.ok",
    "orchestra.atlas.ownership.chain.gates.bad",
    "contextIsCurrent",
  ],
] as const

// The four meanings of "owner": [title, text, badge].
const OWNER_WORDS = [
  ["orchestra.atlas.ownership.words.territory", "orchestra.atlas.ownership.words.territory.text", "B"],
  ["orchestra.atlas.ownership.words.line", "orchestra.atlas.ownership.words.line.text", "R"],
  ["orchestra.atlas.ownership.words.suggested", "orchestra.atlas.ownership.words.suggested.text", "B"],
  ["orchestra.atlas.ownership.words.seat", "orchestra.atlas.ownership.words.seat.text", "D"],
] as const

const TIERS = [
  ["T0", "orchestra.atlas.ownership.tiers.T0"],
  ["T1", "orchestra.atlas.ownership.tiers.T1"],
  ["T2", "orchestra.atlas.ownership.tiers.T2"],
] as const

// Seat names for the copy that names seats: the copy holds placeholders, never names (AGENTS.md, Agent Names).
const SEATS = { backend: seatName("backend"), jimmy: seatName("jimmy"), archie: seatName("archie"), rosie: seatName("rosie") }

export function OwnershipFlow(props: { model: AtlasModel; route: AtlasRoute }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const at = () => STEPS.find((step) => step.id === props.route.query.step) ?? STEPS[4]
  const edited = () => props.route.query.edit === "1"
  const name = () => props.route.query.name ?? SAMPLE_UNIT
  const published = () => firstPublished(props.model.snapshot)
  return (
    <>
      <h2 class="at-own-h">{language.t("orchestra.atlas.ownership.flow.title")}</h2>
      <ol class="at-own-flow">
        <For each={STEPS}>
          {(step, index) => (
            <li>
              <AtlasLink
                class={step.id === at().id ? "on" : ""}
                href={withQuery(props.route, { step: step.id, fact: undefined, why: undefined })}
              >
                <span class="at-own-ic">
                  <Icon name={step.icon} />
                </span>
                <small>{language.t(step.actor)}</small>
                <b>
                  {index() + 1}. {language.t(step.title)}
                </b>
                <Pill k={step.state} />
              </AtlasLink>
            </li>
          )}
        </For>
      </ol>
      <section class="at-own-detail">
        <div>
          <h2>
            <Icon name={at().icon} />
            {language.t(at().title)} <small>{language.t(at().actor)}</small>
          </h2>
          <p class="at-lead">
            <Rich text={language.t(at().line)} />
          </p>
          <ul class="at-gen-facts">
            <For each={at().detail}>
              {(key) => (
                <li>
                  <Icon name="checkc" />
                  {language.t(key, SEATS)}
                </li>
              )}
            </For>
          </ul>
          <Tech rows={[[language.t("orchestra.atlas.ownership.step.code"), <code>{at().code}</code>]]} />
        </div>
        <div class="at-own-ghost">
          <div class="at-gen-sample-k">
            <Icon name="info" />
            {language.t("orchestra.atlas.ownership.ghost.title")}
          </div>
          <For each={GHOST}>
            {(row) => (
              <div class="at-own-ghostrow">
                <b>{language.t(row[0])}</b>
                <Pill k={row[2]} />
                <p>{language.t(row[1])}</p>
              </div>
            )}
          </For>
        </div>
      </section>

      <div class="at-own-grid">
        <Show when={published()}>
          {(first) => (
            <section class="at-panel">
              <header class="at-panel-head">
                <div>
                  <h3>
                    <Icon name="drift" />
                    {language.t("orchestra.atlas.ownership.hold.title")}
                  </h3>
                  <small>
                    {language.plural("orchestra.atlas.ownership.hold.purpose", first().pack.sourceFiles, {
                      n: num(first().pack.sourceFiles),
                      unit: first().unit,
                    })}
                  </small>
                </div>
                <Btn
                  label={language.t(edited() ? "orchestra.atlas.ownership.hold.undo" : "orchestra.atlas.ownership.hold.edit")}
                  primary={!edited()}
                  icon={edited() ? "back" : "code"}
                  onClick={() => atlas.setQuery({ edit: edited() ? undefined : "1" })}
                />
              </header>
              <div class="at-panel-body">
                <div class="at-own-chain">
                  <For each={CHAIN}>
                    {(link, index) => (
                      <div
                        class={`at-own-link ${edited() ? "bad" : "good"}`}
                        style={{ "animation-delay": `${index() * 120}ms` }}
                      >
                        <span>
                          <Icon name={edited() ? "lock" : "checkc"} />
                        </span>
                        <div>
                          <b>{language.t(link[0], { name: skillName(first().unit).slice(0, 6) })}</b>
                          <small>{language.t(edited() ? link[2] : link[1])}</small>
                        </div>
                        <code>{edited() ? link[3] : ""}</code>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={edited()}>
                  <p class="mx-note">
                    {language.t("orchestra.atlas.ownership.hold.unblock", { refusal: words.refusal("artifacts-invalid") })}
                  </p>
                </Show>
              </div>
            </section>
          )}
        </Show>

        <section class="at-panel">
          <header class="at-panel-head">
            <div>
              <h3>
                <Icon name="hash" />
                {language.t("orchestra.atlas.ownership.names.title")}
              </h3>
              <small>{language.t("orchestra.atlas.ownership.names.purpose")}</small>
            </div>
          </header>
          <div class="at-panel-body">
            <label class="mx-field">
              <span>{language.t("orchestra.atlas.ownership.names.unit")}</span>
              <input
                value={name()}
                onChange={(event) => atlas.setQuery({ name: event.currentTarget.value.trim() || SAMPLE_UNIT })}
              />
            </label>
            <div class="at-own-names">
              <div>
                <small>{name()}</small>
                <code>{language.t("orchestra.atlas.ownership.skill", { name: skillName(name()) })}</code>
              </div>
              <div>
                <small>{otherUnit(name())}</small>
                <code>{language.t("orchestra.atlas.ownership.skill", { name: skillName(otherUnit(name())) })}</code>
              </div>
              <div class="bad">
                <small>{language.t("orchestra.atlas.ownership.names.old")}</small>
                <code>{language.t("orchestra.atlas.ownership.skill", { name: lastFolder(name()) })}</code>
                <span>{language.t("orchestra.atlas.ownership.names.collides")}</span>
              </div>
            </div>
            <Show when={published()}>
              {(first) => (
                <p class="mx-note">
                  <Rich
                    text={language.t("orchestra.atlas.ownership.names.published", {
                      unit: first().unit,
                      name: skillName(first().unit),
                    })}
                  />
                </p>
              )}
            </Show>
          </div>
        </section>
      </div>

      <Show when={published()}>
        {(first) => (
          <section class="at-panel at-arch-block">
            <header class="at-panel-head">
              <div>
                <h3>
                  <Icon name="fact" />
                  {language.t("orchestra.atlas.ownership.committed.title")}
                </h3>
                <small>
                  <Rich
                    text={language.t("orchestra.atlas.ownership.committed.purpose", { name: skillName(first().unit) })}
                  />
                </small>
              </div>
            </header>
            <div class="at-own-skill">
              <div class="at-own-receipt">
                <div class="at-gen-sample-k">
                  <Icon name="lock" />
                  {language.t("orchestra.atlas.ownership.committed.receipt")}
                </div>
                <dl class="at-kv">
                  <dt>{language.t("orchestra.atlas.ownership.committed.revision")}</dt>
                  <dd>
                    <code class="at-sha">{props.model.snapshot.revision.slice(0, 12)}</code>
                  </dd>
                  <dt>{language.t("orchestra.atlas.ownership.committed.sources")}</dt>
                  <dd>
                    {language.t("orchestra.atlas.ownership.committed.sources.value", {
                      n: num(first().pack.sourceFiles),
                    })}
                  </dd>
                  <Show when={first().pack.invariants.length}>
                    <dt>{language.t("orchestra.atlas.ownership.committed.facts")}</dt>
                    <dd>
                      <code>{first().pack.invariants.map((rule) => rule.nodeId).join(", ")}</code>
                    </dd>
                  </Show>
                </dl>
              </div>
              <div class="at-own-body">
                <h4>{language.t("orchestra.atlas.ownership.doc.role")}</h4>
                <p>{first().pack.summary}</p>
                <h4>{language.t("orchestra.atlas.ownership.doc.terrain")}</h4>
                <p>
                  {language.t("orchestra.atlas.ownership.committed.owner", { owner: first().pack.owner })}
                  {" · "}
                  {language.t("orchestra.atlas.ownership.committed.tier")} <TierChip tier={first().pack.tier} />
                  {" · "}
                  {language.plural("orchestra.atlas.ownership.files", first().pack.sourceFiles, {
                    n: num(first().pack.sourceFiles),
                  })}
                </p>
                <h4>{language.t("orchestra.atlas.ownership.doc.governing")}</h4>
                <Show
                  when={first().pack.invariants.length}
                  fallback={<p class="muted">{language.t("orchestra.atlas.ownership.doc.none")}</p>}
                >
                  <For each={first().pack.invariants}>
                    {(rule) => (
                      <p>
                        <TierChip tier={rule.tier} /> {rule.claim}
                      </p>
                    )}
                  </For>
                </Show>
                <h4>{language.t("orchestra.atlas.ownership.committed.rest")}</h4>
                <p class="muted">{language.t("orchestra.atlas.ownership.committed.empty")}</p>
              </div>
            </div>
          </section>
        )}
      </Show>

      <section class="at-panel at-arch-block">
        <header class="at-panel-head">
          <div>
            <h3>
              <Icon name="territory" />
              {language.t("orchestra.atlas.ownership.words.title")}
            </h3>
            <small>{language.t("orchestra.atlas.ownership.words.purpose")}</small>
          </div>
        </header>
        <div class="at-own-owners">
          <For each={OWNER_WORDS}>
            {(row) => (
              <div>
                <b>{language.t(row[0])}</b>
                <Pill k={row[2]} />
                <p>{language.t(row[1], SEATS)}</p>
              </div>
            )}
          </For>
        </div>
        <div class="at-own-tiers">
          <For each={TIERS}>
            {(row) => (
              <div>
                <TierChip tier={row[0]} />
                <p>{language.t(row[1])}</p>
              </div>
            )}
          </For>
        </div>
        <div class="at-outside">
          <Icon name="shield" />
          <span>
            <Rich text={language.t("orchestra.atlas.ownership.outside")} />
          </span>
        </div>
      </section>
    </>
  )
}

// The mock's pill(k): how far a part is built.
function Pill(props: { k: keyof typeof BADGES }) {
  const language = useLanguage()
  return <span class={`at-own-badge ${BADGES[props.k][1]}`}>{language.t(BADGES[props.k][0])}</span>
}
