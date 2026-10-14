// Pure test recorder: no filesystem, platform, renderer or credential discovery imports.
export type CandidateFailure = { id: string; phase: "primary" | "cleanup"; label: string; error: unknown }

const overflow = "candidate-diagnostics-overflow"
// Publication bounds. Overflow is named in place; raw streams are omitted, never clipped past redaction.
const limits = { stream: 1 << 20, depth: 8, nodes: 256, string: 4096, scan: 4 << 20, output: 64 << 10 }

export class CandidateRecorder {
  readonly failures: CandidateFailure[] = []
  private readonly identities = new Map<unknown, string>()
  private readonly replacements = new Map<string, string>()
  private readonly sources: { label: string; read: () => unknown }[] = []

  observe(label: string, read: () => unknown) {
    this.sources.push({ label, read })
  }

  get observations() {
    return this.sources.map((source) => {
      try { return { label: source.label, value: source.read() } }
      catch (error) {
        this.fail("cleanup", `diagnostic observation: ${source.label}`, error)
        return { label: source.label, value: { marker: "candidate-observation-failed", failure: this.identity(error) } }
      }
    })
  }

  // Bounded owned child stream: chunks are joined before redaction; over the cap only the byte count survives.
  stream(label: string) {
    const state = { chunks: [] as Uint8Array[], bytes: 0 }
    const read = () => state.bytes > limits.stream
      ? { marker: overflow, label, reason: "stream", observedBytes: state.bytes }
      : this.clean(Buffer.concat(state.chunks).toString("utf8"))
    this.observe(label, read)
    return {
      read,
      push(chunk: string | Uint8Array) {
        const bytes = new Uint8Array(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
        state.bytes += bytes.length
        if (state.bytes > limits.stream) state.chunks = []
        else state.chunks.push(bytes)
      },
    }
  }

  protectBackend(username: string | null, password: string | null) {
    if (!password) return
    for (const value of [password, encodeURIComponent(password), `${username}:${password}`,
      Buffer.from(`${username}:${password}`).toString("base64")]) this.replacements.set(value, "[redacted]")
  }

  protectPath(value: string, label: string) {
    if (value.length > 1) {
      this.replacements.set(value, `<${label}>`)
      this.replacements.set(encodeURI(value), `<${label}>`)
    }
  }

  fail(phase: CandidateFailure["phase"], label: string, error: unknown) {
    this.failures.push({ id: this.identity(error), phase, label, error })
  }

  private identity(value: unknown) {
    const current = this.identities.get(value)
    if (current) return current
    const id = `failure-${this.identities.size + 1}`
    this.identities.set(value, id)
    return id
  }

  clean(value: string): string {
    const replaced = [...this.replacements].sort(([a], [b]) => b.length - a.length)
      .reduce((text, [secret, replacement]) => text.split(secret).join(replacement), value)
    return replaced
      .replace(/\b(https?:\/\/)[^\s/"'<>@]+@/gi, "$1[redacted]@")
      .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/_=.:-]+/gi, "$1 [redacted]")
      // Bounded key prefix keeps this scan linear on long word runs such as base64 or minified output.
      .replace(/(authorization["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n,}]+)/gi, '$1"[redacted]"')
      .replace(/(["']?(?:[\w-]{0,64}(?:password|token|secret)|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1"[redacted]"')
      .replace(/(?:\/Users\/|\/home\/|\/private\/var\/|\/var\/folders\/|\/tmp\/)[^\s"'<>),;]+/g, "<private-path>")
  }

  serialize(value: unknown): string {
    const seen = new Set<object>()
    const budget = { nodes: 0 }
    const text = (item: string) => {
      // Too large to scan safely: omit rather than claim it is clean.
      if (item.length > limits.scan) return `[omitted-unscanned:${item.length}]`
      const cleaned = this.clean(item)
      return cleaned.length > limits.string ? `${cleaned.slice(0, limits.string)}[truncated:${cleaned.length}]` : cleaned
    }
    const full = () => budget.nodes >= limits.nodes
    const list = (items: Iterable<unknown>, depth: number) => {
      const result: unknown[] = []
      for (const entry of items) {
        if (full()) return [...result, { marker: overflow, reason: "nodes" }]
        result.push(project(entry, depth))
      }
      return result
    }
    // Recursion depth is bounded by limits.depth; breadth by the shared node budget.
    const project = (item: unknown, depth: number): unknown => {
      if (++budget.nodes > limits.nodes) return { marker: overflow, reason: "nodes" }
      if (typeof item === "string") return text(item)
      if (typeof item === "bigint") return String(item)
      if (!item || typeof item !== "object") return item
      if (seen.has(item)) return item instanceof Error ? { ref: this.identity(item) } : "[circular]"
      if (depth >= limits.depth) return { marker: overflow, reason: "depth" }
      seen.add(item)
      if (item instanceof Error) return {
        id: this.identity(item), name: text(String(item.name)), message: text(String(item.message)),
        stack: item.stack ? text(String(item.stack)) : undefined, cause: project(item.cause, depth + 1),
        ...(item instanceof AggregateError && Array.isArray(item.errors) ? { errors: list(item.errors, depth + 1) } : {}),
      }
      if (Array.isArray(item)) return list(item, depth + 1)
      const fields: [string, unknown][] = []
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue
        if (full()) return Object.fromEntries([...fields, [overflow, { marker: overflow, reason: "nodes" }]])
        fields.push([text(key),
          /password|authorization|token|secret|api[_-]?key/i.test(key) && !/^(tokens|tokensSaved|tokenCalls)$/.test(key)
            ? "[redacted]"
            : /^(env|environment|config|machineConfig|managedConfig|userConfig|privateResponse)$/i.test(key) ? "[omitted]"
            : project((item as Record<string, unknown>)[key], depth + 1)])
      }
      return Object.fromEntries(fields)
    }
    const output = JSON.stringify(project(value, 0), null, 2) ?? "null"
    const bytes = Buffer.byteLength(output)
    return bytes > limits.output ? JSON.stringify({ marker: overflow, reason: "output", observedBytes: bytes }, null, 2) : output
  }

  publicError(label: string) {
    const error = new Error(`${this.clean(label)}\n${this.serialize(this.failures)}`)
    error.name = "CandidateProofError"
    if (error.stack) error.stack = this.clean(error.stack)
    return error
  }
}
