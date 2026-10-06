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

// `gh api --include` prints the status line and the headers, a blank line, then the body. Only the body is printed
// when gh fails before GitHub answers.
export function parseResponse(output: string) {
  const end = output.indexOf("\r\n\r\n")
  if (!output.startsWith("HTTP/") || end === -1) return { status: 0, headers: new Map<string, string>(), body: output }
  const lines = output.slice(0, end).split(/\r?\n/)
  return {
    status: Number(lines[0]!.split(" ")[1]),
    headers: new Map(
      lines
        .slice(1)
        .map((line) => [line.slice(0, line.indexOf(":")).toLowerCase(), line.slice(line.indexOf(":") + 1).trim()]),
    ),
    body: output.slice(end + 4),
  }
}

// GitHub rate-limits a request with 429, or with 403 and a message naming a secondary rate limit. Clients must honour
// Retry-After, else wait for X-RateLimit-Reset when no requests remain, else wait a minute and back off exponentially:
// https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#exceeding-the-rate-limit
// Returns how long to wait before retrying, or undefined when the failure is not a rate limit.
export function rateLimitDelay(response: ReturnType<typeof parseResponse>, attempt: number, now = Date.now()) {
  if (response.status !== 429 && !(response.status === 403 && /secondary rate limit/i.test(response.body))) return
  const retryAfter = Number(response.headers.get("retry-after"))
  if (retryAfter > 0) return retryAfter * 1000
  const untilReset = Number(response.headers.get("x-ratelimit-reset")) * 1000 - now
  if (response.headers.get("x-ratelimit-remaining") === "0" && untilReset > 0) return untilReset
  return 60_000 * 2 ** attempt
}
