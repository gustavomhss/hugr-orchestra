#!/usr/bin/env bun
// Module-boundary gate. Reads the import positions (import/export-from, import-equals, import(), require(), import
// types, import.meta.glob) of tracked and untracked-but-not-ignored source files under a package registered in
// script/module-registry.json, with the TypeScript parser and no type checker, and checks rules R0-R12 against
// script/module-architecture.json. Workspace specifiers resolve through the working tree's package.json `exports`
// only, never through node_modules. A violation of a ledgerable rule passes only while script/boundary-ledger.json
// lists it; a listed entry that no longer occurs is stale and fails, so the ledger only shrinks.
//
// Not checked: specifiers that are not string literals, files under node_modules/, dist/ and modules/atlas/ (except
// modules/atlas/boundary/), undeclared npm packages, and anything only a type checker, bundler or runtime resolver sees.
// Whether a README's prose is any good is a human call; R8 checks only structure and existence.
//
// Usage: bun run script/check-module-boundaries.ts [--no-stale] [--scope <prefix>...] [--json] [--prune] [--seed]
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  README_END,
  README_START,
  SOURCE,
  isTestFile,
  loadWorkspace,
  ownerOf,
  patternRank,
  renderReadmeBlock,
  resolveExport,
  specifiersOf,
  type Member,
  type Workspace,
} from "./module-architecture"

export type Violation = { rule: string; file: string; specifier: string; message: string }
type Entry = { rule: string; file: string; specifier: string; reason: string }
type Edge = { file: string; specifier: string; kind: string; typeOnly: boolean; from: Member; to?: Member; target?: string; vendored?: string }

const LEDGER = "script/boundary-ledger.json"
const REASONS: Record<string, string> = {
  R1: "D13: a legacy package is reached across layers; the FAC cards leave only the core compat facade",
  R3: "D13: legacy import outside src/compat/; the FAC cards route it through the package facade",
  R4: "D7: undeclared workspace import; 70-90 makes no manifest dependency edits",
  R5: "D8: relative import across a package root; retargets are deferred",
  R6a: "D10: code wildcard in exports; the EXP cards replace it with explicit keys",
  R6b: "D11: the specifier does not resolve under the package exports",
  R7: "D8: deep import into a cohesive module; retargets are optional later work",
  R8: "D15: README scaffold or contract block pending; the RN, RD and RB cards add it",
  R11: "D17: platform-legacy code imports a product domain; resolved by the 70-C' cut",
}
const HEADINGS = [
  "Purpose and ownership",
  "Public entry points and consumers",
  "Dependencies and boundaries",
  "Assets, schemas and generated files",
  "Persistence, identity and lifetime",
  "Commands",
  "Contracts and verification limits",
]
const REPO_PATH = /`((?:apps|packages|modules|native|tooling|script|docs|\.github)\/[^`\s]*)`/g

if (import.meta.main) {
  const result = run({ root: path.resolve(import.meta.dir, ".."), args: process.argv.slice(2) })
  result.err.forEach((line) => console.error(line))
  result.out.forEach((line) => console.log(line))
  process.exit(result.code)
}

export function run(options: { root: string; args: string[]; minFiles?: number; minEdges?: number }) {
  const out: string[] = []
  const err: string[] = []
  const report = { new: [] as Violation[], stale: [] as Entry[], counts: {} as Record<string, number> }
  const finish = (code: number) => ({ code, out, err, report })
  const fatal = (message: string) => {
    err.push(`ERROR ${message}`)
    return finish(1)
  }
  const flags = new Set(options.args.filter((arg) => arg.startsWith("--")))
  const scope = flags.has("--scope") ? options.args.filter((arg) => !arg.startsWith("--")).map((arg) => arg.replace(/\/+$/, "")) : undefined
  const unknown = [...flags].filter((flag) => !["--no-stale", "--scope", "--json", "--prune", "--seed"].includes(flag))
  if (unknown.length > 0) return fatal(`unknown option ${unknown.join(" ")}`)
  if (scope !== undefined && (scope.length === 0 || flags.has("--seed"))) return fatal("--scope needs at least one path prefix and cannot seed")
  const workspace = loadWorkspace(options.root)
  const inScope = (file: string) => scope === undefined || scope.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))
  const empty = (scope ?? []).filter((prefix) => !workspace.files.some((file) => file === prefix || file.startsWith(`${prefix}/`)))
  if (empty.length > 0) return fatal(`SCOPE_EMPTY: no listed file under ${empty.join(", ")}`)
  const result = check(workspace, inScope)
  const minFiles = options.minFiles ?? 4000
  const minEdges = options.minEdges ?? 2000
  if (scope === undefined && result.parsed < minFiles)
    return fatal(`parsed ${result.parsed} files, fewer than ${minFiles}; a scan that read almost nothing proves nothing`)
  if (scope === undefined && result.edges < minEdges)
    return fatal(`found ${result.edges} cross-package edges, fewer than ${minEdges}; the resolver is not seeing the workspace`)
  const ledgerFile = path.join(options.root, LEDGER)
  const ledgerable = (rule: string) => rule in REASONS
  const key = (item: { rule: string; file: string; specifier: string }) => `${item.rule}|${item.file}|${item.specifier}`
  const line = (item: Violation) => `NEW ${item.rule} ${item.file} ${item.specifier}: ${item.message}`
  report.counts = Object.fromEntries(
    [...new Set(result.violations.map((item) => item.rule))].sort().map((rule) => [rule, result.violations.filter((item) => item.rule === rule).length]),
  )
  if (flags.has("--seed")) {
    if (existsSync(ledgerFile)) return fatal(`LEDGER_EXISTS: ${LEDGER} already exists; --seed writes it only once`)
    const entries = result.violations.filter((item) => ledgerable(item.rule)).map((item) => ({ ...pick(item), reason: REASONS[item.rule] ?? item.rule }))
    writeLedger(ledgerFile, entries)
    report.new = result.violations.filter((item) => !ledgerable(item.rule))
    err.push(...report.new.map(line))
    out.push(`module-boundaries: seeded ${entries.length} entries; ${report.new.length} violations of unledgerable rules`)
    return finish(report.new.length > 0 ? 1 : 0)
  }
  if (!existsSync(ledgerFile)) return fatal(`LEDGER_MISSING: ${LEDGER} does not exist; the lead seeds it once with --seed`)
  const ledger = readLedger(ledgerFile)
  if (typeof ledger === "string") return fatal(ledger)
  const listed = new Set(ledger.map(key))
  const found = new Set(result.violations.map(key))
  report.new = result.violations.filter((item) => !ledgerable(item.rule) || !listed.has(key(item)))
  report.stale = ledger.filter((entry) => !found.has(key(entry)) && inScope(entry.file))
  const gone = new Set(report.stale.map(key))
  if (flags.has("--prune")) writeLedger(ledgerFile, ledger.filter((entry) => !gone.has(key(entry))))
  if (flags.has("--json")) out.push(JSON.stringify(report, null, 2))
  if (!flags.has("--json")) {
    err.push(...report.new.map(line))
    err.push(...report.stale.map((entry) => `STALE ${entry.rule} ${entry.file} ${entry.specifier}: no longer occurs; remove it from ${LEDGER}`))
    out.push(
      `module-boundaries: ${result.parsed} files parsed, ${result.edges} cross-package edges, ${result.violations.length} violations ` +
        `(${result.violations.length - report.new.length} ledgered), ${report.new.length} new, ${report.stale.length} stale${flags.has("--prune") ? " (pruned)" : ""}`,
    )
  }
  return finish(report.new.length > 0 || (report.stale.length > 0 && !flags.has("--no-stale") && !flags.has("--prune")) ? 1 : 0)
}

export function check(workspace: Workspace, inScope: (file: string) => boolean) {
  const files = new Set(workspace.files)
  const dirs = new Set(workspace.files.flatMap((file) => file.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))))
  const exists = (file: string) => files.has(file) || dirs.has(file)
  const scanned = workspace.files.filter(
    (file) =>
      SOURCE.test(file) &&
      inScope(file) &&
      !/(^|\/)(node_modules|dist)\//.test(file) &&
      (!file.startsWith("modules/atlas/") || file.startsWith("modules/atlas/boundary/")) &&
      workspace.memberOf(file) !== undefined,
  )
  const edges = scanned.flatMap((file) => {
    const from = workspace.memberOf(file) as Member
    return specifiersOf(file, readFileSync(path.join(workspace.root, file), "utf8")).map((item) => resolveEdge(workspace, files, from, file, item))
  })
  const violations = [
    ...registryRule(workspace, exists),
    ...ownershipRule(workspace),
    ...browserSafeRule(workspace),
    ...wildcardRule(workspace),
    ...readmeRule(workspace, exists),
    ...edges.flatMap((edge) => edgeRules(workspace, files, edge)),
  ]
  const unique = [...new Map(violations.map((item) => [`${item.rule}|${item.file}|${item.specifier}`, item])).values()]
  return {
    parsed: scanned.length,
    edges: edges.filter((edge) => edge.to !== undefined && edge.to !== edge.from).length,
    violations: unique.sort((a, b) => `${a.rule}|${a.file}|${a.specifier}`.localeCompare(`${b.rule}|${b.file}|${b.specifier}`)),
  }
}

function resolveEdge(workspace: Workspace, files: Set<string>, from: Member, file: string, item: { specifier: string; kind: string; typeOnly: boolean }): Edge {
  const edge = { file, specifier: item.specifier, kind: item.kind, typeOnly: item.typeOnly, from }
  const stem = (target: string) => {
    const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find((candidate) => files.has(candidate)) ?? target
    return { ...edge, to: workspace.memberOf(resolved), target: resolved }
  }
  if (item.specifier.startsWith(".") || item.specifier.startsWith("/"))
    return stem(path.posix.normalize(path.posix.join(path.posix.dirname(file), item.specifier)))
  const alias = Object.entries(from.spec.aliases ?? {}).find(([prefix]) => item.specifier.startsWith(prefix))
  if (alias) return stem(`${from.path}/${alias[1]}${item.specifier.slice(alias[0].length)}`)
  const name = item.specifier.startsWith("@") ? item.specifier.split("/").slice(0, 2).join("/") : (item.specifier.split("/")[0] ?? item.specifier)
  const to = workspace.members.find((member) => member.name === name)
  if (!to) {
    const vendored = workspace.architecture.legacy.find((entry) => entry.specifier === name && !workspace.members.some((member) => member.name === name))
    return { ...edge, kind: vendored ? "vendored" : "npm", vendored: vendored?.specifier }
  }
  const subpath = item.specifier === name ? "." : `./${item.specifier.slice(name.length + 1)}`
  if (to.manifest.exports === undefined) return { ...stem(path.posix.join(to.path, subpath === "." ? (to.manifest.main ?? "index.js") : subpath)), to, kind: "workspace" }
  const hit = resolveExport(to.manifest.exports, subpath)
  return { ...edge, kind: "workspace", to, target: hit ? path.posix.join(to.path, hit.target) : undefined }
}

function edgeRules(workspace: Workspace, files: Set<string>, edge: Edge): Violation[] {
  const at = (rule: string, message: string) => ({ rule, file: edge.file, specifier: edge.specifier, message })
  const from = edge.from
  const to = edge.to
  const test = isTestFile(edge.file)
  const cross = to !== undefined && to !== from
  const relative = edge.file.slice(from.path.length + 1)
  const legacy = (file: string) =>
    workspace.architecture.legacy.find((entry) => entry.status === "legacy" && entry.path !== undefined && (file === entry.path || file.startsWith(`${entry.path}/`)))
  const exempt = from.spec.status === "legacy" || legacy(edge.file) !== undefined || edge.file.startsWith(`${from.path}/src/compat/`)
  const vendoredLegacy = edge.vendored === undefined ? undefined : workspace.architecture.legacy.find((entry) => entry.status === "legacy" && entry.specifier === edge.vendored)
  const declared = (name: string) =>
    [from.manifest.dependencies, from.manifest.devDependencies, from.manifest.peerDependencies, from.manifest.optionalDependencies].some(
      (field) => field !== undefined && name in field,
    )
  const containment = workspace.architecture.relayContainment
  const domains = from.spec.domains ?? {}
  const kindOf = (file: string | undefined) => {
    const owners = file === undefined ? [] : ownerOf(file.slice(from.path.length + 1), domains)
    const id = owners.length === 1 ? owners[0] : undefined
    const domain = id === undefined ? undefined : domains[id]
    return id === undefined || domain === undefined ? undefined : { id, kind: domain.kind }
  }
  const source = kindOf(edge.file)
  const sink = to === from && edge.target !== undefined && edge.target.startsWith(`${from.path}/src/`) ? kindOf(edge.target) : undefined
  return [
    !test && cross && !layerAllows(workspace, from, to, edge.target)
      ? [at("R1", `${from.alias} (${from.spec.layer}) may not depend on ${to.alias} (${to.spec.layer})${edge.typeOnly ? ", type-only edges included" : ""}`)]
      : [],
    !test && !exempt && ((edge.target !== undefined && legacy(edge.target) !== undefined) || vendoredLegacy !== undefined)
      ? [at("R3", `non-legacy code reaches ${edge.target && legacy(edge.target) ? legacy(edge.target)?.path : "a vendored legacy client"} outside ${from.path}/src/compat/`)]
      : [],
    (cross && edge.kind === "workspace" && !declared(to.name)) || (edge.vendored !== undefined && !declared(edge.vendored))
      ? [at("R4", `${from.path}/package.json does not declare ${edge.vendored ?? to?.name}`)]
      : [],
    (edge.specifier.startsWith(".") || edge.specifier.startsWith("/")) && edge.target !== undefined && !edge.target.startsWith(`${from.path}/`)
      ? [at("R5", `relative import leaves ${from.path}`)]
      : [],
    edge.kind === "workspace" && to?.manifest.exports !== undefined && (edge.target === undefined || !files.has(edge.target))
      ? [at("R6b", edge.target === undefined ? `no ${to.name} exports key matches` : `${to.name} exports point at missing ${edge.target}`)]
      : [],
    !test && cross && deepModule(to, edge.target) ? [at("R7", `deep import into a cohesive module of ${to.alias}; import its entry`)] : [],
    cross && to.spec.status === "unused" ? [at("R9", `${to.alias} is registered as unused`)] : [],
    !test && from.alias === containment.package && (edge.specifier === containment.specifier || edge.specifier.startsWith(`${containment.specifier}/`)) &&
    !containment.domains.includes(source?.id ?? "")
      ? [at("R10", `only core domains ${containment.domains.join(", ")} may import ${containment.specifier}`)]
      : [],
    !test && relative.startsWith("src/") && source !== undefined && sink !== undefined && productViolation(workspace, source, sink)
      ? [at("R11", `${source.kind} ${source.id} may not import ${sink.kind} ${sink.id}`)]
      : [],
  ].flat()
}

function layerAllows(workspace: Workspace, from: Member, to: Member, target: string | undefined) {
  const allowed = workspace.architecture.layers[from.spec.layer] ?? []
  if (allowed.includes(to.spec.layer)) return true
  if (allowed.includes(`${to.spec.layer}:platformLibrary`) && to.spec.platformLibrary === true) return true
  return allowed.includes(`${to.spec.layer}:browserSafe`) && (to.spec.browserSafe ?? []).some((file) => `${to.path}/${file}` === target)
}

function deepModule(to: Member, target: string | undefined) {
  if (target === undefined) return false
  return (to.spec.modules ?? []).some(
    (module) =>
      module.kind === "cohesive" &&
      target.startsWith(`${to.path}/${module.path}/`) &&
      !(module.entries ?? []).some((entry) => `${to.path}/${entry}` === target),
  )
}

function productViolation(workspace: Workspace, source: { id: string; kind: string }, sink: { id: string; kind: string }) {
  if (source.kind === "platform-legacy") return sink.kind === "product"
  if (source.kind !== "product" || sink.kind !== "product" || source.id === sink.id) return false
  return !workspace.architecture.productEdges.some((edge) => edge[0] === source.id && edge[1] === sink.id)
}

function registryRule(workspace: Workspace, exists: (file: string) => boolean): Violation[] {
  const at = (specifier: string, message: string) => ({ rule: "R0", file: "script/module-architecture.json", specifier, message })
  const architecture = workspace.architecture
  const layers = Object.keys(architecture.layers)
  const known = (reference: string) => {
    const [layer, qualifier] = reference.split(":")
    return layers.includes(layer ?? "") && (qualifier === undefined || qualifier === "platformLibrary" || qualifier === "browserSafe")
  }
  const malformed = (pattern: string) =>
    pattern.startsWith("/") || pattern.split("/").includes("..") || (pattern.match(/\*/g) ?? []).length > 1 || /\*.*\//.test(pattern)
  const products = Object.values(architecture.packages).flatMap((spec) =>
    Object.entries(spec.domains ?? {}).filter(([, domain]) => domain.kind === "product").map(([id]) => id),
  )
  const aliases = workspace.registry.map((entry) => entry.alias)
  const relayHost = architecture.packages[architecture.relayContainment.package]?.domains
  return [
    ...aliases.filter((alias) => !(alias in architecture.packages)).map((alias) => at(alias, "registered in module-registry.json but not described")),
    ...Object.keys(architecture.packages).filter((alias) => !aliases.includes(alias)).map((alias) => at(alias, "described but not in module-registry.json")),
    ...Object.entries(architecture.layers).flatMap(([layer, allowed]) => allowed.filter((reference) => !known(reference)).map((reference) => at(`layers.${layer}`, `unknown layer ${reference}`))),
    ...workspace.members.flatMap((member) => {
      const spec = member.spec
      const where = `packages.${member.alias}`
      const domains = Object.entries(spec.domains ?? {})
      return [
        ...(layers.includes(spec.layer) ? [] : [at(where, `unknown layer ${spec.layer}`)]),
        ...(exists(`${member.path}/package.json`) ? [] : [at(where, `${member.path}/package.json does not exist`)]),
        ...(spec.entries ?? [])
          .filter((entry) => {
            const hit = resolveExport(member.manifest.exports, `./${entry}`)
            return !hit || !exists(path.posix.join(member.path, hit.target))
          })
          .map((entry) => at(`${where}.entries`, `entry ${entry} does not resolve to an existing file`)),
        ...(spec.browserSafe ?? []).filter((file) => !exists(`${member.path}/${file}`)).map((file) => at(`${where}.browserSafe`, `${file} does not exist`)),
        ...(spec.modules ?? [])
          .flatMap((module) => [module.path, ...(module.entries ?? [])])
          .filter((file) => !exists(`${member.path}/${file}`))
          .map((file) => at(`${where}.modules`, `${file} does not exist`)),
        ...domains.flatMap(([id, domain]) => [
          ...domain.patterns.filter(malformed).map((pattern) => at(`${where}.domains.${id}`, `malformed pattern ${pattern}`)),
          ...(domain.entry === undefined || exists(`${member.path}/${domain.entry}`) ? [] : [at(`${where}.domains.${id}`, `entry ${domain.entry} does not exist`)]),
        ]),
      ]
    }),
    ...architecture.legacy.filter((entry) => entry.path !== undefined && !exists(entry.path)).map((entry) => at("legacy", `${entry.path} does not exist`)),
    ...architecture.legacy.filter((entry) => entry.compat !== undefined && entry.specifier === undefined).map((entry) => at("legacy", `${entry.path} has compat facades but no specifier`)),
    ...architecture.productEdges.flat().filter((id) => !products.includes(id)).map((id) => at("productEdges", `${id} is not a product domain`)),
    ...(relayHost === undefined
      ? [at("relayContainment", `${architecture.relayContainment.package} has no domains`)]
      : architecture.relayContainment.domains.filter((id) => !(id in relayHost)).map((id) => at("relayContainment", `unknown domain ${id}`))),
    ...architecture.logicalModules.flatMap((module) =>
      module.paths
        .filter((pattern) => !workspace.files.some((file) => (pattern.includes("*") ? patternRank(pattern, file) > 0 : file === pattern)))
        .map((pattern) => at(`logicalModules.${module.id}`, `${pattern} matches nothing`)),
    ),
    ...architecture.assetModules.filter((module) => !exists(module.path)).map((module) => at(`assetModules.${module.id}`, `${module.path} does not exist`)),
    ...architecture.scaffoldReadmes.filter((file) => !file.endsWith("/README.md")).map((file) => at("scaffoldReadmes", `${file} is not a README.md path`)),
  ]
}

function ownershipRule(workspace: Workspace): Violation[] {
  return workspace.members
    .filter((member) => member.spec.domains !== undefined)
    .flatMap((member) => {
      const domains = member.spec.domains ?? {}
      const files = workspace.files.filter((file) => file.startsWith(`${member.path}/src/`)).map((file) => file.slice(member.path.length + 1))
      const at = (file: string, specifier: string, message: string) => ({ rule: "R12", file, specifier, message })
      return [
        ...files.flatMap((file) => {
          const owners = ownerOf(file, domains)
          if (owners.length === 1) return []
          return [at(`${member.path}/${file}`, "ownership", owners.length === 0 ? "no domain owns this file" : `owned by ${owners.join(" and ")} at equal precedence`)]
        }),
        ...Object.entries(domains).flatMap(([id, domain]) =>
          domain.patterns
            .filter((pattern) => !files.some((file) => patternRank(pattern, file) > 0))
            .map((pattern) => at("script/module-architecture.json", `${member.alias}:${id}:${pattern}`, "stale pattern matches no file")),
        ),
      ]
    })
}

function browserSafeRule(workspace: Workspace): Violation[] {
  return workspace.members.flatMap((member) =>
    (member.spec.browserSafe ?? [])
      .map((file) => `${member.path}/${file}`)
      .filter((file) => existsSync(path.join(workspace.root, file)))
      .flatMap((file) =>
        specifiersOf(file, readFileSync(path.join(workspace.root, file), "utf8")).map((item) => ({
          rule: "R2",
          file,
          specifier: item.specifier,
          message: "a browserSafe file must import nothing",
        })),
      ),
  )
}

function wildcardRule(workspace: Workspace): Violation[] {
  return workspace.members.flatMap((member) => {
    const exports = member.manifest.exports
    const keys = exports && typeof exports === "object" && !Array.isArray(exports) ? Object.keys(exports) : []
    return keys
      .filter((key) => key.includes("*") && !(member.spec.assetWildcards ?? []).includes(key))
      .map((key) => ({ rule: "R6a", file: `${member.path}/package.json`, specifier: key, message: "code wildcard in exports" }))
  })
}

function readmeRule(workspace: Workspace, exists: (file: string) => boolean): Violation[] {
  const read = (file: string) => (existsSync(path.join(workspace.root, file)) ? readFileSync(path.join(workspace.root, file), "utf8") : undefined)
  const problems = new Map<string, string[]>()
  const add = (file: string, problem: string) => problems.set(file, [...(problems.get(file) ?? []), problem])
  workspace.members.forEach((member) => {
    const file = `${member.path}/README.md`
    const text = read(file)
    if (text === undefined) return add(file, "missing")
    const start = text.indexOf(README_START)
    const end = text.indexOf(README_END, start)
    if (start < 0 || end < 0) return add(file, "no generated module-contract block")
    if (text.slice(start, end + README_END.length) !== renderReadmeBlock(workspace, member.alias))
      add(file, "module-contract block differs from script/module-readme.ts output")
  })
  workspace.architecture.scaffoldReadmes.forEach((file) => {
    const text = read(file)
    if (text === undefined) return add(file, "missing")
    const headings = text.split(/\r?\n/).filter((line) => line.startsWith("## ")).map((line) => line.slice(3).trim()).filter((line) => HEADINGS.includes(line))
    if (headings.join("|") !== HEADINGS.join("|")) add(file, `scaffold headings missing or out of order (found: ${headings.join(", ") || "none"})`)
    ;[...text.matchAll(REPO_PATH)]
      .map((match) => (match[1] ?? "").replace(/\/$/, ""))
      .filter((reference) => !/[*<>{}]/.test(reference) && !exists(reference))
      .forEach((reference) => add(file, `names missing path ${reference}`))
  })
  return [...problems].map(([file, list]) => ({ rule: "R8", file, specifier: "README", message: list.join("; ") }))
}

function readLedger(file: string): Entry[] | string {
  const value: unknown = JSON.parse(readFileSync(file, "utf8"))
  const entries = value && typeof value === "object" && "entries" in value ? value.entries : undefined
  if (!Array.isArray(entries)) return `${LEDGER}: expected { "entries": [...] }`
  const text = (entry: unknown, field: string) => {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>)[field] : undefined
    return typeof item === "string" && item.trim().length > 0 ? item : undefined
  }
  const valid = entries.filter(
    (entry): entry is Entry =>
      ["rule", "file", "specifier", "reason"].every((field) => text(entry, field) !== undefined) && (text(entry, "rule") ?? "") in REASONS,
  )
  if (valid.length !== entries.length) return `${LEDGER}: every entry needs a ledgerable rule and non-empty file, specifier and reason`
  const keys = valid.map((entry) => `${entry.rule}|${entry.file}|${entry.specifier}`)
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index)
  return duplicate === undefined ? valid : `${LEDGER}: duplicate entry ${duplicate}`
}

function writeLedger(file: string, entries: Entry[]) {
  const sorted = [...entries].sort((a, b) => `${a.rule}|${a.file}|${a.specifier}`.localeCompare(`${b.rule}|${b.file}|${b.specifier}`))
  writeFileSync(file, JSON.stringify({ entries: sorted.map((entry) => ({ ...pick(entry), reason: entry.reason })) }, null, 2) + "\n")
}

function pick(item: { rule: string; file: string; specifier: string }) {
  return { rule: item.rule, file: item.file, specifier: item.specifier }
}
