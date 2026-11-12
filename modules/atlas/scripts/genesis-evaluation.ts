// Isolated evaluation only. No policy creation, ordinary publish, or promotion command.
import { writeFileSync } from "node:fs"
import { resolve, dirname, basename } from "node:path"
import { isOwnershipNeed } from "@atlas/knowledge"
import { prepareEvaluation, admitEvaluation, admitEvaluationRebuildTarget } from "../packages/adapter-io/src/genesis-evaluation.js"
import { loadEvaluationAccess, initializeEvaluationStore } from "../packages/adapter-io/src/ownership-evaluation-policy.js"
import { nativeRoot, readNativeFile, decodeNativeUtf8 } from "../packages/adapter-io/src/genesis-native-io.js"
import { nativePath, nativeRecord, nativeKeys, nativeText, validateNativeReadQuery } from "../packages/adapter-io/src/genesis-native-format.js"

async function main() {
  const [mode, repo, first, second, ...extra] = process.argv.slice(2)
  if (!repo || !first || extra.length || !["prepare", "init-store", "admit", "admit-target", "read", "index"].includes(mode ?? "") ||
    ((mode === "prepare" || mode === "init-store" || mode === "admit" || mode === "admit-target") ? !second : second !== undefined)) throw new Error("evaluation: prepare|admit root input output-or-approval; read|index root query")
  const root = nativeRoot(repo)
  const control = (path: string) => { const file = resolve(path); return JSON.parse(decodeNativeUtf8(readNativeFile(nativeRoot(dirname(file)), nativePath(basename(file))))) }
  if (mode === "prepare") {
    const prepared = prepareEvaluation(root, first), output = resolve(second!)
    nativeRoot(dirname(output)); nativePath(basename(output))
    writeFileSync(output, JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" })
    console.log(JSON.stringify(prepared)); return
  }
  if (mode === "init-store") {
    const prepared = nativeRecord(control(first), "prepared")
    if (prepared.schema !== "genesis-native-prepared/v2") throw new Error("evaluation-prepared-schema")
    initializeEvaluationStore(root, nativeText(prepared.candidate_id, "candidate") as import("@atlas/contracts").Hash, second! as import("@atlas/contracts").Hash)
    console.log(JSON.stringify({ kind: "evaluation-store-initialized", policy: "NOT_CREATED", admission: "NOT_RUN" })); return
  }
  if (mode === "admit" || mode === "admit-target") {
    const result = mode === "admit" ? await admitEvaluation(root, control(first), second!) : await admitEvaluationRebuildTarget(root, control(first), second!)
    console.log(JSON.stringify(result))
    if (result.kind === "hold" || !result.emission.ok || nativeRecord(result.emission.data, "emission").emitted !== true) process.exitCode = 2
    return
  }
  const query = nativeRecord(control(first), "query"), access = loadEvaluationAccess(root)
  const { composeRuntime } = await import("../packages/adapter-io/src/compose.js")
  const runtime = composeRuntime(root, access)
  if (mode === "index") {
    nativeKeys(query, ["scope", "need"], "index query")
    if (!isOwnershipNeed(query.need)) throw new Error("evaluation-query-need")
    const result = runtime.ownership.index(nativeText(query.scope, "scope"), query.need)
    console.log(JSON.stringify(result)); if (result.kind === "hold") process.exitCode = 2
    return
  }
  const result = runtime.ownership.read(validateNativeReadQuery(query))
  console.log(JSON.stringify(result)); if (result.kind === "hold") process.exitCode = 2
}
await main().catch((error: unknown) => { console.error(JSON.stringify({ kind: "error", phase: "evaluation", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1 })
