export * as OutputHeaders from "./headers"

import { Actions } from "@orchestra/schema/actions"
import { OutputNative } from "./native"

// Additive metadata proposal for parent Schema/Protocol assembly. No Range request
// is invented when the public input has no range field.
export type Info = Actions.TransferInfo & { readonly contentRange?: string; readonly acceptRanges?: string }

export function filename(value: string, fallback: string) {
  const name = value.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, "_").trim().slice(0, 200).replace(/[. ]+$/, "")
  if (!name || name === "." || name === "..") return fallback
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name
}

export function info(binding: Actions.Binding, native: Actions.TransferInfo, headers: Readonly<Record<string, string>>): Info {
  const disposition = headers["content-disposition"]
  if (disposition !== undefined && (disposition.length > 8192 || /[\x00-\x1f\x7f]/.test(disposition)))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Disposition")
  const extended = disposition && /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plain = disposition && /(?:^|;)\s*filename=(?:"([^"\r\n]*)"|([^;]*))/i.exec(disposition)
  const name = extended ? decodeURIComponent(extended.trim()) : plain?.[1] ?? plain?.[2]?.trim()
  const type = safeHeader(binding, headers["content-type"], 512)
  if (type !== undefined && !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:\s*;[^\r\n]*)?$/.test(type))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Type")
  const length = headers["content-length"]
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Length")
  const digest = safeHeader(binding, headers["content-digest"] ?? headers.digest ?? headers["x-amz-checksum-sha256"] ?? native.digest, 1024)
  const contentRange = safeHeader(binding, headers["content-range"], 128)
  if (contentRange !== undefined && !/^bytes (?:\d+-\d+|\*)\/(?:\d+|\*)$/.test(contentRange))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Content-Range")
  const acceptRanges = headers["accept-ranges"]
  if (acceptRanges !== undefined && acceptRanges !== "bytes" && acceptRanges !== "none")
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output Accept-Ranges")
  return { filename: filename(name ?? native.filename, native.filename), contentType: type ?? native.contentType,
    ...(length === undefined ? (native.size === undefined ? {} : { size: native.size }) : { size: Number(length) }),
    ...(digest === undefined ? {} : { digest }), ...(contentRange === undefined ? {} : { contentRange }),
    ...(acceptRanges === undefined ? {} : { acceptRanges }) }
}

function safeHeader(binding: Actions.Binding, value: string | undefined, maximum: number) {
  if (value !== undefined && (value.length > maximum || /[\x00-\x1f\x7f]/.test(value)))
    throw OutputNative.error(binding, "transport_failed", "Provider returned invalid CI output transfer headers")
  return value
}
