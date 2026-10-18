export const RESPONSE_DOWNLOAD_CHUNK_BYTES = 64 * 1024

export type ResponseDownloadFailure = { status: "error"; code: "permission_denied" | "transfer_failed" }
export type ResponseDownloadResult = { status: "ok" } | { status: "cancelled" } | ResponseDownloadFailure
export type ResponseDownloadAPI = {
  start(filename: string): Promise<{ status: "ok"; handle: string } | ResponseDownloadFailure>
  ready(handle: string): Promise<ResponseDownloadResult>
  write(handle: string, sequence: number, chunk: ArrayBuffer): Promise<ResponseDownloadResult>
  finish(handle: string, sequence: number): Promise<ResponseDownloadResult>
  cancel(handle: string): Promise<ResponseDownloadResult>
}
