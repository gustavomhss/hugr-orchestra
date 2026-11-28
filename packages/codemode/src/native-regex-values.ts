import type { Capture, Match, Replacement } from "./native-regex.js"
import { isBlockedMember, type SafeObject } from "./tool-runtime.js"

export function fromWireCapture(value: Capture): string | undefined {
  return value.kind === "text" ? value.value : undefined
}

export function fromWireMatch(value: Match): Array<unknown> {
  const result: Array<unknown> & { index?: number; groups?: SafeObject } = value.captures.map(fromWireCapture)
  if (value.index !== undefined) result.index = value.index
  if (value.groups !== undefined) result.groups = fromWireGroups(value.groups)
  return result
}

export function replacementArgs(value: Replacement, subject: string): Array<unknown> {
  const result: Array<unknown> = [value.match, ...value.captures.map(fromWireCapture), value.offset, subject]
  if (value.groups !== undefined) result.push(fromWireGroups(value.groups))
  return result
}

function fromWireGroups(groups: Readonly<Record<string, Capture>>): SafeObject {
  const result: SafeObject = Object.create(null)
  for (const [key, value] of Object.entries(groups)) {
    if (!isBlockedMember(key)) result[key] = fromWireCapture(value)
  }
  return result
}
