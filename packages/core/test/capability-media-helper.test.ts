import { describe, expect } from "bun:test"
import { Buffer } from "node:buffer"
import { base64, dataURL, defaults, image, json, jsonBody, multipart, outbound, readBody, request } from "@orchestra/core/capability/media/http"
import { validateVideo, VideoInput } from "@orchestra/core/capability/media/schema"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { it } from "./lib/effect"

function code<A>(effect: Effect.Effect<A, Capability.Failure>, expected: Capability.ErrorCode, message?: string) {
  return Effect.gen(function* () {
    const error = yield* effect.pipe(Effect.flip)
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe(expected)
    if (message) expect(error.message).toBe(message)
  })
}

function fixture() {
  return Effect.gen(function* () {
    const captured: { path: string; body: string }[] = []
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname
        captured.push({ path, body: await req.text() })
        if (path === "/redirect") return Response.redirect(new URL("/ok", req.url).href, 302)
        if (path === "/utf8") return new Response(new Uint8Array([...Buffer.from('{"text":"'), 255, ...Buffer.from('"}')]))
        if (path === "/large") return new Response(new Uint8Array(32))
        return Response.json({ text: "valid ✓" })
      },
    })), (server) => Effect.sync(() => server.stop(true)))
    return { server, origin: `http://127.0.0.1:${server.port}`, captured }
  })
}

function pixels() {
  return Effect.gen(function* () {
    const { PhotonImage } = yield* Effect.promise(() => import("@silvia-odwyer/photon-node"))
    return yield* Effect.acquireUseRelease(Effect.sync(() => new PhotonImage(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1)),
      (value) => Effect.sync(() => ({ png: value.get_bytes(), jpeg: value.get_bytes_jpeg(90) })), (value) => Effect.sync(() => value.free()))
  })
}

describe("media helper bounds and exception semantics", () => {
  it.live("base64 exact decoded length honors zero/one/two padding before allocation and keeps canonical encoding", () => Effect.gen(function* () {
    yield* Effect.forEach(["AA==", "AAE=", "AAEC", "AAECAw==", "AAECAwQ=", "AAECAwQF"], (value) => Effect.gen(function* () {
      const bytes = Buffer.from(value, "base64")
      const decoded = yield* base64(value, bytes.length)
      expect(Buffer.from(decoded)).toEqual(bytes)
      yield* code(base64(value, bytes.length - 1), "quota_exceeded")
    }))
    yield* Effect.forEach(["", "A", "AA", "A===", "====", "=AAA", "AA=A", "AA==\n", "AAA\n", "AAA\r", "AAA\u2028", "AAA\u2029", "AA-_", "AAB=", "AB=="],
      (value) => code(base64(value, 16), "acquisition_failed", "Media base64 decoding failed"))
  }))

  it.live("PNG/JPEG decoder validates bytes; byte/pixel/dimension budgets retain quota_exceeded", () => Effect.gen(function* () {
    const data = yield* pixels()
    expect(yield* image(data.png, "image/png", defaults)).toEqual({ width: 2, height: 1 })
    expect(yield* image(data.jpeg, "image/jpeg", defaults)).toEqual({ width: 2, height: 1 })
    yield* code(image(data.png, "image/png", { ...defaults, downloadBytes: data.png.length - 1 }), "quota_exceeded")
    yield* code(image(data.png, "image/png", { ...defaults, pixels: 1 }), "quota_exceeded")
    const wide = new Uint8Array(data.png)
    new DataView(wide.buffer).setUint32(16, 4097)
    yield* code(image(wide, "image/png", defaults), "quota_exceeded")
    const malformed = new Uint8Array(data.png)
    malformed.fill(0, 33, malformed.length - 12)
    yield* code(image(malformed, "image/png", defaults), "acquisition_failed", "Media image decoding failed")
    yield* code(image(new Uint8Array([255, 216, 255, 217]), "image/jpeg", defaults), "acquisition_failed", "Media image decoding failed")
  }))

  it.live("corrupt UTF-8 JSON is outcome_unknown rather than replacement-character success", () => Effect.gen(function* () {
    const f = yield* fixture()
    const output = Schema.Struct({ text: Schema.String })
    const valid = yield* request(`${f.origin}/ok`, {}, 1024, 2000).pipe(Effect.flatMap((bytes) => json(bytes, output)))
    expect(valid).toEqual({ text: "valid ✓" })
    yield* code(request(`${f.origin}/utf8`, {}, 1024, 2000).pipe(Effect.flatMap((bytes) => json(bytes, output))),
      "outcome_unknown", "Media utf8 decoding failed")
    yield* code(json(Buffer.from("{"), output), "outcome_unknown", "Media json decoding failed")
    yield* code(json(Buffer.from('{"text":1}'), output), "outcome_unknown", "Media json decoding failed")
  }))

  it.live("real HTTP quota/redirect/connection failures are typed and outbound byte caps prevent I/O", () => Effect.gen(function* () {
    const f = yield* fixture()
    const body = "A😀"
    yield* request(`${f.origin}/ok`, { method: "POST", body }, 1024, 2000, Buffer.byteLength(body))
    expect(f.captured[0].body).toBe(body)
    yield* code(request(`${f.origin}/ok`, { method: "POST", body }, 1024, 2000, Buffer.byteLength(body) - 1), "quota_exceeded")
    expect(f.captured).toHaveLength(1)
    yield* code(request(`${f.origin}/large`, {}, 31, 2000), "quota_exceeded")
    yield* code(request(`${f.origin}/redirect`, {}, 1024, 2000), "acquisition_failed")
    expect(f.captured.filter((entry) => entry.path === "/ok")).toHaveLength(1)
    f.server.stop(true)
    yield* code(request(`${f.origin}/ok`, {}, 1024, 2000), "acquisition_failed")
  }))

  it.live("JSON/base64 outbound builders enforce actual escaped/UTF-8/padded sizes before materialization", () => Effect.gen(function* () {
    const value = { text: '✓😀\n\u0001"\\\ud800', count: 1, values: [null, true, false, 1e-7] }
    const expected = JSON.stringify(value)
    const bytes = Buffer.byteLength(expected)
    expect(yield* jsonBody(value, bytes)).toBe(expected)
    yield* code(jsonBody(value, bytes - 1), "quota_exceeded")
    yield* Effect.forEach([new Uint8Array([1]), new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])], (data) => Effect.gen(function* () {
      const expected = `data:image/png;base64,${Buffer.from(data).toString("base64")}`
      expect(yield* dataURL(data, "image/png", expected.length)).toBe(expected)
      yield* code(dataURL(data, "image/png", expected.length - 1), "quota_exceeded")
    }))
    const f = yield* fixture()
    const body = yield* jsonBody(value, bytes)
    yield* request(`${f.origin}/ok`, { method: "POST", body }, 1024, 2000, bytes)
    expect(f.captured[0].body).toBe(expected)
    const form = new FormData()
    form.append("image[]", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "input.png")
    form.append("prompt", "✓")
    const upper = yield* outbound(form)
    const encoded = yield* Effect.promise(() => new Response(form).arrayBuffer())
    expect(encoded.byteLength).toBeLessThanOrEqual(upper)
    yield* code(outbound(form, upper - 1), "quota_exceeded")
  }))

  it.live("unexpected programming/allocation exceptions remain Effect defects, including ambiguous WASM traps", () => Effect.gen(function* () {
    const data = yield* pixels()
    const sentinel = new RangeError("fixture allocation defect")
    const damaged = new Uint8Array(data.png)
    Object.defineProperty(damaged, "byteLength", { get() { throw sentinel } })
    const imageExit = yield* image(damaged, "image/png", defaults).pipe(Effect.exit)
    expect(Exit.isFailure(imageExit)).toBe(true)
    if (Exit.isFailure(imageExit)) {
      const die = Cause.findDie(imageExit.cause)
      expect(die._tag).toBe("Success")
      if (die._tag === "Success") expect(die.success.defect).toBe(sentinel)
    }
    const init: RequestInit = {}
    Object.defineProperty(init, "headers", { enumerable: true, get() { throw sentinel } })
    const f = yield* fixture()
    const httpExit = yield* request(`${f.origin}/ok`, init, 1024, 2000).pipe(Effect.exit)
    expect(Exit.isFailure(httpExit)).toBe(true)
    if (Exit.isFailure(httpExit)) {
      const die = Cause.findDie(httpExit.cause)
      expect(die._tag).toBe("Success")
      if (die._tag === "Success") expect(die.success.defect).toBe(sentinel)
    }
    expect(f.captured).toHaveLength(0)
    const payload = new Proxy({ text: "x" }, { getPrototypeOf() { throw sentinel } })
    const jsonExit = yield* jsonBody(payload).pipe(Effect.exit)
    expect(Exit.isFailure(jsonExit)).toBe(true)
    if (Exit.isFailure(jsonExit)) {
      const die = Cause.findDie(jsonExit.cause)
      expect(die._tag).toBe("Success")
      if (die._tag === "Success") expect(die.success.defect).toBe(sentinel)
    }
    const crc = new Uint8Array(data.png)
    crc[29] ^= 1
    const trap = yield* image(crc, "image/png", defaults).pipe(Effect.exit)
    expect(Exit.isFailure(trap)).toBe(true)
    if (Exit.isFailure(trap)) expect(Cause.hasDies(trap.cause)).toBe(true)
  }))

  it.live("Runway video edit follows executable two-ratio contract; image-to-video retains six advertised ratios", () => Effect.gen(function* () {
    const base: VideoInput = { provider: "runway", operation: "edit", model: "gen4_aleph", prompt: "Edit", purpose: "fixture",
      connection: { id: Capability.ConnectionID.create(), provider: "runway", generation: 0 },
      target: { id: Capability.TargetID.create(), connectionID: Capability.ConnectionID.create(), generation: 0, environment: "fixture" },
      options: { ratio: "1280:720", duration: 5 }, inputArtifactRefs: [{ id: Capability.ArtifactID.create(), revision: 0 }] }
    const input = { ...base, target: { ...base.target, connectionID: base.connection.id } }
    expect(validateVideo(input)).toBeUndefined()
    expect(validateVideo({ ...input, options: { ...input.options, ratio: "720:1280" } })).toBeUndefined()
    const ratios = ["960:960", "832:1104", "1104:832", "1584:672"] as const
    ratios.forEach((ratio) => {
      expect(Option.isNone(Schema.decodeUnknownOption(VideoInput)({ ...input, options: { ...input.options, ratio } }))).toBe(true)
      expect(validateVideo({ ...input, operation: "image-to-video", model: "gen4.5", options: { ...input.options, ratio } })).toBeUndefined()
      expect(Option.isSome(Schema.decodeUnknownOption(VideoInput)({ ...input, operation: "image-to-video", model: "gen4.5", options: { ...input.options, ratio } }))).toBe(true)
    })
  }))

  it.live("multipart counts lone LF/CR as CRLF before fetch and before materializing file copies", () => Effect.gen(function* () {
    const fields = { prompt: "\n".repeat(2000) + "\r".repeat(2000) + "\r\n".repeat(20) + "✓" }
    const files = [{ name: "image[]", filename: "input.png", mime: "image/png", data: new Uint8Array([1, 2, 3]) }]
    const form = yield* multipart(fields, files)
    const bound = yield* outbound(form)
    const encoded = yield* Effect.promise(() => new Response(form).arrayBuffer())
    const normalized = fields.prompt.replace(/\r\n|\r|\n/g, "\r\n")
    expect(new TextDecoder().decode(encoded).includes(normalized)).toBe(true)
    expect(encoded.byteLength).toBeLessThanOrEqual(bound)
    yield* code(multipart(fields, files, encoded.byteLength - 1), "quota_exceeded")
    const f = yield* fixture()
    yield* code(request(`${f.origin}/ok`, { method: "POST", body: form }, 1024, 2000, encoded.byteLength - 1), "quota_exceeded")
    expect(f.captured).toHaveLength(0)
    yield* request(`${f.origin}/ok`, { method: "POST", body: form }, 1024, 2000, bound)
    expect(f.captured).toHaveLength(1)
    expect(f.captured[0].body.includes(normalized)).toBe(true)
  }))

  it.live("reader lock releases when cancellation unexpectedly rejects; original defect survives", () => Effect.gen(function* () {
    const sentinel = new RangeError("fixture cancel defect")
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])) },
      cancel() { return Promise.reject(sentinel) } })
    const exit = yield* Effect.promise(() => readBody(body, 1)).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const die = Cause.findDie(exit.cause)
      expect(die._tag).toBe("Success")
      if (die._tag === "Success") expect(die.success.defect).toBe(sentinel)
    }
    expect(body.locked).toBe(false)
    const healthy = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.close() } })
    expect(yield* Effect.promise(() => readBody(healthy, 2))).toEqual(new Uint8Array([1, 2]))
    expect(healthy.locked).toBe(false)
  }))
})
