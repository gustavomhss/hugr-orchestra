export type ExportableDiff = { file: string; patch?: string }

// Resolves each listed file's patch text, at most `limit` loads at a time. A file keeps whatever patch
// text it has, binary and rename-only headers included; a file with no text at all is skipped.
export async function collectPatches<T extends ExportableDiff>(input: {
  diffs: readonly T[]
  needsLoad: (diff: T) => boolean
  load: (diff: T) => Promise<string | undefined>
  limit?: number
}) {
  const patches = new Array<string | undefined>(input.diffs.length)
  const queue = input.diffs.map((diff, index) => ({ diff, index }))
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const listed = next.diff.patch
      const loaded = input.needsLoad(next.diff) ? await input.load(next.diff).catch(() => undefined) : undefined
      patches[next.index] = loaded ?? listed
    }
  }
  await Promise.all(Array.from({ length: Math.min(input.limit ?? 8, queue.length) }, worker))
  return {
    patches: patches.filter((patch): patch is string => !!patch?.trim()),
    skipped: input.diffs.filter((_, index) => !patches[index]?.trim()).map((diff) => diff.file),
  }
}

// One unified diff: every patch ends its own last line, and none gains blank lines between them.
export function joinPatches(patches: readonly string[]) {
  return patches.map((patch) => (patch.endsWith("\n") ? patch : patch + "\n")).join("")
}
