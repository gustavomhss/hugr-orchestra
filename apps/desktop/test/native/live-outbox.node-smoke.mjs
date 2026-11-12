// Hosted Node runner only: actual node:sqlite, not Bun emulation or Electron qualification.
import "../../src/main/live-outbox.node.test.ts"
import "../../src/main/live-outbox-control.node.test.ts"

console.log(JSON.stringify({ kind: "live-outbox-runtime", node: process.version, versions: process.versions, platform: process.platform, arch: process.arch }))
