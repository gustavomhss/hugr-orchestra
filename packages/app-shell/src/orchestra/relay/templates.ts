import { documentProfile, type RelayDocument } from "./client"
import { START } from "./graph"
import type { useRelayCopy } from "./ui"

type Translate = ReturnType<typeof useRelayCopy>["t"]
type CopyKey = Parameters<Translate>[0]

// Templates are the shipped profiles the server seeded. They are offered in the create dialog and under "Start from a
// template" and nowhere else: the library lists the user's own workflows. A profile whose Relay tools are not ported
// yet stays in the list, marked unavailable with its reason, so the choice does not shrink silently.
export const templates = (documents: RelayDocument[]) =>
  documents
    .filter((document) => documentProfile(document) !== undefined)
    .toSorted((a, b) => Number(b.runnable) - Number(a.runnable) || a.name.localeCompare(b.name))

// Human names and one-line bodies for the shipped profiles. A profile without an entry keeps the name the server gave it.
const PROFILE_COPY: Record<string, { name: CopyKey; body: CopyKey }> = {
  tdd_feature: { name: "orchestra.workflows.template.tddFeature", body: "orchestra.workflows.template.tddFeature.body" },
  "wp-execute": { name: "orchestra.workflows.template.wpExecute", body: "orchestra.workflows.template.wpExecute.body" },
  bugfix: { name: "orchestra.workflows.template.bugfix", body: "orchestra.workflows.template.bugfix.body" },
  "safe-refactor": {
    name: "orchestra.workflows.template.safeRefactor",
    body: "orchestra.workflows.template.safeRefactor.body",
  },
  "feature-launch": {
    name: "orchestra.workflows.template.featureLaunch",
    body: "orchestra.workflows.template.featureLaunch.body",
  },
  design: { name: "orchestra.workflows.template.design", body: "orchestra.workflows.template.design.body" },
  planning: { name: "orchestra.workflows.template.planning", body: "orchestra.workflows.template.planning.body" },
  "research-v2": { name: "orchestra.workflows.template.research", body: "orchestra.workflows.template.research.body" },
  "spec-decompose": {
    name: "orchestra.workflows.template.specDecompose",
    body: "orchestra.workflows.template.specDecompose.body",
  },
}

const shipped = (document: RelayDocument) => {
  const profile = documentProfile(document)
  return profile && Object.hasOwn(PROFILE_COPY, profile) ? PROFILE_COPY[profile] : undefined
}

export function templateName(t: Translate, document: RelayDocument) {
  const entry = shipped(document)
  return entry ? t(entry.name) : document.name
}

// A seeded profile's objective without its "name vX — " prefix, for a profile with no written body.
export function templateSummary(document: RelayDocument) {
  const brief = document.nodes.find((node) => node.type === START)?.parameters.relayBrief
  const text = typeof brief === "string" ? brief.replace(/^[\w-]+ v[\d.]+ — /, "") : ""
  return text || document.description
}

export function templateBody(t: Translate, document: RelayDocument) {
  const entry = shipped(document)
  return entry ? t(entry.body) : templateSummary(document) || t("orchestra.workflows.template.copy")
}

// Why a template cannot run, in words for the owner; undefined when it can.
export function templateReason(t: Translate, document: RelayDocument) {
  return document.runnable ? undefined : t("orchestra.workflows.template.toolsMissingTitle")
}
