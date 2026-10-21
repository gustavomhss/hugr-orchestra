import { getFilename } from "@orchestra/core/util/path"
import type { FileContent, FileNode } from "@/v2-wire"
import type { useSDK } from "../sdk"

type DirectorySDK = ReturnType<ReturnType<typeof useSDK>>

// The V2 server lists location-relative entries and serves raw bytes; both are shaped back into the legacy
// file models the tree and viewers render.
export async function listFileNodes(sdk: DirectorySDK, path: string): Promise<FileNode[]> {
  const result = await sdk.api.file.list({ path, location: { directory: sdk.directory } })
  const root = sdk.directory.replace(/[\\/]+$/, "")
  return result.data.map((entry) => ({
    name: getFilename(entry.path),
    path: entry.path,
    absolute: `${root}/${entry.path}`,
    type: entry.type,
    ignored: false,
  }))
}

export async function readFileContent(sdk: DirectorySDK, path: string): Promise<FileContent | undefined> {
  const bytes = await sdk.api.file.read({ path, location: { directory: sdk.directory } })
  const mimeType = MEDIA[path.slice(path.lastIndexOf(".") + 1).toLowerCase()]
  // Images and audio keep their bytes as base64, as V1 serves them, so the media viewers can preview them. Other
  // content with a NUL byte is binary, which the viewers show without a body.
  if (mimeType && mimeType !== "image/svg+xml")
    return { type: "binary", content: base64(bytes), encoding: "base64", mimeType }
  if (bytes.includes(0)) return { type: "binary", content: "" }
  return { type: "text", content: new TextDecoder().decode(bytes), ...(mimeType ? { mimeType } : {}) }
}

const MEDIA: Record<string, string | undefined> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
}

// btoa takes a binary string; chunks keep String.fromCharCode under the engine's argument limit.
function base64(bytes: Uint8Array) {
  return btoa(
    Array.from({ length: Math.ceil(bytes.length / 0x8000) }, (_, index) =>
      String.fromCharCode(...bytes.subarray(index * 0x8000, (index + 1) * 0x8000)),
    ).join(""),
  )
}
