export * as ReviewCatalog from "./index"

import { createHash } from "node:crypto"
import path from "node:path"
import { Schema } from "effect"
import { NonNegativeInt, PositiveInt, optional } from "@orchestra/schema/schema"
import { current } from "./entries"

// The review arsenal as data (design §8.5, plan K5). The host reads it to route, plan packs and offer escalation
// options; no model ever sees it whole. Every id is an open string validated against this catalog, so a later phase
// adds entries without a schema change.
export { current }
export { releaseChecks } from "./release-checks"
export { zizmor } from "./zizmor"

const Id = Schema.NonEmptyString.check(Schema.isPattern(/^[a-z0-9*][a-z0-9.*/:-]*$/))
const Ids = Schema.Array(Id)
const Line = Schema.NonEmptyString.check(Schema.isMaxLength(240))
const Share = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))

export const Severity = Schema.Literals(["P0", "P1", "P2", "P3"])
export const Cost = Schema.Literals(["low", "medium", "high"])
export const Status = Schema.Literals(["probation", "active", "demoted", "dropped"])

/** Manifests and extensions that select an entry at base or head; `absent` are negative signals (Bazel, Nix). Empty `manifests` and `extensions` match every change. */
// File names and globs, not catalog ids, so they keep their case (`Cargo.toml`, `BUILD.bazel`).
const Files = Schema.Array(Schema.NonEmptyString)
export const Detection = Schema.Struct({ manifests: Files, extensions: Files, absent: Files })

export const Pack = Schema.Struct({
  id: Id,
  tool: Line,
  version: Line,
  // SRI digest per host target, copied from the pinned manifest the pack reuses.
  pin: optional(Schema.Struct({ source: Line, integrity: Schema.Record(Id, Line) })),
  licence: Schema.Literals(["pinned", "invoke", "user-licence", "never"]),
  backend: Schema.Literals(["pinned", "path", "repo"]),
  // `any` serves every language, such as a secrets scanner over text.
  languages: Schema.Union([Schema.Literal("any"), Ids]),
  detection: Schema.Struct({ ...Detection.fields, paths: optional(Files) }),
  lane: Schema.Literals(["no-build", "repo", "build"]),
  tiers: Ids,
  output: Schema.Union([
    Schema.Struct({ format: Schema.Literal("sarif") }),
    Schema.Struct({ format: Schema.Literal("json"), parser: Id }),
  ]),
  cost: Cost,
  network: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("none") }),
    Schema.Struct({ kind: Schema.Literal("offline-db"), database: Line }),
  ]),
  scratchWrites: Schema.Boolean,
  template: Id,
  lenses: Ids,
  status: Status,
}).check(
  Schema.makeFilter((pack) =>
    pack.licence !== "never" && (pack.backend !== "pinned" || pack.licence === "pinned")
      ? undefined
      : { path: ["licence"], issue: "pack-licence: licence does not permit this backend" },
  ),
  Schema.makeFilter((pack) =>
    pack.backend !== "pinned" || (pack.pin !== undefined && Object.keys(pack.pin.integrity).length > 0)
      ? undefined
      : { path: ["pin"], issue: "pack-pin: pinned backend requires nonempty integrity metadata" },
  ),
)

export const Rule = Schema.Struct({
  pack: Id,
  // A raw native tool id, including case and punctuation, or `*` for every rule the pinned pack ships with no rule of its own here.
  rule: Schema.NonEmptyString.check(Schema.isMaxLength(240)),
  class: Id,
  lens: Id,
  // Tool severity (or `*`) to lucy severity.
  severity: Schema.Record(Schema.NonEmptyString, Severity),
  triage: Line,
  status: Status,
  cwe: optional(Schema.NonEmptyString.check(Schema.isPattern(/^CWE-\d+$/))),
})

export const Overlay = Schema.Struct({
  id: Id,
  // Binding: a changed path that matches routes the overlay.
  paths: Schema.Array(Schema.NonEmptyString),
  // Suggestions: an added line that matches is offered to the lead to confirm or decline.
  content: Schema.Array(Schema.Struct({ id: Id, pattern: Schema.NonEmptyString })),
  lenses: Ids,
  // Packs the overlay requires to run.
  checks: Ids,
})

export const Lens = Schema.Struct({ id: Id, node: Id, classes: Ids })

export const Option = Schema.Struct({ id: Id, rung: Schema.Literals(["quote", "tool", "probe"]), cost: Cost })

export const Escalation = Schema.Struct({ option: Id, proves: Line })

export const Class = Schema.Struct({
  id: Id,
  node: Id,
  // Keyed by language id, or `*` for any language without its own list; at most three options a verifier may take.
  options: Schema.Record(Id, Schema.Array(Escalation).check(Schema.isMinLength(1), Schema.isMaxLength(3))),
})

export const Language = Schema.Struct({ id: Id, detection: Detection, node: Id })

export const Profile = Schema.Struct({
  id: Id,
  node: Id,
  // The settlement stage it records under, or `first-round` for the stage of the round it continues (K3).
  stage: Id,
  // A tier id, `risk` for the §5.3 triggers, or `first-round` for the tier of the round it continues.
  tier: Id,
  overlays: Schema.Boolean,
  // Lenses per tier id; the routed overlays add theirs.
  lenses: Schema.Record(Id, Ids),
  variants: NonNegativeInt,
})

export const Budget = Schema.Struct({
  lenses: Schema.Struct({ min: NonNegativeInt, max: PositiveInt }),
  // False when the lead runs the lenses inside its single pass.
  lensChildren: Schema.Boolean,
  samples: PositiveInt,
  loadsPerSession: NonNegativeInt,
  itemsPerLens: NonNegativeInt,
  candidatesPerLens: PositiveInt,
  verifiers: NonNegativeInt,
  candidatesPerVerifier: NonNegativeInt,
  toolCallsPerSession: PositiveInt,
})

export const Tier = Schema.Struct({
  id: Id,
  // An unbuilt tier is requestable and runs `runs` instead (R3).
  built: Schema.Boolean,
  runs: Id,
  report: Schema.Array(Severity),
  budget: Budget,
  // Severities allowed to climb to each rung (§8.4); `changedTests` adds fail-before/pass-after for every new or changed test.
  rungs: Schema.Struct({
    quote: Schema.Array(Severity),
    tool: Schema.Array(Severity),
    probe: Schema.Array(Severity),
    changedTests: Schema.Boolean,
  }),
  probeAttempts: NonNegativeInt,
})

export const Signal = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("path"), globs: Schema.Array(Schema.NonEmptyString) }),
  Schema.Struct({ kind: Schema.Literal("overlay"), overlay: Id }),
  Schema.Struct({ kind: Schema.Literal("changed-lines"), over: PositiveInt }),
  Schema.Struct({ kind: Schema.Literal("churn"), days: PositiveInt, commits: PositiveInt, authors: PositiveInt }),
  // Every changed path matches; `additionsOnly` also requires that no line is removed.
  Schema.Struct({ kind: Schema.Literal("only"), globs: Schema.Array(Schema.NonEmptyString), additionsOnly: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("small"), atMost: PositiveInt }),
])

/** Evaluated in order; the first trigger that fires sets the tier, else `Route.tier`. */
export const Trigger = Schema.Struct({ id: Id, tier: Id, signal: Signal })

export const Ledger = Schema.Struct({
  activate: Schema.Struct({ read: PositiveInt, confirmed: Share }),
  demote: Schema.Struct({ window: PositiveInt, confirmedBelow: Share }),
  drop: Schema.Struct({ window: PositiveInt, highCostWindow: PositiveInt }),
})

export const Route = Schema.Struct({
  version: Id,
  tier: Id,
  profiles: Schema.Array(Profile),
  tiers: Schema.Array(Tier),
  triggers: Schema.Array(Trigger),
  ledger: Ledger,
})

export const Catalog = Schema.Struct({
  version: Id,
  packs: Schema.Array(Pack),
  rules: Schema.Array(Rule),
  overlays: Schema.Array(Overlay),
  lenses: Schema.Array(Lens),
  classes: Schema.Array(Class),
  options: Schema.Array(Option),
  languages: Schema.Array(Language),
  route: Route,
})
export type Catalog = typeof Catalog.Type

export type Problem = { readonly kind: string; readonly id: string; readonly at: string }

export class CheckError extends Error {
  override name = "ReviewCatalogCheckError"
  constructor(readonly problems: readonly Problem[]) {
    super(`Review catalog check failed:\n${problems.map((problem) => `${problem.kind}: ${problem.id} (${problem.at})`).join("\n")}`)
  }
}

const RESERVED = ["risk", "first-round"]
const CITE = /\b(pack|rule|class|lens|overlay|probe|tool):([a-z0-9<][\w.*/<>-]*)/g
const ROUTED = ["lucy-lens", "lucy-review/prove"]

/**
 * The id build check (E12). `tree` is a seat skill tree as `SeatSkillContent.read` returns it: tree-relative path to
 * text. Fails on an id a node cites that the catalog lacks, a profile, lens or class node missing from the tree, a
 * `lucy-lens` or `lucy-review-prove` node no route reaches, and any catalog entry naming an unknown id.
 */
export function check(input: unknown, tree: Readonly<Record<string, string>>) {
  const catalog = Schema.decodeUnknownSync(Catalog)(input)
  const nodes = Object.keys(tree)
    .filter((file) => path.posix.basename(file) === "SKILL.md")
    .map((file) => path.posix.dirname(file))
  const problems = [...references(catalog), ...cited(catalog, tree), ...missing(catalog, nodes), ...unreached(catalog, nodes)]
  if (problems.length > 0) throw new CheckError(problems)
}

/** The hash of the canonical catalog (sorted keys, no whitespace) that receipts record. */
export function catalogDigest(catalog: Catalog) {
  return `sha256:${createHash("sha256").update(canonical(catalog), "utf8").digest("hex")}`
}

function references(catalog: Catalog): Problem[] {
  const known = {
    pack: new Set(catalog.packs.map((pack) => pack.id)),
    overlay: new Set(catalog.overlays.map((overlay) => overlay.id)),
    lens: new Set(catalog.lenses.map((lens) => lens.id)),
    class: new Set(catalog.classes.map((entry) => entry.id)),
    option: new Set(catalog.options.map((option) => option.id)),
    language: new Set(catalog.languages.map((language) => language.id)),
    tier: new Set(catalog.route.tiers.map((tier) => tier.id)),
  }
  const unknown = (kind: keyof typeof known, ids: readonly string[], at: string) =>
    ids.filter((id) => !known[kind].has(id)).map((id) => ({ kind: `unknown-${kind}`, id, at }))
  const duplicates = Object.entries({
    pack: catalog.packs.map((pack) => pack.id),
    rule: catalog.rules.map((rule) => `${rule.pack}/${rule.rule}`),
    overlay: catalog.overlays.map((overlay) => overlay.id),
    lens: catalog.lenses.map((lens) => lens.id),
    class: catalog.classes.map((entry) => entry.id),
    option: catalog.options.map((option) => option.id),
    language: catalog.languages.map((language) => language.id),
    profile: catalog.route.profiles.map((profile) => profile.id),
    tier: catalog.route.tiers.map((tier) => tier.id),
  }).flatMap(([kind, ids]) =>
    ids.filter((id, index) => ids.indexOf(id) !== index).map((id) => ({ kind: "duplicate-id", id, at: kind })),
  )
  const raised = catalog.lenses.flatMap((lens) => lens.classes)
  return [
    ...duplicates,
    ...catalog.packs.flatMap((pack) => [
      ...unknown("lens", pack.lenses, `pack:${pack.id}`),
      ...unknown("tier", pack.tiers, `pack:${pack.id}`),
      ...unknown("language", pack.languages === "any" ? [] : pack.languages, `pack:${pack.id}`),
    ]),
    ...catalog.rules.flatMap((rule) => [
      ...unknown("pack", [rule.pack], `rule:${rule.pack}/${rule.rule}`),
      ...unknown("class", [rule.class], `rule:${rule.pack}/${rule.rule}`),
      ...unknown("lens", [rule.lens], `rule:${rule.pack}/${rule.rule}`),
    ]),
    ...catalog.overlays.flatMap((overlay) => [
      ...unknown("lens", overlay.lenses, `overlay:${overlay.id}`),
      ...unknown("pack", overlay.checks, `overlay:${overlay.id}`),
      ...overlay.content
        .filter((entry) => !compiles(entry.pattern))
        .map((entry) => ({ kind: "invalid-pattern", id: entry.id, at: `overlay:${overlay.id}` })),
    ]),
    ...catalog.lenses.flatMap((lens) => unknown("class", lens.classes, `lens:${lens.id}`)),
    ...catalog.classes.flatMap((entry) => [
      ...(raised.includes(entry.id) ? [] : [{ kind: "unraised-class", id: entry.id, at: `class:${entry.id}` }]),
      ...unknown("language", Object.keys(entry.options).filter((key) => key !== "*"), `class:${entry.id}`),
      ...unknown("option", Object.values(entry.options).flat().map((option) => option.option), `class:${entry.id}`),
    ]),
    ...catalog.route.profiles.flatMap((profile) => [
      ...unknown("tier", RESERVED.includes(profile.tier) ? [] : [profile.tier], `profile:${profile.id}`),
      ...unknown("tier", Object.keys(profile.lenses), `profile:${profile.id}`),
      ...unknown("lens", Object.values(profile.lenses).flat(), `profile:${profile.id}`),
    ]),
    ...catalog.route.tiers.flatMap((tier) => unknown("tier", [tier.runs], `tier:${tier.id}`)),
    ...unknown("tier", [catalog.route.tier], "route"),
    ...catalog.route.triggers.flatMap((trigger) => [
      ...unknown("tier", [trigger.tier], `trigger:${trigger.id}`),
      ...unknown("overlay", trigger.signal.kind === "overlay" ? [trigger.signal.overlay] : [], `trigger:${trigger.id}`),
    ]),
  ]
}

function cited(catalog: Catalog, tree: Readonly<Record<string, string>>): Problem[] {
  const known = {
    pack: catalog.packs.map((pack) => pack.id),
    rule: catalog.rules.map((rule) => `${rule.pack}/${rule.rule}`),
    class: catalog.classes.map((entry) => entry.id),
    lens: catalog.lenses.map((lens) => lens.id),
    overlay: catalog.overlays.map((overlay) => overlay.id),
    probe: catalog.options.map((option) => option.id),
    tool: catalog.options.map((option) => option.id),
  }
  return Object.entries(tree)
    .filter(([file]) => file.endsWith(".md"))
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([file, text]) =>
      Array.from(text.matchAll(CITE), (match) => ({ kind: match[1] as keyof typeof known, id: match[2].replace(/[.-]+$/, "") }))
        // `tool:<pack>` names the option family in prose, not one option.
        .filter((ref) => !ref.id.includes("<"))
        .filter((ref) => !known[ref.kind].includes(ref.kind === "probe" || ref.kind === "tool" ? `${ref.kind}:${ref.id}` : ref.id))
        .map((ref) => ({ kind: "unknown-cited-id", id: `${ref.kind}:${ref.id}`, at: file })),
    )
}

function missing(catalog: Catalog, nodes: readonly string[]): Problem[] {
  const names = new Set(nodes.map((node) => node.split("/").join("-")))
  return [
    ...catalog.route.profiles.map((profile) => ({ id: profile.node, at: `profile:${profile.id}` })),
    ...catalog.lenses.map((lens) => ({ id: lens.node, at: `lens:${lens.id}` })),
    ...catalog.classes.map((entry) => ({ id: entry.node, at: `class:${entry.id}` })),
  ]
    .filter((entry) => !names.has(entry.id))
    .map((entry) => ({ kind: "missing-node", ...entry }))
}

// A routed lens or proof node reaches its ancestors (the group nodes above it) and its descendants (the leaves a
// Session may open below it).
function unreached(catalog: Catalog, nodes: readonly string[]): Problem[] {
  const lenses = new Set([
    ...catalog.route.profiles.flatMap((profile) => Object.values(profile.lenses).flat()),
    ...catalog.overlays.flatMap((overlay) => overlay.lenses),
  ])
  const routed = catalog.lenses.filter((lens) => lenses.has(lens.id))
  const classes = new Set(routed.flatMap((lens) => lens.classes))
  const reached = [
    ...routed.map((lens) => lens.node),
    ...catalog.classes.filter((entry) => classes.has(entry.id)).map((entry) => entry.node),
  ].flatMap((name) => nodes.filter((node) => node.split("/").join("-") === name))
  return nodes
    .filter((node) => ROUTED.some((root) => node === root || node.startsWith(`${root}/`)))
    .filter((node) => !reached.some((other) => node === other || node.startsWith(`${other}/`) || other.startsWith(`${node}/`)))
    .toSorted()
    .map((node) => ({ kind: "unreached-node", id: node.split("/").join("-"), at: `${node}/SKILL.md` }))
}

function compiles(pattern: string) {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
