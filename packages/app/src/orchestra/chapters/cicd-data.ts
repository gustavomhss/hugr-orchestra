import { Schema } from "effect"

type Entry = { path: string; type: "file" | "directory" }
export type WorkflowInventory = { status: "ready" | "empty" | "error" | "unavailable"; paths: string[] }

export const GITLAB_CI = ".gitlab-ci.yml"
export const TRIGGERS = ["manual", "push", "pullRequest"] as const
export const ENVIRONMENTS = ["preview", "staging", "production"] as const
// `error` means the server could not start the run; `failed` means a command failed.
export const STATUSES = ["idle", "running", "passed", "failed", "error", "cancelled", "interrupted"] as const
export type PipelineStatus = (typeof STATUSES)[number]
export type Pipeline = {
  id: string
  name: string
  branch: string
  trigger: (typeof TRIGGERS)[number]
  command: string
  environment: (typeof ENVIRONMENTS)[number]
  deploy: boolean
  status: PipelineStatus
  runs: number
  log: string
  // Present only while a server PTY owns the run. `ready` records that the start gate was released.
  run?: { ptyID: string; ready: boolean }
}

// Persisted logs keep their tail so a noisy run cannot exhaust profile storage.
export const LOG_LIMIT = 20_000
export const PIPEFAIL_WARNING = "This shell cannot detect a failure inside a pipeline (no pipefail)."

export function workflowFiles(entries: readonly Entry[]) {
  return (
    entries
      // A Unix filename can contain a literal backslash; only native Windows prefixes need normalization.
      .map((entry) => ({
        ...entry,
        path: entry.path.startsWith(".github\\") ? entry.path.replaceAll("\\", "/") : entry.path,
      }))
      .filter(
        (entry) =>
          entry.type === "file" &&
          /^\.github\/workflows\/[^/]*$/.test(entry.path) &&
          (entry.path.endsWith(".yml") || entry.path.endsWith(".yaml")),
      )
      .map((entry) => entry.path)
      .sort()
  )
}

export async function loadWorkflows(list: (path: string) => Promise<readonly Entry[]>): Promise<WorkflowInventory> {
  // Check parents because V2 reports filesystem defects as generic server errors.
  // A failed list must not be mistaken for an absent workflows directory.
  const inventory = async (): Promise<WorkflowInventory> => {
    const root = await list("")
    const gitlab = root.some((entry) => entry.type === "file" && entry.path === GITLAB_CI) ? [GITLAB_CI] : []
    const github = root.some((entry) => entry.type === "directory" && directoryPath(entry.path) === ".github")
      ? await githubWorkflows(list)
      : []
    const paths = [...gitlab, ...github]
    return { status: paths.length ? "ready" : "empty", paths }
  }
  return inventory().catch((error: unknown) => ({ status: workflowFailure(error), paths: [] }))
}

async function githubWorkflows(list: (path: string) => Promise<readonly Entry[]>) {
  const github = await list(".github")
  if (!github.some((entry) => entry.type === "directory" && directoryPath(entry.path) === ".github/workflows"))
    return []
  return workflowFiles(await list(".github/workflows"))
}

function directoryPath(path: string) {
  return path.replaceAll("\\", "/").replace(/\/$/, "")
}

export function workflowFailure(error: unknown): "error" | "unavailable" {
  const cause = error instanceof Error ? error.cause : error
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  return status === 404 || status === 405 || status === 501 ? "unavailable" : "error"
}

// Pipelines run in a POSIX shell regardless of the profile's interactive shell. Windows servers use
// Git for Windows' sh from its default install location.
export function posixShell(directory: string) {
  return /^[A-Za-z]:[\\/]/.test(directory) || directory.startsWith("\\\\")
    ? "C:\\Program Files\\Git\\bin\\sh.exe"
    : "/bin/sh"
}

// Each command line is one step, like a CI `script` entry: lines ending in `\`, `&&`, `||` or `|`
// continue on the next line. Steps run through `eval` in one shell so `cd` and exports carry over,
// and `set -e` on each `eval` status stops at the first failing step, including a failed `a && b`.
// The shell first blocks on one line of PTY input so no output is produced before the page attaches.
export function pipelineScript(command: string) {
  const steps = command
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .reduce<string[]>((result, line) => {
      const previous = result.at(-1)
      if (previous !== undefined && /(\\|&&|\|\||\|)\s*$/.test(previous))
        return [...result.slice(0, -1), `${previous}\n${line}`]
      return [...result, line]
    }, [])
    .filter((step) => step.trim())
  const pipes = steps.some((step) => /(^|[^|])\|([^|]|$)/.test(step))
  return [
    "IFS= read -r orchestra_ready",
    "set -e",
    `if (set -o pipefail) 2>/dev/null; then set -o pipefail;${pipes ? ` else echo ${quote(PIPEFAIL_WARNING)};` : ""} fi`,
    ...steps.map((step) => `eval ${quote(step)}`),
  ].join("\n")
}

function quote(text: string) {
  return `'${text.replaceAll("'", `'\\''`)}'`
}

// Stored profile pipelines, decoded strictly when another tab or window may have written them.
export const decodeStoredPipelines = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      pipelines: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          branch: Schema.String,
          trigger: Schema.Literals(TRIGGERS),
          command: Schema.String,
          environment: Schema.Literals(ENVIRONMENTS),
          deploy: Schema.Boolean,
          status: Schema.Literals(STATUSES),
          runs: Schema.Number,
          log: Schema.String,
          run: Schema.optionalKey(Schema.Struct({ ptyID: Schema.String, ready: Schema.Boolean })),
        }),
      ),
    }),
  ),
)

// Terminal output rendered as plain log text: escape sequences dropped, carriage-return redraws
// collapsed to the final state of each line, and the echoed start gate removed.
export function plainLog(raw: string) {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/\r+\n/g, "\n")
    .split("\n")
    .map((line) => line.slice(line.lastIndexOf("\r") + 1).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ""))
    .join("\n")
    .replace(/^\n/, "")
    .replace(/\n+$/, "")
}

export function tailLog(text: string, limit = LOG_LIMIT) {
  if (text.length <= limit) return text
  return `…\n${text.slice(text.length - limit)}`
}
