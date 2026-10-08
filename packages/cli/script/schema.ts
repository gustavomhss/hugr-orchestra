#!/usr/bin/env bun

const args = process.argv.slice(2)
if (args.length !== 1 || !args[0]) {
  console.error("Usage: bun --bun packages/cli/script/schema.ts <output>")
  process.exit(2)
}

// Validate arguments before loading config dependencies or touching the output.
const { Config } = await import("@orchestra/core/config")
const { Schema } = await import("effect")
const document = Schema.toJsonSchemaDocument(Config.Info)

await Bun.write(
  args[0],
  JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...document.schema,
      $defs: document.definitions,
      allowComments: true,
      allowTrailingCommas: true,
    },
    null,
    2,
  ) + "\n",
)
