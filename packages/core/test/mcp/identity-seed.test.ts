import path from "node:path"
import { randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import { expect } from "bun:test"
import { Effect, Layer, Redacted } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { AppProcess } from "@orchestra/core/process"
import { Tool } from "@orchestra/core/tool/tool"
import { expectSpawn } from "../fixture/omni-expect"
import { testEffect } from "../lib/effect"
import { graph, identity, leaf, workspace } from "./identity-fixture"

const it = testEffect(Layer.empty)
const authority = { kind: "provided" as const, name: "seed-fixture", key: "stable-authority" }

it.live("native-only service construction/registration does not acquire the MCP identity seed", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const h = yield* identity(f)
    const g = yield* graph(f, { documents: () => [], replacements: [[h.McpIdentity.node, h.layer]] })
    expect(yield* Effect.promise(() => Bun.file(f.seed).exists())).toBe(false)
    yield* g.tools.register({ native_sentinel: leaf("NATIVE") })
    yield* g.applications.register({ application_sentinel: leaf("APPLICATION") })
    yield* g.registry.materialize()
    expect(yield* Effect.promise(() => Bun.file(f.seed).exists())).toBe(false)
  }),
)

it.live(
  "first use seals an independent 32-byte seed; fresh instances and concurrent callers reuse it without rewrite",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const observed: Uint8Array[] = []
      const h = yield* identity(f, {
        digest: (_, seed) => {
          observed.push(Uint8Array.from(Redacted.value(seed)))
          return "A".repeat(43)
        },
      })
      yield* h.service.identify(authority, "probe")
      expect(observed).toHaveLength(1)
      expect(observed[0]).toHaveLength(32)
      const sealed = yield* Effect.promise(() => Bun.file(f.seed).text())
      expect(sealed).toContain("enc:v1:")
      expect(sealed).not.toContain(Buffer.from(observed[0]).toString("base64"))
      expect(sealed).not.toContain(Buffer.from(observed[0]).toString("hex"))
      const first = yield* identity(f)
      const second = yield* identity(f)
      const ids = yield* Effect.all(
        [first.service.identify(authority, "probe"), second.service.identify(authority, "probe")],
        { concurrency: "unbounded" },
      )
      expect(ids[0].id).toBe(ids[1].id)
      expect(yield* Effect.promise(() => Bun.file(f.seed).text())).toBe(sealed)
      expect(JSON.stringify(ids)).not.toContain(Buffer.from(observed[0]).toString("base64"))
    }),
)

it.live.skipIf(process.platform === "win32")("seed creation uses restrictive POSIX mode", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const h = yield* identity(f)
    yield* h.service.identify(authority, "probe")
    expect((yield* Effect.promise(() => fs.stat(f.seed))).mode & 0o777).toBe(0o600)
  }),
)

for (const value of ["", "garbage", "enc:v1:AA", "enc:v1:" + "A".repeat(9_000)]) {
  it.live(`existing ${value.length}-byte malformed seed is refused unchanged while native tools remain available`, () =>
    Effect.gen(function* () {
      const f = yield* workspace
      yield* Effect.promise(() => Bun.write(f.seed, value))
      const h = yield* identity(f)
      const result = yield* h.service.identify(authority, "probe").pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(h.McpIdentity.IdentityError)
        expect(JSON.stringify(result.failure)).not.toContain(f.seed)
      }
      expect(yield* Effect.promise(() => Bun.file(f.seed).text())).toBe(value)
      const g = yield* graph(f, { documents: () => [], replacements: [[h.McpIdentity.node, h.layer]] })
      yield* g.tools.register({ native_sentinel: leaf("NATIVE") })
      const failed = yield* g.tools.registerMcp(authority, "probe", () => leaf("UNPUBLISHED")).pipe(Effect.result)
      expect(failed._tag).toBe("Failure")
      if (failed._tag === "Failure") expect(failed.failure).toBeInstanceOf(Tool.RegistrationError)
      expect((yield* g.registry.materialize()).definitions.map((d) => d.name)).toEqual(["native_sentinel"])
      expect(yield* Effect.promise(() => Bun.file(f.seed).text())).toBe(value)
    }),
  )
}

it.live("an existing valid but tampered sealed record is not overwritten or replaced", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const h = yield* identity(f)
    yield* h.service.identify(authority, "probe")
    const raw = yield* Effect.promise(() => Bun.file(f.seed).text())
    const offset = raw.indexOf("enc:v1:") + "enc:v1:".length + 3
    expect(offset).toBeGreaterThan(8)
    const tampered = raw.slice(0, offset) + (raw[offset] === "A" ? "B" : "A") + raw.slice(offset + 1)
    yield* Effect.promise(() => Bun.write(f.seed, tampered))
    const fresh = yield* identity(f)
    const result = yield* fresh.service.identify(authority, "probe").pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    expect(yield* Effect.promise(() => Bun.file(f.seed).text())).toBe(tampered)
  }),
)

it.live("identity seed symlink and nonregular targets are refused without touching the target", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const target = path.join(f.directory, "target.key")
    yield* Effect.promise(() => Bun.write(target, "PRIVATE_TARGET_SENTINEL"))
    yield* Effect.promise(() => fs.symlink(target, f.seed, "file"))
    const h = yield* identity(f)
    expect((yield* h.service.identify(authority, "probe").pipe(Effect.result))._tag).toBe("Failure")
    expect(yield* Effect.promise(() => Bun.file(target).text())).toBe("PRIVATE_TARGET_SENTINEL")
    expect((yield* Effect.promise(() => fs.lstat(f.seed))).isSymbolicLink()).toBe(true)
    yield* Effect.promise(() => fs.unlink(f.seed))
    yield* Effect.promise(() => fs.mkdir(f.seed))
    const fresh = yield* identity(f)
    expect((yield* fresh.service.identify(authority, "probe").pipe(Effect.result))._tag).toBe("Failure")
    expect((yield* Effect.promise(() => fs.stat(f.seed))).isDirectory()).toBe(true)
  }),
)

it.live("losing only the identity seed creates a fresh action rather than reusing the CredentialCipher data key", () =>
  Effect.gen(function* () {
    const f = yield* workspace
    const first = yield* identity(f)
    const before = yield* first.service.identify(authority, "probe")
    yield* Effect.promise(() => fs.unlink(f.seed))
    const second = yield* identity(f)
    const after = yield* second.service.identify(authority, "probe")
    expect(after.id).not.toBe(before.id)
  }),
)

it.live(
  "simultaneous real processes converge on first sealed seed, and a fresh process preserves IDs despite unrelated inherited env",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      // Missing helper is API RED before spawn; after implementation all children use real helper/Cipher/flock.
      yield* identity(f)
      expect(yield* Effect.promise(() => Bun.file(f.seed).exists())).toBe(false)
      const app = yield* AppProcess.Service.pipe(Effect.provide(AppNodeBuilder.build(AppProcess.node)))
      const configured = {
        kind: "configured",
        source: path.join(f.directory, "local.json"),
        name: "same",
        directory: f.directory,
        server: { type: "local", command: ["fixture-command"], environment: { CONFIGURED: "stable" } },
      }
      const run = (variant: string, cipherFile?: string) =>
        app.run(
          ChildProcess.make(
            process.execPath,
            [
              path.join(import.meta.dir, "identity-process-fixture.ts"),
              f.directory,
              f.seed,
              JSON.stringify(configured),
            ],
            {
              cwd: path.resolve(import.meta.dir, "../.."),
              env: {
                ...process.env,
                H6_UNRELATED_INHERITED_VALUE: variant,
                ...(cipherFile ? { ORCHESTRA_CREDENTIAL_KEY_FILE: cipherFile } : {}),
              },
            },
          ),
          { timeout: "15 seconds" },
        )
      expectSpawn(import.meta.path)
      const first = yield* Effect.all([run("A"), run("B")], { concurrency: "unbounded" })
      for (const result of first) expect(result.exitCode).toBe(0)
      expect(JSON.parse(first[0].stdout.toString()).id).toBe(JSON.parse(first[1].stdout.toString()).id)
      const bytes = yield* Effect.promise(() => Bun.file(f.seed).text())
      const restarted = yield* run("C")
      expect(restarted.exitCode).toBe(0)
      expect(JSON.parse(restarted.stdout.toString()).id).toBe(JSON.parse(first[0].stdout.toString()).id)
      expect(yield* Effect.promise(() => Bun.file(f.seed).text())).toBe(bytes)
      const wrongKey = path.join(f.directory, "wrong-cipher.key")
      yield* Effect.promise(() =>
        fs.writeFile(wrongKey, randomBytes(32).toString("base64"), { flag: "wx", mode: 0o600 }),
      )
      const locked = yield* run("wrong-key", wrongKey)
      expect(locked.exitCode).toBe(1)
      expect(JSON.parse(locked.stdout.toString()).error.tag).toBe("McpIdentity.IdentityError")
      expect(JSON.parse(locked.stdout.toString()).error.message).not.toContain(f.directory)
      expect(yield* Effect.promise(() => Bun.file(f.seed).text())).toBe(bytes)
    }),
  30_000,
)
