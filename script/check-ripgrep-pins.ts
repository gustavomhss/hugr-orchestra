#!/usr/bin/env bun
// Ripgrep pin gate. Every archive digest pinned in packages/core/src/ripgrep/release.ts must equal the digest in
// upstream's published .sha256 file for that archive, and the canonical version must equal upstream's latest release.
// packages/core/test/ripgrep-binary.test.ts guards the CI action's pins; the Linux sandbox runtime reads this table too.
//
// Reach: every platform key RipgrepRelease.keys() lists; no keys at all is a failure, not a pass. It reads only the
// latest release metadata and small .sha256 text files, over https, each request with a deadline; transient failures
// are retried, a 404 is not. It does not download archives or verify extracted executable digests.
//
// Usage: bun run script/check-ripgrep-pins.ts

import { RipgrepRelease } from "../packages/core/src/ripgrep/release"

const keys = RipgrepRelease.keys()
if (keys.length === 0) fail("RipgrepRelease.keys() listed no platforms")

const latest: unknown = await published("https://api.github.com/repos/BurntSushi/ripgrep/releases/latest")
  .then((text) => JSON.parse(text))
  .catch((error: unknown) => fail(`latest release metadata is not readable JSON: ${String(error)}`))
if (!latest || typeof latest !== "object" || !("tag_name" in latest) || typeof latest.tag_name !== "string")
  fail("latest release metadata has no tag_name string")
if (latest.tag_name !== RipgrepRelease.VERSION)
  fail(`canonical version ${RipgrepRelease.VERSION} but upstream's latest release is ${latest.tag_name}`)

const problems = (
  await Promise.all(
    keys.map(async (key) => {
      const release = RipgrepRelease.archive(key)
      if (!release) return [`${key}: no release`]
      const text = await published(`${release.url}.sha256`)
      // Upstream writes `<hex>  <file>` on Unix and certutil's three-line format on Windows.
      const upstream = text.match(/\b[0-9a-f]{64}\b/i)?.[0].toLowerCase()
      console.log(`${key}: pinned ${release.sha256}, upstream ${upstream ?? "none"}`)
      if (upstream !== release.sha256) return [`${key}: pinned ${release.sha256} but upstream publishes ${upstream}`]
      return []
    }),
  )
).flat()

if (problems.length > 0) fail(problems.join("\n"))
console.log(`ripgrep pins: ${keys.length} platforms match upstream`)

async function published(url: string, left = 5): Promise<string> {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) }).catch(
    (error: unknown) => error,
  )
  if (response instanceof Response && response.ok) return response.text()
  const transient = !(response instanceof Response) || response.status >= 500 || response.status === 429
  const reason = response instanceof Response ? `HTTP ${response.status}` : String(response)
  if (!transient || left <= 1) fail(`${url}: ${reason}`)
  await Bun.sleep(5_000)
  return published(url, left - 1)
}

function fail(message: string): never {
  console.error(`ripgrep pins: ${message}`)
  process.exit(1)
}
