export * as HookGlob from "./glob"

// Path patterns for hook conditions, matched the way Bun's glob `match` does it (src/glob/matcher.zig at Bun 1.3.14),
// so the engine keeps those semantics under Node, where the desktop server runs. This is a line-for-line port: the
// pattern and the path are compared as UTF-8 bytes, character classes compare code points, and a lone surrogate is
// U+FFFD, as Bun's string conversion makes it. hook.test.ts checks it against Bun's own matcher.
//
// Portions derived from works under the MIT License:
// Copyright (c) 2023 Devon Govett
// Copyright (c) 2023 Stephen Gregoratto
// Copyright (c) 2024 shulaoda
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
// Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/**
 * Whether `path` matches `pattern`:
 * - `?` is any one character and `*` any run of characters, neither crossing a separator (`/`, and `\` on Windows);
 * - `**` is any run including separators, when it is a whole path segment;
 * - `[ab]`, `[a-z]`, `[!ab]` and `[^ab]` are character classes;
 * - `{a,b}` are alternatives, nested at most 10 deep;
 * - each leading `!` negates the result, and `\` escapes the next character.
 *
 * Matching is case-sensitive and a leading dot is an ordinary character. An invalid pattern matches nothing (before
 * any leading `!` applies).
 */
export const match = (pattern: string, path: string): boolean => {
  const bangs = /^!*/.exec(pattern)![0].length
  const state: State = { path: 0, glob: bangs, wildcard: origin(), globstar: origin(), depth: 0 }
  return run(state, encoder.encode(pattern), 0, encoder.encode(path), []) !== (bangs % 2 === 1)
}

interface Wildcard {
  glob: number
  path: number
  depth: number
}

interface State {
  path: number
  glob: number
  wildcard: Wildcard
  globstar: Wildcard
  depth: number
}

interface Brace {
  readonly open: number
  readonly branch: number
}

const encoder = new TextEncoder()
const MAX_BRACE_DEPTH = 10
const STAR = 0x2a
const QUESTION = 0x3f
const OPEN_BRACKET = 0x5b
const CLOSE_BRACKET = 0x5d
const OPEN_BRACE = 0x7b
const CLOSE_BRACE = 0x7d
const COMMA = 0x2c
const SLASH = 0x2f
const BACKSLASH = 0x5c
const CARET = 0x5e
const BANG = 0x21
const DASH = 0x2d
const REPLACEMENT = 0xfffd
// `\a` is a plain `a` in Bun's matcher.
const ESCAPES = new Map([
  [0x61, 0x61],
  [0x62, 0x08],
  [0x6e, 0x0a],
  [0x72, 0x0d],
  [0x74, 0x09],
])

function origin(): Wildcard {
  return { glob: 0, path: 0, depth: 0 }
}

// `globMatchImpl`. `start` is where this pattern (or brace branch) begins.
function run(state: State, glob: Uint8Array, start: number, path: Uint8Array, braces: Brace[]): boolean {
  main: while (state.glob < glob.length || state.path < path.length) {
    backtrack: if (state.glob < glob.length) {
      const char = glob[state.glob]!
      literal: switch (char) {
        case STAR: {
          const globstar = state.glob + 1 < glob.length && glob[state.glob + 1] === STAR
          if (globstar) state.glob = skipGlobstars(glob, state.glob)
          state.wildcard = {
            glob: state.glob,
            path: state.path + (state.path < path.length ? width(path[state.path]!) : 1),
            depth: state.depth,
          }
          if (!globstar) {
            state.glob += 1
            if (state.path < path.length && separator(path[state.path]!)) state.wildcard = { ...state.globstar }
            continue main
          }
          state.glob += 2
          const endInvalid = state.glob < glob.length
          if (
            endInvalid &&
            state.path === path.length &&
            glob.length - state.glob === 2 &&
            separator(glob[state.glob]!) &&
            glob[state.glob + 1] === STAR
          )
            continue main
          if (
            (Math.max(0, state.glob - start) < 3 || glob[state.glob - 3] === SLASH) &&
            (!endInvalid || glob[state.glob] === SLASH)
          ) {
            if (endInvalid) state.glob += 1
            skipToSeparator(state, path, endInvalid)
            continue main
          }
          if (state.path < path.length && separator(path[state.path]!)) state.wildcard = { ...state.globstar }
          continue main
        }
        case QUESTION: {
          if (state.path >= path.length) break literal
          if (separator(path[state.path]!)) break backtrack
          state.glob += 1
          state.path += width(path[state.path]!)
          continue main
        }
        case OPEN_BRACKET: {
          if (state.path >= path.length) break literal
          state.glob += 1
          const negated = state.glob < glob.length && (glob[state.glob] === CARET || glob[state.glob] === BANG)
          if (negated) state.glob += 1
          const size = width(path[state.path]!)
          const subject = decode(path, state.path, size)
          let first = true
          let matched = false
          while (state.glob < glob.length && (first || glob[state.glob] !== CLOSE_BRACKET)) {
            const low = unicode(glob, state)
            if (low === undefined) return false
            state.glob += low.size
            const ranged =
              state.glob + 1 < glob.length && glob[state.glob] === DASH && glob[state.glob + 1] !== CLOSE_BRACKET
            if (ranged) state.glob += 1
            const high = ranged ? unicode(glob, state) : low
            if (high === undefined) return false
            if (ranged) state.glob += high.size
            if (low.value <= subject && subject <= high.value) matched = true
            first = false
          }
          if (state.glob >= glob.length) return false
          state.glob += 1
          if (matched === negated) break backtrack
          state.path += size
          continue main
        }
        case OPEN_BRACE: {
          const entered = braces.find((brace) => brace.open === state.glob)
          if (entered === undefined) return matchBrace(state, glob, path, braces)
          state.glob = entered.branch
          state.depth += 1
          continue main
        }
        case COMMA:
        case CLOSE_BRACE: {
          if (state.depth === 0) break literal
          skipBranch(state, glob)
          continue main
        }
      }
      if (state.path >= path.length) break backtrack
      const escaped = unescape(glob, state)
      if (escaped === undefined) return false
      const size = width(escaped)
      const equal =
        escaped === SLASH
          ? separator(path[state.path]!)
          : size > 1
            ? state.path + size <= path.length && same(path, state.path, glob, state.glob, size)
            : path[state.path] === escaped
      if (equal) {
        state.glob += size
        state.path += size
        if (escaped === SLASH) state.wildcard = { ...state.globstar }
        continue main
      }
    }
    if (state.wildcard.path > 0 && state.wildcard.path <= path.length) {
      state.path = state.wildcard.path
      state.glob = state.wildcard.glob
      state.depth = state.wildcard.depth
      continue main
    }
    return false
  }
  return true
}

function matchBrace(state: State, glob: Uint8Array, path: Uint8Array, braces: Brace[]) {
  const open = state.glob
  let depth = 0
  let brackets = false
  let branch = 0
  while (state.glob < glob.length) {
    const char = glob[state.glob]
    if (char === OPEN_BRACE && !brackets) {
      depth += 1
      if (depth === 1) branch = state.glob + 1
    }
    if (char === CLOSE_BRACE && !brackets) {
      depth -= 1
      if (depth === 0) return matchBranch(state, glob, path, open, branch, braces)
    }
    if (char === COMMA && depth === 1) {
      if (matchBranch(state, glob, path, open, branch, braces)) return true
      branch = state.glob + 1
    }
    if (char === OPEN_BRACKET) brackets = true
    if (char === CLOSE_BRACKET) brackets = false
    if (char === BACKSLASH) state.glob += 1
    state.glob += 1
  }
  return false
}

function matchBranch(state: State, glob: Uint8Array, path: Uint8Array, open: number, branch: number, braces: Brace[]) {
  if (braces.length === MAX_BRACE_DEPTH) return false
  braces.push({ open, branch })
  const copy: State = {
    ...state,
    wildcard: { ...state.wildcard },
    globstar: { ...state.globstar },
    glob: branch,
    depth: braces.length,
  }
  const matched = run(copy, glob, branch, path, braces)
  braces.pop()
  return matched
}

function skipBranch(state: State, glob: Uint8Array) {
  const end = state.depth - 1
  let brackets = false
  while (state.glob < glob.length) {
    const char = glob[state.glob]
    if (char === OPEN_BRACE && !brackets) state.depth += 1
    if (char === CLOSE_BRACE && !brackets) {
      state.depth -= 1
      if (state.depth === end) {
        state.glob += 1
        return
      }
    }
    if (char === OPEN_BRACKET) brackets = true
    if (char === CLOSE_BRACKET) brackets = false
    if (char === BACKSLASH) state.glob += 1
    state.glob += 1
  }
}

function skipToSeparator(state: State, path: Uint8Array, endInvalid: boolean) {
  if (state.path === path.length) {
    state.wildcard.path += 1
    return
  }
  const found = path.findIndex((byte, index) => index >= state.path && separator(byte))
  const end = found === -1 ? path.length : found
  state.wildcard.path = endInvalid || end !== path.length ? end + 1 : end
  state.globstar = { ...state.wildcard }
}

// Collapses a run of `**/` segments (and a final `/**`) to its last `**`; returns the index of that `**`.
function skipGlobstars(glob: Uint8Array, at: number) {
  const rest = (from: number, text: string) =>
    from + text.length <= glob.length && [...text].every((char, offset) => glob[from + offset] === char.charCodeAt(0))
  const runs = (from: number): number => (rest(from, "/**/") ? runs(from + 3) : from)
  const end = runs(at + 2)
  return (end + 3 === glob.length && rest(end, "/**") ? end + 3 : end) - 2
}

// A backslash escape at the cursor, which moves to the escaped byte. Undefined when the pattern ends in a backslash.
function unescape(glob: Uint8Array, state: State) {
  const char = glob[state.glob]!
  if (char !== BACKSLASH) return char
  state.glob += 1
  if (state.glob >= glob.length) return undefined
  const escaped = glob[state.glob]!
  return ESCAPES.get(escaped) ?? escaped
}

// `getUnicode`: the code point at the cursor (unescaped; the cursor moves to the escaped character) and its byte size.
function unicode(glob: Uint8Array, state: State) {
  const char = glob[state.glob]!
  if (char < 0x80 && char !== BACKSLASH) return { value: char, size: 1 }
  if (char !== BACKSLASH) return { value: decode(glob, state.glob, width(char)), size: width(char) }
  state.glob += 1
  if (state.glob >= glob.length) return undefined
  const escaped = glob[state.glob]!
  const mapped = ESCAPES.get(escaped)
  if (mapped !== undefined) return { value: mapped, size: 1 }
  const size = width(escaped)
  return { value: size === 1 ? escaped : decode(glob, state.glob, size), size }
}

function separator(byte: number) {
  return byte === SLASH || (process.platform === "win32" && byte === BACKSLASH)
}

// `wtf8ByteSequenceLength`: the length a lead byte announces, 1 for anything else.
function width(byte: number) {
  if (byte < 0x80) return 1
  if ((byte & 0xe0) === 0xc0) return 2
  if ((byte & 0xf0) === 0xe0) return 3
  if ((byte & 0xf8) === 0xf0) return 4
  return 1
}

// `decodeWTF8RuneT`: U+FFFD for a malformed or overlong sequence.
function decode(bytes: Uint8Array, at: number, size: number) {
  if (size === 1) return bytes[at]!
  const tail = Array.from({ length: size - 1 }, (_, offset) => bytes[at + 1 + offset] ?? 0)
  if (tail.some((byte) => (byte & 0xc0) !== 0x80)) return REPLACEMENT
  const lead = bytes[at]! & (size === 2 ? 0x1f : size === 3 ? 0x0f : 0x07)
  const value = tail.reduce((point, byte) => (point << 6) | (byte & 0x3f), lead)
  if (value < (size === 2 ? 0x80 : size === 3 ? 0x800 : 0x10000) || value > 0x10ffff) return REPLACEMENT
  return value
}

function same(left: Uint8Array, from: number, right: Uint8Array, at: number, size: number) {
  return Array.from({ length: size }, (_, offset) => offset).every(
    (offset) => left[from + offset] === right[at + offset],
  )
}
