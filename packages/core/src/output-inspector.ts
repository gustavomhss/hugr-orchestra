export * as OutputInspector from "./output-inspector"

/** Bounded, producer-local scan. A recognized shape latches HOLD and discards overlap. */
export function make() {
  const decoder = new TextDecoder()
  const prefixes = [
    { prefix: "AKIA", minimum: 16, maximum: 16, alphabet: /^[A-Z0-9]$/ },
    { prefix: "ASIA", minimum: 16, maximum: 16, alphabet: /^[A-Z0-9]$/ },
    ...["p", "o", "u", "s", "r"].map((kind) => ({ prefix: `gh${kind}_`, minimum: 36, maximum: Infinity, alphabet: /^[A-Za-z0-9]$/ })),
    ...["sk_live_", "sk-proj-"].map((prefix) => ({ prefix, minimum: 20, maximum: Infinity, alphabet: /^[A-Za-z0-9_-]$/ })),
  ]
  const state = { overlap: "", word: false, candidates: [] as { pattern: typeof prefixes[number]; position: number; count: number }[],
    reason: undefined as string | undefined }
  const block = () => {
    state.reason = "recognized-secret-output"
    state.overlap = ""
    state.candidates = []
    return state.reason
  }
  const push = (chunk: string | Uint8Array): string | undefined => {
    if (state.reason) return state.reason
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(state.overlap + text)) return block()
    state.overlap = (state.overlap + text).slice(-64)
    for (const char of text) {
      const word = /\w/.test(char)
      if (state.word !== word && state.candidates.some((candidate) => candidate.position === candidate.pattern.prefix.length &&
        candidate.count >= candidate.pattern.minimum)) return block()
      state.candidates = state.candidates.flatMap((candidate) => {
        if (candidate.position < candidate.pattern.prefix.length)
          return candidate.pattern.prefix[candidate.position] === char ? [{ ...candidate, position: candidate.position + 1 }] : []
        if (!candidate.pattern.alphabet.test(char) || candidate.count === candidate.pattern.maximum) return []
        return [{ ...candidate, count: Math.min(candidate.count + 1, candidate.pattern.minimum) }]
      })
      if (!state.word) state.candidates.push(...prefixes.filter((pattern) => pattern.prefix[0] === char)
        .map((pattern) => ({ pattern, position: 1, count: 0 })))
      state.word = word
    }
    // A complete shape at the acquired chunk's end must HOLD before that chunk can be retained.
    if (state.word && state.candidates.some((candidate) => candidate.position === candidate.pattern.prefix.length &&
      candidate.count >= candidate.pattern.minimum)) return block()
  }
  return { push, finish: () => {
    const pending = push(decoder.decode())
    if (pending) return pending
    if (state.word && state.candidates.some((candidate) => candidate.position === candidate.pattern.prefix.length &&
      candidate.count >= candidate.pattern.minimum)) return block()
  } }
}

/** Delay retention by 64 UTF-16 units (65 across a surrogate pair).
 * Every recognized shape above completes within 40 ASCII characters of its start.
 * This fixed window quarantines partial prefixes without buffering whole output.
 * Extend the window if the closed recognized shapes gain a longer minimum.
 */
export function quarantine() {
  const inspection = make()
  const state = { pending: "" }
  return {
    push(chunk: string) {
      const reason = inspection.push(chunk)
      if (reason) {
        state.pending = ""
        return { reason, text: "" }
      }
      const text = state.pending + chunk
      const boundary = Math.max(0, text.length - 64)
      const end = boundary > 0 && /[\uD800-\uDBFF]/.test(text[boundary - 1]) ? boundary - 1 : boundary
      state.pending = text.slice(end)
      return { reason, text: text.slice(0, end) }
    },
    finish() {
      const reason = inspection.finish()
      const text = reason ? "" : state.pending
      state.pending = ""
      return { reason, text }
    },
  }
}

export function reason(text: string) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text) ||
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(text) ||
    /\b(?:sk_live_|sk-proj-)[A-Za-z0-9_-]{20,}\b/.test(text)) return "recognized-secret-output"
}
