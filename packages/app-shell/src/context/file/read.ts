import { getFilename } from "@orchestra/core/util/path"
import type { FileContent, FileNode } from "../../compat/sdk-v2"
import type { useSDK } from "../sdk"

type DirectorySDK = ReturnType<ReturnType<typeof useSDK>>

// The V2 server lists location-relative entries and serves raw bytes; both are shaped back into the legacy
// file models the tree and viewers render.
export async function listFileNodes(sdk: DirectorySDK, path: string): Promise<FileNode[]> {
  if ((await sdk.protocol) === "v1") return sdk.client.file.list({ path }).then((x) => x.data ?? [])
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
  if ((await sdk.protocol) === "v1") return sdk.client.file.read({ path }).then((x) => x.data)
  const bytes = await sdk.api.file.read({ path, location: { directory: sdk.directory } })
  // A NUL byte marks binary content, which the viewers show without a text body.
  if (bytes.includes(0)) return { type: "binary", content: "" }
  return { type: "text", content: new TextDecoder().decode(bytes) }
}
