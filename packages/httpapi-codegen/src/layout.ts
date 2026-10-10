import { parsers } from "prettier/plugins/typescript"
import { GenerationError, identifierPart } from "./error-symbol"
import type { Group } from "./index"

export function assertSplitGroups(groups: ReadonlyArray<Group>, splitGroups?: ReadonlySet<string>) {
  const identifiers = new Set(groups.map((group) => group.identifier))
  splitGroups?.forEach((identifier) => {
    if (!identifiers.has(identifier)) {
      throw new GenerationError({ reason: `Unknown split group: ${identifier}` })
    }
  })
}

export function splitPromiseTypes(content: string, names: ReadonlyArray<string>, module: string) {
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [content, {}])
  if (!isNode(ast) || !Array.isArray(ast.body)) {
    throw new GenerationError({ reason: "Invalid Promise type layout document" })
  }
  const declarations = ast.body.filter(isNode)
  const selected = declarations.filter((node) => names.includes(declarationName(node) ?? ""))
  if (selected.length !== names.length) {
    throw new GenerationError({ reason: `Missing Promise declarations for ${module}` })
  }
  const references = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!isNode(value)) return
    if (value.type === "TSTypeReference") {
      const root = typeReferenceRoot(value.typeName)
      if (root !== undefined) references.add(root)
    }
    Object.values(value).forEach(visit)
  }
  selected.forEach(visit)
  const imports = declarations
    .filter(
      (node) =>
        node.type === "ImportDeclaration" &&
        Array.isArray(node.specifiers) &&
        node.specifiers.some(
          (specifier: unknown) =>
            isNode(specifier) &&
            isNode(specifier.local) &&
            typeof specifier.local.name === "string" &&
            references.has(specifier.local.name),
        ),
    )
    .map((node) => source(content, node))
  const json = references.has("JsonValue") && declarations.some((node) => declarationName(node) === "JsonValue")
  const ranges = selected.map(range)
  return {
    main:
      ranges.reduceRight((text, bounds) => text.slice(0, bounds[0]) + text.slice(bounds[1]), content) +
      `\nexport { ${selected.map((node) => `${isNode(node.declaration) && node.declaration.type === "TSTypeAliasDeclaration" ? "type " : ""}${declarationName(node)}`).join(", ")} } from "./${module}"\n`,
    split: [
      ...imports,
      ...(json ? ['import type { JsonValue } from "./types"'] : []),
      ...selected.map((node) => source(content, node)),
    ].join("\n\n"),
  }
}

export function renderPromiseGroup(group: Group, methods: ReadonlyArray<string>, imports: ReadonlyArray<string>) {
  if (group.endpoints[0]?.topLevel) {
    throw new GenerationError({ reason: `Cannot split top-level Promise group: ${group.identifier}` })
  }
  return `import type { ${imports.join(", ")} } from "./types"
import type { RequestOptions } from "./client"
import type { RequestDescriptor } from "./request"

export function make${identifierPart(group.identifier)}(
  request: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => Promise<A>,
  sse: <A>(descriptor: RequestDescriptor, options?: RequestOptions) => AsyncIterable<A>,
) {
  return { ${methods.join(", ")} }
}
`
}

export function splitPromiseRequest(content: string) {
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [content, {}])
  if (!isNode(ast) || !Array.isArray(ast.body)) {
    throw new GenerationError({ reason: "Invalid Promise client layout document" })
  }
  const descriptor = ast.body
    .filter(isNode)
    .find((node) => node.type === "TSInterfaceDeclaration" && isNode(node.id) && node.id.name === "RequestDescriptor")
  if (descriptor === undefined) throw new GenerationError({ reason: "Missing Promise request descriptor" })
  const bounds = range(descriptor)
  return {
    main:
      `import type { RequestDescriptor } from "./request"\n` + content.slice(0, bounds[0]) + content.slice(bounds[1]),
    split: `export ${source(content, descriptor)}\n`,
  }
}

function declarationName(node: Record<string, unknown>) {
  if (!isNode(node.declaration)) return
  if (node.declaration.type === "VariableDeclaration" && Array.isArray(node.declaration.declarations)) {
    const declaration = node.declaration.declarations[0]
    if (isNode(declaration) && isNode(declaration.id) && typeof declaration.id.name === "string")
      return declaration.id.name
  }
  if (node.declaration.type !== "TSTypeAliasDeclaration") return
  if (!isNode(node.declaration.id) || typeof node.declaration.id.name !== "string") return
  return node.declaration.id.name
}

function typeReferenceRoot(node: unknown): string | undefined {
  if (!isNode(node)) return
  if (node.type === "TSQualifiedName") return typeReferenceRoot(node.left)
  if (node.type === "Identifier" && typeof node.name === "string") return node.name
}

function source(content: string, node: Record<string, unknown>) {
  const bounds = range(node)
  return content.slice(bounds[0], bounds[1])
}

function range(node: Record<string, unknown>): readonly [number, number] {
  if (
    !Array.isArray(node.range) ||
    node.range.length !== 2 ||
    typeof node.range[0] !== "number" ||
    typeof node.range[1] !== "number"
  ) {
    throw new GenerationError({ reason: "Missing Promise declaration source range" })
  }
  return [node.range[0], node.range[1]]
}

function isNode(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
