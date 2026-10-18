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
      const state: {
        failed: boolean
        finalizing: boolean
        reason?: unknown
        waiter?: (error: unknown) => void
        handle?: string
        sourceCancelled: boolean
        targetCancellation?: Promise<unknown>
      } = { failed: false, finalizing: false, sourceCancelled: false }
      const cancelSource = (reason?: unknown) => {
        if (state.sourceCancelled) return
        state.sourceCancelled = true
        // A tee's cancellation promise can wait for its other branch indefinitely.
        void reader.cancel(reason).catch(() => undefined)
      }
      const cancelTarget = () => {
        if (state.handle) state.targetCancellation ??= api.cancel(state.handle).catch(() => undefined)
      }
      const fail = (error: unknown) => {
        if (state.failed) return
        state.failed = true
        state.reason = error
        const reject = state.waiter
        state.waiter = undefined
        reject?.(error)
        cancelSource(error)
        cancelTarget()
      }
      const wait = <T>(operation: () => Promise<T>) => {
        if (state.failed) return Promise.reject<T>(state.reason)
        // Only the current operation owns a reject callback; settled chunks have no shared stop promise root.
        return new Promise<T>((resolve, reject) => {
          state.waiter = reject
          Promise.resolve().then(() => {
            if (state.failed) throw state.reason
            return operation()
          }).then(
            (value) => { if (state.waiter === reject) state.waiter = undefined; resolve(value) },
            (error: unknown) => { if (state.waiter === reject) state.waiter = undefined; reject(error) },
          )
        })
      }
      const abort = () => fail(new DOMException("", "AbortError"))
      controller.signal.addEventListener("abort", abort, { once: true })
      active.add(controller)
      // Observe abort/source errors even while the native chooser or disk acknowledgement is pending.
      void reader.closed.catch(fail)
      try {
        if (disposed) abort()
        const started = await wait(() => api.start(filename).then((result) => {
          if (result.status === "ok") state.handle = result.handle
          if (state.failed) cancelTarget()
          return result
        }))
        requireDownloadSuccess(started)
        if (started.status !== "ok") return
        requireDownloadSuccess(await wait(() => api.ready(started.handle)))
        let sequence = 0
        while (true) {
          const chunk = await wait(() => reader.read())
          if (chunk.done) break
          if (!(chunk.value instanceof Uint8Array)) throw new Error("transfer_failed")
          for (let offset = 0; offset < chunk.value.byteLength; offset += RESPONSE_DOWNLOAD_CHUNK_BYTES) {
            // Copy only this chunk: passing a view clones its entire backing buffer over IPC.
            const bytes = new ArrayBuffer(Math.min(RESPONSE_DOWNLOAD_CHUNK_BYTES, chunk.value.byteLength - offset))
            new Uint8Array(bytes).set(chunk.value.subarray(offset, offset + bytes.byteLength))
            requireDownloadSuccess(await wait(() => api.write(started.handle, sequence, bytes)))
            sequence++
          }
        }
        if (state.failed) throw state.reason
        // Once submitted, the sink decides whether cancellation beat commit or rename became irreversible.
        state.finalizing = true
        requireDownloadSuccess(await api.finish(started.handle, sequence))
      } catch (error) {
        fail(error)
        throw state.finalizing ? error : state.reason
      } finally {
        controller.signal.removeEventListener("abort", abort)
        active.delete(controller)
        cancelSource()
        reader.releaseLock()
        await state.targetCancellation
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
