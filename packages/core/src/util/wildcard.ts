export * as Wildcard from "./wildcard"

/**
 * Whole-string glob match: `*` matches any run (newlines included), `?` any one UTF-16 code unit, and every other
 * character is literal. `\` reads as `/` on both sides. A pattern ending in " *" also matches its bare prefix, so
 * "ls *" covers "ls" but not "lstmeval". Case folds on Windows only.
 */
export function match(input: string, pattern: string) {
  const fold = process.platform === "win32" ? canonical : (text: string) => text
  const value = fold(input.replaceAll("\\", "/"))
  const normalized = fold(pattern.replaceAll("\\", "/"))
  return glob(normalized, value) || (normalized.endsWith(" *") && glob(normalized.slice(0, -2), value))
}

// No regex here: the input is often a model-written shell command, and a regex built from several stars backtracks
// polynomially on it. The segments between stars have fixed lengths, so the first and last are anchored to the ends
// and each middle one takes its leftmost fit, which keeps the match O(pattern × input).
function glob(pattern: string, value: string) {
  const segments = pattern.split("*")
  const head = segments[0]
  if (segments.length === 1) return value.length === head.length && fits(head, value, 0)
  const tail = segments[segments.length - 1]
  const end = value.length - tail.length
  if (end < head.length || !fits(head, value, 0) || !fits(tail, value, end)) return false
  return (
    segments
      .slice(1, -1)
      .reduce((from, segment) => (from < 0 ? from : leftmost(segment, value, from, end)), head.length) >= 0
  )
}

// The end of the leftmost fit of `segment` inside value[from, limit), or -1 when it does not fit.
function leftmost(segment: string, value: string, from: number, limit: number) {
  for (let index = from; index + segment.length <= limit; index++)
    if (fits(segment, value, index)) return index + segment.length
  return -1
}

function fits(segment: string, value: string, index: number) {
  for (let offset = 0; offset < segment.length; offset++) {
    const char = segment[offset]
    if (char !== "?" && char !== value[index + offset]) return false
  }
  return true
}

// The case folding of a non-unicode `i` regex (ECMAScript Canonicalize) applied to each code unit, which is not plain
// toUpperCase: a code unit whose uppercase is not one code unit ("ß") stays itself, and a non-ASCII one never folds into
// ASCII ("ı" is not "I"). Nothing folds into `*` or `?`.
function canonical(text: string) {
  return text
    .split("")
    .map((char) => {
      const upper = char.toUpperCase()
      if (upper.length !== 1 || (char.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128)) return char
      return upper
    })
    .join("")
}
