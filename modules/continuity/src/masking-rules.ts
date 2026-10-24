export * as ContinuityMaskingRules from "./masking-rules"

import { Token } from "@orchestra/core/util/token"

// Masking rules shared by the V1 continuity service and the V2 strategy; no Session message types here.

/** Assistant steps, with everything after them, whose tool output always stays verbatim. */
export const TAIL_STEPS = 5

/** Failed output keeps this many leading lines verbatim; errors are high-value evidence. */
export const ERROR_LINES = 20

// Planning state, recovered detail and delegation returns are what the model needs next; never hide them.
export const PROTECTED = new Set(["skill", "todowrite", "todoread", "context_recall", "task", "maestro_request_review"])

// Tool arguments that identify a call well enough to re-run or recover it.
export const KEY_ARGS = ["filePath", "path", "command", "pattern", "url", "query", "include", "description"]

// What one inline file (an image, a PDF page) costs a model request; its base64 length says nothing about it.
export const ATTACHMENT_TOKENS = 1_600

/** Only message/attachment media positions are discounted; schemas, JSON results and arguments remain text. */
export function estimate(value: unknown) {
  let files = 0
  const visit = (item: unknown, place: "root" | "message" | "native" | "part" | "state" | "output" | "plain" = "root"): unknown => {
    if (Array.isArray(item)) return item.map((entry) => visit(entry, place === "root" ? "message" : place))
    if (!item || typeof item !== "object") return item
    const object = Object.fromEntries(Object.entries(item))
    const mime = object.mime ?? object.mediaType ?? object.mimeType ?? object.media_type
    const source = object.source && typeof object.source === "object" && !Array.isArray(object.source) ? Object.fromEntries(Object.entries(object.source)) : undefined
    const media = (place === "part" || place === "root") && (object.type === "image" && (object.image !== undefined || object.data !== undefined && typeof mime === "string" && mime.startsWith("image/") ||
      source?.data !== undefined && typeof source.media_type === "string" && source.media_type.startsWith("image/")) ||
      ["file", "media"].includes(String(object.type)) && typeof mime === "string" && /^(image\/|application\/pdf$|audio\/|video\/)/.test(mime) && (object.url !== undefined || object.data !== undefined))
    if (media) {
      files++
      return Object.fromEntries(Object.entries(object).filter(([key]) => !["image", "data", "url", "source"].includes(key)).map(([key, entry]) => [key, visit(entry, "plain")]))
    }
    const info = object.info && typeof object.info === "object" ? Object.fromEntries(Object.entries(object.info)) : undefined
    return Object.fromEntries(Object.entries(object).map(([key, entry]) => {
      const next = place === "root" && key === "messages" ? "message" :
        place === "message" && key === "message" && ["user", "assistant"].includes(String(object.type)) ? "native" :
        place === "message" && key === "attachment" && object.type === "attachment" ? "part" :
        place === "message" && key === "parts" && ["user", "assistant"].includes(String(info?.role)) ? "part" :
        (place === "native" || place === "message" && ["user", "assistant", "tool"].includes(String(object.role))) && key === "content" ? "part" :
        place === "part" && object.type === "tool" && key === "state" ? "state" :
        place === "state" && key === "attachments" ? "part" :
        place === "part" && object.type === "tool-result" && key === "output" ? "output" :
        place === "part" && object.type === "tool_result" && key === "content" ? "part" :
        place === "output" && object.type === "content" && key === "value" ? "part" : "plain"
      return [key, visit(entry, next)]
    }))
  }
  const text = JSON.stringify(visit(value))
  return Token.estimate(text ?? "") + files * ATTACHMENT_TOKENS
}

/** The tool name and the arguments that identify a call well enough to re-run or recover it. */
export function describe(tool: string, input: unknown) {
  const args = KEY_ARGS.flatMap((key) => {
    const value = input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined
    if (typeof value !== "string" || !value.trim()) return []
    const text = value.trim().replace(/\s+/g, " ")
    return [`${key}=${text.length > 160 ? `${text.slice(0, 160)}…` : text}`]
  })
  return [tool, ...args].join(" ")
}
