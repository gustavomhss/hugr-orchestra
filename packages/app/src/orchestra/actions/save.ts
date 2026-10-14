import type { Platform } from "@/context/platform"

/** Only streamed saves are accepted; caller owns abort and source cancellation. */
export async function saveActionsResponse(response: Response, platform: Platform) {
  if (!response.body) throw new Error("transfer_failed")
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get("content-disposition") ?? "")?.[1]
  const filename = encoded ? decodeURIComponent(encoded) : "download"
  if ("downloadResponse" in platform && typeof platform.downloadResponse === "function") {
    await platform.downloadResponse(response, filename)
    return
  }
  if (!("showSaveFilePicker" in window) || typeof window.showSaveFilePicker !== "function")
    throw new Error("streaming_save_unavailable")
  const handle: unknown = await window.showSaveFilePicker({ suggestedName: filename })
  if (!handle || typeof handle !== "object" || !("createWritable" in handle) || typeof handle.createWritable !== "function")
    throw new Error("streaming_save_unavailable")
  const target: unknown = await handle.createWritable()
  if (!(target instanceof WritableStream)) throw new Error("streaming_save_unavailable")
  await response.body.pipeTo(target)
}
