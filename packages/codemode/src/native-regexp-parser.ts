/*! @license
 * Acorn readRegexp lexical scan, adapted from Acorn 8.15.0.
 * MIT License
 *
 * Copyright (C) 2012-2022 by various contributors (see AUTHORS)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import { Parser, tokTypes, lineBreak, version, type Options, type Program, type TokenType } from "acorn"

type ValidationState = {
  parser: unknown
  reset(start: number, pattern: string, flags: string): void
}

type PinnedParser = {
  input: string
  pos: number
  containsEsc: boolean
  options: { ecmaVersion: number }
  regexpState: ValidationState | null
  readWord1(): string
  raise(position: number, message: string): never
  unexpected(position: number): never
  validateRegExpFlags(state: ValidationState): void
  validateRegExpPattern(state: ValidationState): void
  finishToken(type: TokenType, value: { pattern: string; flags: string; value: null }): void
}

export function parseWithoutNativeRegExp(input: string, options: Options): Program {
  if (version !== "8.15.0" || typeof Parser.extend !== "function" || typeof Parser.tokenizer !== "function" ||
      typeof lineBreak.test !== "function" || !isRecord(tokTypes.regexp)) unavailable()

  const PinnedAcornParser = Parser.extend((BaseParser) => class extends BaseParser {
    readRegexp() {
      const parser: unknown = this
      if (!isPinnedParser(parser)) unavailable()

      const start = parser.pos
      let escaped = false
      let inClass = false
      for (;;) {
        if (parser.pos >= parser.input.length) parser.raise(start, "Unterminated regular expression")
        const character = parser.input.charAt(parser.pos)
        if (lineBreak.test(character)) parser.raise(start, "Unterminated regular expression")
        if (escaped) {
          escaped = false
          ++parser.pos
          continue
        }
        if (character === "[") inClass = true
        if (character === "]" && inClass) inClass = false
        if (character === "/" && !inClass) break
        escaped = character === "\\"
        ++parser.pos
      }
      const pattern = parser.input.slice(start, parser.pos)
      ++parser.pos
      const flagsStart = parser.pos
      const flags = parser.readWord1()
      if (parser.containsEsc) parser.unexpected(flagsStart)

      const state = parser.regexpState ?? createValidationState(parser)
      parser.regexpState = state
      state.reset(start, pattern, flags)
      parser.validateRegExpFlags(state)
      parser.validateRegExpPattern(state)
      return parser.finishToken(tokTypes.regexp, { pattern, flags, value: null })
    }
  })
  return PinnedAcornParser.parse(input, options)
}

function createValidationState(parser: PinnedParser): ValidationState {
  try {
    // The public Options union omits normalized "latest" (1e8). This private pinned call
    // forwards only that number; callbacks, program and source positions stay on the real parser.
    const donor: unknown = Reflect.apply(Parser.tokenizer, Parser, ["/(?:)/", { ecmaVersion: parser.options.ecmaVersion }])
    if (!isRecord(donor) || typeof donor.getToken !== "function") unavailable()
    donor.getToken()
    if (!isValidationState(donor.regexpState, donor)) unavailable()
    const constructor: unknown = donor.regexpState.constructor
    if (typeof constructor !== "function") unavailable()
    // Donor options can be normalized again by Acorn; actual validation always binds the original parser.
    const state: unknown = Reflect.construct(constructor, [parser])
    if (!isValidationState(state, parser)) unavailable()
    return state
  } catch {
    // Internal compatibility failures disclose neither input nor private reflection details.
    return unavailable()
  }
}

function isPinnedParser(value: unknown): value is PinnedParser {
  if (!isRecord(value) || typeof value.input !== "string" || !Number.isInteger(value.pos) ||
      typeof value.containsEsc !== "boolean" || !isRecord(value.options) ||
      !Number.isInteger(value.options.ecmaVersion)) return false
  return ["readWord1", "raise", "unexpected", "validateRegExpFlags", "validateRegExpPattern", "finishToken"]
    .every((name) => typeof value[name] === "function") &&
    (value.regexpState === null || isValidationState(value.regexpState, value))
}

function isValidationState(value: unknown, parser: unknown): value is ValidationState {
  if (!isRecord(value) || value.parser !== parser || typeof value.validFlags !== "string" ||
      typeof value.source !== "string" || typeof value.flags !== "string" || !Number.isInteger(value.start) ||
      !Array.isArray(value.backReferenceNames) || !isRecord(value.groupNames)) return false
  return ["reset", "raise", "at", "nextIndex", "current", "lookahead", "advance", "eat", "eatChars"]
    .every((name) => typeof value[name] === "function")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function unavailable(): never {
  throw new Error("Isolated regular expression parsing is unavailable")
}
