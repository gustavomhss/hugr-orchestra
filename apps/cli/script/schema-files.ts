#!/usr/bin/env bun

import { Config } from "@orchestra/core/config"
import { TuiConfig } from "@orchestra/tui/config"
import path from "node:path"
import { Schema } from "effect"

type JsonSchema = Record<string, unknown>
const MODEL_REF = "https://models.dev/model-schema.json#/$defs/Model"

export function generateEffect(schema: Schema.Top) {
  const document = Schema.toJsonSchemaDocument(schema)
  const normalized = normalize({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    $defs: document.definitions,
  })
  if (!isRecord(normalized)) throw new Error("schema generator produced a non-object schema")
  const restored = restoreModelRefs(normalized)
  if (!isRecord(restored)) throw new Error("schema generator produced a non-object schema")
  restored.allowComments = true
  restored.allowTrailingCommas = true
  return restored
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (!isRecord(value)) return value

  const schema = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))

  if (Array.isArray(schema.anyOf)) {
    const anyOf = schema.anyOf.filter((item) => !isRecord(item) || item.type !== "null")
    if (anyOf.length !== schema.anyOf.length) {
      const { anyOf: _, ...rest } = schema
      if (anyOf.length === 1 && isRecord(anyOf[0])) return normalize({ ...anyOf[0], ...rest })
      return { ...rest, anyOf }
    }
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length === 1 && isRecord(schema.allOf[0])) {
    const { allOf: _, ...rest } = schema
    return normalize({ ...schema.allOf[0], ...rest })
  }

  if (schema.type === "integer" && schema.maximum === undefined) {
    return { ...schema, maximum: Number.MAX_SAFE_INTEGER }
  }

  return schema
}

function restoreModelRefs(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => restoreModelRefs(item))
  if (!isRecord(value)) return value

  const schema = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, restoreModelRefs(item, name)]))
  if ((key === "model" || key === "small_model") && schema.type === "string") {
    return { ...schema, $ref: MODEL_REF }
  }
  return schema
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const configSchemaFile = path.resolve(import.meta.dir, "../../../schema/config.json")
export const tuiSchemaFile = path.resolve(import.meta.dir, "../../../schema/tui.json")
export const themeSchemaFile = path.resolve(import.meta.dir, "../../../schema/theme.json")
export const themeSchemaSource = path.resolve(import.meta.dir, "../../../packages/ui/src/theme/desktop-theme.schema.json")

export const configSchemaText = () => JSON.stringify(generateEffect(Config.Info), null, 2)
export const tuiSchemaText = () => JSON.stringify(generateEffect(TuiConfig.Info), null, 2)

// schema/ is what editors fetch through the $schema URLs; the theme schema is hand-written in packages/ui and mirrored verbatim.
if (import.meta.main) {
  await Bun.write(configSchemaFile, configSchemaText())
  await Bun.write(tuiSchemaFile, tuiSchemaText())
  await Bun.write(themeSchemaFile, Bun.file(themeSchemaSource))
  console.log(configSchemaFile)
  console.log(tuiSchemaFile)
  console.log(themeSchemaFile)
}
