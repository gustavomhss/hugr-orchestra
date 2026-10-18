export const captureByteCap = 8 * 1024 * 1024

export function requireCaptureLength(length: string | null) {
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > captureByteCap))
    throw new Error("PROVIDER_CAPTURE_REQUEST_TOO_LARGE")
}

// Reused by request admission and the response capture tee. This boundary caps
// retained bytes before buffering, and aborts the shared fetch before awaiting
// tee cancellation (which otherwise waits for a still-live forwarded sibling).
export async function readCaptureBytes(body: ReadableStream<Uint8Array> | null, options: {
  failure: string
  controller?: AbortController
  report?: (error: Error, bytes: number) => void
}) {
  if (!body) return Buffer.alloc(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  const size = { bytes: 0 }
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size.bytes += chunk.value.byteLength
    if (size.bytes > captureByteCap) {
      const error = new Error(options.failure)
      options.report?.(error, size.bytes)
      options.controller?.abort(error)
      return reader.cancel(error).then(
        () => { throw error },
        (cause: unknown) => { throw new AggregateError([error, cause], error.message) },
      )
    }
    chunks.push(chunk.value)
  }
  return Buffer.concat(chunks)
}
