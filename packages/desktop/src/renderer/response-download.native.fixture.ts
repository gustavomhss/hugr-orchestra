import { createResponseDownloader } from "./response-download"

const downloader = createResponseDownloader(window.api.responseDownload)
const state: { controller?: ReadableStreamDefaultController<Uint8Array>; pulls: number; cancels: number } = { pulls: 0, cancels: 0 }

declare global {
  interface Window {
    responseSaveFixture: {
      download(mode: "bytes" | "pending" | "error" | "clone"): Promise<{ status: string; name?: string; message?: string; pulls: number; cancels: number; locked?: boolean }>
      abort(): void
      dispose(): void
    }
  }
}

window.responseSaveFixture = {
  async download(mode) {
    state.pulls = 0
    state.cancels = 0
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { state.controller = controller },
      pull(controller) {
        if (mode === "pending" || mode === "clone") return
        if (state.pulls === 128) { controller.close(); return }
        if (mode === "error" && state.pulls === 1) { controller.error(new Error("fixture stream failure")); return }
        controller.enqueue(new Uint8Array(4096).fill(state.pulls++))
      },
      cancel() { state.cancels++ },
    }, { highWaterMark: 0 }))
    const clone = mode === "clone" ? response.clone() : undefined
    const result = await downloader.downloadResponse(response, "fixture.bin").then(
      () => ({ status: "ok", pulls: state.pulls, cancels: state.cancels }),
      (error: unknown) => ({ status: "error", name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "unknown", pulls: state.pulls, cancels: state.cancels }),
    )
    if (!clone) return result
    const locked = response.body?.locked
    // Reach this only after the save fails; leaving the clone open must not block failure or reader release.
    await clone.body?.cancel()
    return { ...result, locked }
  },
  abort() { state.controller?.error(new DOMException("fixture abort", "AbortError")) },
  dispose() { downloader.dispose() },
}
