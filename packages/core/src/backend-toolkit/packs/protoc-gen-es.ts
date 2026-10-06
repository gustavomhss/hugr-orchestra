import type { Pack } from "../manifest"
import lock from "./protoc-gen-es.package-lock.json"

const VERSION = "2.16.0"

export default {
  id: "protoc-gen-es",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "bufbuild/protobuf-es",
  runtime: "node",
  install: {
    kind: "npm",
    // The package.json text the lock was written from, in npm's own formatting.
    packageJson:
      JSON.stringify(
        { name: "backend-toolkit-protoc-gen-es", private: true, dependencies: { "@bufbuild/protoc-gen-es": VERSION } },
        null,
        2,
      ) + "\n",
    lock: JSON.stringify(lock, null, 2) + "\n",
  },
  launch: ["{install}/node_modules/@bufbuild/protoc-gen-es/bin/protoc-gen-es"],
  fit: { role: "generator", input: "a Buf module of .proto files", skills: ["backend-api"] },
} as const satisfies Pack
