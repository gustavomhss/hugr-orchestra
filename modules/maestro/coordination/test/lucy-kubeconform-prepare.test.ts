import { expect, test } from "bun:test"
import { appendFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Effect, Fiber } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run } from "./fixture/lucy-engagement"
import { begin, capture, decoded, digest, native, ownerRequest, present, roots, rule, scoped, sources, trace, verified, version } from "./fixture/lucy-kubeconform-prepare"

test(native ? "kubeconform preparation requires a real explicit once even under exact allows; rejection writes no cache"
  : "kubeconform preparation actively refuses this host before permission or cache writes", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const f = roots(root)
    yield* rule(host, "allow")
    const observed = trace()
    const pending = yield* begin(host, f, { tools: ["kubeconform", "kubeconform"] }).pipe(Effect.withTracer(observed.tracer))
    if (!native) {
      expect(pending.first.kind).toBe("settled")
      if (pending.first.kind !== "settled") throw new Error("P1 unsupported host requested permission")
      expect(decoded(pending.first.result)).toEqual({ status: "not-run", reason: "read-sandbox-unsupported-host", tools: [] })
      expect(pending.requests).toEqual([])
    } else {
      const request = ownerRequest(pending, host, ["kubeconform"])
      expect(yield* present(f.tools)).toBe(false)
      expect(yield* present(f.runtime)).toBe(false)
      expect(observed.outcomes).toEqual([])
      yield* host.permissions.reply({ requestID: request.id, reply: "reject" })
      expect((yield* Fiber.join(pending.running)).type).toBe("error")
    }
    expect(yield* host.permissions.list()).toEqual([])
    expect(yield* present(f.tools)).toBe(false)
    expect(yield* present(f.runtime)).toBe(false)
    expect(observed.outcomes).toEqual([])
    expect(root.requests).toEqual([])
  }))))
}, 60_000)

test("public preparation keeps the Maestro gate, deny policy and existing two-tool input bound", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const f = roots(root)
    // The old supported member reaches the real seat gate even on the unchanged baseline.
    const backend = yield* scoped(host.call("maestro_prepare_review_checks", { tools: ["shfmt"] }, "backend"), f)
    expect(backend.type).toBe("error")
    expect(backend.text).toContain("requires Maestro")
    for (const input of [{ tools: [] }, { tools: ["shfmt", "cargo-machete", "kubeconform"] }, { tools: ["owner-command"] }]) {
      const invalid = yield* scoped(host.call("maestro_prepare_review_checks", input), f)
      expect(invalid.type).toBe("error")
      expect(invalid.text).toContain("Invalid tool input")
    }
    yield* rule(host, "deny")
    const denied = yield* scoped(host.call("maestro_prepare_review_checks", { tools: ["kubeconform"] }), f)
    if (native) {
      expect(denied.type).toBe("error")
      expect(denied.text).not.toContain("Invalid tool input")
    } else expect(decoded(denied)).toEqual({ status: "not-run", reason: "read-sandbox-unsupported-host", tools: [] })
    expect(yield* host.permissions.list()).toEqual([])
    expect(yield* present(f.tools)).toBe(false)
    expect(yield* present(f.runtime)).toBe(false)
    expect(root.requests).toEqual([])
  }))))
}, 60_000)

test(native ? "real public kubeconform preparation uses a fresh private payload while preserving an old global install"
  : "repeated preparation stays an explicit unsupported-host result without native success", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const f = roots(root)
    if (!native) {
      for (let attempt = 0; attempt < 2; attempt++) expect(decoded(yield* scoped(host.call("maestro_prepare_review_checks", { tools: ["kubeconform"] }), f)))
        .toEqual({ status: "not-run", reason: "read-sandbox-unsupported-host", tools: [] })
      expect(yield* present(f.tools)).toBe(false)
      expect(yield* present(f.runtime)).toBe(false)
      expect(yield* host.permissions.list()).toEqual([])
      return
    }
    const expected = yield* sources
    const pin = (yield* BackendToolkit.Manifest).kubeconform
    if (!pin || "runtime" in pin) throw new Error("P1 existing native manifest unavailable")
    const legacy = { ...pin, notices: undefined }
    const installed = yield* BackendToolkit.ensure("kubeconform").pipe(
      Effect.provideService(BackendToolkit.Root, f.global), Effect.provideService(BackendToolkit.Manifest, { kubeconform: legacy }),
    )
    const linux = expected.targets.find((entry) => entry.target === "linux-x64")
    if (!linux) throw new Error("P1 independent Linux identity absent")
    expect(digest(yield* Effect.promise(() => readFile(installed.executable)))).toBe(linux.executable.sha256)
    expect(yield* present(path.join(path.dirname(installed.executable), ".complete"))).toBe(true)
    expect(yield* present(path.join(path.dirname(installed.executable), "notices"))).toBe(false)
    const old = yield* Effect.promise(() => capture(f.global))
    const observed = trace()
    const first = yield* begin(host, f, { tools: ["kubeconform", "kubeconform"] }).pipe(Effect.withTracer(observed.tracer))
    const permission = ownerRequest(first, host, ["kubeconform"])
    yield* host.permissions.reply({ requestID: permission.id, reply: "once" })
    const result = decoded(yield* Fiber.join(first.running))
    expect(result.tools).toHaveLength(1)
    const identity = yield* verified(result, f)
    version(observed)
    expect(observed.outcomes).toHaveLength(1)
    expect(yield* Effect.promise(() => capture(f.global))).toEqual(old)
    const cached = yield* Effect.promise(() => capture(f.tools))
    const repeated = yield* begin(host, f, { tools: ["kubeconform"] }).pipe(Effect.withTracer(observed.tracer))
    const again = ownerRequest(repeated, host, ["kubeconform"])
    expect(String(again.id)).not.toBe(String(permission.id))
    yield* host.permissions.reply({ requestID: again.id, reply: "once" })
    const second = decoded(yield* Fiber.join(repeated.running))
    expect(yield* verified(second, f)).toEqual(identity)
    version(observed, 2)
    expect(observed.outcomes).toHaveLength(2)
    expect(yield* Effect.promise(() => capture(f.tools))).toEqual(cached)
    expect(yield* Effect.promise(() => capture(f.global))).toEqual(old)
    expect(yield* host.permissions.list()).toEqual([])
    expect(root.requests).toEqual([])
  }))))
}, 600_000)

test(native ? "one actual owner request prepares shfmt and kubeconform in first-occurrence order"
  : "mixed preparation refuses this host before acquiring either tool", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const f = roots(root)
    const observed = trace()
    const pending = yield* begin(host, f, { tools: ["shfmt", "kubeconform"] }).pipe(Effect.withTracer(observed.tracer))
    if (!native) {
      expect(pending.first.kind).toBe("settled")
      if (pending.first.kind !== "settled") throw new Error("P1 unsupported host requested permission")
      expect(decoded(pending.first.result)).toEqual({ status: "not-run", reason: "read-sandbox-unsupported-host", tools: [] })
      expect(pending.requests).toEqual([])
      expect(yield* present(f.tools)).toBe(false)
      expect(yield* present(f.runtime)).toBe(false)
      return
    }
    const request = ownerRequest(pending, host, ["shfmt", "kubeconform"])
    yield* host.permissions.reply({ requestID: request.id, reply: "once" })
    const result = decoded(yield* Fiber.join(pending.running))
    yield* verified(result, f)
    expect(result.tools.map((entry) => ({ tool: entry.tool, ok: entry.ok }))).toEqual([{ tool: "shfmt", ok: true }, { tool: "kubeconform", ok: true }])
    version(observed)
    expect(observed.outcomes).toHaveLength(2)
    expect(observed.outcomes[0].stdout.data.toString("utf8")).not.toBe("v0.8.0\n")
    expect(observed.outcomes[1].stdout.data.toString("utf8")).toBe("v0.8.0\n")
    expect(root.requests).toEqual([])
  }))))
}, 600_000)

test(native ? "a missing real sandbox dependency refuses after owner approval before kubeconform acquisition"
  : "missing-dependency preparation still refuses the unsupported host first", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const f = roots(root)
    const missing = path.join(root.global.cache, "absent-p1-system-dependency")
    const pending = yield* begin(host, f, { tools: ["kubeconform"] }, [missing])
    if (!native) {
      expect(pending.first.kind).toBe("settled")
      if (pending.first.kind !== "settled") throw new Error("P1 unsupported host requested permission")
      expect(decoded(pending.first.result)).toEqual({ status: "not-run", reason: "read-sandbox-unsupported-host", tools: [] })
    } else {
      const request = ownerRequest(pending, host, ["kubeconform"])
      yield* host.permissions.reply({ requestID: request.id, reply: "once" })
      expect(decoded(yield* Fiber.join(pending.running))).toEqual({ status: "not-run", reason: `sandbox-dependency-missing: ${missing}`, tools: [] })
    }
    expect(yield* present(f.tools)).toBe(false)
    expect(yield* present(f.runtime)).toBe(false)
    expect(yield* host.permissions.list()).toEqual([])
    expect(root.requests).toEqual([])
  }))))
}, 60_000)

test(native ? "real executable mutation after the native version return cannot publish a successful preparation"
  : "unsupported-host preparation performs no version probe to mutate", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const f = roots(root)
    const changed: string[] = []
    const observed = trace(() => {
      const files = [...new Bun.Glob("**/engines/kubeconform/0.8.0-linux-x64/kubeconform").scanSync({ cwd: f.tools, onlyFiles: true, followSymlinks: false, dot: true })]
      expect(files).toHaveLength(1)
      const filename = path.join(f.tools, files[0])
      appendFileSync(filename, "P1-POST-PROBE-CHANGE")
      changed.push(filename)
    })
    const pending = yield* begin(host, f, { tools: ["kubeconform"] }).pipe(Effect.withTracer(observed.tracer))
    if (!native) {
      expect(pending.first.kind).toBe("settled")
      if (pending.first.kind !== "settled") throw new Error("P1 unsupported host requested permission")
      expect(decoded(pending.first.result)).toEqual({ status: "not-run", reason: "read-sandbox-unsupported-host", tools: [] })
      expect(changed).toEqual([])
      expect(observed.outcomes).toEqual([])
      return
    }
    const request = ownerRequest(pending, host, ["kubeconform"])
    yield* host.permissions.reply({ requestID: request.id, reply: "once" })
    const result = decoded(yield* Fiber.join(pending.running))
    version(observed)
    expect(changed).toHaveLength(1)
    expect((yield* Effect.promise(() => readFile(changed[0]))).subarray(-20).toString("utf8")).toBe("P1-POST-PROBE-CHANGE")
    expect(result).toEqual({ status: "not-run", tools: [{ tool: "kubeconform", ok: false, reason: "host-binary-mismatch" }] })
    expect(root.requests).toEqual([])
  }))))
}, 600_000)
