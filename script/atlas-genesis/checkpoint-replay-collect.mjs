// Runner-only collection: never copy into restricted-user paths with elevated write authority.
import assert from "node:assert/strict"
import { lstatSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function collectNetworkProof(source, destination) {
  for (const directory of [source, destination]) {
    const stat = lstatSync(directory)
    assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o022) === 0,
      "checkpoint replay collection: unsafe receipt directory")
  }
  const receipts = ["network-positive.json", "network-isolated.json"].map((name) => {
    const path = join(source, name)
    const stat = lstatSync(path)
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o022) === 0,
      "checkpoint replay collection: unsafe network receipt")
    return { name, bytes: readFileSync(path) }
  })
  const routes = receipts.map((receipt) => JSON.parse(receipt.bytes))
  assert(Array.isArray(routes[0]) && routes[0].length > 0, "checkpoint replay collection: empty network positive control")
  assert(Array.isArray(routes[1]) && routes[1].length === 0, "checkpoint replay collection: isolated network has routes")
  // O_EXCL refuses existing files, hardlinks, FIFOs and destination symlinks before following or writing.
  for (const receipt of receipts) writeFileSync(join(destination, receipt.name), receipt.bytes, { flag: "wx", mode: 0o600 })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, "usage: checkpoint-replay-collect.mjs <runner-private-network-receipts> <owned-output>")
  collectNetworkProof(process.argv[2], process.argv[3])
}
