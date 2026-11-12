// Restore only into a fresh recovery directory. Import candidates through retained-candidates.mjs afterward.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { checkpointRemote } from "./checkpoint-remote.mjs"
import { restoreChain } from "./checkpoint.mjs"

const [identityFile, destination] = process.argv.slice(2)
assert(identityFile && destination && process.argv.length === 4, "usage: checkpoint-restore.mjs <expected-identity.json> <new-directory>")
const identity = JSON.parse(readFileSync(identityFile, "utf8"))
const remote = checkpointRemote({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN })
const records = await remote.read(identity)
const chain = restoreChain(records, identity, destination)
console.log(JSON.stringify({ restoredSnapshots: chain.envelopes.filter((envelope) => envelope.kind === "snapshot").length,
  completedCommands: chain.completions.length, inFlightCommands: chain.inFlight.length }))
