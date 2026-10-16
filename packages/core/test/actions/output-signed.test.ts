import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { X509Certificate } from "node:crypto"
import { Deferred, Effect, Exit, Fiber, Schema, Stream } from "effect"
import { Actions } from "@orchestra/schema/actions"
import { ExitCode } from "effect/unstable/process/ChildProcessSpawner"
import { AppProcess } from "../../src/process"
import { LayerNode } from "../../src/effect/layer-node"
import { OutputNetwork } from "./output-network"
import { OutputFixture } from "./output-fixture"
import { expectSpawn } from "../fixture/omni-expect"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const Result = Schema.fromJsonString(Schema.Struct({ bytes: Schema.Array(Schema.Number),
  info: Schema.optionalKey(Actions.TransferInfo), error: Schema.optionalKey(Actions.ErrorData) }))

it.live("Node GL authenticated redirect: real qualified credential capture, fresh info/read GETs, zero signed-hop auth and exact raw bytes", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* OutputNetwork.make()
  fixture.state.mode = "redirect"
  const result = yield* fixture.proc.run(fixture.command("info-read"), { timeout: "30 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 })
    .pipe(Effect.flatMap(AppProcess.requireSuccess))
  const value = Schema.decodeUnknownSync(Result)(result.stdout.toString().trim())
  expect(value.error).toBeUndefined()
  expect(value.bytes).toEqual(Array.from(OutputFixture.bytes))
  expect(value.info).toEqual({ filename: "result.bin", contentType: "application/octet-stream", size: 17, digest: "sha-256=synthetic-digest" })
  expect(fixture.state.nativeGets).toBe(2)
  expect(fixture.state.signedGets).toBe(4)
  fixture.observed.filter((request) => !request.signed).forEach((request) => {
    expect(request.headers["private-token"]).toBe("synthetic-native-token")
    expect(request.clientCertificate).toBe(true)
  })
  fixture.observed.filter((request) => request.signed).forEach((request) => {
    expect(request.headers.authorization).toBeUndefined()
    expect(request.headers["private-token"]).toBeUndefined()
    expect(request.headers["job-token"]).toBeUndefined()
    expect(request.headers.cookie).toBeUndefined()
    expect(request.clientCertificate).toBe(false)
  })
  expect(fixture.observed.every((request) => request.method === "GET")).toBe(true)
  expect(result.stdout.toString()).not.toContain("synthetic-native-token")
  expect(result.stdout.toString()).not.toContain("synthetic-url-secret")
}), 120_000)

it.live("Node signed expiry renews original native endpoint once; persistent denial and partial transfer never retry bytes", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* OutputNetwork.make()
  yield* Effect.forEach(["renew", "deny", "partial"], (mode) => Effect.gen(function* () {
    fixture.state.mode = mode
    fixture.state.nativeGets = 0
    fixture.state.signedGets = 0
    const result = yield* fixture.proc.run(fixture.command("read"), { timeout: "30 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 })
      .pipe(Effect.flatMap(AppProcess.requireSuccess))
    const value = Schema.decodeUnknownSync(Result)(result.stdout.toString().trim())
    expect(fixture.state.nativeGets).toBe(mode === "partial" ? 1 : 2)
    expect(fixture.state.signedGets).toBe(mode === "partial" ? 1 : 2)
    if (mode === "renew") {
      expect(value.bytes).toEqual(Array.from(OutputFixture.bytes))
      expect(value.error).toBeUndefined()
      return
    }
    expect(value.error?.kind).toBe(mode === "deny" ? "permission_denied" : "transfer_failed")
    expect(value.bytes).toEqual(mode === "deny" ? [] : Array.from(OutputFixture.bytes))
  }))
}), 120_000)

it.live("Node unsafe native/signed redirects, redirect loops and changed actor fail typed without endpoint fallback or secret diagnostics", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* OutputNetwork.make()
  yield* Effect.forEach(["unsafe-native", "unsafe-hop", "loop", "actor"], (mode) => Effect.gen(function* () {
    fixture.state.mode = mode
    fixture.state.actor = mode === "actor" ? "changed-user" : "fixture-user"
    fixture.state.nativeGets = 0
    fixture.state.signedGets = 0
    const result = yield* fixture.proc.run(fixture.command("read"), { timeout: "30 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 })
      .pipe(Effect.flatMap(AppProcess.requireSuccess))
    const value = Schema.decodeUnknownSync(Result)(result.stdout.toString().trim())
    expect(value.bytes).toEqual([])
    expect(value.error?.kind).toBe(mode === "actor" ? "binding_stale" : mode === "loop" ? "transfer_failed" : "host_mismatch")
    expect(fixture.state.nativeGets).toBe(mode === "actor" ? 0 : 1)
    expect(fixture.state.signedGets).toBe(mode === "actor" || mode === "unsafe-native" ? 0 : mode === "loop" ? 3 : 1)
    expect(result.stdout.toString()).not.toContain("synthetic-url-secret")
    expect(result.stdout.toString()).not.toContain("synthetic-native-token")
  }))
}), 120_000)

it.live("Node cancellation and direct watchdog close signed socket while sidecar lives and consumer blocks", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* OutputNetwork.make()
  fixture.state.mode = "blocked"
  yield* Effect.forEach(["cancel", "deadline"], (mode) => Effect.scoped(Effect.gen(function* () {
    const marker = yield* Deferred.make<void>()
    const closed = yield* Deferred.make<void>()
    fixture.state.onClose = () => Deferred.doneUnsafe(closed, Exit.succeed(undefined))
    const handle = yield* fixture.proc.spawn(fixture.command(mode))
    const seen = { text: "" }
    const out = yield* handle.stdout.pipe(Stream.runForEach((chunk) => Effect.sync(() => {
      seen.text += Buffer.from(chunk).toString()
      if (seen.text.includes("ownership-released")) Deferred.doneUnsafe(marker, Exit.succeed(undefined))
    })), Effect.forkChild)
    const err = yield* AppProcess.collectStream(handle.stderr, 32 * 1024).pipe(Effect.forkChild)
    yield* Deferred.await(marker).pipe(Effect.timeout("20 seconds"))
    // Independent socket oracle BEFORE allowing sidecar to exit.
    yield* Deferred.await(closed).pipe(Effect.timeout("5 seconds"))
    expect(yield* handle.isRunning).toBe(true)
    yield* Stream.make(new TextEncoder().encode("oracle-observed\n")).pipe(Stream.run(handle.stdin))
    expect(yield* handle.exitCode).toBe(ExitCode(0))
    yield* Fiber.join(out)
    expect(seen.text).toContain('"interrupted":true')
    expect((yield* Fiber.join(err)).truncated).toBe(false)
  })))
}), 120_000)

it.live("Node signed getter verifies TLS independently; native CA material does not become signed-host trust", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* OutputNetwork.make()
  const control = yield* fixture.proc.run(fixture.command("read"), { timeout: "30 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 })
    .pipe(Effect.flatMap(AppProcess.requireSuccess))
  expect(Schema.decodeUnknownSync(Result)(control.stdout.toString().trim()).bytes).toEqual(Array.from(OutputFixture.bytes))
  expect(fixture.state.nativeGets).toBe(1)
  expect(fixture.state.signedGets).toBe(1)
  const original = yield* fixture.peerCertificate(fixture.signed.origin, "signed-cert.pem", "localhost")
  expect(original).toBe(new X509Certificate(fixture.tls.signed.cert).fingerprint256)
  // Serve the exact native-only CA identity, not an unrelated untrusted cert:
  // copying CLI ca_cert into the signed getter would succeed and fail this test.
  const listener = yield* fixture.signedWithCertificate(fixture.tls.native)
  expect(listener.origin).not.toBe(fixture.signed.origin)
  const fingerprint = yield* fixture.peerCertificate(listener.origin, "native-cert.pem", "localhost")
  expect(fingerprint).toBe(new X509Certificate(fixture.tls.native.cert).fingerprint256)
  expect(fingerprint).not.toBe(original)
  fixture.state.nativeGets = 0
  fixture.state.signedGets = 0
  const result = yield* fixture.proc.run(fixture.command("read"), { timeout: "30 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 })
    .pipe(Effect.flatMap(AppProcess.requireSuccess))
  const value = Schema.decodeUnknownSync(Result)(result.stdout.toString().trim())
  expect(value.error?.kind).toBe("transfer_failed")
  expect(value.bytes).toEqual([])
  expect(fixture.state.nativeGets).toBe(1)
  expect(fixture.state.signedGets).toBe(0)
}), 120_000)

it.live("Node signed getter rejects a trusted chain with the wrong hostname before HTTP or renewal", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* OutputNetwork.make()
  const control = yield* fixture.proc.run(fixture.command("read"), { timeout: "30 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 })
    .pipe(Effect.flatMap(AppProcess.requireSuccess))
  expect(Schema.decodeUnknownSync(Result)(control.stdout.toString().trim()).bytes).toEqual(Array.from(OutputFixture.bytes))
  const original = yield* fixture.peerCertificate(fixture.signed.origin, "signed-cert.pem", "localhost")
  expect(original).toBe(new X509Certificate(fixture.tls.signed.cert).fingerprint256)
  yield* Effect.promise(() => fs.writeFile(path.join(fixture.root, "wrong-host.cnf"), [
    "[certificate]", "subjectAltName=DNS:wrong.invalid", "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment", "extendedKeyUsage=serverAuth", "",
  ].join("\n")))
  yield* fixture.run(fixture.openssl, ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", "wrong-host-key.pem", "-out", "wrong-host.csr",
    "-subj", "/CN=wrong.invalid", "-config", "tls.cnf"])
  yield* fixture.run(fixture.openssl, ["x509", "-req", "-in", "wrong-host.csr", "-CA", "signed-cert.pem", "-CAkey", "signed-key.pem",
    "-set_serial", "2", "-out", "wrong-host-cert.pem", "-days", "1", "-extfile", "wrong-host.cnf", "-extensions", "certificate"])
  // Independent chain oracle isolates hostname failure from an untrusted issuer.
  const chain = yield* fixture.run(fixture.openssl, ["verify", "-CAfile", "signed-cert.pem", "wrong-host-cert.pem"])
  expect(chain.stdout.toString()).toContain("wrong-host-cert.pem: OK")
  const material = { key: yield* Effect.promise(() => fs.readFile(path.join(fixture.root, "wrong-host-key.pem"))),
    cert: yield* Effect.promise(() => fs.readFile(path.join(fixture.root, "wrong-host-cert.pem"))) }
  const listener = yield* fixture.signedWithCertificate(material)
  expect(listener.origin).not.toBe(fixture.signed.origin)
  const fingerprint = yield* fixture.peerCertificate(listener.origin, "signed-cert.pem", "wrong.invalid")
  expect(fingerprint).toBe(new X509Certificate(material.cert).fingerprint256)
  expect(fingerprint).not.toBe(original)
  fixture.state.nativeGets = 0
  fixture.state.signedGets = 0
  const result = yield* fixture.proc.run(fixture.command("read"), { timeout: "30 seconds", maxOutputBytes: 32 * 1024, maxErrorBytes: 32 * 1024 })
    .pipe(Effect.flatMap(AppProcess.requireSuccess))
  const value = Schema.decodeUnknownSync(Result)(result.stdout.toString().trim())
  expect(value.error?.kind).toBe("transfer_failed")
  expect(value.bytes).toEqual([])
  expect(fixture.state.nativeGets).toBe(1)
  expect(fixture.state.signedGets).toBe(0)
  expect(result.stdout.toString()).not.toContain("synthetic-native-token")
  expect(result.stdout.toString()).not.toContain("synthetic-url-secret")
}), 120_000)
