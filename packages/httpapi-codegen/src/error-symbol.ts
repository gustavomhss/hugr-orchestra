import { Schema, type SchemaAST } from "effect"

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
