import { patchClaim, settlePatchLoad } from "./patch-load"

export type ExportableDiff = { file: string; patch?: string }

// Resolves each listed file's patch text, at most `limit` loads at a time. A file keeps whatever patch
// text it has, binary and rename-only headers included. A confirmed empty is skipped. A failed load is not.
export async function collectPatches<T extends ExportableDiff>(input: {
  diffs: readonly T[]
  needsLoad: (diff: T) => boolean
  load: (diff: T) => Promise<string | undefined>
  limit?: number
  current?: () => boolean
  report?: (error: unknown) => void
}) {
  const patches = new Array<string | undefined>(input.diffs.length)
  const known = new Array<boolean>(input.diffs.length)
  const failed = new Array<boolean>(input.diffs.length)
  const queue = input.diffs.map((diff, index) => ({ diff, index }))
  const current = () => input.current?.() ?? true
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const listed = next.diff.patch
      if (!input.needsLoad(next.diff)) {
        patches[next.index] = listed
        known[next.index] = true
        continue
      }
      await settlePatchLoad({
        read: input.load(next.diff),
        current,
        apply: (value) => {
          patches[next.index] = value ?? listed
          known[next.index] = true
        },
        report: (error) => {
          failed[next.index] = true
          patches[next.index] = listed
          known[next.index] = true
          input.report?.(error)
        },
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(input.limit ?? 8, queue.length) }, worker))
  return {
    patches: patches.filter((patch): patch is string => !!patch?.trim()),
    skipped: input.diffs
      .filter((_, index) => patchClaim(known[index] ?? false, failed[index] ?? false, patches[index]) === "empty")
      .map((diff) => diff.file),
  }
}

// One unified diff: every patch ends its own last line, and none gains blank lines between them.
export function joinPatches(patches: readonly string[]) {
  return patches.map((patch) => (patch.endsWith("\n") ? patch : patch + "\n")).join("")
}
