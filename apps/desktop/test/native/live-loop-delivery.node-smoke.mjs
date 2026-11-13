import "../../src/main/live-loop-delivery.node.test.ts"

console.log(JSON.stringify({ kind: "live-loop-delivery-runtime", node: process.version, versions: process.versions, platform: process.platform, arch: process.arch }))
