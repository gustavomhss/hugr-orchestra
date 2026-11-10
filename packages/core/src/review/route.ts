export * as ReviewRoute from "./route"

import path from "node:path"
import { Glob } from "../util/glob"
import { ReviewCatalog } from "./catalog"
import { ReviewRouting } from "./routing"
import type { ReviewSettings } from "./settings"

// The host's routing (design §8.2, plan WP 1.2): one pure function over the request, the base and head trees and the
// catalog, run before any model reads the change. No clock, no I/O, no model: the same inputs give the same record.
// Only paths, added lines, line counts and history counts are read, never the change's own prose, and a model may later
// only add to the record (R13). Path overlays, languages, lenses, packs and budgets are binding; content overlays are
// suggestions the lead confirms or declines.

export type Request = {
  readonly stage: "plan" | "code"
  // Catalog ids; the profile defaults to the stage's, the tier to the project pin, else the profile's rule (K8).
  readonly profile?: string
  readonly tier?: string
  readonly settings: ReviewSettings.Settings
  // The tier the first round ran, for a profile that continues it (`rereview`).
  readonly firstRound?: string
  // The change's own text (PR body, commit messages). Data, never a routing signal (§8.2): route does not read it.
  readonly text?: readonly string[]
}

/** A revision as routing sees it: its repository-relative file paths (manifests match by file name). */
export type Tree = { readonly files: readonly string[] }

export type Change = {
  readonly path: string
  readonly added: readonly { readonly line: number; readonly text: string }[]
  readonly removed: number
  // Commits and distinct authors touching the path over the catalog's churn window, counted by the caller.
  readonly history?: { readonly commits: number; readonly authors: number }
}

export type Head = Tree & { readonly changes: readonly Change[] }

type Catalog = ReviewCatalog.Catalog
type Profile = Catalog["route"]["profiles"][number]
type Choice = { readonly id: string; readonly source: "request" | "pin" | "risk" | "catalog"; readonly signals: readonly string[] }

export class RouteError extends Error {
  override name = "ReviewRouteError"
  constructor(
    readonly code: "unsupported-profile" | "profile-stage" | "unsupported-tier" | "first-round-tier" | "unknown-lens",
    message: string,
  ) {
    super(message)
  }
}

export function route(request: Request, base: Tree, head: Head, catalog: Catalog): ReviewRouting.Record {
  const profile = requireProfile(request, catalog)
  const changes = head.changes
    .toSorted((left, right) => compare(left.path, right.path))
    .map((change) => ({ ...change, added: change.added.toSorted((left, right) => left.line - right.line) }))
  const overlays = profile.overlays ? routeOverlays(changes, catalog) : []
  const choice = chooseTier(request, profile, changes, overlays, catalog)
  const tier = requireTier(choice, catalog)
  const languages = routeLanguages([...base.files, ...head.files], changes, catalog)
  const lenses = routeLenses(profile, tier.run.id, overlays, catalog)
  const max = tier.run.budget.lenses.max
  return {
    version: ReviewRouting.VERSION,
    // `catalogDigest` is `sha256:<hex>`; the record's digest field holds the bare hex.
    catalog: ReviewCatalog.catalogDigest(catalog).slice("sha256:".length),
    profile: { id: profile.id, source: "request" },
    tier: {
      id: tier.run.id,
      source: choice.source,
      ...(tier.requested.id === tier.run.id ? {} : { requested: tier.requested.id }),
      signals: choice.signals,
    },
    overlays,
    languages,
    lenses: lenses.slice(0, max),
    packs: routePacks(base.files, changes, languages, overlays, tier.requested.id, tier.run.id, catalog),
    budget: {
      lensChildren: tier.run.budget.lensChildren ? Math.min(lenses.length, max) : 0,
      samples: tier.run.budget.samples,
      verifiers: tier.run.budget.verifiers,
      itemsPerLens: tier.run.budget.itemsPerLens,
      loadsPerSession: tier.run.budget.loadsPerSession,
      candidatesPerChild: tier.run.budget.candidatesPerLens,
      candidatesPerVerifier: tier.run.budget.candidatesPerVerifier,
      toolCallsPerSession: tier.run.budget.toolCallsPerSession,
      probeAttempts: tier.run.probeAttempts,
    },
    deviations: lenses.slice(max).map((lens) => ({
      kind: "lens-cap",
      stage: "route" as const,
      detail: `lens ${lens.id} (${lens.because}) is over the ${tier.run.id} cap of ${max} lenses`,
      ref: lens.id,
    })),
  }
}

function requireProfile(request: Request, catalog: Catalog) {
  // The default profile is the one named after the stage (K8).
  const id = request.profile ?? request.stage
  const profile = catalog.route.profiles.find((entry) => entry.id === id)
  if (!profile)
    throw new RouteError(
      "unsupported-profile",
      `Unsupported review profile "${id}"; this build supports ${catalog.route.profiles.map((entry) => entry.id).join(", ")}.`,
    )
  if (profile.stage !== "first-round" && profile.stage !== request.stage)
    throw new RouteError("profile-stage", `Review profile "${id}" records under stage "${profile.stage}", not "${request.stage}".`)
  return profile
}

function chooseTier(
  request: Request,
  profile: Profile,
  changes: readonly Change[],
  overlays: readonly ReviewRouting.Overlay[],
  catalog: Catalog,
): Choice {
  if (request.tier) return { id: request.tier, source: "request", signals: [] }
  if (request.settings.tier) return { id: request.settings.tier, source: "pin", signals: [] }
  if (profile.tier === "risk") return risk(changes, overlays, catalog)
  if (profile.tier !== "first-round") return { id: profile.tier, source: "catalog", signals: [] }
  if (!request.firstRound)
    throw new RouteError("first-round-tier", `Review profile "${profile.id}" continues a first round; the request names no first-round tier.`)
  return { id: request.firstRound, source: "request", signals: [] }
}

// §5.3: the first trigger that fires sets the tier; its signals are every fired trigger of that tier.
function risk(changes: readonly Change[], overlays: readonly ReviewRouting.Overlay[], catalog: Catalog): Choice {
  const fired = catalog.route.triggers.flatMap((trigger) => {
    const signal = fire(trigger, changes, overlays)
    return signal ? [{ tier: trigger.tier, signal }] : []
  })
  if (fired.length === 0) return { id: catalog.route.tier, source: "risk", signals: [] }
  const id = fired[0].tier
  return { id, source: "risk", signals: Array.from(new Set(fired.filter((item) => item.tier === id).map((item) => item.signal))) }
}

function fire(
  trigger: Catalog["route"]["triggers"][number],
  changes: readonly Change[],
  overlays: readonly ReviewRouting.Overlay[],
) {
  const signal = trigger.signal
  const lines = changes.reduce((sum, change) => sum + change.added.length + change.removed, 0)
  if (signal.kind === "path") {
    const hit = changes.find((change) => signal.globs.some((glob) => Glob.match(glob, change.path)))
    return hit && `path: ${hit.path}`
  }
  // A content-suggested overlay fires too: a trigger may only add rigor, and the lead never lowers the tier.
  if (signal.kind === "overlay") return overlays.some((overlay) => overlay.id === signal.overlay) ? `overlay: ${signal.overlay}` : undefined
  if (signal.kind === "changed-lines") return lines > signal.over ? `changedLines: ${lines}` : undefined
  if (signal.kind === "churn") {
    const hit = changes.find(
      (change) => change.history && change.history.commits >= signal.commits && change.history.authors >= signal.authors,
    )
    return hit && `churn: ${hit.path}`
  }
  if (signal.kind === "only") {
    const only =
      changes.length > 0 &&
      changes.every((change) => signal.globs.some((glob) => Glob.match(glob, change.path))) &&
      (!signal.additionsOnly || changes.every((change) => change.removed === 0))
    return only ? `only: ${trigger.id}` : undefined
  }
  return changes.length > 0 && lines <= signal.atMost ? `small: ${lines}` : undefined
}

function requireTier(choice: Choice, catalog: Catalog) {
  const supported = catalog.route.tiers.map((entry) => entry.id).join(", ")
  const requested = catalog.route.tiers.find((entry) => entry.id === choice.id)
  if (!requested)
    throw new RouteError("unsupported-tier", `Unsupported review tier "${choice.id}" (${choice.source}); this build supports ${supported}.`)
  // An unbuilt tier is recorded as requested and runs the tier it names (R3).
  const run = requested.built ? requested : catalog.route.tiers.find((entry) => entry.id === requested.runs && entry.built)
  if (!run) throw new RouteError("unsupported-tier", `Review tier "${choice.id}" is not built and names no built tier to run.`)
  return { requested, run }
}

function routeOverlays(changes: readonly Change[], catalog: Catalog): ReviewRouting.Overlay[] {
  const lines = changes.flatMap((change) => change.added.map((added) => ({ path: change.path, line: added.line, text: added.text })))
  return catalog.overlays.flatMap((overlay): ReviewRouting.Overlay[] => {
    const hit = changes.find((change) => overlay.paths.some((glob) => Glob.match(glob, change.path)))
    if (hit) return [{ id: overlay.id, source: "path", signal: hit.path }]
    const patterns = overlay.content.map((entry) => ({ id: entry.id, regex: new RegExp(entry.pattern) }))
    const line = lines.find((item) => patterns.some((pattern) => pattern.regex.test(item.text)))
    const pattern = line && patterns.find((item) => item.regex.test(line.text))
    if (!line || !pattern) return []
    return [{ id: overlay.id, source: "content", signal: `${line.path}:${line.line} ${pattern.id}` }]
  })
}

function routeLanguages(files: readonly string[], changes: readonly Change[], catalog: Catalog): ReviewRouting.Language[] {
  const names = new Set(files.map((file) => path.posix.basename(file)))
  return catalog.languages.flatMap((language): ReviewRouting.Language[] => {
    if (language.detection.absent.some((name) => names.has(name))) return []
    const signal =
      language.detection.manifests.find((name) => names.has(name)) ??
      changes.find((change) => language.detection.extensions.includes(path.posix.extname(change.path)))?.path
    return signal ? [{ id: language.id, source: "path", signal }] : []
  })
}

// Lenses in the profile's lowest tier are the profile's own; the rest arrive with the tier.
function routeLenses(profile: Profile, tier: string, overlays: readonly ReviewRouting.Overlay[], catalog: Catalog) {
  const listed = profile.lenses[tier]
  if (!listed) throw new RouteError("unsupported-tier", `Review profile "${profile.id}" has no lenses for tier "${tier}".`)
  const floor = profile.lenses[catalog.route.tiers[0]?.id ?? tier] ?? []
  const routed = [
    ...listed.map((id) => ({ id, source: "catalog" as const, because: floor.includes(id) ? "profile" : `tier:${tier}` })),
    // Only path overlays bind lenses; a content suggestion adds its lens once the lead confirms it.
    ...overlays
      .filter((overlay) => overlay.source === "path")
      .flatMap((overlay) =>
        (catalog.overlays.find((entry) => entry.id === overlay.id)?.lenses ?? []).map((id) => ({
          id,
          source: "path" as const,
          because: `overlay:${overlay.id}`,
        })),
      ),
  ]
  return routed
    .filter((lens, index) => routed.findIndex((other) => other.id === lens.id) === index)
    .map((lens): ReviewRouting.Lens => {
      const entry = catalog.lenses.find((item) => item.id === lens.id)
      if (!entry) throw new RouteError("unknown-lens", `Review lens "${lens.id}" is not in the catalog.`)
      return { id: lens.id, source: lens.source, node: entry.node, because: lens.because }
    })
}

function routePacks(
  baseFiles: readonly string[],
  changes: readonly Change[],
  languages: readonly ReviewRouting.Language[],
  overlays: readonly ReviewRouting.Overlay[],
  requested: string,
  run: string,
  catalog: Catalog,
): ReviewRouting.Pack[] {
  // Pack manifests come from the base only, so a change cannot add the gates that review it.
  const names = new Set(baseFiles.map((file) => path.posix.basename(file)))
  const routedLanguages = languages.map((language) => language.id)
  const required = new Set(
    overlays
      .filter((overlay) => overlay.source === "path")
      .flatMap((overlay) => catalog.overlays.find((entry) => entry.id === overlay.id)?.checks ?? []),
  )
  return catalog.packs.flatMap((pack): ReviewRouting.Pack[] => {
    if (required.has(pack.id)) return [{ id: pack.id, source: "path", lane: pack.lane, status: "routed" }]
    const detection = pack.detection
    const fits =
      pack.status !== "dropped" &&
      pack.licence !== "never" &&
      (pack.languages === "any" || pack.languages.some((id) => routedLanguages.includes(id))) &&
      !detection.absent.some((name) => names.has(name)) &&
      ((detection.manifests.length === 0 && detection.extensions.length === 0 && (detection.paths?.length ?? 0) === 0) ||
        detection.manifests.some((name) => names.has(name)) ||
        changes.some((change) => detection.paths?.some((glob) => Glob.match(glob, change.path))) ||
        changes.some((change) => detection.extensions.includes(path.posix.extname(change.path))))
    if (!fits) return []
    if (pack.tiers.includes(run)) return [{ id: pack.id, source: "catalog", lane: pack.lane, status: "routed" }]
    // R3: a pack only the requested, unbuilt tier runs is listed as not examined.
    if (pack.tiers.includes(requested))
      return [{ id: pack.id, source: "catalog", lane: pack.lane, status: "not-run", reason: "not-built" }]
    return []
  })
}

function compare(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
