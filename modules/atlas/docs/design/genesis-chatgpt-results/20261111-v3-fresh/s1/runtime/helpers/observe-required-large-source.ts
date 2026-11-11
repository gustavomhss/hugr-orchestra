import { observeOwnershipInput } from "./code/modules/atlas/packages/adapter-io/src/ownership-input.ts"
import { readNativeFile } from "./code/modules/atlas/packages/adapter-io/src/genesis-native-io.ts"

const root = process.argv[2]
if (!root) throw new Error("source root required")
const path = "packages/client/src/generated/types.ts"
const observation = observeOwnershipInput(root, `file:${path}`)
let importerRead: { kind: string; byte_length?: number; error?: string }
try {
  const bytes = readNativeFile(root, path, 256000)
  importerRead = { kind: "read", byte_length: bytes.length }
} catch (error) {
  importerRead = { kind: "error", error: error instanceof Error ? error.message : String(error) }
}
console.log(JSON.stringify({ operation: "observe required source using unchanged release functions", path, observation, importerRead }))
