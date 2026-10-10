// Pure test recorder: no filesystem, platform, renderer or credential discovery imports.
export type CandidateFailure = { id: string; phase: "primary" | "cleanup"; label: string; error: unknown }

export class CandidateRecorder {
  readonly failures: CandidateFailure[] = []
  private readonly identities = new Map<unknown, string>()
  private readonly replacements = new Map<string, string>()
  private readonly sources: { label: string; read: () => unknown }[] = []

  observe(label: string, read: () => unknown) {
    this.sources.push({ label, read })
  }

  get observations() {
    return this.sources.map((source) => ({ label: source.label, value: source.read() }))
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
      .replace(/(authorization["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n,}]+)/gi, '$1"[redacted]"')
      .replace(/(["']?(?:[\w-]*(?:password|token|secret)|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1"[redacted]"')
      .replace(/(?:\/Users\/|\/home\/|\/private\/var\/|\/var\/folders\/|\/tmp\/)[^\s"'<>),;]+/g, "<private-path>")
  }

  serialize(value: unknown): string {
    const seen = new Set<object>()
    const project = (item: unknown): unknown => {
      if (typeof item === "string") return this.clean(item)
      if (!item || typeof item !== "object") return item
      if (seen.has(item)) return item instanceof Error ? { ref: this.identity(item) } : "[circular]"
      seen.add(item)
      if (item instanceof Error) return {
        id: this.identity(item), name: this.clean(item.name), message: this.clean(item.message),
        stack: item.stack ? this.clean(item.stack) : undefined,
        cause: project(item.cause), ...(item instanceof AggregateError ? { errors: item.errors.map(project) } : {}),
      }
      if (Array.isArray(item)) return item.map(project)
      return Object.fromEntries(Object.entries(item).map(([key, field]) => [this.clean(key),
        /password|authorization|token|secret|api[_-]?key/i.test(key) && !/^(tokens|tokensSaved|tokenCalls)$/.test(key)
          ? "[redacted]"
          : /^(env|environment|config|machineConfig|managedConfig|userConfig|privateResponse)$/i.test(key) ? "[omitted]" : project(field)]))
    }
    return JSON.stringify(project(value), null, 2) ?? "null"
  }

  publicError(label: string) {
    const error = new Error(`${this.clean(label)}\n${this.serialize(this.failures)}`)
    error.name = "CandidateProofError"
    if (error.stack) error.stack = this.clean(error.stack)
    return error
  }
}
