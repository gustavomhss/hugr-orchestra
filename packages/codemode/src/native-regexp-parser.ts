import type { Options, Program } from "acorn"

// Refusing scaffold; no caller may fall back to dynamic native RegExp construction.
export function parseWithoutNativeRegExp(_input: string, _options: Options): Program {
  throw new Error("Isolated regular expression parsing is unavailable")
}
