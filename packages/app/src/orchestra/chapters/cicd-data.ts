type Entry = { path: string; type: "file" | "directory" }
export type WorkflowInventory = { status: "ready" | "empty" | "error" | "unavailable"; paths: string[] }

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
    if (
      !root.some(
        (entry) => entry.type === "directory" && entry.path.replaceAll("\\", "/").replace(/\/$/, "") === ".github",
      )
    )
      return { status: "empty", paths: [] }
    const github = await list(".github")
    if (
      !github.some(
        (entry) =>
          entry.type === "directory" && entry.path.replaceAll("\\", "/").replace(/\/$/, "") === ".github/workflows",
      )
    )
      return { status: "empty", paths: [] }
    const paths = workflowFiles(await list(".github/workflows"))
    return { status: paths.length ? "ready" : "empty", paths }
  }
  return inventory().catch((error: unknown) => ({ status: workflowFailure(error), paths: [] }))
}

export function workflowFailure(error: unknown): "error" | "unavailable" {
  const cause = error instanceof Error ? error.cause : error
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  return status === 404 || status === 405 || status === 501 ? "unavailable" : "error"
}
