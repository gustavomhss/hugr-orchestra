// Bounded native-package bridge. It creates no policy, credentials, reviewer identities or approvals.
import { writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { isOwnershipNeed } from "@atlas/knowledge"
import { prepareNativePackage, publishNativePackage } from "../packages/adapter-io/src/genesis-native.js"
import { nativeKeys, nativePath, nativeRecord, nativeText, validateNativeReadQuery } from "../packages/adapter-io/src/genesis-native-format.js"
import { decodeNativeUtf8, nativeRoot, readNativeFile } from "../packages/adapter-io/src/genesis-native-io.js"

const usage = "genesis-native.ts prepare <isolated-repo> <package-relative-path> <new-candidate-file> | publish <isolated-repo> <candidate-file> <approval-relative-path> | index|read <isolated-repo> <query-file>"

async function main() {
  const [mode, repo, first, second, ...extra] = process.argv.slice(2)
  if (!repo || !first || extra.length || !["prepare", "publish", "index", "read"].includes(mode ?? "") ||
    ((mode === "prepare" || mode === "publish") ? !second : second !== undefined)) throw new Error(usage)
  const root = nativeRoot(repo)
  const control = (path: string): unknown => {
    const absolute = resolve(path)
    return JSON.parse(decodeNativeUtf8(readNativeFile(nativeRoot(dirname(absolute)), nativePath(basename(absolute)))))
  }
  if (mode === "prepare") {
    const prepared = prepareNativePackage(root, first)
    const output = resolve(second!)
    nativeRoot(dirname(output))
    nativePath(basename(output))
    writeFileSync(output, JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" })
    console.log(JSON.stringify(prepared))
    return
  }
  if (mode === "publish") {
    const result = await publishNativePackage(root, control(first), second!)
    console.log(JSON.stringify(result))
    if (result.kind === "hold" || !result.emission.ok || nativeRecord(result.emission.data, "emit response").emitted !== true) process.exitCode = 2
    return
  }
  const query = nativeRecord(control(first), "query")
  nativeText(query.scope, "query.scope")
  if (mode === "index") {
    nativeKeys(query, ["scope", "need"], "index query")
    if (!isOwnershipNeed(query.need)) throw new Error("native-query-need")
    const { composeRuntime } = await import("../packages/adapter-io/src/compose.js")
    const result = composeRuntime(root).ownership.index(query.scope as string, query.need)
    console.log(JSON.stringify(result))
    if (result.kind === "hold") process.exitCode = 2
    return
  }
  const request = validateNativeReadQuery(query)
  const { composeRuntime } = await import("../packages/adapter-io/src/compose.js")
  const result = composeRuntime(root).ownership.read(request)
  console.log(JSON.stringify(result))
  if (result.kind === "hold") process.exitCode = 2
}

await main().catch((error: unknown) => {
  console.error(JSON.stringify({ kind: "error", error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 1
})
