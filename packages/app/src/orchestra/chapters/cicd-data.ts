type Entry = { path: string; type: "file" | "directory" }
export type WorkflowInventory = { status: "ready" | "empty" | "error" | "unavailable"; paths: string[] }

export const GITLAB_CI = ".gitlab-ci.yml"
export const TRIGGERS = ["manual", "push", "pullRequest"] as const
export const ENVIRONMENTS = ["preview", "staging", "production"] as const
export type PipelineStatus = "idle" | "running" | "passed" | "failed" | "cancelled" | "interrupted"
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
export const LOG_LIMIT = 100_000

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

// The shell blocks on one line of PTY input until the page has attached, so fast commands cannot
// finish before their output is observed. `set -e` gives multi-line commands CI semantics.
export function pipelineScript(command: string) {
  return `IFS= read -r orchestra_ready\nset -e\n${command}`
}

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
