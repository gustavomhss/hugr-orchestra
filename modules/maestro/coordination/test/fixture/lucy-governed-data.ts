import fs from "node:fs/promises"
import path from "node:path"
import { ReviewItem } from "@orchestra/core/review-toolkit/item"

export const HOST_FACTS = "Host check facts (embed these checks and blockers verbatim; host authority, not model text):\n"
export const HOST_OUTCOMES = "Host outcomes (initial pack, rule, fingerprint and outcome; generation stays host-only):\n"
export const CONFIRMED = "confirmed findings, as the host merged them"
export const field = (value: string) => ({ value, source: "stakeholder" })
export const workCard = [
  "## Definition of Done", "The report downloads as CSV.",
  "## Invariants", "Existing reports keep their format.",
  "## Quality Standards", "Typed, no new dependencies.",
  "## Completeness Criteria", "Every report column is exported.",
  "## Success Criteria", "The owner downloads a CSV.",
].join("\n")
export const validationChecks = [{ id: "spec", status: "PASS", detail: "docs/export.md committed" }]

export const QUOTE = "The report downloads as CSV."
export const QUOTE_LINE = 3
export const LOGIC_LENS = "correctness-logic"
export const PLANTED = plantedItem()

export async function retainedArtifacts(store: string) {
  const names = await fs.readdir(store).catch(() => [])
  const files = await Promise.all(names.filter((name) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)).map(async (name) => {
    const file = path.join(store, name, "retained.json")
    return await Bun.file(file).exists() ? file : undefined
  }))
  return files.filter((file) => file !== undefined)
}

export function plantedItem() {
  const rule = "export-claim"
  const snippetDigest = ReviewItem.snippetDigest(QUOTE)
  return {
    fingerprint: ReviewItem.fingerprint({ pack: "gitleaks", rule, path: "docs/export.md", snippetDigest }),
    class: "logic.invariant",
    lens: LOGIC_LENS,
    pack: "gitleaks",
    rule,
    ruleStatus: "probation" as const,
    severity: "P1" as const,
    path: "docs/export.md",
    line: QUOTE_LINE,
    snippetDigest,
    sources: [{ pack: "gitleaks", rule }],
    triage: "planted",
    onChangedLine: true,
  }
}

export function fenced(tag: string, value: unknown) {
  return "```" + tag + "\n" + JSON.stringify(value) + "\n```"
}

export function eligibleEntry() {
  return fenced("review-entry", {
    status: "eligible",
    context: { intent: "nothing found", acceptance: "nothing found", invariants: "nothing found", assumptions: "nothing found" },
    overlays: { confirmed: [], declined: [], added: [] },
    slices: [],
  })
}

export function lensReturn(brief: string) {
  const lens = /Stage: hunt, lens ([^,]+)/.exec(brief)?.[1] ?? LOGIC_LENS
  const raised = lens === LOGIC_LENS
  return fenced("review-lens", {
    lens,
    candidates: raised ? [{
      class: "logic.invariant",
      node: "lucy-review-prove-quote",
      path: "docs/export.md",
      line: QUOTE_LINE,
      severity: "P1",
      trigger: "The export claim is not held by the spec.",
      quote: QUOTE,
      source: PLANTED.fingerprint,
    }] : [],
    observations: [],
    hunks: raised ? [{ path: "docs/export.md", startLine: 1, endLine: QUOTE_LINE }] : [],
    items: raised ? [{ fingerprint: PLANTED.fingerprint, pursued: true }] : [],
  })
}

export function verifierReturn(brief: string) {
  const klass = /Stage: verify, class (\S+)\./.exec(brief)?.[1] ?? "logic.invariant"
  if (klass !== "logic.invariant") return fenced("review-verify", { class: klass, results: [] })
  const parsed = /<data name="candidates">\n([\s\S]*?)\n<\/data>/.exec(brief)?.[1]
  const candidates = JSON.parse(parsed ?? "[]") as { id: string; path: string; line: number }[]
  const hit = candidates.find((item) => item.path === "docs/export.md" && item.line === QUOTE_LINE)
  if (!hit) return fenced("review-verify", { class: klass, results: [] })
  return fenced("review-verify", {
    class: klass,
    results: [{
      candidate: hit.id,
      state: "confirmed",
      rung: "quote",
      evidence: { kind: "quote", path: "docs/export.md", startLine: QUOTE_LINE, endLine: QUOTE_LINE },
      history: [{ option: "quote", outcome: "settled" }],
    }],
  })
}

export const line = (text: string, label: string) => text.split("\n").find((part) => part.startsWith(label))?.slice(label.length)

export function requireBindings(text: string, label: string) {
  const row = text.split("\n").find((item) => item.startsWith("Bindings: "))
  if (!row) throw new Error(`${label} refused before bindings: ${text.slice(0, 500)}`)
  return JSON.parse(row.slice("Bindings: ".length)) as {
    planRevisionID?: string
    contextRecordID?: string
    contextHash?: string
    validationRecordID?: string
  }
}

export function requireRecordID(id: string | undefined, label: string) {
  if (!id?.startsWith("evt_")) throw new Error(`${label} has no event id: ${id ?? "missing"}`)
  return id
}
