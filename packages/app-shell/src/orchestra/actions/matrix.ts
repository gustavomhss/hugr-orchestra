import type { Actions } from "@orchestra/schema/actions"
import type { ActionKey } from "@/i18n/actions"

type Cell = Record<string, unknown>
type Matcher = { id: string; names: ReadonlySet<string>; pattern?: RegExp }

const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g
// Consecutive expressions collapse into one hole so the pattern never stacks lazy wildcards.
const HOLES = /(?:\$\{\{[\s\S]*?\}\})+/
const MATRIX_PATH = /^matrix((?:\.[A-Za-z_][\w-]*)+)$/
// GitHub runs at most 256 jobs per matrix; larger expansions are treated as unknown.
const MATRIX_LIMIT = 256

// Graph nodes are labelled by the job key, as in the approved mock; `name:` templates may hold expressions.
export function label(job: Actions.GraphJob) {
  return job.id
}

// Stage or runner text without unresolved expressions.
export function placement(job: Actions.GraphJob) {
  if (job.stage) return job.stage
  const values = typeof job.runner === "string" ? [job.runner] : Array.isArray(job.runner) ? job.runner : []
  const text = values.filter((value): value is string => typeof value === "string" && !value.includes("${{")).join(" · ")
  return text || undefined
}

// A native definition identity always wins. Only GitHub (`byName`) is joined by execution name, because its job
// names derive from the workflow source; an execution joins only when exactly one definition can produce its name.
// GitLab names do not prove a definition (parallel/matrix jobs can share them), so they stay unjoined.
export function join(definitions: ReadonlyMap<string, Actions.GraphJob>, jobs: readonly Actions.Job[], byName: boolean) {
  const matchers = byName ? [...definitions.values()].map(matcher) : []
  const result = new Map<string, Actions.Job[]>()
  for (const job of jobs) {
    const id = job.definitionID ? (definitions.has(job.definitionID) ? job.definitionID : undefined) : byName ? named(job.name, matchers) : undefined
    if (!id) continue
    const items = result.get(id) ?? []
    items.push(job)
    result.set(id, items)
  }
  return result
}

// Aggregate result of a matrix, with GitHub's run semantics: it stays in progress while any execution is live and
// has a conclusion only once all are completed; then one failure fails it.
export function aggregate(jobs: readonly Actions.Job[]): { status?: string | null; conclusion?: string | null } {
  if (jobs.length <= 1) return { status: jobs[0]?.status, conclusion: jobs[0]?.conclusion }
  const values = jobs.map((job) => ((job.status === "completed" ? job.conclusion : job.status) ?? job.conclusion ?? "").toLowerCase())
  if (values.some((value) => ["in_progress", "running", "queued", "pending", "waiting", "requested"].includes(value))) return { status: "in_progress" }
  if (values.some((value) => ["failure", "failed", "error", "timed_out", "startup_failure"].includes(value))) return { status: "completed", conclusion: "failure" }
  if (values.every((value) => value === "skipped")) return { status: "completed", conclusion: "skipped" }
  if (values.every((value) => ["success", "passed", "skipped"].includes(value))) return { status: "completed", conclusion: "success" }
  if (values.some((value) => ["cancelled", "canceled"].includes(value))) return { status: "completed", conclusion: "cancelled" }
  return {}
}

// Source diagnostics are `source_<kind>:<code>:<detail>`; users see copy per code plus the job keys it names.
export function notes(diagnostics: readonly string[]) {
  const result = new Map<ActionKey, Set<string>>()
  for (const diagnostic of diagnostics) {
    const parts = diagnostic.replace(/^source_(partial|unresolved):(source_diagnostic:)?/, "").split(":")
    const key = noteKey(parts[0] ?? "", diagnostic.startsWith("source_unresolved"))
    const job = /^jobs\.(.+?)(?:->|\.steps\.|$)/.exec(parts.slice(1).join(":"))?.[1]
    const jobs = result.get(key) ?? new Set<string>()
    if (job) jobs.add(job)
    result.set(key, jobs)
  }
  return [...result].map(([key, jobs]) => ({ key, jobs: [...jobs] }))
}

function noteKey(code: string, unresolved: boolean): ActionKey {
  if (code === "matrix_dynamic") return "orchestra.actions.graph.note.matrixDynamic"
  if (code === "reusable_unresolved") return "orchestra.actions.graph.note.reusable"
  if (code.startsWith("needs_")) return "orchestra.actions.graph.note.needs"
  if (code.startsWith("triggers_")) return "orchestra.actions.graph.note.triggers"
  if (code.includes("include")) return "orchestra.actions.graph.note.includes"
  if (code.includes("input")) return "orchestra.actions.graph.note.inputs"
  if (code.endsWith("_limit") || code === "diagnostics_truncated") return "orchestra.actions.graph.note.limit"
  if (code.startsWith("yaml_")) return "orchestra.actions.graph.note.yaml"
  return unresolved ? "orchestra.actions.graph.note.unresolved" : "orchestra.actions.graph.note.partial"
}

function named(name: string, matchers: readonly Matcher[]) {
  const candidates = matchers.filter((item) => item.names.has(name) || item.pattern?.test(name))
  return candidates.length === 1 ? candidates[0].id : undefined
}

function matcher(job: Actions.GraphJob): Matcher {
  const template = job.name
  const dynamic = template.includes("${{")
  if (job.matrix === undefined && !dynamic && !job.reusable) return { id: job.id, names: new Set([template]) }
  // A job that never expanded (for example a skipped matrix) keeps its literal name, so the template is a name too.
  const cells = job.matrix === undefined ? undefined : cellsOf(job.matrix)
  // Without an expression in its name, GitHub names each matrix execution `<name> (<cell values>)`.
  const names = cells?.map((cell) => dynamic ? interpolate(template, cell) : suffixed(template, cell)) ?? []
  const resolved = names.filter((value): value is string => value !== undefined)
  if (!job.reusable && resolved.length && resolved.length === names.length) return { id: job.id, names: new Set([template, ...resolved]) }
  // Names that cannot be enumerated (unknown cells, non-matrix expressions, called workflows) become anchored patterns.
  const body = dynamic
    ? template.split(HOLES).map(escape).join("[\\s\\S]*?")
    : `${escape(template)}${job.matrix === undefined ? "" : " \\(.+\\)"}`
  // Called workflow jobs are reported as `<caller> / <called job>`.
  return { id: job.id, names: new Set([template]), pattern: new RegExp(`^${body}${job.reusable ? " / .+" : ""}$`) }
}

// GitHub matrix expansion: cross product, then exclude, then include (extends matching cells or adds new ones).
function cellsOf(matrix: unknown) {
  if (!record(matrix) || JSON.stringify(matrix).includes("${{")) return undefined
  const include = matrix.include ?? []
  const exclude = matrix.exclude ?? []
  if (!records(include) || !records(exclude)) return undefined
  const dimensions = Object.entries(matrix).filter(([key]) => key !== "include" && key !== "exclude")
  if (!dimensions.every((entry): entry is [string, unknown[]] => Array.isArray(entry[1]) && entry[1].length > 0)) return undefined
  if (dimensions.reduce((size, [, values]) => size * values.length, 1) > MATRIX_LIMIT) return undefined
  const product = dimensions.reduce<Cell[]>((cells, [key, values]) => cells.flatMap((cell) => values.map((value) => ({ ...cell, [key]: value }))), [{}])
  const keys = new Set(dimensions.map(([key]) => key))
  const base = dimensions.length ? product.filter((cell) => !exclude.some((entry) => Object.entries(entry).every(([key, value]) => same(cell[key], value)))) : []
  const added = include.flatMap((entry) => {
    const matches = base.filter((cell) => Object.entries(entry).every(([key, value]) => !keys.has(key) || same(cell[key], value)))
    matches.forEach((cell) => Object.assign(cell, entry))
    return matches.length ? [] : [{ ...entry }]
  })
  const cells = [...base, ...added]
  return cells.length && cells.length <= MATRIX_LIMIT ? cells : undefined
}

function suffixed(template: string, cell: Cell) {
  const values = Object.values(cell)
  if (!values.every((value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")) return undefined
  return `${template} (${values.map(String).join(", ")})`
}

function interpolate(template: string, cell: Cell) {
  const state = { resolved: true }
  const text = template.replace(EXPRESSION, (_, expression: string) => {
    const path = MATRIX_PATH.exec(expression.trim())?.[1]
    const value = path?.slice(1).split(".").reduce<unknown>((current, key) => record(current) ? current[key] : undefined, cell)
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
    state.resolved = false
    return ""
  })
  return state.resolved ? text : undefined
}

function record(value: unknown): value is Cell {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function records(value: unknown): value is Cell[] {
  return Array.isArray(value) && value.every(record)
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
