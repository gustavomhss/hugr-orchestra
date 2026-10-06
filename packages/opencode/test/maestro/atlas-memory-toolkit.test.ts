import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { access, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { BackendToolkit } from "@opencode-ai/core/backend-toolkit"
import { BackendToolkitManifest } from "@opencode-ai/core/backend-toolkit/manifest"
import { BackendToolkitTarget } from "@opencode-ai/core/backend-toolkit/target"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Git } from "@/git"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { testEffect } from "../lib/effect"

// F3-D9: AtlasMemory.open hands Atlas the backend toolkit's pinned gitleaks, so a supported install never refuses a
// write `scanner-unavailable` only because no scanner is on PATH. The engine is served by a local fixture.

const it = testEffect(Layer.empty)
const layer = LayerNode.compile(LayerNode.group([Git.node]))

// Answers --version, reports every scanned record clean and leaves a marker next to itself, so the test can tell
// that Atlas ran this binary and not a scanner found on PATH.
const SCANNER = '#!/bin/sh\n[ "$1" = "--version" ] && exit 0\n/bin/cat >/dev/null\necho scanned > "$0.scanned"\nexit 0\n'

const TASK = {
  taskId: "T-17",
  attempted: ["wrapped repository errors with the operation name"],
  failedWith: ["go vet: unused import in handler.go"],
  stoppedAt: "handler compiles; list endpoint not started",
  lesson: "run go vet before the handler tests",
}

const execution = { sessionID: "ses_toolkit", callID: "call_toolkit", assistantMessageID: "msg_toolkit" }

const toolkit = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "atlas-toolkit-")))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.serve({ port: 0, fetch: () => new Response(SCANNER) })),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const pin = {
    artifact: {
      url: `http://127.0.0.1:${server.port}/gitleaks`,
      integrity: `sha256-${createHash("sha256").update(SCANNER).digest("base64")}` as const,
      format: "raw" as const,
      entries: [{ from: "gitleaks", to: "gitleaks", executable: true }],
    },
    executable: "gitleaks",
  }
  const manifest = {
    ...BackendToolkitManifest.ENGINES,
    gitleaks: {
      ...BackendToolkitManifest.ENGINES.gitleaks,
      targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
    },
  }
  return { root, manifest }
})

it.instance(
  "open binds the toolkit's gitleaks as Atlas's scanner, and leaves Atlas to PATH when the toolkit cannot supply it",
  () =>
    Effect.gen(function* () {
      const detected = BackendToolkitTarget.detect()
      if (!("target" in detected)) throw new Error(`BLOCKED: test host has no toolkit target: ${detected.unsupported}`)
      const fixture = yield* toolkit
      const memory = yield* AtlasMemory.open(execution).pipe(
        Effect.provideService(BackendToolkit.Root, fixture.root),
        Effect.provideService(BackendToolkit.Manifest, fixture.manifest),
      )
      if ("unavailable" in memory) throw new Error(memory.unavailable)
      const command = path.join(
        fixture.root,
        "engines",
        "gitleaks",
        `${BackendToolkitManifest.ENGINES.gitleaks.version}-${detected.target}`,
        "gitleaks",
      )
      expect(memory.binding.scanner).toEqual({ name: "gitleaks", command })
      expect(memory.write(TASK)).toMatchObject({ ok: true })
      expect(yield* Effect.promise(() => access(`${command}.scanned`).then(() => true, () => false))).toBe(true)

      const fallback = yield* AtlasMemory.open(execution).pipe(
        Effect.provideService(BackendToolkit.Target, { unsupported: "test-host-unsupported" }),
      )
      if ("unavailable" in fallback) throw new Error(fallback.unavailable)
      expect(fallback.binding.scanner).toBeUndefined()
    }).pipe(Effect.provide(layer)),
  { git: true },
)
