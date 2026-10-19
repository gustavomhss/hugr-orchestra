import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { AtlasFact, AtlasFactState, AtlasGate } from "../atlas-model"
import { seatName } from "./format"
import { ATLAS_ICONS, type AtlasIconName } from "./icons"

// The Atlas vocabulary chips of specs/atlas-ui/mock/ui.js: plain words first, the Atlas term on hover (data-tip).
type CopyKey = Parameters<ReturnType<typeof useLanguage>["t"]>[0]
export type AtlasReq = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "R10" | "R11"

const STATES = {
  fresh: ["good", "checkc", "orchestra.atlas.kit.state.fresh", "orchestra.atlas.kit.state.fresh.tip"],
  drifted: ["warm", "drift", "orchestra.atlas.kit.state.drifted", "orchestra.atlas.kit.state.drifted.tip"],
  retired: ["", "minusc", "orchestra.atlas.kit.state.retired", "orchestra.atlas.kit.state.retired.tip"],
  pending: ["blue", "clock", "orchestra.atlas.kit.state.pending", "orchestra.atlas.kit.state.pending.tip"],
} as const
const TIERS: Record<string, readonly [CopyKey, CopyKey] | undefined> = {
  T0: ["orchestra.atlas.kit.tier.T0", "orchestra.atlas.kit.tier.T0.tip"],
  T1: ["orchestra.atlas.kit.tier.T1", "orchestra.atlas.kit.tier.T1.tip"],
  T2: ["orchestra.atlas.kit.tier.T2", "orchestra.atlas.kit.tier.T2.tip"],
}
const FAMILIES: Record<string, readonly [CopyKey, CopyKey] | undefined> = {
  advisory: ["orchestra.atlas.kit.family.advisory", "orchestra.atlas.kit.family.advisory.tip"],
  predicate: ["orchestra.atlas.kit.family.predicate", "orchestra.atlas.kit.family.predicate.tip"],
  relation: ["orchestra.atlas.kit.family.relation", "orchestra.atlas.kit.family.relation.tip"],
  negation: ["orchestra.atlas.kit.family.negation", "orchestra.atlas.kit.family.negation.tip"],
  transition: ["orchestra.atlas.kit.family.transition", "orchestra.atlas.kit.family.transition.tip"],
  "test-vacuity": ["orchestra.atlas.kit.family.test-vacuity", "orchestra.atlas.kit.family.test-vacuity.tip"],
}
type Look = readonly [string, AtlasIconName, CopyKey]
const REFUSED: Look = ["bad", "xc", "orchestra.atlas.kit.outcome.refused"]
const OUTCOMES: Record<string, Look | undefined> = {
  admitted: ["good", "checkc", "orchestra.atlas.kit.outcome.admitted"],
  reconciled: ["good", "checkc", "orchestra.atlas.kit.outcome.reconciled"],
  refused: REFUSED,
  unavailable: ["", "minusc", "orchestra.atlas.kit.outcome.unavailable"],
  uncertain: ["warm", "warning", "orchestra.atlas.kit.outcome.uncertain"],
}
const REFUSALS: Record<string, CopyKey | undefined> = {
  "ungrounded": "orchestra.atlas.kit.refusal.ungrounded",
  "unauthorized": "orchestra.atlas.kit.refusal.unauthorized",
  "unratified": "orchestra.atlas.kit.refusal.unratified",
  "contended": "orchestra.atlas.kit.refusal.contended",
  "untrusted-store": "orchestra.atlas.kit.refusal.untrusted-store",
  "untrusted": "orchestra.atlas.kit.refusal.untrusted",
  "closed-slot-violation": "orchestra.atlas.kit.refusal.closed-slot-violation",
  "governance-downgrade": "orchestra.atlas.kit.refusal.governance-downgrade",
  "governance-relocation": "orchestra.atlas.kit.refusal.governance-relocation",
  "canonical-form violation": "orchestra.atlas.kit.refusal.canonical-form-violation",
  "scanner-blocked": "orchestra.atlas.kit.refusal.scanner-blocked",
  "scanner-unavailable": "orchestra.atlas.kit.refusal.scanner-unavailable",
  "ambiguous": "orchestra.atlas.kit.refusal.ambiguous",
  "undetermined-kind": "orchestra.atlas.kit.refusal.undetermined-kind",
  "template-invalid": "orchestra.atlas.kit.refusal.template-invalid",
  "unit-missing-or-ambiguous": "orchestra.atlas.kit.refusal.unit-missing-or-ambiguous",
  "over-cap": "orchestra.atlas.kit.refusal.over-cap",
  "store-partial": "orchestra.atlas.kit.refusal.store-partial",
  "store-unavailable": "orchestra.atlas.kit.refusal.store-unavailable",
  "kind-conflation": "orchestra.atlas.kit.refusal.kind-conflation",
  "unowned": "orchestra.atlas.kit.refusal.unowned",
  "logbook-unauthorized": "orchestra.atlas.kit.refusal.logbook-unauthorized",
  "logbook-duplicate": "orchestra.atlas.kit.refusal.logbook-duplicate",
  "no-own-fold": "orchestra.atlas.kit.refusal.no-own-fold",
  "record-not-found": "orchestra.atlas.kit.refusal.record-not-found",
  "foreign-owner": "orchestra.atlas.kit.refusal.foreign-owner",
  "unit-mismatch": "orchestra.atlas.kit.refusal.unit-mismatch",
  "provider-unconfigured": "orchestra.atlas.kit.refusal.provider-unconfigured",
  "provider-project-mismatch": "orchestra.atlas.kit.refusal.provider-project-mismatch",
  "artifacts-invalid": "orchestra.atlas.kit.refusal.artifacts-invalid",
  "source-revision-not-ancestor": "orchestra.atlas.kit.refusal.source-revision-not-ancestor",
  "context-dirty": "orchestra.atlas.kit.refusal.context-dirty",
  "plan-grounding-stale": "orchestra.atlas.kit.refusal.plan-grounding-stale",
  "grounded-plan-required": "orchestra.atlas.kit.refusal.grounded-plan-required",
  "territory-unavailable": "orchestra.atlas.kit.refusal.territory-unavailable",
  "unit-unavailable": "orchestra.atlas.kit.refusal.unit-unavailable",
  "skill-bytes-changed": "orchestra.atlas.kit.refusal.skill-bytes-changed",
  "anchor-source-drift": "orchestra.atlas.kit.refusal.anchor-source-drift",
  "knowledge-body-budget-exceeded": "orchestra.atlas.kit.refusal.knowledge-body-budget-exceeded",
}
const REQS: Record<AtlasReq, CopyKey> = {
  R1: "orchestra.atlas.kit.req.R1",
  R2: "orchestra.atlas.kit.req.R2",
  R3: "orchestra.atlas.kit.req.R3",
  R4: "orchestra.atlas.kit.req.R4",
  R5: "orchestra.atlas.kit.req.R5",
  R6: "orchestra.atlas.kit.req.R6",
  R7: "orchestra.atlas.kit.req.R7",
  R8: "orchestra.atlas.kit.req.R8",
  R9: "orchestra.atlas.kit.req.R9",
  R10: "orchestra.atlas.kit.req.R10",
  R11: "orchestra.atlas.kit.req.R11",
}
const REMEDIES = {
  reground: "orchestra.atlas.kit.remedy.reground",
  "raise-tier": "orchestra.atlas.kit.remedy.raise-tier",
  "grant-scope": "orchestra.atlas.kit.remedy.grant-scope",
  "token-billy": "orchestra.atlas.kit.remedy.token-billy",
  token: "orchestra.atlas.kit.remedy.token",
} as const

// Words the views also need as plain text (A.familyWord, A.origin, A.refusal, A.REQS, a gate's remedy).
export function useAtlasWords() {
  const language = useLanguage()
  return {
    familyWord: (family: string) => {
      const copy = FAMILIES[family]
      return copy ? language.t(copy[0]) : family
    },
    origin: (fact: { scope: string }) =>
      language.t(fact.scope === "atlas:mined" ? "orchestra.atlas.kit.origin.mined" : "orchestra.atlas.kit.origin.written"),
    refusal: (code: string) => {
      const key = REFUSALS[code]
      return key ? language.t(key) : code
    },
    requirement: (id: AtlasReq) => language.t(REQS[id]),
    remedy: (gate: AtlasGate) => (gate.remedy ? language.t(REMEDIES[gate.remedy], { scope: gate.scope ?? "" }) : ""),
  }
}

export function Icon(props: { name: AtlasIconName; class?: string }) {
  return (
    <svg
      class={props.class ? `wf-ic ${props.class}` : "wf-ic"}
      viewBox="0 0 16 16"
      aria-hidden="true"
      innerHTML={ATLAS_ICONS[props.name]}
    />
  )
}

export function StateChip(props: { state: AtlasFactState | "pending" }) {
  const language = useLanguage()
  return (
    <span class={`at-state ${STATES[props.state][0]}`} data-tip={language.t(STATES[props.state][3])}>
      <Icon name={STATES[props.state][1]} />
      {language.t(STATES[props.state][2])}
    </span>
  )
}

export function TierChip(props: { tier: string }) {
  const language = useLanguage()
  const word = (index: 0 | 1) => {
    const copy = TIERS[props.tier]
    return copy ? language.t(copy[index]) : props.tier
  }
  return (
    <span class="at-tier-chip" data-tip={word(1)}>
      {word(0)}
    </span>
  )
}

export function FamilyChip(props: { family: string }) {
  const language = useLanguage()
  const word = (index: 0 | 1) => {
    const copy = FAMILIES[props.family]
    return copy ? language.t(copy[index]) : props.family
  }
  return (
    <span class="at-origin" data-tip={word(1)}>
      {word(0)}
    </span>
  )
}

// At most two chips on a row: the state, then the tier when it governs, else the family when it is not Stated.
export function Second(props: { fact: AtlasFact }) {
  return (
    <Show
      when={props.fact.tier !== "T2"}
      fallback={
        <Show when={props.fact.family && props.fact.family !== "advisory"}>
          <FamilyChip family={props.fact.family} />
        </Show>
      }
    >
      <TierChip tier={props.fact.tier} />
    </Show>
  )
}

// Every memory write ends in one of four outcomes, plus "already saved" when reconciled.
export function OutcomeChip(props: { outcome: string; reconciled?: boolean }) {
  const language = useLanguage()
  const look = () => OUTCOMES[props.reconciled ? "reconciled" : props.outcome] ?? REFUSED
  return (
    <span class={`at-state ${look()[0]}`}>
      <Icon name={look()[1]} />
      {language.t(look()[2])}
    </span>
  )
}

export function Help(props: { text: string }) {
  return (
    <button type="button" class="at-help" data-tip={props.text} aria-label={props.text}>
      ?
    </button>
  )
}

export function HashV(props: { hash?: string | null }) {
  return (
    <Show when={props.hash} fallback="—">
      {(hash) => (
        <code class="at-hashv" data-tip={hash()}>
          {hash().slice(0, 8)}…
        </code>
      )}
    </Show>
  )
}

export function Seat(props: { id: string }) {
  const name = () => seatName(props.id)
  return (
    <span class="at-seat">
      <i>{name()[0]}</i>
      {name()}
    </span>
  )
}

export function FilePath(props: { path: string }) {
  const cut = () => props.path.lastIndexOf("/")
  return (
    <code class="at-path">
      <Show when={cut() >= 0}>
        <span>{props.path.slice(0, cut() + 1)}</span>
      </Show>
      {props.path.slice(cut() + 1)}
    </code>
  )
}

// D13: a control that needs a new capability shows this marker; the full text is its tooltip.
export function NewCap(props: { id: AtlasReq }) {
  const language = useLanguage()
  const words = useAtlasWords()
  return (
    <span class="at-newcap" data-tip={language.t("orchestra.atlas.kit.newcap.tip", { id: props.id, text: words.requirement(props.id) })}>
      <Icon name="sparkle" />
      {language.t("orchestra.atlas.kit.newcap", { id: props.id })}
    </span>
  )
}

export function NewDot(props: { id: AtlasReq }) {
  const language = useLanguage()
  const words = useAtlasWords()
  return <i class="at-newdot" data-tip={language.t("orchestra.atlas.kit.newdot.tip", { id: props.id, text: words.requirement(props.id) })} />
}

export function Badge(props: { label: string; tone?: string }) {
  return <span class={props.tone ? `mx-badge ${props.tone}` : "mx-badge"}>{props.label}</span>
}
