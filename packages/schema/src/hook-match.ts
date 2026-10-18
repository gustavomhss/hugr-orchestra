export * as HookMatch from "./hook-match"

import { HookGlob } from "./hook-glob"

// The hook condition matcher, shared by the engine (@orchestra/relay) and the app's hook Test, so a pattern holds in
// the Test exactly when it holds at runtime. Pure and platform-free: the caller says whether to fold case.

/**
 * `path` patterns use HookGlob (`**` crosses directories; minimatch-like and case-sensitive); the other fields use
 * Orchestra's permission Wildcard, case-insensitive when `fold` is set (Windows). A pattern ending in " *" also
 * matches without the argument.
 */
export const matches = (
  field: "path" | "tool" | "command" | "event",
  pattern: string,
  value: string,
  fold = false,
): boolean => {
  if (field === "path") return HookGlob.match(pattern, value)
  const normalized = pattern.replaceAll("\\", "/")
  const subject = value.replaceAll("\\", "/")
  return star(normalized, subject, fold) || (normalized.endsWith(" *") && star(normalized.slice(0, -2), subject, fold))
}

/**
 * Orchestra's Wildcard (core/src/util/wildcard.ts: `*` any run, newlines included; `?` one character; everything else
 * literal; case-insensitive on Windows) without its regex. That regex backtracks polynomially on several stars, and the
 * value here is a model-written command, so this matches greedily in O(pattern × value): the first and last literal
 * segments are anchored and each middle one takes its leftmost fit.
 */
function star(pattern: string, value: string, fold: boolean) {
  const segments = pattern.split("*")
  const head = segments[0]!
  if (segments.length === 1) return value.length === head.length && fits(head, value, 0, fold)
  const tail = segments.at(-1)!
  const end = value.length - tail.length
  if (end < head.length || !fits(head, value, 0, fold) || !fits(tail, value, end, fold)) return false
  return (
    segments
      .slice(1, -1)
      .reduce<
        number | undefined
      >((from, segment) => (from === undefined ? undefined : leftmost(segment, value, from, end, fold)), head.length) !==
    undefined
  )
}

// The end of the leftmost fit of `segment` in `value[from, limit)`.
function leftmost(segment: string, value: string, from: number, limit: number, fold: boolean) {
  const start = Array.from({ length: limit - segment.length - from + 1 }, (_, offset) => from + offset).find((index) =>
    fits(segment, value, index, fold),
  )
  return start === undefined ? undefined : start + segment.length
}

// Whether `segment` (`?` = any one UTF-16 unit, as in a non-unicode regex) matches `value` at `index`.
function fits(segment: string, value: string, index: number, fold: boolean) {
  return segment
    .split("")
    .every(
      (char, offset) =>
        char === "?" ||
        char === value[index + offset] ||
        (fold && char.toUpperCase() === value[index + offset]!.toUpperCase()),
    )
}
