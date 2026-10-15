type Token = { value: string; offset: number }
export type Query = { words: string[]; terms: Set<string> }
export type Rank = { score: number; field: "markdown" | "title"; snippet_offset: number }

export function query(text: string): Query {
  const words = tokens(text).map((token) => token.value)
  return { words, terms: new Set(words) }
}

/** Lexical evidence only: identifiers, paths and errors have no inferred semantics. */
export function rank(title: string, markdown: string, query: Query): Rank | undefined {
  if (!query.terms.size) return
  const heading = tokens(title)
  const body = tokens(markdown)
  const present = new Set([...heading, ...body].map((token) => token.value))
  if ([...query.terms].some((term) => !present.has(term))) return
  const titleTerms = new Set(heading.filter((token) => query.terms.has(token.value)).map((token) => token.value)).size
  const phrase = (items: Token[]) =>
    items.some((_, index) => query.words.every((word, offset) => items[index + offset]?.value === word))
  const titleSpan = window(heading, query.terms)
  const bodySpan = window(body, query.terms)
  const field = titleSpan && !bodySpan ? "title" : "markdown"
  const span = field === "title" ? titleSpan : bodySpan
  return {
    // Phrase > title-term count > proximity; each lower tier is strictly bounded.
    score:
      Number(phrase(heading) || phrase(body)) * 1_000_000 + titleTerms * 1000 + (span ? 1000 / (1 + span.width) : 0),
    field,
    snippet_offset: Math.max(0, (span?.offset ?? body.find((token) => query.terms.has(token.value))?.offset ?? 0) - 40),
  }
}

export function compare(
  left: { score: number; last: string; id: string },
  right: { score: number; last: string; id: string },
) {
  return (
    right.score - left.score ||
    (left.last > right.last ? -1 : left.last < right.last ? 1 : 0) ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  )
}

function tokens(text: string): Token[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu), (match) => ({
    value: match[0].normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase(),
    offset: match.index,
  })).filter((token) => /[\p{L}\p{N}]/u.test(token.value))
}

function window(items: Token[], terms: Set<string>) {
  const counts = new Map<string, number>()
  let start = 0
  let found: { width: number; offset: number } | undefined
  for (let end = 0; end < items.length; end++) {
    if (terms.has(items[end].value)) counts.set(items[end].value, (counts.get(items[end].value) ?? 0) + 1)
    while (counts.size === terms.size && start <= end) {
      const width = end - start
      if (!found || width < found.width) found = { width, offset: items[start].offset }
      const value = items[start++].value
      if (!terms.has(value)) continue
      const remaining = (counts.get(value) ?? 0) - 1
      if (remaining) counts.set(value, remaining)
      if (!remaining) counts.delete(value)
    }
  }
  return found
}

export * as ArchiveSearch from "./archive-search"
