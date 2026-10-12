#!/usr/bin/env bun
// Ripgrep pin gate. Every archive digest pinned in packages/core/src/ripgrep/binary.ts must equal the digest in
// upstream's published .sha256 file for that archive. The CI action and the Linux sandbox runtime take their pins from
// the same table (packages/core/test/ripgrep-binary.test.ts guards the action), so this checks all of them.
//
// Reach: every platform key RipgrepBinary.keys() lists; no keys at all is a failure, not a pass. It reads only the
// small .sha256 text files, over https, each request with a deadline; transient failures are retried, a 404 is not.
//
// Usage: bun run script/check-ripgrep-pins.ts

import { RipgrepBinary } from "../packages/core/src/ripgrep/binary"

const keys = RipgrepBinary.keys()
if (keys.length === 0) fail("RipgrepBinary.keys() listed no platforms")

const problems = (
  await Promise.all(
    keys.map(async (key) => {
      const release = RipgrepBinary.release(key)
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
