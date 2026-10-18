import { format } from "prettier"
import { parsers } from "prettier/plugins/typescript"
import { GenerationError, identifierPart } from "./error-symbol"
import type { Group, Output } from "./index"

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
  const references = typeReferences(selected)
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
  const shared = declarations.flatMap((node) => {
    const name = declarationName(node)
    const exported =
      name !== undefined
        ? [name]
        : Array.isArray(node.specifiers)
          ? node.specifiers.flatMap((specifier: unknown) =>
              isNode(specifier) && isNode(specifier.exported) && typeof specifier.exported.name === "string"
                ? [specifier.exported.name]
                : [],
            )
          : []
    return exported.filter((name) => references.has(name) && !names.includes(name))
  })
  const retainedReferences = typeReferences(declarations.filter((node) => !selected.includes(node)))
  const retainedImports = names.filter((name) => retainedReferences.has(name))
  const ranges = selected.map(range)
  return {
    main:
      (retainedImports.length ? `import type { ${retainedImports.join(", ")} } from "./${module}"\n` : "") +
      ranges.reduceRight((text, bounds) => text.slice(0, bounds[0]) + text.slice(bounds[1]), content) +
      `\nexport { ${selected.map((node) => `${isNode(node.declaration) && node.declaration.type === "TSTypeAliasDeclaration" ? "type " : ""}${declarationName(node)}`).join(", ")} } from "./${module}"\n`,
    split: [
      ...imports,
      ...(shared.length ? [`import type { ${shared.join(", ")} } from "./types"`] : []),
      ...selected.map((node) => source(content, node)),
    ].join("\n\n"),
  }
}

export async function formatFiles(files: Output["files"]) {
  const formatted: Array<{ path: string; content: string }> = []
  for (const batch of Array.from({ length: Math.ceil(files.length / 8) }, (_, index) =>
    files.slice(index * 8, index * 8 + 8),
  )) {
    formatted.push(
      ...(
        await Promise.all(
          batch.map((file) =>
            formatFile(file).catch((error: unknown) => {
              throw error instanceof GenerationError
                ? error
                : new GenerationError({ reason: `Failed to format ${file.path}: ${String(error)}` })
            }),
          ),
        )
      ).flat(),
    )
  }
  return formatted
}

// Partition only complete, formatted declarations. Import and barrel overhead count toward the bound.
export async function formatFile(file: Output["files"][number]) {
  const formatted = await format(file.content, {
    filepath: file.path,
    parser: "typescript",
    semi: false,
    printWidth: 120,
  })
  if (!file.boundedTypes || physicalLines(formatted) <= 400) return [{ path: file.path, content: formatted }]
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [formatted, {}])
  if (!isNode(ast) || !Array.isArray(ast.body)) {
    throw new GenerationError({ reason: `Invalid bounded type layout: ${file.path}` })
  }
  const statements = ast.body.filter(isNode)
  const imports = statements.filter((node) => node.type === "ImportDeclaration")
  const declarations = statements.filter((node) => node.type !== "ImportDeclaration")
  if (
    !declarations.length ||
    declarations.some((node) => !isNode(node.declaration) || node.declaration.type !== "TSTypeAliasDeclaration")
  ) {
    throw new GenerationError({ reason: `Bounded type layout requires exported aliases: ${file.path}` })
  }
  const stem = file.path.slice(0, -3)
  const names = declarations.map((node) => {
    const name = declarationName(node)
    if (name === undefined) throw new GenerationError({ reason: `Unnamed bounded type declaration: ${file.path}` })
    return name
  })
  if (new Set(names).size !== names.length) {
    throw new GenerationError({ reason: `Duplicate bounded type declaration: ${file.path}` })
  }
  const render = (nodes: ReadonlyArray<Record<string, unknown>>, owners: ReadonlyMap<string, string>) => {
    const local = new Set(nodes.map(declarationName))
    const references = typeReferences(nodes)
    const cross = Array.from(references).filter((name) => !local.has(name) && owners.has(name))
    return [
      ...imports
        .filter(
          (node) =>
            Array.isArray(node.specifiers) &&
            node.specifiers.some(
              (specifier: unknown) =>
                isNode(specifier) && isNode(specifier.local) && references.has(String(specifier.local.name)),
            ),
        )
        .map((node) => source(formatted, node)),
      ...Array.from(
        Map.groupBy(cross, (name) => owners.get(name)),
        ([module, names]) => `import type { ${names.join(", ")} } from "./${module}"`,
      ),
      ...nodes.map((node) => source(formatted, node)),
    ].join("\n\n")
  }
  const print = (content: string) => format(content, { parser: "typescript", semi: false, printWidth: 120 })
  // One provisional owner per declaration conservatively includes every possible cross-part import.
  const provisional = new Map(names.map((name, index) => [name, `${stem}-part-${index + 1}`]))
  const parts: Array<Array<Record<string, unknown>>> = [[]]
  for (const node of declarations) {
    const current = parts[parts.length - 1]
    const candidate = await print(render([...current, node], provisional))
    if (physicalLines(candidate) <= 350) {
      current.push(node)
      continue
    }
    const single = await print(render([node], provisional))
    if (physicalLines(single) > 400) {
      throw new GenerationError({
        reason: `Promise declaration exceeds 400 lines: ${file.path}:${declarationName(node)}`,
      })
    }
    if (!current.length) current.push(node)
    if (current.includes(node)) continue
    parts.push([node])
  }
  const owners = new Map(
    parts.flatMap((nodes, index) =>
      nodes.map((node) => [names[declarations.indexOf(node)], `${stem}-part-${index + 1}`] as const),
    ),
  )
  const files = await Promise.all(
    parts.map(async (nodes, index) => ({
      path: `${stem}-part-${index + 1}.ts`,
      content: await print(render(nodes, owners)),
    })),
  )
  files.unshift({
    path: file.path,
    content: await print(
      parts
        .map(
          (nodes, index) =>
            `export type { ${nodes.map(declarationName).join(", ")} } from "./${stem}-part-${index + 1}"`,
        )
        .join("\n"),
    ),
  })
  const oversized = files.find((part) => physicalLines(part.content) > 400)
  if (oversized) throw new GenerationError({ reason: `Promise type layout exceeds 400 lines: ${oversized.path}` })
  return files
}

function physicalLines(content: string) {
  return content.split(/\r\n|\r|\n/).length - Number(content.endsWith("\n"))
}

function typeReferences(nodes: ReadonlyArray<Record<string, unknown>>) {
  const references = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!isNode(value)) return
    if (value.type === "TSTypeReference") {
      const root = typeReferenceRoot(value.typeName)
      if (root !== undefined) references.add(root)
    }
    Object.values(value).forEach(visit)
  }
  nodes.forEach(visit)
  return references
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
