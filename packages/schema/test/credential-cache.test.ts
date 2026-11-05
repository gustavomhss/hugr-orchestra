import { expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { Credential } from "../src/credential"
import { Integration } from "../src/integration"

const cache = () => ({ type: "cache", methodID: Integration.MethodID.make("fabric.entra"),
  format: "microsoft.identity.cache", version: 1, serialized: "{\"synthetic\":\"not-a-real-token\"}" } as const)
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

test("CCW01 opaque cache joins the canonical credential union without pretending to be OAuth", async () => {
  expect(Credential.Cache).toBeDefined()
  const root = await import("@orchestra/schema")
  expect(root.Credential.Cache).toBe(Credential.Cache)
  // Cache refines the canonical producer ID's bounds without tightening legacy OAuth IDs.
  const producer: Equal<typeof Credential.Cache.Type["methodID"], typeof Integration.MethodID.Type> = true
  expect(producer).toBe(true)
  expect(Schema.encodeSync(Credential.Cache)(Schema.decodeUnknownSync(Credential.Cache)(cache()))).toEqual(cache())
  expect(Schema.decodeUnknownSync(Credential.Value)(cache())).toEqual(cache())
  const readonly: Equal<typeof Credential.Cache.Type, Readonly<typeof Credential.Cache.Type>> = true
  expect(readonly).toBe(true)
  expect(Object.keys(Schema.encodeSync(Credential.Cache)(cache())).sort())
    .toEqual(["format", "methodID", "serialized", "type", "version"])
})

test("CCW02 cache records are closed and require every field while serialized data remains opaque", () => {
  expect(Credential.Cache).toBeDefined()
  const value = cache()
  expect(Schema.decodeUnknownSync(Credential.Cache)({ ...value, serialized: "" }).serialized).toBe("")
  expect(Schema.decodeUnknownSync(Credential.Cache)({ ...value, serialized: "not JSON; token credential chosen data" }).serialized)
    .toBe("not JSON; token credential chosen data")
  Object.keys(value).forEach((field) => expect(() => Schema.decodeUnknownSync(Credential.Cache)(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== field)),
  )).toThrow())
  ;["access", "refresh", "expires", "authority", "metadata", "callback", "unknown"].forEach((field) =>
    [Credential.Cache, Credential.Value].forEach((schema) =>
      expect(() => Schema.decodeUnknownSync(schema)({ ...value, [field]: "forbidden" })).toThrow(),
    ),
  )
  ;[
    { ...value, type: "oauth" }, { ...value, methodID: 1 }, { ...value, format: 1 },
    { ...value, version: "1" }, { ...value, serialized: {} }, { ...value, serialized: () => "data" },
  ].forEach((input) => expect(() => Schema.decodeUnknownSync(Credential.Cache)(input)).toThrow())
})

test("CCW03 cache format, producer id and serialized size have explicit code-unit ceilings", () => {
  expect(Credential.Cache).toBeDefined()
  const value = cache()
  ;(["methodID", "format"] as const).forEach((field) => {
    expect(Schema.decodeUnknownSync(Credential.Cache)({ ...value, [field]: "x".repeat(256) })[field]).toHaveLength(256)
    ;["", "x".repeat(257)].forEach((text) =>
      expect(() => Schema.decodeUnknownSync(Credential.Cache)({ ...value, [field]: text })).toThrow(),
    )
    expect(Schema.decodeUnknownSync(Credential.Cache)({ ...value, [field]: "🙂".repeat(128) })[field]).toHaveLength(256)
    expect(() => Schema.decodeUnknownSync(Credential.Cache)({ ...value, [field]: "🙂".repeat(128) + "x" })).toThrow()
  })
  ;["x".repeat(1048576), "🙂".repeat(524288)].forEach((serialized) => {
    // Boolean assertions retain the exact boundary without dumping a MiB value when a mutant accepts it.
    expect(Schema.decodeUnknownSync(Credential.Cache)({ ...value, serialized }).serialized === serialized).toBe(true)
    expect(Option.isNone(Schema.decodeUnknownOption(Credential.Cache)({ ...value, serialized: serialized + "x" }))).toBe(true)
  })
  expect(Schema.decodeUnknownSync(Credential.Cache)({ ...value, version: Number.MAX_SAFE_INTEGER }).version).toBe(Number.MAX_SAFE_INTEGER)
  ;[0, -1, 0.25, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].forEach((version) =>
    expect(() => Schema.decodeUnknownSync(Credential.Cache)({ ...value, version })).toThrow(),
  )
})

test("CCW04 legacy key and OAuth contracts retain their fields and optional encoding", () => {
  expect(Credential.Cache).toBeDefined()
  const key = { type: "key", key: "synthetic-key" } as const
  const oauth = { type: "oauth", methodID: Integration.MethodID.make("existing.method"),
    refresh: "synthetic-refresh", access: "synthetic-access", expires: 0 } as const
  expect(Schema.encodeSync(Credential.Value)(Schema.decodeUnknownSync(Credential.Value)(key))).toEqual(key)
  expect(Schema.encodeSync(Credential.Value)(Schema.decodeUnknownSync(Credential.Value)(oauth))).toEqual(oauth)
  expect(Schema.encodeSync(Credential.Key)({ ...key, metadata: undefined })).toEqual(key)
  expect(Schema.encodeSync(Credential.OAuth)({ ...oauth, metadata: undefined })).toEqual(oauth)
  expect(Schema.decodeUnknownSync(Credential.Key)({ ...key, key: "" }).key).toBe("")
  expect(Schema.decodeUnknownSync(Credential.OAuth)({ ...oauth, methodID: "", refresh: "", access: "" }).access).toBe("")
  const long = { ...oauth, methodID: Integration.MethodID.make("🙂".repeat(129)) }
  expect(Schema.encodeSync(Credential.Value)(Schema.decodeUnknownSync(Credential.Value)(long))).toEqual(long)
  expect(Schema.decodeUnknownSync(Credential.ID)("x".repeat(257))).toBe(Credential.ID.make("x".repeat(257)))
})
