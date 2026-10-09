import { parentPort, workerData } from "node:worker_threads"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { DocumentWork } from "./work"

const Request = Schema.Struct({ kind: Schema.Literals(["pdf", "sheet"]), input: Schema.Unknown,
  data: Schema.Array(Schema.Uint8Array) })
const run = async () => {
  const request = Schema.decodeUnknownSync(Request)(workerData)
  if (request.kind === "pdf") {
    const { operate } = await import("./pdf")
    return DocumentWork.requireReply(await operate(request.input, request.data))
  }
  const { operate } = await import("../sheet/workbook")
  return DocumentWork.requireReply(await operate(request.input, request.data))
}
// Only expected input/library failures are serialized. Parent termination handles timeout/interruption.
void Effect.runPromise(Effect.tryPromise({ try: run, catch: (error) => error instanceof Capability.Failure
  ? error : DocumentWork.failure() }).pipe(Effect.match({
    onSuccess: (result) => parentPort?.postMessage(result),
    onFailure: (error) => parentPort?.postMessage({ status: "error", code: error.code }),
  })))
