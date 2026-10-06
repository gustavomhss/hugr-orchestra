// Decisions script/test-ci.ts makes while uploading a snapshot, kept apart so tests can import them: test-ci.ts starts
// uploading as soon as it is loaded.

import { $ } from "bun"

// Of the merge-bases of HEAD with each ref that exists, the one whose tree differs from `tree` in the fewest files.
// Earlier refs win ties.
export async function closestBase(cwd: string, refs: string[], tree: string) {
  const candidates = await Promise.all(
    refs.map(async (ref) => {
      const result = await $`git merge-base HEAD ${ref}`.cwd(cwd).quiet().nothrow()
      if (result.exitCode !== 0) return undefined
      const base = result.text().trim()
      const files = await $`git diff-tree -r -z --no-renames --name-only ${base} ${tree}`.cwd(cwd).text()
      return { base, files: files.split("\0").filter(Boolean).length }
    }),
  )
  return candidates
    .filter((candidate) => candidate !== undefined)
    .toSorted((a, b) => a.files - b.files)
    .at(0)?.base
}
