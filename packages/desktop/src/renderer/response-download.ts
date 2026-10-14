import {
  RESPONSE_DOWNLOAD_CHUNK_BYTES,
  type ResponseDownloadAPI,
  type ResponseDownloadResult,
} from "../preload/response-download"

/** One source chunk and one bounded IPC copy at a time; each write acknowledges disk completion. */
export function createResponseDownloader(api: ResponseDownloadAPI) {
  const active = new Set<AbortController>()
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      active.forEach((controller) => controller.abort())
    },
    async downloadResponse(response: Response, filename: string) {
      if (!response.body) throw new Error("transfer_failed")
      const reader = response.body.getReader()
      const controller = new AbortController()
      const stopped = Promise.withResolvers<never>()
      const state: {
        failed: boolean
        handle?: string
        sourceCancellation?: Promise<void>
        targetCancellation?: Promise<unknown>
      } = { failed: false }
      const cancelSource = (reason?: unknown) => state.sourceCancellation ??= reader.cancel(reason).catch(() => undefined)
      const cancelTarget = () => {
        if (state.handle) state.targetCancellation ??= api.cancel(state.handle).catch(() => undefined)
      }
      const fail = (error: unknown) => {
        if (state.failed) return
        state.failed = true
        stopped.reject(error)
        void cancelSource(error)
        cancelTarget()
      }
      const abort = () => fail(new DOMException("", "AbortError"))
      controller.signal.addEventListener("abort", abort, { once: true })
      active.add(controller)
      // Observe abort/source errors even while the native chooser or disk acknowledgement is pending.
      void stopped.promise.catch(() => undefined)
      void reader.closed.catch(fail)
      try {
        if (disposed) abort()
        if (state.failed) return await stopped.promise
        const started = await Promise.race([
          api.start(filename).then((result) => {
            if (result.status === "ok") state.handle = result.handle
            if (state.failed) cancelTarget()
            return result
          }),
          stopped.promise,
        ])
        requireDownloadSuccess(started)
        if (started.status !== "ok") return
        requireDownloadSuccess(await Promise.race([api.ready(started.handle), stopped.promise]))
        let sequence = 0
        while (true) {
          const chunk = await Promise.race([reader.read(), stopped.promise])
          if (chunk.done) break
          if (!(chunk.value instanceof Uint8Array)) throw new Error("transfer_failed")
          for (let offset = 0; offset < chunk.value.byteLength; offset += RESPONSE_DOWNLOAD_CHUNK_BYTES) {
            // Copy only this chunk: passing a view clones its entire backing buffer over IPC.
            const bytes = new ArrayBuffer(Math.min(RESPONSE_DOWNLOAD_CHUNK_BYTES, chunk.value.byteLength - offset))
            new Uint8Array(bytes).set(chunk.value.subarray(offset, offset + bytes.byteLength))
            requireDownloadSuccess(await Promise.race([api.write(started.handle, sequence, bytes), stopped.promise]))
            sequence++
          }
        }
        requireDownloadSuccess(await Promise.race([api.finish(started.handle, sequence), stopped.promise]))
      } catch (error) {
        fail(error)
        throw error
      } finally {
        controller.signal.removeEventListener("abort", abort)
        active.delete(controller)
        await cancelSource()
        await state.targetCancellation
        reader.releaseLock()
      }
    },
  }
}

function requireDownloadSuccess(result: ResponseDownloadResult) {
  if (result.status === "cancelled") throw new DOMException("", "AbortError")
  if (result.status === "error") {
    if (result.code === "permission_denied") throw new DOMException(result.code, "NotAllowedError")
    throw new Error(result.code)
  }
}
