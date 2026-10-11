import { Schema, SchemaAST } from "effect"
import { HttpApiSchema } from "effect/unstable/httpapi"
import { GenerationError } from "./error-symbol"

export const resolveHttpApiEncoding = SchemaAST.resolveAt<HttpApiSchema.Encoding>("~httpApiEncoding")
export const resolveHttpApiStatus = SchemaAST.resolveAt<number>("httpApiStatus")
const resolveContentSchema = SchemaAST.resolveAt<SchemaAST.AST>("contentSchema")

export function sameEncoding(left: SchemaAST.AST, right: SchemaAST.AST): boolean {
  if (left._tag !== right._tag || left.encoding?.length !== right.encoding?.length) return false
  if (
    left.encoding?.some((link, index) => {
      const other = right.encoding?.[index]
      return other === undefined || link.transformation !== other.transformation || !sameEncoding(link.to, other.to)
    })
  )
    return false
  if (!sameChecks(left.checks, right.checks) || !sameContext(left.context, right.context)) return false
  if (SchemaAST.isSuspend(left) && SchemaAST.isSuspend(right)) return sameEncoding(left.thunk(), right.thunk())
  if (SchemaAST.isUnion(left) && SchemaAST.isUnion(right)) {
    return (
      left.types.length === right.types.length &&
      left.types.every((ast, index) => sameEncoding(ast, right.types[index]))
    )
  }
  if (SchemaAST.isArrays(left) && SchemaAST.isArrays(right)) {
    return (
      left.elements.length === right.elements.length &&
      left.rest.length === right.rest.length &&
      left.elements.every((ast, index) => sameEncoding(ast, right.elements[index])) &&
      left.rest.every((ast, index) => sameEncoding(ast, right.rest[index]))
    )
  }
  if (SchemaAST.isObjects(left) && SchemaAST.isObjects(right)) {
    return (
      left.propertySignatures.length === right.propertySignatures.length &&
      left.indexSignatures.length === right.indexSignatures.length &&
      left.propertySignatures.every((field, index) => sameEncoding(field.type, right.propertySignatures[index].type)) &&
      left.indexSignatures.every(
        (field, index) =>
          sameEncoding(field.parameter, right.indexSignatures[index].parameter) &&
          sameEncoding(field.type, right.indexSignatures[index].type),
      )
    )
  }
  return true
}

function sameChecks(left: SchemaAST.Checks | undefined, right: SchemaAST.Checks | undefined): boolean {
  if (left?.length !== right?.length) return false
  if (left === undefined || right === undefined) return true
  return left.every((check, index) => {
    const other = right[index]
    if (other === undefined || check._tag !== other._tag) return false
    if (check._tag === "Filter" && other._tag === "Filter") {
      return check.run === other.run && check.aborted === other.aborted
    }
    return check._tag === "FilterGroup" && other._tag === "FilterGroup" && sameChecks(check.checks, other.checks)
  })
}

function sameContext(left: SchemaAST.Context | undefined, right: SchemaAST.Context | undefined) {
  return left?.isOptional === right?.isOptional && left?.isMutable === right?.isMutable
}

export function assertPortable(schema: Schema.Top, path: string, portable: Map<SchemaAST.AST, boolean>) {
  const visiting = new Set<SchemaAST.AST>()
  const taggedError = taggedErrorFields(schema)
  const visit = (ast: SchemaAST.AST): boolean => {
    const cached = portable.get(ast)
    if (cached !== undefined) return cached
    if (visiting.has(ast)) return true
    visiting.add(ast)
    const result = visitCurrent(ast)
    visiting.delete(ast)
    portable.set(ast, result)
    return result
  }
  const visitCurrent = (ast: SchemaAST.AST): boolean => {
    if (!annotationsPortable(ast.annotations)) return false
    if (!checksPortable(ast.checks) || ("encodingChecks" in ast && !checksPortable(ast.encodingChecks))) return false
    if (SchemaAST.isDeclaration(ast)) {
      return generationPortable(ast.annotations?.generation) && ast.typeParameters.every(visit)
    }
    if (ast.encoding !== undefined && ast.annotations?.generation === undefined) return false
    if (SchemaAST.isSuspend(ast)) return visit(ast.thunk())
    if (SchemaAST.isUnion(ast)) return ast.types.every(visit)
    if (SchemaAST.isArrays(ast)) {
      return ast.elements.every(visit) && ast.rest.every(visit)
    }
    if (SchemaAST.isObjects(ast)) {
      return (
        ast.propertySignatures.every((field) => visit(field.type)) &&
        ast.indexSignatures.every((index) => visit(index.parameter) && visit(index.type))
      )
    }
    if (SchemaAST.isTemplateLiteral(ast)) return ast.parts.every(visit)
    return true
  }
  if (taggedError !== undefined && SchemaAST.isDeclaration(schema.ast)) {
    if (
      schema.ast.checks !== undefined ||
      ("encodingChecks" in schema.ast && !checksPortable(schema.ast.encodingChecks)) ||
      schema.ast.typeParameters.some((ast) => ast.checks !== undefined) ||
      !schema.ast.typeParameters.every(visit)
    ) {
      throw new GenerationError({ reason: `Unportable schema: ${path}` })
    }
    return
  }
  if (!visit(schema.ast)) throw new GenerationError({ reason: `Unportable schema: ${path}` })
}

function checksPortable(checks: SchemaAST.Checks | undefined): boolean {
  if (checks === undefined) return true
  return checks.every((check) =>
    check._tag === "Filter"
      ? !check.aborted &&
        check.annotations?.meta !== undefined &&
        typeof check.annotations.arbitrary === "object" &&
        check.annotations.arbitrary !== null &&
        "constraint" in check.annotations.arbitrary
      : checksPortable(check.checks),
  )
}

export function metadataPortable(ast: SchemaAST.AST, seen: Set<SchemaAST.AST>): boolean {
  if (seen.has(ast)) return true
  seen.add(ast)
  if (!annotationsPortable(ast.annotations) || !checksPortable(ast.checks)) return false
  if ("encodingChecks" in ast && !checksPortable(ast.encodingChecks)) return false
  if (ast.encoding?.some((link) => !metadataPortable(link.to, seen))) return false
  if (SchemaAST.isDeclaration(ast)) return ast.typeParameters.every((item) => metadataPortable(item, seen))
  if (SchemaAST.isSuspend(ast)) return metadataPortable(ast.thunk(), seen)
  if (SchemaAST.isUnion(ast)) return ast.types.every((item) => metadataPortable(item, seen))
  if (SchemaAST.isArrays(ast)) {
    return (
      ast.elements.every((item) => metadataPortable(item, seen)) &&
      ast.rest.every((item) => metadataPortable(item, seen))
    )
  }
  if (SchemaAST.isObjects(ast)) {
    return (
      ast.propertySignatures.every((field) => metadataPortable(field.type, seen)) &&
      ast.indexSignatures.every(
        (field) => metadataPortable(field.parameter, seen) && metadataPortable(field.type, seen),
      )
    )
  }
  return true
}

function generationPortable(generation: unknown): boolean {
  if (typeof generation !== "object" || generation === null) return false
  const value = generation as {
    readonly runtime?: unknown
    readonly Type?: unknown
    readonly importDeclaration?: unknown
  }
  if (typeof value.runtime !== "string" || typeof value.Type !== "string") return false
  if (value.importDeclaration !== undefined) {
    if (
      typeof value.importDeclaration !== "string" ||
      !/from ["']effect(?:\/[^"']+)?["']$/.test(value.importDeclaration)
    ) {
      return false
    }
  }
  const namespace =
    typeof value.importDeclaration === "string"
      ? /import(?: type)? \* as ([A-Za-z_$][\w$]*)/.exec(value.importDeclaration)?.[1]
      : undefined
  return value.runtime.startsWith("Schema.") || (namespace !== undefined && value.runtime.startsWith(`${namespace}.`))
}

function annotationsPortable(annotations: Schema.Annotations.Annotations | undefined) {
  if (annotations === undefined) return true
  return Object.entries(annotations).every(([key, value]) => {
    if (
      ["toCodec", "toCodecJson", "toArbitrary", "toFormatter", "toEquivalence", "~effect/Schema/Class"].includes(key)
    ) {
      return true
    }
    if (key === "generation") return generationPortable(value)
    return serializable(value)
  })
}

function serializable(value: unknown): boolean {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(serializable)
  if (typeof value !== "object") return false
  return Object.values(value).every(serializable)
}

export function taggedErrorFields(schema: Schema.Top) {
  const fields = declaredErrorFields(schema)
  return fields?.key === "_tag" ? fields : undefined
}

export function declaredErrorFields(schema: Schema.Top) {
  if (!SchemaAST.isDeclaration(schema.ast) || schema.ast.annotations?.["~effect/Schema/Class"] === undefined) {
    return undefined
  }
  const fields = schema.ast.typeParameters[0]
  if (!SchemaAST.isObjects(fields) || fields.indexSignatures.length > 0) return undefined
  const key = fields.propertySignatures.find((field) => field.name === "_tag" || field.name === "name")?.name
  if (key !== "_tag" && key !== "name") return undefined
  const tag = fields.propertySignatures.find((field) => field.name === key)?.type
  if (tag === undefined || !SchemaAST.isLiteral(tag) || typeof tag.literal !== "string") return undefined
  return {
    ast: fields,
    // The class-bound factory is canonical across transport/status AST copies, unlike the shared fields Struct.
    declaration: schema.ast.annotations["~effect/Schema/Class"],
    key,
    tag: tag.literal,
    identifier: SchemaAST.resolveIdentifier(schema.ast) ?? tag.literal,
    fields: fields.propertySignatures.flatMap((field) =>
      field.name === key || typeof field.name !== "string"
        ? []
        : [[field.name, Schema.make(field.type), SchemaAST.isOptional(field.type)] as const],
    ),
  }
}

export function isDataEnvelope(schema: Schema.Top) {
  if (isStreamSchema(schema) || HttpApiSchema.isNoContent(schema.ast)) return false
  const ast = Schema.toType(schema).ast
  return (
    SchemaAST.isObjects(ast) &&
    ast.indexSignatures.length === 0 &&
    ast.propertySignatures.length === 1 &&
    ast.propertySignatures[0]?.name === "data"
  )
}

export function isStreamSchema(schema: Schema.Top): schema is HttpApiSchema.StreamSchema {
  return "_tag" in schema && (schema._tag === "StreamSse" || schema._tag === "StreamUint8Array")
}

export function streamDataSchema(schema: Extract<HttpApiSchema.StreamSchema, { readonly _tag: "StreamSse" }>) {
  return Schema.make(streamDataAst(Schema.toType(schema.events).ast))
}

export function streamEncodedDataSchema(schema: Extract<HttpApiSchema.StreamSchema, { readonly _tag: "StreamSse" }>) {
  const data = streamDataAst(schema.events.ast)
  const encodedAst = data.encoding?.at(-1)?.to
  if (encodedAst === undefined) throw new GenerationError({ reason: "Invalid SSE data schema" })
  const encoded = resolveContentSchema(encodedAst)
  if (!SchemaAST.isAST(encoded)) throw new GenerationError({ reason: "Invalid SSE data schema" })
  return Schema.make(encoded)
}

function streamDataAst(ast: SchemaAST.AST) {
  if (!SchemaAST.isObjects(ast)) throw new GenerationError({ reason: "Invalid SSE data schema" })
  const data = ast.propertySignatures.find((field) => field.name === "data")?.type
  if (data === undefined) throw new GenerationError({ reason: "Invalid SSE data schema" })
  return data
}

export function streamEffectPortable(schema: Schema.Top) {
  if (!isStreamSchema(schema) || schema._tag === "StreamUint8Array" || schema.sseMode === "events") return true
  const rebuilt = HttpApiSchema.StreamSse({
    data: streamDataSchema(schema),
    error: schema.error,
    contentType: schema.contentType,
  })
  return sameEncoding(schema.events.ast, rebuilt.events.ast)
}

export function responseSchemas(schema: Schema.Top, path: string): Array<readonly [string, Schema.Top]> {
  if (HttpApiSchema.isNoContent(schema.ast)) return []
  if (!isStreamSchema(schema)) return [[path, schema]]
  if (schema._tag === "StreamUint8Array") return []
  const value = schema.sseMode === "data" ? streamDataSchema(schema) : schema.events
  return [
    [`${path}.${schema.sseMode}`, value],
    [`${path}.error`, schema.error],
  ]
}
