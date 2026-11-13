import { lstatSync } from "node:fs"
import { join } from "node:path"
import { nativeRoot, readNativeFile } from "./genesis-native-io.js"

/** Internal state is not a native package input. Keep nativePath's .atlas prohibition intact. */
export function readEvaluationStateFile(repoPath: string, name: string): Uint8Array {
  if (!/^(?:evaluation-store\.json|evaluation-policy\.json|evaluation-budget-[0-9a-f]{64}\.json)$/.test(name))
    throw new Error("evaluation-state-name")
  const root = nativeRoot(repoPath), directory = nativeRoot(join(root, ".atlas"))
  const rootBefore = lstatSync(root)
  const before = lstatSync(directory), file = join(directory, name), input = lstatSync(file)
  if (input.isSymbolicLink() || !input.isFile() || input.nlink !== 1) throw new Error("evaluation-state-alias")
  // Reuse descriptor-bound bounded IO with a validated basename, not a package-path exception.
  const bytes = readNativeFile(directory, name, 16384)
  const rootAfter = lstatSync(root)
  const after = lstatSync(directory), output = lstatSync(file)
  if (nativeRoot(repoPath) !== root || nativeRoot(join(root, ".atlas")) !== directory ||
    rootBefore.dev !== rootAfter.dev || rootBefore.ino !== rootAfter.ino ||
    before.dev !== after.dev || before.ino !== after.ino || output.isSymbolicLink() ||
    !output.isFile() || output.nlink !== 1 || input.dev !== output.dev || input.ino !== output.ino)
    throw new Error("evaluation-state-alias")
  return bytes
}
