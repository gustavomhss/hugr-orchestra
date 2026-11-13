export * as BackendToolkitNoticeSources from "./notice-sources"

import type { NativeEngine } from "./manifest"

type Notice = NonNullable<NativeEngine["notices"]>[number]
type Sources = {
  readonly raw: ReadonlyArray<{ readonly url: string; readonly sha256: string; readonly filename: string }>
  readonly archives: ReadonlyArray<{
    readonly url: string
    readonly sha256: string
    readonly format: string
    readonly files: ReadonlyArray<{ readonly member: string; readonly sha256: string; readonly filename: string }>
  }>
}

/** Exact upstream notice bytes; no rewriting, concatenation or inferred attribution text. */
export function from(sources: Sources): ReadonlyArray<Notice> {
  return [
    ...sources.raw.map((item): Notice => ({ url: item.url, integrity: integrity(item.sha256), filename: item.filename })),
    ...sources.archives.flatMap((source) => {
      const format = source.format
      if (format !== "zip" && format !== "tar.gz") throw new Error("notice-source-format")
      return source.files.map((file): Notice => ({
        url: source.url, integrity: integrity(file.sha256), filename: file.filename,
        archive: { format, integrity: integrity(source.sha256), member: file.member },
      }))
    }),
  ]
}

function integrity(hex: string): `sha256-${string}` {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("notice-source-digest")
  return `sha256-${Buffer.from(hex, "hex").toString("base64")}`
}
