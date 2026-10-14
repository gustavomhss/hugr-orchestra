// Node sidecar: trusted test CA is set before process start, never injected into
// production signed getter. CLI config actor capture and HTTPS are real implementations.
import fs from "node:fs/promises"
import path from "node:path"
import { X509Certificate } from "node:crypto"
import { checkServerIdentity, connect, getCACertificates } from "node:tls"
import { NodeChildProcessSpawner, NodeFileSystem, NodePath } from "@effect/platform-node"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { ActionsOutput } from "../../src/actions/output"
import { ActionsGitlab } from "../../src/actions/transport/gitlab"
import { OutputFixture } from "./output-fixture"

const origin = new URL(process.argv[2])
const mode = process.argv[3]
// Fail with a fixture-specific error if startup trust or its scoped file lifetime
// broke, before a redacted production transfer error could hide that distinction.
const extra = getCACertificates("extra").map((cert) => new X509Certificate(cert).fingerprint256)
if (!extra.includes(new X509Certificate(await fs.readFile(path.join(process.cwd(), "signed-cert.pem"))).fingerprint256) ||
    extra.includes(new X509Certificate(await fs.readFile(path.join(process.cwd(), "native-cert.pem"))).fingerprint256))
  throw new Error("Output fixture startup trust must include only the signed test CA, never the native CLI CA")
const binding = { ...OutputFixture.gitlab, account: "fixture-user", directory: process.cwd(),
  provider: { kind: "gitlab", hostname: origin.host, apiOrigin: origin.origin } as const }
const spawnerLayer = Layer.provide(NodeChildProcessSpawner.layer, Layer.merge(NodeFileSystem.layer, NodePath.layer))
const transfer = { kind: "artifact", id: "8", runID: "287" } as const

const program = Effect.scoped(Effect.gen(function* () {
  if (mode === "peer-certificate") {
    const peer = new URL(process.argv[4])
    const ca = yield* Effect.promise(() => fs.readFile(path.join(process.cwd(), process.argv[5])))
    const fingerprint = yield* Effect.acquireUseRelease(
      Effect.try({ try: () => connect({ host: peer.hostname, port: Number(peer.port), servername: process.argv[6],
        ca, rejectUnauthorized: true, minVersion: "TLSv1.2", checkServerIdentity }),
        catch: () => new Error("Output fixture certificate oracle could not open TLS socket") }),
      (socket) => Effect.callback<string, Error>((resume) => {
        const ready = () => {
          const certificate = socket.getPeerX509Certificate()
          if (!socket.authorized || !certificate) { resume(Effect.fail(new Error("Output fixture peer certificate oracle requires a verified TLS peer"))); return }
          resume(Effect.succeed(certificate.fingerprint256))
        }
        const fail = (error: Error) => resume(Effect.fail(error))
        socket.once("secureConnect", ready)
        socket.once("error", fail)
        return Effect.sync(() => { socket.off("secureConnect", ready); socket.off("error", fail) })
      }),
      (socket) => Effect.sync(() => { socket.destroy() }),
    ).pipe(Effect.timeout("5 seconds"))
    console.log(JSON.stringify({ fingerprint }))
    return
  }
  const spawner = yield* ChildProcessSpawner
  const transport = ActionsGitlab.make(process.cwd(), { ...spawner,
    run: () => Effect.die("Fixture only uses real scoped spawn"), runStream: () => Stream.die("Fixture only uses real scoped spawn") })
  const service = ActionsOutput.make({ transport, reader: OutputFixture.reader(binding) })
  if (mode === "cancel" || mode === "deadline") {
    return yield* Effect.gen(function* () {
      const first = yield* Deferred.make<void>()
      const fiber = yield* service.read(binding, transfer).pipe(Stream.runForEach(() =>
        Deferred.succeed(first, undefined).pipe(Effect.andThen(Effect.never))), Effect.forkChild)
      yield* Deferred.await(first)
      if (mode === "cancel") yield* Fiber.interrupt(fiber)
      if (mode === "deadline") yield* TestClock.adjust("5 minutes")
      console.log("ownership-released")
      // Remain alive with blocked consumer until parent observes socket closure.
      yield* Effect.callback<void>((resume) => {
        const accept = () => { process.stdin.pause(); resume(Effect.void) }
        process.stdin.once("data", accept)
        return Effect.sync(() => { process.stdin.off("data", accept); process.stdin.pause() })
      })
      yield* Fiber.interrupt(fiber)
      console.log(JSON.stringify({ interrupted: Exit.isFailure(yield* Fiber.await(fiber)) }))
    }).pipe(Effect.provide(TestClock.layer()))
  }
  const info = mode === "info-read" ? yield* service.info(binding, transfer) : undefined
  const chunks: Uint8Array[] = []
  const result = yield* service.read(binding, transfer).pipe(Stream.runForEach((chunk) => Effect.sync(() => chunks.push(chunk))), Effect.result)
  console.log(JSON.stringify({ ...(info ? { info } : {}), bytes: Array.from(Buffer.concat(chunks)),
    ...(result._tag === "Failure" ? { error: result.failure } : {}) }))
}))

await Effect.runPromise(program.pipe(Effect.provide(spawnerLayer)))
