export * as ActionsScheduleYaml from "./schedule-yaml"

import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml"
import { diagnostics, object, read } from "../source/document"
import { ActionsResourceNative } from "./native"

const Schedules = Schema.Array(Schema.Struct({ cron: Schema.NonEmptyString }))

export function inspect(binding: Actions.Binding, text: string) {
  const report = diagnostics()
  const document = read(text, "github", report)
  if (!document || report.state() !== "complete")
    throw ActionsResourceNative.error(binding, "source_unresolved", "Schedule YAML failed the shared bounded CI document guard")
  if (!object(document.value.on)) return []
  const schedules = document.value.on.schedule
  if (schedules === undefined) return []
  const entries = ActionsResourceNative.input(binding, Schedules, schedules)
  if (entries.length > 100) throw ActionsResourceNative.error(binding, "metadata_truncated", "Workflow schedule count exceeds the bounded resource limit")
  entries.forEach((entry) => cron(binding, entry.cron))
  return entries
}

// Called by SourcePublisher's injected resource callback. It changes on.schedule
// only; the publisher retains branch/blob/commit admission and actual writes.
export function edit(binding: Actions.Binding, text: string, schedules: readonly { readonly cron: string }[]) {
  inspect(binding, text)
  if (schedules.length > 100) throw ActionsResourceNative.error(binding, "invalid_input", "At most 100 workflow schedules can be authored in one bounded edit")
  schedules.forEach((entry) => cron(binding, entry.cron))
  const document = parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false, resolveKnownTags: false, logLevel: "error" })
  const trigger = document.get("on", true)
  if (isAlias(trigger)) throw ActionsResourceNative.error(binding, "source_unresolved", "Aliased workflow triggers require an explicit source-editor change")
  if (trigger === undefined) document.set("on", document.createNode({}))
  if (isScalar(trigger) && typeof trigger.value === "string") document.set("on", document.createNode({ [trigger.value]: null }))
  if (isSeq(trigger)) {
    if (trigger.items.some((node) => !isScalar(node) || typeof node.value !== "string"))
      throw ActionsResourceNative.error(binding, "source_unresolved", "Workflow event sequence could not be edited without changing other triggers")
    document.set("on", document.createNode(Object.fromEntries(trigger.items.filter(isScalar).map((node) => [String(node.value), null]))))
  }
  const events = document.get("on", true)
  if (!isMap(events)) throw ActionsResourceNative.error(binding, "source_unresolved", "Workflow triggers must be an explicit editable mapping")
  const existing = events.get("schedule", true)
  if (isAlias(existing)) throw ActionsResourceNative.error(binding, "source_unresolved", "Aliased schedules require an explicit source-editor change")
  if (!schedules.length) events.delete("schedule")
  if (schedules.length) {
    if (isSeq(existing)) existing.items = schedules.map((entry, index) => {
      const node = existing.items[index]
      if (node === undefined) return document.createNode({ cron: entry.cron })
      if (!isMap(node) || isAlias(node.get("cron", true)))
        throw ActionsResourceNative.error(binding, "source_unresolved", "Schedule aliases require an explicit source-editor change")
      node.set("cron", entry.cron)
      return node
    })
    if (!isSeq(existing)) events.set("schedule", document.createNode(schedules.map((entry) => ({ cron: entry.cron }))))
  }
  const result = document.toString()
  inspect(binding, result)
  return result
}

export function cron(binding: Actions.Binding, value: string) {
  // Native provider remains the cron parser/validator. Reject unsafe framing and
  // wrong field count here, rather than claiming a local cron dialect is native.
  if (value.length > 256 || /[\r\n\x00-\x1f\x7f]/.test(value) || value.trim().split(/ +/).length !== 5)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule cron requires five bounded native fields")
  if (binding.provider.kind === "github") {
    const names = [[], [], [], ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]]
    const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]
    const valid = value.trim().split(/ +/).every((field, index) => field.split(",").every((item) => {
      const parts = item.split("/")
      if (parts.length > 2 || parts[1] !== undefined && (!/^[1-9]\d*$/.test(parts[1]) || Number(parts[1]) > 1000)) return false
      if (parts[0] === "*") return true
      const bounds = parts[0].split("-").map((part) => /^\d+$/.test(part) ? Number(part) : names[index].indexOf(part.toUpperCase()) + (index === 3 ? 1 : 0))
      return bounds.length <= 2 && bounds.every((part) => Number.isInteger(part) && part >= ranges[index][0] && part <= ranges[index][1]) &&
        (bounds.length === 1 || bounds[0] <= bounds[1])
    }))
    if (!valid) throw ActionsResourceNative.error(binding, "invalid_input", "GitHub schedule cron must use its supported five-field POSIX syntax")
  }
  return value
}
