import { expect, test } from "bun:test"
import { BoundedJson } from "../src/json"
import { failure } from "./fixture/assert"

test("PRF01 trusted byte profiles are distinct and clamp raised limits for parse and admit", () => {
  ;(["workspace", "package"] as const).forEach((profile) => {
    const ceiling = profile === "workspace" ? 262144 : 524288
    const value = "x".repeat(ceiling - 2)
    expect(BoundedJson.admit(value, profile).ok).toBe(true)
    expect(BoundedJson.parse(JSON.stringify(value), "json", profile).ok).toBe(true)
    ;[undefined, { maxBytes: 1048576 }].forEach((limits) => {
      expect(BoundedJson.admit(value, profile, limits).ok).toBe(true)
      expect(BoundedJson.parse(JSON.stringify(value), "json", profile, limits).ok).toBe(true)
      failure(BoundedJson.admit(value + "x", profile, limits))
      failure(BoundedJson.parse(JSON.stringify(value + "x"), "json", profile, limits))
    })
    expect(BoundedJson.admit("é", profile, { maxBytes: 4 })).toEqual({ ok: true, value: "é" })
    failure(BoundedJson.admit("é", profile, { maxBytes: 3 }))
    expect(BoundedJson.parse(JSON.stringify("é"), "json", profile, { maxBytes: 4 })).toEqual({ ok: true, value: "é" })
    failure(BoundedJson.parse(JSON.stringify("é"), "json", profile, { maxBytes: 3 }))
  })
})

test("PRF02 trusted depth profiles remain lower-only and unknown profiles fail closed", () => {
  ;(["workspace", "package"] as const).forEach((profile) => {
    const depth = profile === "workspace" ? 16 : 17
    const value = Array.from({ length: depth }).reduce<unknown>((value) => [value], 0)
    expect(BoundedJson.admit(value, profile).ok).toBe(true)
    expect(BoundedJson.parse(JSON.stringify(value), "json", profile).ok).toBe(true)
    failure(BoundedJson.admit(value, profile, { maxDepth: depth - 1 }))
    failure(BoundedJson.parse(JSON.stringify(value), "json", profile, { maxDepth: depth - 1 }))
    ;[undefined, { maxDepth: 1000 }].forEach((limits) => {
      expect(BoundedJson.admit(value, profile, limits).ok).toBe(true)
      expect(BoundedJson.parse(JSON.stringify(value), "json", profile, limits).ok).toBe(true)
      failure(BoundedJson.admit([value], profile, limits))
      failure(BoundedJson.parse(JSON.stringify([value]), "json", profile, limits))
    })
  })
  // Deliberately bypass the static union to qualify the runtime guard at this private boundary.
  failure(BoundedJson.admit({}, "unknown" as never))
  failure(BoundedJson.parse("{}", "json", "unknown" as never))
})
