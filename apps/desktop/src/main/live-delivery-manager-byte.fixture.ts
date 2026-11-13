import type { ServerResponse } from "node:http"

export type ByteWriteObservation = {
  bodyBytesWritten: number
  lastWrite: number
  writeCompleted: number
  closed: boolean
  bytesWritten: () => number
}

// This is the real test transport producer, not the delivery manager or its byte-cap policy.
export async function writeByteOverflow(response: ServerResponse, limit: number, observation: ByteWriteObservation, failures: unknown[]) {
  const socket = response.socket
  observation.bytesWritten = () => socket?.bytesWritten ?? 0
  response.once("close", () => { observation.closed = true })
  const write = (text: string) => new Promise<boolean>((resolve, reject) => {
    if (response.destroyed) { resolve(false); return }
    let settled = false
    const finish = (completed: boolean, error?: NodeJS.ErrnoException | null) => {
      const unexpected = error && (!response.destroyed || !["ECONNRESET", "EPIPE", "ERR_STREAM_PREMATURE_CLOSE", "ERR_STREAM_DESTROYED"].includes(error.code ?? ""))
      if (unexpected) {
        console.error(JSON.stringify({ kind: "live-delivery-fixture-write-error", name: error.name.slice(0, 128), code: error.code?.slice(0, 128) ?? null, message: error.message.slice(0, 128), responseDestroyed: response.destroyed, writableEnded: response.writableEnded, writableFinished: response.writableFinished, socketDestroyed: socket?.destroyed ?? null, closed: observation.closed, writeCompleted: observation.writeCompleted, bodyBytesWritten: observation.bodyBytesWritten }))
        failures.push(error)
      }
      if (settled) return
      settled = true; response.off("close", closed)
      if (unexpected) { reject(error); return }
      resolve(completed)
    }
    const closed = () => finish(false)
    response.once("close", closed)
    observation.bodyBytesWritten += Buffer.byteLength(text); observation.lastWrite = Date.now()
    try {
      response.write(text, (error) => {
        if (!error) observation.writeCompleted++
        finish(!error && !response.destroyed, error)
      })
    } catch (error) {
      response.off("close", closed); failures.push(error)
      if (settled) return
      settled = true; reject(error)
    }
  })
  response.writeHead(200, { "content-type": "application/json" })
  if (!(await write('{"padding":"'))) return
  const chunk = "é".repeat(32 * 1024)
  for (let bytes = 0; bytes <= limit && !response.destroyed; bytes += Buffer.byteLength(chunk)) {
    if (!(await write(chunk))) return
  }
  // Intentionally leave this valid JSON prefix open: only byte-cap enforcement can block before10s.
}
