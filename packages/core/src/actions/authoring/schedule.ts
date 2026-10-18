import { isAlias, isMap, isScalar, isSeq, Pair, parseDocument } from "yaml"
import { ActionsError } from "../error"
import { diagnostics, read } from "../source/document"
import { bytes } from "./input"

// Reused by the GitHub schedules domain and the source editor. This edits YAML, not a schedule resource.
export function editSchedule(sourceText: string, cronEntries: readonly string[]): string {
  bytes(sourceText)
  const report = diagnostics()
  const checked = read(sourceText, "github", report)
  if (!checked || report.state() === "unresolved") throw invalid("Schedule source failed bounded YAML preflight")
  if (cronEntries.length > 1000 || cronEntries.some((cron) => typeof cron !== "string" || !cron || cron.length > 256 ||
    !cron.isWellFormed() || /[\r\n\x00]/.test(cron))) throw invalid("Schedule entries require bounded, nonempty native cron strings")
  const document = parseDocument(sourceText, {
    version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false,
    resolveKnownTags: false, merge: false, logLevel: "error",
  })
  if (document.errors.length || !isMap(document.contents)) throw invalid("Schedule source requires one YAML mapping")
  const original = document.get("on", true)
  if (isAlias(original)) throw invalid("Aliased workflow triggers require an explicit source edit")
  if ((isMap(original) || isSeq(original) || isScalar(original)) && original.anchor)
    throw invalid("Anchored workflow triggers require an explicit source edit")
  const events = isMap(original) ? original : document.createNode({})
  if (!isMap(events)) throw invalid("Workflow triggers could not be represented as a native mapping")
  if (!isMap(original) && original !== undefined) {
    const names = isScalar(original) && typeof original.value === "string" ? [original.value]
      : isSeq(original) && original.items.every((item) => isScalar(item) && typeof item.value === "string")
        ? original.items.map((item) => isScalar(item) ? String(item.value) : "") : undefined
    if (!names || new Set(names).size !== names.length || names.some((name) => !name || name === "schedule"))
      throw invalid("Workflow triggers require literal unique native events")
    // Build once rather than repeatedly calling YAMLMap.set's linear key lookup.
    events.items = names.map((name) => new Pair(document.createNode(name), document.createNode(null)))
    if (isScalar(original) || isSeq(original)) {
      events.commentBefore = original.commentBefore
      events.comment = original.comment
    }
  }
  if (events.has("<<")) throw invalid("Merged workflow triggers require an explicit source edit")
  const existing = events.get("schedule", true)
  if (existing !== undefined && (!isSeq(existing) || existing.anchor || existing.items.some((item) => !isMap(item) || item.anchor ||
    !isScalar(item.get("cron", true)) || typeof item.get("cron") !== "string" || item.has("<<"))))
    throw invalid("Schedule entries require literal cron mappings; aliases and merges stay source-owned")
  if (isSeq(existing) && existing.items.length === cronEntries.length &&
    existing.items.every((item, index) => isMap(item) && item.get("cron") === cronEntries[index])) return sourceText
  if (existing === undefined && cronEntries.length === 0) return sourceText
  if (cronEntries.length === 0) {
    // Keep comments attached to the removed schedule field as event-map trailing comments.
    if (isSeq(existing)) events.comment = [events.comment, existing.commentBefore, existing.comment].filter(Boolean).join("\n") || undefined
    events.delete("schedule")
  }
  if (cronEntries.length > 0) {
    const schedule = isSeq(existing) ? existing : document.createNode([])
    if (!isSeq(schedule)) throw invalid("Schedule entries could not be represented as a native sequence")
    schedule.items = cronEntries.map((cron, index) => {
      const previous = schedule.items[index]
      if (!isMap(previous)) return document.createNode({ cron })
      const scalar = previous.get("cron", true)
      if (!isScalar(scalar) || scalar.anchor) throw invalid("Schedule cron must remain an unanchored scalar")
      // Mutate only the scalar value: entry comments, quote style and unknown keys remain owned by YAML.
      scalar.value = cron
      return previous
    })
    events.set("schedule", schedule)
  }
  if (!isMap(original)) document.set("on", events)
  const encoded = document.toString({ lineWidth: 0 })
  const result = (sourceText.startsWith("\uFEFF") && !encoded.startsWith("\uFEFF") ? "\uFEFF" : "") +
    (sourceText.includes("\r\n") ? encoded.replace(/\r?\n/g, "\r\n") : encoded)
  bytes(result)
  const output = diagnostics()
  if (!read(result, "github", output) || output.state() === "unresolved") throw invalid("Schedule edit failed bounded YAML output validation")
  return result
}

function invalid(message: string) {
  return new ActionsError({ kind: "source_unresolved", message, provider: "github", disposition: "definitely_unsent" })
}
