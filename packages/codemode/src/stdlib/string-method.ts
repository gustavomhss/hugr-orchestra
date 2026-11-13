import { type AstNode, InterpreterRuntimeError } from "../interpreter/model.js"
import { boundedData } from "./value.js"
import { matchToValue, toHostRegex } from "./regexp.js"
import { SandboxRegExp } from "../values.js"

export const invokeStringMethod = (value: string, name: string, args: Array<unknown>, node: AstNode): unknown => {
  const str = (index: number): string => {
    const arg = args[index]
    if (typeof arg !== "string")
      throw new InterpreterRuntimeError(`String.${name} expects argument ${index + 1} to be a string.`, node)
    return arg
  }
  const num = (index: number): number => {
    const arg = args[index]
    if (typeof arg !== "number")
      throw new InterpreterRuntimeError(`String.${name} expects argument ${index + 1} to be a number.`, node)
    return arg
  }
  const optNum = (index: number): number | undefined => (args[index] === undefined ? undefined : num(index))
  const optStr = (index: number): string | undefined => (args[index] === undefined ? undefined : str(index))

  let result: unknown
  switch (name) {
    case "toLowerCase":
      result = value.toLowerCase()
      break
    case "toUpperCase":
      result = value.toUpperCase()
      break
    case "trim":
      result = value.trim()
      break
    // trimLeft/trimRight are the legacy aliases of trimStart/trimEnd, kept because models write them.
    case "trimStart":
    case "trimLeft":
      result = value.trimStart()
      break
    case "trimEnd":
    case "trimRight":
      result = value.trimEnd()
      break
    // Locale/options arguments are ignored: comparison runs with the host default locale, and
    // the common use is a sort comparator where any consistent order works.
    case "localeCompare":
      result = value.localeCompare(str(0))
      break
    case "normalize": {
      const form = optStr(0)
      try {
        result = value.normalize(form)
      } catch {
        throw new InterpreterRuntimeError(
          `String.normalize expects the form "NFC", "NFD", "NFKC", or "NFKD" (got ${JSON.stringify(form)}).`,
          node,
        ).as("RangeError")
      }
      break
    }
    case "split": {
      if (args.length === 0) {
        result = [value]
        break
      }
      if (args[0] instanceof SandboxRegExp) {
        result = value.split((args[0] as SandboxRegExp).native(), optNum(1))
        break
      }
      const requestedLimit = optNum(1)
      result = value.split(str(0), requestedLimit === undefined ? undefined : requestedLimit >>> 0)
      break
    }
    case "slice":
      result = value.slice(optNum(0), optNum(1))
      break
    case "includes":
      result = value.includes(str(0), optNum(1))
      break
    case "startsWith":
      result = value.startsWith(str(0), optNum(1))
      break
    case "endsWith":
      result = value.endsWith(str(0), optNum(1))
      break
    case "indexOf":
      result = value.indexOf(str(0), optNum(1))
      break
    case "lastIndexOf":
      result = value.lastIndexOf(str(0), optNum(1))
      break
    case "replace":
    case "replaceAll": {
      if (args[0] instanceof SandboxRegExp) {
        const pattern = (args[0] as SandboxRegExp).native()
        const replacement = str(1)
        if (name === "replaceAll" && !pattern.global) {
          throw new InterpreterRuntimeError(
            `String.replaceAll requires a regular expression with the global (g) flag: write /${pattern.source}/${pattern.flags}g, or use String.replace to replace only the first match.`,
            node,
          )
        }
        result = name === "replace" ? value.replace(pattern, replacement) : value.replaceAll(pattern, replacement)
        break
      }
      if (name === "replace") {
        result = value.replace(str(0), str(1))
        break
      }
      result = value.replaceAll(str(0), str(1))
      break
    }
    case "match": {
      const pattern = toHostRegex(args[0], name, node)
      const matched = value.match(pattern)
      if (matched === null) return null
      // A global match is a plain array of matched strings; a non-global match carries
      // index/groups own properties, so bypass the copying data checkpoint to keep them.
      if (pattern.global) return boundedData(matched, "String.match result")
      return matchToValue(matched)
    }
    case "matchAll": {
      const pattern = toHostRegex(args[0], name, node, "g")
      if (!pattern.global) {
        throw new InterpreterRuntimeError(
          `String.matchAll requires a regular expression with the global (g) flag: write /${pattern.source}/${pattern.flags}g, or use String.match for a single match.`,
          node,
        )
      }
      // Materialized as an array (not an iterator); each entry is a match array with
      // index/groups own properties. Match count is bounded by the subject length.
      return Array.from(value.matchAll(pattern), matchToValue)
    }
    case "search": {
      result = value.search(toHostRegex(args[0], name, node))
      break
    }
    case "repeat": {
      const count = num(0)
      if (!Number.isFinite(count) || count < 0)
        throw new InterpreterRuntimeError("String.repeat expects a finite non-negative count.", node)
      result = value.repeat(count)
      break
    }
    case "padStart":
      result = value.padStart(num(0), optStr(1))
      break
    case "padEnd":
      result = value.padEnd(num(0), optStr(1))
      break
    case "charAt":
      result = value.charAt(optNum(0) ?? 0)
      break
    case "at":
      result = value.at(optNum(0) ?? 0)
      break
    case "substring":
      result = value.substring(optNum(0) ?? 0, optNum(1))
      break
    case "substr":
      result = value.substr(optNum(0) ?? 0, optNum(1))
      break
    // JS charCodeAt returns NaN out of range; NaN flows as an ordinary in-sandbox value
    // (normalized to null only at the data boundary - see copyOut), so return it as-is.
    case "charCodeAt":
      result = value.charCodeAt(optNum(0) ?? 0)
      break
    case "codePointAt":
      result = value.codePointAt(optNum(0) ?? 0)
      break
    case "toString":
      result = value
      break
    case "concat": {
      result = value.concat(...args.map((_, index) => str(index)))
      break
    }
    default:
      throw new InterpreterRuntimeError(`String method '${name}' is not available in CodeMode.`, node)
  }
  return boundedData(result, `String.${name} result`)
}
