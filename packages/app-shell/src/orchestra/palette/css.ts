import { COLOR_LITERAL } from "./color"

// A small reader for Orchestra's own stylesheets: enough structure (at-rules, rules, nesting, declarations) to
// copy their color declarations into palette overrides without changing the cascade between them.
export type CssNode =
  | { kind: "at"; prelude: string; children: CssNode[] }
  | { kind: "rule"; selector: string; declarations: Declaration[]; children: CssNode[] }
export type Declaration = { property: string; value: string }

export function parseCss(text: string) {
  return block(text.replace(/\/\*[\s\S]*?\*\//g, ""), 0).nodes
}

function block(text: string, start: number): { nodes: CssNode[]; declarations: Declaration[]; end: number } {
  const nodes: CssNode[] = []
  const declarations: Declaration[] = []
  const state = { buffer: "", index: start }
  const flush = () => {
    const text = state.buffer.trim()
    state.buffer = ""
    const colon = text.indexOf(":")
    if (!text || text.startsWith("@") || colon < 1) return
    declarations.push({ property: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim() })
  }
  while (state.index < text.length) {
    const char = text[state.index]
    if (char === '"' || char === "'") {
      const close = text.indexOf(char, state.index + 1)
      state.buffer += text.slice(state.index, close + 1)
      state.index = close + 1
      continue
    }
    if (char === "{") {
      const prelude = state.buffer.trim()
      state.buffer = ""
      const inner = block(text, state.index + 1)
      state.index = inner.end + 1
      nodes.push(
        prelude.startsWith("@")
          ? { kind: "at", prelude, children: inner.nodes }
          : { kind: "rule", selector: prelude, declarations: inner.declarations, children: inner.nodes },
      )
      continue
    }
    if (char === "}") {
      flush()
      return { nodes, declarations, end: state.index }
    }
    if (char === ";") {
      flush()
      state.index++
      continue
    }
    state.buffer += char
    state.index++
  }
  flush()
  return { nodes, declarations, end: state.index }
}

// Properties that can paint a color. Shorthands are copied whole; only their colors change.
const COLOR_PROPERTY =
  /^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|scrollbar-color|-webkit-text-fill-color|-webkit-tap-highlight-color)$/

/** Custom properties that hold a color literal somewhere in the sources. */
export function colorTokens(sources: CssNode[][]) {
  const names = new Set<string>()
  const visit = (nodes: CssNode[]) =>
    nodes.forEach((node) => {
      if (node.kind === "rule")
        node.declarations
          .filter((item) => item.property.startsWith("--") && hasColor(item.value))
          .forEach((item) => names.add(item.property))
      visit(node.children)
    })
  sources.forEach(visit)
  return names
}

export function hasColor(value: string) {
  return new RegExp(COLOR_LITERAL.source).test(value)
}

/**
 * Copies the color declarations of `nodes` under `[data-orchestra-palette="<id>"]`, passing each value through
 * `value`. Every copy gains the same (0,1,0) specificity, so it beats its source rule while the copies keep the
 * order and specificity relations of their sources. Rules for the other color scheme are skipped.
 */
export function paletteRules(
  nodes: CssNode[],
  input: {
    id: string
    scheme: "dark" | "light"
    tokens: Set<string>
    value: (declaration: Declaration, rule: Declaration[]) => string
  },
  context = { parent: undefined as string | undefined, at: "", shadowed: lightShadowed(nodes) },
): string[] {
  return nodes.flatMap((node) => {
    if (node.kind === "at") {
      if (/^@(keyframes|font-face|property|-webkit-keyframes)\b/.test(node.prelude)) return []
      const inner = paletteRules(node.children, input, { ...context, at: `${context.at}${node.prelude}|` })
      return inner.length ? [`${node.prelude} {\n${indent(inner.join("\n"))}\n}`] : []
    }
    const selector = context.parent ? nest(node.selector, context.parent) : node.selector
    const other = input.scheme === "dark" ? '[data-color-scheme="light"]' : '[data-color-scheme="dark"]'
    if (selector.includes(other)) return []
    // In a light palette, a base declaration that the light scheme overrides on the same selector never applies.
    const dead = (property: string) =>
      input.scheme === "light" &&
      !selector.includes('[data-color-scheme="light"]') &&
      split(selector).every((part) => context.shadowed.has(`${context.at}${normalize(part)}|${property}`))
    const live = node.declarations.filter((item) => !dead(item.property))
    const declarations = live
      .filter((item) =>
        item.property.startsWith("--") ? input.tokens.has(item.property) : COLOR_PROPERTY.test(item.property),
      )
      .map((item) => `  ${item.property}: ${input.value(item, live)};`)
    const own = declarations.length ? [`${boost(selector, input.id)} {\n${declarations.join("\n")}\n}`] : []
    return [...own, ...paletteRules(node.children, input, { ...context, parent: selector })]
  })
}

/** Selector-and-property keys that a `[data-color-scheme="light"]` rule declares, by at-rule context. */
function lightShadowed(nodes: CssNode[], at = "", parent?: string): Set<string> {
  return new Set(
    nodes.flatMap((node) => {
      if (node.kind === "at") return [...lightShadowed(node.children, `${at}${node.prelude}|`, parent)]
      const selector = parent ? nest(node.selector, parent) : node.selector
      const own = split(selector)
        .filter((part) => part.includes('[data-color-scheme="light"]'))
        .flatMap((part) => node.declarations.map((item) => `${at}${normalize(part)}|${item.property}`))
      return [...own, ...lightShadowed(node.children, at, selector)]
    }),
  )
}

function normalize(selector: string) {
  return selector
    .replace(/\[data-color-scheme(="(light|dark)")?\]/g, "")
    .replace(/^html(\s+|$)/, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function boost(selector: string, id: string) {
  const mark = `[data-orchestra-palette="${id}"]`
  return split(selector)
    .map((part) => {
      if (/^html(?![\w-])/.test(part)) return `html${mark}${part.slice(4)}`
      if (part.startsWith(":root")) return `:root${mark}${part.slice(5)}`
      return `${mark} ${part}`
    })
    .join(",\n")
}

function nest(selector: string, parent: string) {
  const scope = split(parent).length > 1 ? `:is(${parent})` : parent
  return split(selector)
    .map((part) => (part.includes("&") ? part.replaceAll("&", scope) : `${scope} ${part}`))
    .join(", ")
}

/** Splits a selector list on its top-level commas. */
export function split(selector: string) {
  const parts: string[] = []
  const state = { depth: 0, current: "" }
  for (const char of selector) {
    if (char === "(") state.depth++
    if (char === ")") state.depth--
    if (char === "," && state.depth === 0) {
      parts.push(state.current.trim())
      state.current = ""
      continue
    }
    state.current += char
  }
  parts.push(state.current.trim())
  return parts.filter(Boolean)
}

function indent(text: string) {
  return text
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n")
}
