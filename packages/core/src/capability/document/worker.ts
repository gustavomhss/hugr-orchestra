import { parentPort, workerData } from "node:worker_threads"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { DocumentWork } from "./work"

const Request = Schema.Struct({ kind: Schema.Literals(["pdf", "sheet"]), input: Schema.Unknown,
  data: Schema.Array(Schema.Uint8Array) })
const run = async () => {
  const request = Schema.decodeUnknownSync(Request)(workerData)
  // The operation's whole lazy module graph loads before the parent may terminate this worker (see DocumentWork.run).
  const { operate } = request.kind === "pdf"
    ? (await Promise.all([import("./pdf"), import("pdf-lib"), import("clawpdf")]))[0]
    : (await Promise.all([import("../sheet/workbook"), import("exceljs"), import("htmlparser2")]))[0]
  parentPort?.postMessage({ status: "loaded" })
  return DocumentWork.requireReply(await operate(request.input, request.data))
}
// Only expected input/library failures are serialized. Parent termination handles timeout/interruption.
void Effect.runPromise(Effect.tryPromise({ try: run, catch: (error) => error instanceof Capability.Failure
  ? error : DocumentWork.failure() }).pipe(Effect.match({
    onSuccess: (result) => parentPort?.postMessage(result),
    onFailure: (error) => parentPort?.postMessage({ status: "error", code: error.code }),
  })))
