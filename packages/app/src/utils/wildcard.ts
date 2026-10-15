/** Case-sensitive, whole-string glob: `*` spans any run and `?` one UTF-16 code unit, including newlines. */
export function matchWildcard(input: string, pattern: string) {
  const segments = pattern.split("*")
  const head = segments[0]
  if (segments.length === 1) return input.length === head.length && matchesAt(head, input, 0)
  const tail = segments[segments.length - 1]
  const end = input.length - tail.length
  if (end < head.length || !matchesAt(head, input, 0) || !matchesAt(tail, input, end)) return false

  // Each fixed-length middle segment takes its leftmost fit. O(pattern × input), without regex backtracking.
  return (
    segments
      .slice(1, -1)
      .reduce((from, segment) => (from < 0 ? from : findSegment(segment, input, from, end)), head.length) >= 0
  )
}

function findSegment(segment: string, input: string, from: number, limit: number) {
  for (let index = from; index + segment.length <= limit; index++) {
    if (matchesAt(segment, input, index)) return index + segment.length
  }
  return -1
}

function matchesAt(segment: string, input: string, index: number) {
  for (let offset = 0; offset < segment.length; offset++) {
    if (segment[offset] !== "?" && segment[offset] !== input[index + offset]) return false
  }
  return true
}
