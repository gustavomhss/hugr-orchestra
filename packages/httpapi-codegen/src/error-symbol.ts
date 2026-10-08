import { Schema, type SchemaAST } from "effect"
import { parsers } from "prettier/plugins/typescript"

export class GenerationError extends Schema.TaggedErrorClass<GenerationError>()("GenerationError", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason
  }
}

export function errorSymbols<
  T extends { readonly identifier: string; readonly key: string; readonly ast: SchemaAST.AST },
>(errors: ReadonlyArray<T>) {
  const symbols = new Map<string, T>()
  for (const error of errors) {
    const identifier = declaredErrorIdentifier(error.identifier)
    const previous = symbols.get(identifier)
    if (
      previous !== undefined &&
      (previous.identifier !== error.identifier || previous.key !== error.key || previous.ast !== error.ast)
    ) {
      throw new GenerationError({
        reason: `Promise error name collision: ${previous.identifier} and ${error.identifier} normalize to ${identifier}`,
      })
    }
    symbols.set(identifier, error)
  }
  return symbols
}

export function assertErrorSymbols(symbols: Iterable<string>, declarations: string, errors: string) {
  const identifiers = Array.from(symbols)
  if (identifiers.length === 0) return
  // These bindings are always re-exported by the Promise barrel, across all groups.
  const reserved = new Set(["ClientError", "ClientErrorReason", "Orchestra"])
  const visit = (node: unknown, bindings: boolean) => {
    if (Array.isArray(node)) return node.forEach((value) => visit(value, bindings))
    if (!isNode(node)) return
    const binding =
      ["TSTypeAliasDeclaration", "TSImportEqualsDeclaration"].includes(String(node.type))
        ? node.id
        : ["ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(String(node.type))
          ? node.local
          : undefined
    if (bindings && isNode(binding) && typeof binding.name === "string") reserved.add(binding.name)
    if (node.type === "TSTypeReference" && isNode(node.typeArguments)) {
      const reference = node.typeName
      if (isNode(reference) && reference.type === "Identifier" && typeof reference.name === "string") {
        reserved.add(reference.name)
      }
    }
    Object.values(node).forEach((value) => visit(value, bindings))
  }
  for (const [source, bindings] of [
    [declarations, true],
    [errors, false],
  ] as const) {
    // Prettier's built-in TypeScript parser is synchronous; parse binding/reference syntax,
    // rather than guessing import spellings or treating literals as generic references.
    const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [source, {}])
    if (!isNode(ast) || ast.type !== "Program") {
      throw new GenerationError({ reason: "Invalid Promise symbol document" })
    }
    visit(ast, bindings)
  }
  for (const identifier of identifiers) {
    if (reserved.has(identifier)) {
      throw new GenerationError({ reason: `Promise error symbol collision: ${identifier}` })
    }
  }
}

function isNode(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function declaredErrorIdentifier(value: string) {
  // Match Promise type prefixes: PascalCase ASCII words, dropping separators/non-ASCII.
  // Capitalization avoids keywords; empty or digit-leading names need a legal prefix.
  const identifier = identifierPart(value)
  return /^[A-Z]/.test(identifier) ? identifier : `Error${identifier}`
}

export function identifierPart(value: string) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("")
}
