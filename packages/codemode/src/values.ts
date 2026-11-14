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
  declare readonly regex: RegExp
  #metadata: State
  #native: RegExp | undefined

  constructor(pattern: string, flags: string, metadata?: State) {
    Object.defineProperty(this, "regex", { enumerable: true, get: () => {
      if (!this.#native) throw new Error("Metadata-only regular expressions require explicit native execution")
      return this.#native
    } })
    if (metadata) {
      this.#metadata = { ...metadata }
      return
    }
    this.#native = new RegExp(pattern, flags)
    this.#metadata = { source: this.#native.source, flags: this.#native.flags, lastIndex: 0 }
  }

  // Metadata seam: finite execution will construct only from a validated isolated reply.
  static fromState(state: State): SandboxRegExp {
    return new SandboxRegExp(state.source, state.flags, state)
  }

  get source() { return this.#metadata.source }
  get flags() { return this.#metadata.flags }
  get lastIndex() { return this.#native ? this.#native.lastIndex : this.#metadata.lastIndex }

  /** Explicit untimed native path. Finite evaluation must never call this method. */
  native(): RegExp {
    if (this.#native) return this.#native
    const native = new RegExp(this.source, this.flags)
    native.lastIndex = this.#metadata.lastIndex
    this.#native = native
    return native
  }

  state(): State { return { source: this.source, flags: this.flags, lastIndex: this.lastIndex } }
  updateState(state: State): void {
    if (state.source !== this.source || state.flags !== this.flags)
      throw new Error("Regular expression state cannot change source or flags")
    this.#metadata = { ...state }
    if (this.#native) this.#native.lastIndex = state.lastIndex
  }

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
