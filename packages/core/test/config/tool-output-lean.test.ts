import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { ConfigToolOutput } from "@orchestra/core/config/tool-output"
import { ConfigV1 } from "@orchestra/core/v1/config/config"
import { ConfigMigrateV1 } from "@orchestra/core/v1/config/migrate"

const limits = { max_lines: 123, max_bytes: 4567 }

function leanSuite<T extends { readonly tool_output?: object }, I extends { readonly tool_output?: object }>(
  name: string,
  schema: Schema.Codec<T, I>,
) {
  describe(`${name} lean config`, () => {
    for (const lean of [undefined, {}, { enabled: true }, { enabled: false }]) {
      test(`lean decode and encode preserves ${JSON.stringify(lean)}`, () => {
        const tool_output = { ...limits, ...(lean === undefined ? {} : { lean }) }
        const decoded = Schema.decodeUnknownSync(schema)({ tool_output })
        expect(decoded.tool_output).toEqual(tool_output)
        expect(Schema.encodeSync(schema)(decoded).tool_output).toEqual(tool_output)
      })
    }

    test("lean omission adds no tool_output default", () => {
      expect(Schema.decodeUnknownSync(schema)({}).tool_output).toBeUndefined()
    })

    for (const enabled of ["true", "false", 0, 1, null]) {
      test(`lean rejects invalid enabled ${JSON.stringify(enabled)}`, () => {
        expect(() => Schema.decodeUnknownSync(schema)({ tool_output: { lean: { enabled } } })).toThrow()
      })
    }
  })
}

leanSuite("v1", ConfigV1.Info)
leanSuite("v2", Config.Info)

describe("lean v1 migration to v2", () => {
  for (const lean of [undefined, {}, { enabled: true }, { enabled: false }]) {
    test(`lean migration roundtrip preserves ${JSON.stringify(lean)}`, () => {
      const tool_output = { ...limits, ...(lean === undefined ? {} : { lean }) }
      const v1 = Schema.decodeUnknownSync(ConfigV1.Info)({ snapshot: false, tool_output })
      const migrated = ConfigMigrateV1.migrate(v1)
      expect(migrated.tool_output).toEqual(tool_output)
      const v2 = Schema.decodeUnknownSync(Config.Info)(migrated)
      expect(v2.snapshots).toBe(false)
      expect(v2.tool_output).toEqual(tool_output)
      const encoded = Schema.encodeSync(Config.Info)(v2)
      expect(Schema.decodeUnknownSync(Config.Info)(JSON.parse(JSON.stringify(encoded))).tool_output).toEqual(tool_output)
      expect(
        Schema.encodeSync(ConfigToolOutput.Info)(Schema.decodeUnknownSync(ConfigToolOutput.Info)(tool_output)),
      ).toEqual(tool_output)
    })
  }

  test("lean migration omission stays absent", () => {
    const v1 = Schema.decodeUnknownSync(ConfigV1.Info)({ snapshot: false })
    expect(Schema.decodeUnknownSync(Config.Info)(ConfigMigrateV1.migrate(v1)).tool_output).toBeUndefined()
  })
})
