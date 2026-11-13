import type { Effect, Fiber } from "effect"
import type { State } from "./native-regex.js"

export class SandboxPromise {
  interrupted = false
  constructor(
    readonly fiber: Fiber.Fiber<unknown, unknown> | undefined,
    readonly immediate?: Effect.Effect<unknown, unknown>,
  ) {}
}

export class SandboxDate {
  constructor(readonly time: number) {}
}

export class SandboxRegExp {
  readonly regex: RegExp
  constructor(pattern: string, flags: string, _metadata?: State) {
    this.regex = new RegExp(pattern, flags)
  }

  // Metadata seam: finite execution will construct only from a validated isolated reply.
  static fromState(_state: State): SandboxRegExp {
    throw new Error("Metadata-only regular expressions are not implemented")
  }

  get source() { return this.regex.source }
  get flags() { return this.regex.flags }
  get lastIndex() { return this.regex.lastIndex }

  /** Explicit untimed native path. Finite evaluation must never call this method. */
  native(): RegExp { return this.regex }

  state(): State { return { source: this.source, flags: this.flags, lastIndex: this.lastIndex } }
  updateState(state: State): void { this.regex.lastIndex = state.lastIndex }

  read(name: string): string | number | boolean | undefined {
    if (name === "source") return this.source
    if (name === "flags") return this.flags
    if (name === "lastIndex") return this.lastIndex
    if (name === "global") return this.flags.includes("g")
    if (name === "ignoreCase") return this.flags.includes("i")
    if (name === "multiline") return this.flags.includes("m")
    if (name === "sticky") return this.flags.includes("y")
    if (name === "unicode") return this.flags.includes("u")
    if (name === "dotAll") return this.flags.includes("s")
    return undefined
  }
}

export class SandboxMap {
  readonly map = new Map<unknown, unknown>()
}

export class SandboxSet {
  readonly set = new Set<unknown>()
}

export class SandboxURLSearchParams {
  constructor(readonly params: URLSearchParams) {}
}

export class SandboxURL {
  readonly searchParams: SandboxURLSearchParams
  constructor(readonly url: URL) {
    this.searchParams = new SandboxURLSearchParams(url.searchParams)
  }
}

export const isSandboxValue = (
  value: unknown,
): value is SandboxDate | SandboxRegExp | SandboxMap | SandboxSet | SandboxURL | SandboxURLSearchParams =>
  value instanceof SandboxDate ||
  value instanceof SandboxRegExp ||
  value instanceof SandboxMap ||
  value instanceof SandboxSet ||
  value instanceof SandboxURL ||
  value instanceof SandboxURLSearchParams
