import { Buffer } from "node:buffer"
import { id } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import type { OwnPackPlus } from "./own-model.js"
import type { OwnUnit } from "./types.js"

export const OWN_ARTIFACT_SCHEMA = 1
export const OWN_ARTIFACT_ROOT = ".opencode/skills/own"

const RECEIPT_BEGIN = "<!-- own-receipt:begin -->"
const RECEIPT_END = "<!-- own-receipt:end -->"

export type OwnGraphCoverage = "COMPLETE" | "UNDER_APPROX"

export interface StaticOwnReceipt {
  readonly schemaVersion: typeof OWN_ARTIFACT_SCHEMA
  readonly unit: string
  readonly skillName: string
  readonly snapshot: string
  readonly sourceRevision: string
  readonly graphCoverage: OwnGraphCoverage
  readonly sourceBlobs: Readonly<Record<string, string>>
  readonly factIds: readonly string[]
  readonly drillUnits: readonly string[]
  readonly contentHash: string
}

export interface StaticOwnArtifact {
  readonly path: string
  readonly content: string
  readonly receipt: StaticOwnReceipt
}

export interface StaticOwnInput {
  readonly unit: OwnUnit
  readonly snapshot: string
  readonly sourceRevision: string
  readonly graphCoverage: OwnGraphCoverage
  /** Git blob identity for every source file whose current bytes this skill states. */
  readonly sourceBlobs: Readonly<Record<string, string>>
  readonly pack: OwnPackPlus
}

export type StaticOwnVerification =
  | { readonly status: "READY"; readonly artifact: StaticOwnArtifact }
  | { readonly status: "HOLD"; readonly reason: "MALFORMED" | "UNDER_APPROX" | "STALE" | "MISMATCH" }

export interface StaticOwnFile {
  readonly path: string
  readonly content: string
}

export interface StaticOwnSetInput {
  /** Current, non-empty canonical coverage set. Each entry is independently composed from head Atlas state. */
  readonly expected: readonly StaticOwnInput[]
  readonly base: readonly StaticOwnFile[]
  readonly head: readonly StaticOwnFile[]
  readonly impact: {
    readonly coverage: OwnGraphCoverage
    readonly impactedUnits: readonly string[]
    readonly removedUnits: readonly string[]
  }
}

export type StaticOwnSetVerification =
  | { readonly status: "READY" }
  | { readonly status: "HOLD"; readonly issues: readonly string[] }

export type StaticOwnFreshness =
  | { readonly status: "READY" }
  | { readonly status: "HOLD"; readonly staleSources: readonly string[] }

export interface StaticOwnFreshnessSetInput {
  /** Genesis-owned canonical unit coverage. CI checks this list, never infers scope from Markdown prose. */
  readonly expectedUnits: readonly string[]
  readonly base: readonly StaticOwnFile[]
  readonly head: readonly StaticOwnFile[]
  readonly impact: {
    readonly coverage: OwnGraphCoverage
    readonly impactedUnits: readonly string[]
    readonly removedUnits: readonly string[]
  }
  readonly currentBlob: (path: string) => string | undefined
}

/** Injective canonical-unit encoding. Leaf handles are display-only and may collide. */
export function staticOwnSkillName(unit: string): string {
  return `own_${Buffer.from(unit, "utf8").toString("base64url")}`
}

export function staticOwnArtifactPath(unit: string): string {
  return `${OWN_ARTIFACT_ROOT}/${Buffer.from(unit, "utf8").toString("base64url")}/SKILL.md`
}

function claimOf(fact: GroundedFact): string {
  if (fact.kind === "advisory") return fact.claimNorm
  if (fact.kind === "predicate") return fact.check.kind === "assertion" ? fact.check.expr : fact.check.query
  return ""
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort()
}

function body(input: StaticOwnInput, skillName: string): string {
  const { pack } = input
  return [
    `# ${skillName}`,
    "",
    "## Role",
    "",
    pack.unit || "(no role filed)",
    "",
    "## Terrain",
    "",
    `- Owner: ${pack.shape.owner || "(unassigned)"}`,
    `- Tier: ${pack.shape.tier}`,
    ...pack.shape.contents.map((node) => `- Contains: \`${node}\``),
    "",
    "## Governing Facts",
    "",
    ...pack.invariants.map((fact) => `- [${fact.tier}] \`${fact.nodeId}\`: ${fact.claim}`),
    ...pack.gotchas.map((fact) => `- [${fact.tier}] \`${fact.id}\`: ${claimOf(fact)}`),
    "",
    "## Advisory Facts",
    "",
    ...pack.advisory.map((fact) => `- [${fact.tier}] \`${fact.nodeId}\` [${fact.freshness}]: ${fact.claim}`),
    "",
    "## Relations",
    "",
    ...pack.edges.dependents.map((node) => `- Dependent: \`${node}\``),
    ...pack.edges.dependencies.map((node) => `- Dependency: \`${node}\``),
    "",
    "## Drill",
    ...(pack.drill.finer.length + pack.pullReachable.length === 0
      ? []
      : [
          "",
          ...pack.drill.finer.map((unit) => `- Load \`${staticOwnSkillName(unit.id)}\` for \`${unit.id}\`.`),
          ...pack.pullReachable.map((node) => `- Pull-reachable fact: \`${node}\`.`),
        ]),
  ].join("\n")
}

function receiptOf(input: StaticOwnInput, skillName: string, content: string): StaticOwnReceipt {
  const factIds = uniqueSorted([
    ...input.pack.invariants.map((fact) => String(fact.nodeId)),
    ...input.pack.gotchas.map((fact) => String(fact.id)),
    ...input.pack.advisory.map((fact) => String(fact.nodeId)),
  ])
  const drillUnits = uniqueSorted(input.pack.drill.finer.map((unit) => unit.id))
  return {
    schemaVersion: OWN_ARTIFACT_SCHEMA,
    unit: input.unit.id,
    skillName,
    snapshot: input.snapshot,
    sourceRevision: input.sourceRevision,
    graphCoverage: input.graphCoverage,
    sourceBlobs: Object.fromEntries(Object.entries(input.sourceBlobs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    factIds,
    drillUnits,
    contentHash: String(
      id({
        unit: input.unit.id,
        skillName,
        snapshot: input.snapshot,
        sourceRevision: input.sourceRevision,
        graphCoverage: input.graphCoverage,
        content,
      }),
    ),
  }
}

function hasStaleFact(pack: OwnPackPlus): boolean {
  return (
    pack.invariants.some((fact) => fact.freshness !== "FRESH") ||
    pack.advisory.some((fact) => fact.freshness !== "FRESH") ||
    pack.gotchas.some((fact) => fact.freshness !== "FRESH")
  )
}

export function materializeStaticOwn(input: StaticOwnInput): StaticOwnArtifact {
  if (input.unit.id.length === 0 || input.snapshot.length === 0 || input.sourceRevision.length === 0) {
    throw new Error("static Own materialization requires non-empty unit, snapshot, and sourceRevision")
  }
  if (hasStaleFact(input.pack)) throw new Error(`static Own materialization requires fresh facts: ${input.unit.id}`)
  const skillName = staticOwnSkillName(input.unit.id)
  const rendered = body(input, skillName)
  const receipt = receiptOf(input, skillName, rendered)
  const content = `${[
    "---",
    `name: ${skillName}`,
    `description: Atlas ownership context for ${input.unit.id}.`,
    "---",
    "",
    RECEIPT_BEGIN,
    JSON.stringify(receipt),
    RECEIPT_END,
    "",
    rendered,
  ].join("\n")}\n`
  return { path: staticOwnArtifactPath(input.unit.id), content, receipt }
}

function isReceipt(value: unknown): value is StaticOwnReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === OWN_ARTIFACT_SCHEMA &&
    typeof record.unit === "string" &&
    typeof record.skillName === "string" &&
    typeof record.snapshot === "string" &&
    typeof record.sourceRevision === "string" &&
    (record.graphCoverage === "COMPLETE" || record.graphCoverage === "UNDER_APPROX") &&
    typeof record.sourceBlobs === "object" &&
    record.sourceBlobs !== null &&
    !Array.isArray(record.sourceBlobs) &&
    Object.entries(record.sourceBlobs).every(([path, blob]) => isRepoPath(path) && isGitBlob(blob)) &&
    Array.isArray(record.factIds) &&
    record.factIds.every((value) => typeof value === "string") &&
    Array.isArray(record.drillUnits) &&
    record.drillUnits.every((value) => typeof value === "string") &&
    typeof record.contentHash === "string"
  )
}

export function parseStaticOwnReceipt(content: string): StaticOwnReceipt | undefined {
  const begin = content.indexOf(RECEIPT_BEGIN)
  const end = content.indexOf(RECEIPT_END)
  if (
    begin === -1 ||
    end === -1 ||
    end <= begin ||
    content.indexOf(RECEIPT_BEGIN, begin + 1) !== -1 ||
    content.indexOf(RECEIPT_END, end + 1) !== -1
  )
    return undefined
  try {
    const value = JSON.parse(content.slice(begin + RECEIPT_BEGIN.length, end).trim()) as unknown
    return isReceipt(value) ? value : undefined
  } catch {
    return undefined
  }
}

function isRepoPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  )
}

function isGitBlob(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
}

/**
 * CoreLink-style source freshness: static artifacts carry immutable blob anchors, so CI needs no historical
 * Atlas store to detect code drift. Whole-file anchors are deliberately conservative until Own carries spans.
 */
export function verifyStaticOwnFreshness(
  content: string,
  currentBlob: (path: string) => string | undefined,
): StaticOwnFreshness {
  const receipt = parseStaticOwnReceipt(content)
  if (receipt === undefined || Object.keys(receipt.sourceBlobs).length === 0)
    return { status: "HOLD", staleSources: ["<missing-source-anchor>"] }
  const stale = Object.entries(receipt.sourceBlobs)
    .filter(([path, blob]) => currentBlob(path) !== blob)
    .map(([path]) => path)
    .sort()
  return stale.length === 0 ? { status: "READY" } : { status: "HOLD", staleSources: stale }
}

/**
 * CoreLink-style PR gate: it proves artifact coverage and source freshness, not agent-authored prose truth.
 * Semantic review remains human judgment; source anchors make unreviewed code drift mechanically impossible.
 */
export function verifyStaticOwnFreshnessSet(input: StaticOwnFreshnessSetInput): StaticOwnSetVerification {
  const issues: string[] = []
  if (input.impact.coverage !== "COMPLETE") issues.push("impact coverage is UNDER_APPROX")
  if (input.expectedUnits.length === 0) issues.push("expected Own coverage is empty")
  const expected = new Set<string>()
  for (const unit of input.expectedUnits) {
    if (expected.has(unit)) issues.push(`duplicate expected unit: ${unit}`)
    expected.add(unit)
  }
  const head = new Map<string, StaticOwnFile>()
  const base = new Map<string, StaticOwnFile>()
  for (const file of input.base) base.set(file.path, file)
  for (const file of input.head) {
    if (head.has(file.path)) issues.push(`duplicate head artifact path: ${file.path}`)
    head.set(file.path, file)
    const receipt = parseStaticOwnReceipt(file.content)
    if (receipt === undefined) {
      issues.push(`malformed artifact: ${file.path}`)
      continue
    }
    if (file.path !== staticOwnArtifactPath(receipt.unit)) issues.push(`non-canonical artifact path: ${file.path}`)
    if (receipt.skillName !== staticOwnSkillName(receipt.unit)) issues.push(`non-canonical skill name: ${receipt.unit}`)
    if (!expected.has(receipt.unit)) issues.push(`unexpected artifact unit: ${receipt.unit}`)
    const freshness = verifyStaticOwnFreshness(file.content, input.currentBlob)
    if (freshness.status === "HOLD") issues.push(`stale artifact ${receipt.unit}: ${freshness.staleSources.join(", ")}`)
  }
  const impacted = new Set(input.impact.impactedUnits)
  for (const unit of expected) {
    const path = staticOwnArtifactPath(unit)
    const file = head.get(path)
    if (file === undefined) {
      issues.push(`missing artifact: ${unit}`)
      continue
    }
    if (!impacted.has(unit)) {
      const prior = base.get(path)
      if (prior === undefined || prior.content !== file.content) issues.push(`unimpacted artifact changed: ${unit}`)
    }
  }
  for (const unit of input.impact.removedUnits) {
    if (head.has(staticOwnArtifactPath(unit))) issues.push(`removed unit artifact remains: ${unit}`)
  }
  return issues.length === 0 ? { status: "READY" } : { status: "HOLD", issues: uniqueSorted(issues) }
}

/** Compare committed bytes with an independently recomposed artifact. Never trust receipt self-report. */
export function verifyStaticOwn(input: StaticOwnInput, content: string): StaticOwnVerification {
  const receipt = parseStaticOwnReceipt(content)
  if (receipt === undefined) return { status: "HOLD", reason: "MALFORMED" }
  if (receipt.graphCoverage === "UNDER_APPROX" || input.graphCoverage === "UNDER_APPROX")
    return { status: "HOLD", reason: "UNDER_APPROX" }
  if (hasStaleFact(input.pack)) return { status: "HOLD", reason: "STALE" }
  const expected = materializeStaticOwn(input)
  if (content !== expected.content || JSON.stringify(receipt) !== JSON.stringify(expected.receipt))
    return { status: "HOLD", reason: "MISMATCH" }
  return { status: "READY", artifact: expected }
}

/**
 * PR-gate core. Inputs come from Atlas graph authority; committed receipts are evidence only and never the
 * oracle. No empty expected set may pass: an extraction failure must not look like a fully covered project.
 */
export function verifyStaticOwnSet(input: StaticOwnSetInput): StaticOwnSetVerification {
  const issues: string[] = []
  if (input.impact.coverage !== "COMPLETE") issues.push("impact coverage is UNDER_APPROX")
  if (input.expected.length === 0) issues.push("expected Own coverage is empty")

  const expected = new Map<string, StaticOwnInput>()
  for (const item of input.expected) {
    if (expected.has(item.unit.id)) issues.push(`duplicate expected unit: ${item.unit.id}`)
    expected.set(item.unit.id, item)
  }
  const head = new Map<string, StaticOwnFile>()
  const base = new Map<string, StaticOwnFile>()
  for (const file of input.base) {
    if (base.has(file.path)) issues.push(`duplicate base artifact path: ${file.path}`)
    base.set(file.path, file)
  }
  for (const file of input.head) {
    if (head.has(file.path)) issues.push(`duplicate head artifact path: ${file.path}`)
    head.set(file.path, file)
    const receipt = parseStaticOwnReceipt(file.content)
    if (receipt === undefined) {
      issues.push(`malformed artifact: ${file.path}`)
      continue
    }
    if (file.path !== staticOwnArtifactPath(receipt.unit)) issues.push(`non-canonical artifact path: ${file.path}`)
    if (receipt.skillName !== staticOwnSkillName(receipt.unit)) issues.push(`non-canonical skill name: ${receipt.unit}`)
    if (!expected.has(receipt.unit)) issues.push(`unexpected artifact unit: ${receipt.unit}`)
  }

  const impacted = new Set(input.impact.impactedUnits)
  for (const [unit, expectedInput] of expected) {
    const path = staticOwnArtifactPath(unit)
    const file = head.get(path)
    if (file === undefined) {
      issues.push(`missing artifact: ${unit}`)
      continue
    }
    const checked = verifyStaticOwn(expectedInput, file.content)
    if (checked.status === "HOLD") issues.push(`invalid artifact ${unit}: ${checked.reason}`)
    if (!impacted.has(unit)) {
      const prior = base.get(path)
      if (prior === undefined || prior.content !== file.content) issues.push(`unimpacted artifact changed: ${unit}`)
    }
  }
  for (const unit of input.impact.removedUnits) {
    if (head.has(staticOwnArtifactPath(unit))) issues.push(`removed unit artifact remains: ${unit}`)
  }
  return issues.length === 0 ? { status: "READY" } : { status: "HOLD", issues: uniqueSorted(issues) }
}
