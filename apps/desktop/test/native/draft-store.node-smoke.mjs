// The CI Node runner loads this TypeScript suite with --experimental-strip-types.
import "../../src/main/draft-store.node.test.ts"

console.log(JSON.stringify({ kind: "draft-store-runtime", node: process.version, platform: process.platform, arch: process.arch }))
