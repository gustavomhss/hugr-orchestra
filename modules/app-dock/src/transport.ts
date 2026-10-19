/** The message channel to Electron main. Today `process.parentPort` (utilityProcess); a V2 `serve` child gets B4's local channel. */
export interface Transport {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
}
