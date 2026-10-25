import path from "path"
import { LANGUAGE_EXTENSIONS } from "../../util/filetype"

export type DiffMode = "git" | "branch" | "last-turn"
export type DiffViewerFocus = "patches" | "files"
export type DiffView = "split" | "unified"

type DiffFile = {
  readonly file: string
  readonly patch?: string
  readonly additions: number
  readonly deletions: number
  readonly status: "added" | "deleted" | "modified"
}

export const normalizeDiffs = (
  diffs: ReadonlyArray<{
    readonly file?: string
    readonly patch?: string | null
    readonly additions: number
    readonly deletions: number
    readonly status?: DiffFile["status"] | null
  }>,
): DiffFile[] =>
  diffs.flatMap((item) =>
    item.file
      ? [
          {
            file: item.file,
            patch: item.patch ?? undefined,
            additions: item.additions,
            deletions: item.deletions,
            status: item.status ?? "modified",
          } satisfies DiffFile,
        ]
      : [],
  )

export function filetype(input?: string) {
  if (!input) return "none"
  const language = LANGUAGE_EXTENSIONS[path.extname(input)]
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript"
  return language
}

export function storedView(value: unknown): DiffView | undefined {
  if (value === "split" || value === "unified") return value
}

export function diffSourceLabel(mode: DiffMode) {
  if (mode === "last-turn") return "last turn"
  if (mode === "branch") return "main branch"
  return "working tree"
}
