// Runner-only collection: never copy into restricted-user paths with elevated write authority.
import assert from "node:assert/strict"
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
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

/** Runs as the restricted UID: expose only its own regular, singly linked output for collection. */
export function publishReplayOutput(source) {
  walkOutput(source, process.getuid(), (_path, fd) => fchmodSync(fd, 0o755), (_path, fd) => fchmodSync(fd, 0o644))
}

/** Runs as the runner. Opened-descriptor checks prevent source path swaps from reading runner-private files. */
export function collectReplayOutput(source, destination, uid) {
  assert(Number.isSafeInteger(uid) && uid >= 0, "checkpoint replay collection: invalid source UID")
  walkOutput(source, uid,
    (path) => mkdirSync(path ? join(destination, path) : destination, { mode: 0o700 }),
    (path, fd) => writeFileSync(join(destination, path), readFileSync(fd), { flag: "wx", mode: 0o600 }))
}

function walkOutput(source, uid, directory, file, relative = "") {
  const fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    assert(stat.uid === uid, "checkpoint replay collection: foreign output owner")
    assert(relative !== "" || stat.isDirectory(), "checkpoint replay collection: output root is not a directory")
    if (stat.isDirectory()) {
      directory(relative, fd)
      for (const name of readdirSync(`/proc/self/fd/${fd}`)) {
        assert(/^[A-Za-z0-9._-]+$/.test(name) && !name.includes("\n") && name !== "." && name !== "..",
          "checkpoint replay collection: invalid output name")
        walkOutput(`/proc/self/fd/${fd}/${name}`, uid, directory, file, join(relative, name))
      }
      return
    }
    assert(stat.isFile() && stat.nlink === 1 && stat.size <= 128 * 1024 * 1024,
      "checkpoint replay collection: unsafe output file")
    file(relative, fd)
  } finally {
    closeSync(fd)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, source, destination, uid] = process.argv.slice(2)
  assert(source && ((mode === "publish" && process.argv.length === 4) ||
    (mode === "output" && process.argv.length === 6) || (mode === "network" && process.argv.length === 5)),
  "usage: checkpoint-replay-collect.mjs publish <output> | output <source> <new-output> <uid> | network <private-receipts> <output>")
  if (mode === "publish") publishReplayOutput(source)
  if (mode === "output") collectReplayOutput(source, destination, Number(uid))
  if (mode === "network") collectNetworkProof(source, destination)
}
