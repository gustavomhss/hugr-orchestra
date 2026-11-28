import "../../src/main/live-recovery-ipc.node.test.ts"

console.log(JSON.stringify({ kind: "live-recovery-ipc-runtime", node: process.version, versions: process.versions, platform: process.platform, arch: process.arch }))
