import "../../src/main/live-delivery-manager-control.node.test.ts"
import "../../src/main/live-delivery-manager.node.test.ts"
import "../../src/main/live-delivery-manager-byte.node.test.ts"

console.log(JSON.stringify({ kind: "live-delivery-manager-runtime", node: process.version, versions: process.versions, platform: process.platform, arch: process.arch }))
