// The official Node runner executes only the real SQLite control before store implementation.
import "../../src/main/live-outbox-control.node.test.ts"

console.log(JSON.stringify({ kind: "live-outbox-control-runtime", node: process.version, versions: process.versions, platform: process.platform, arch: process.arch }))
