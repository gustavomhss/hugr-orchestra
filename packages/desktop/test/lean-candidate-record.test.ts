import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { CandidateRecorder } from "./lean-candidate-record.fixture"

test("recorder removes synthetic owned passwords, bare Basic credentials and Authorization tokens from every sink", () => {
  const recorder = new CandidateRecorder()
  const password = "synthetic-owned-password-V1"
  const basic = Buffer.from(`orchestra:${password}`).toString("base64")
  const bearer = "synthetic.authorization.token-V2"
  recorder.protectBackend("orchestra", password)
  recorder.protectBackend("orchestra", "synthetic-relaunch-password-V3")
  recorder.protectPath("/private/var/synthetic-candidate", "owned-root")
  const raw = { text: `${password} ${basic} Authorization: Bearer ${bearer}\nhttp://orchestra:${password}@127.0.0.1:1234`,
    password, authorization: "custom-auth-token", nested: { access_token: "synthetic-nested-token", apiKey: "synthetic-key" },
    path: "/private/var/synthetic-candidate/public-profile-a", foreign: "/Users/synthetic-owner/.config/private.json",
    proxy: "http://synthetic-proxy-user:synthetic-proxy-password@127.0.0.1:4321/v1",
    config: { machinePolicy: "synthetic-private-config" }, tokens: { kind: "estimated", saved: 42 }, tokensSaved: 42, tokenCalls: 2 }
  // Positive controls are measured against each sink's actual unsanitized input.
  for (const sink of [
    { source: JSON.stringify(raw), output: recorder.serialize(raw), values: [password, basic, bearer, "custom-auth-token", "synthetic-nested-token", "synthetic-private-config", "synthetic-proxy-user", "synthetic-proxy-password"] },
    { source: raw.text, output: recorder.clean(raw.text), values: [password, basic, bearer] },
  ]) {
    for (const value of sink.values) { expect(sink.source).toContain(value); expect(sink.output).not.toContain(value) }
    expect(sink.output).toContain("[redacted]")
  }
  const published = JSON.parse(recorder.serialize(raw))
  expect(published.path).toBe("<owned-root>/public-profile-a")
  expect(published.foreign).toBe("<private-path>")
  expect(published.proxy).toBe("http://[redacted]@127.0.0.1:4321/v1")
  expect(published.config).toBe("[omitted]")
  expect(published.tokens).toEqual(raw.tokens)
  expect(published.tokensSaved).toBe(42)
  expect(published.tokenCalls).toBe(2)
  expect(recorder.clean("synthetic-relaunch-password-V3")).toBe("[redacted]")
})

test("recorder keeps original primary/cleanup objects and distinct identities while public errors are sanitized", () => {
  const recorder = new CandidateRecorder()
  const primary = new Error("Authorization: Bearer synthetic-primary-token")
  const cleanup = new Error("password=synthetic-cleanup-password")
  const group = new AggregateError([primary, cleanup], "Original nested aggregate", { cause: primary })
  recorder.fail("primary", "native command oracle", primary)
  recorder.fail("cleanup", "owned Electron close", cleanup)
  recorder.fail("primary", "nested runtime", group)
  recorder.fail("cleanup", "same original identity", primary)
  expect(recorder.failures[0]!.error).toBe(primary)
  expect(recorder.failures[1]!.error).toBe(cleanup)
  expect(recorder.failures[2]!.error).toBe(group)
  expect(group.errors).toEqual([primary, cleanup])
  expect(group.cause).toBe(primary)
  expect(primary.message).toBe("Authorization: Bearer synthetic-primary-token")
  expect(cleanup.message).toBe("password=synthetic-cleanup-password")
  expect(recorder.failures[0]!.id).not.toBe(recorder.failures[1]!.id)
  expect(recorder.failures[3]!.id).toBe(recorder.failures[0]!.id)
  const published = recorder.serialize(recorder.failures)
  expect(published).toContain('"phase": "primary"')
  expect(published).toContain('"phase": "cleanup"')
  expect(published).toContain("native command oracle")
  expect(published).toContain("owned Electron close")
  expect(published).not.toContain("synthetic-primary-token")
  expect(published).not.toContain("synthetic-cleanup-password")
  expect(recorder.publicError("Native candidate primary and cleanup diagnostics").message).toContain(published)
})

test("all owned candidate proof helpers compile through the standard desktop package command in CI", async () => {
  const { typecheckCandidateProof } = await import("./lean-candidate-types.fixture")
  await typecheckCandidateProof()
}, 150000)

test("recorder redacts split-stream passwords discovered after capture and omits raw response/config payloads", () => {
  const recorder = new CandidateRecorder()
  const password = "synthetic-late-owned-password"
  const chunks = [password.slice(0, 11), password.slice(11)]
  recorder.observe("owned child stream", () => chunks.join(""))
  expect(JSON.stringify(recorder.observations)).toContain(password)
  recorder.protectBackend("orchestra", password)
  const response = { privateResponse: { config: "synthetic-private-machine-policy", password } }
  const original = new Error("Own GET route: 500", { cause: response })
  recorder.fail("primary", "own HTTP failure", original)
  const output = recorder.serialize({ streams: recorder.observations, diagnostics: recorder.failures })
  expect(output).not.toContain(password)
  expect(output).not.toContain("synthetic-private-machine-policy")
  expect(output).toContain("Own GET route: 500")
  expect(output).toContain("[omitted]")
  expect(original.cause).toBe(response)
  expect(chunks.join("")).toBe(password)
})

test("actual native proof entry fails by name on unsupported hosts under the candidate workflow; portable suites skip it", async () => {
  if (process.env.CI !== "true" || !process.env.GITHUB_RUN_ID) throw new Error("LEAN_CANDIDATE_NEGATIVE_PROBE_CI_REQUIRED")
  if (process.platform === "darwin" && process.arch === "x64") throw new Error("LEAN_CANDIDATE_NEGATIVE_PROBE_REQUIRES_UNSUPPORTED_HOST")
  const { desktop } = await import("./lean-candidate-archive.fixture")
  const run = async (env: Record<string, string>) => {
    const child = Bun.spawn([process.execPath, "test", "test/lean-candidate-package.test.ts"], { cwd: desktop,
      env: { PATH: process.env.PATH!, CI: "true", GITHUB_ACTIONS: "false", ...env }, stdout: "pipe", stderr: "pipe", timeout: 10000, killSignal: "SIGKILL" })
    const [out, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect(child.signalCode).not.toBe("SIGKILL")
    return { code, output: out + error }
  }
  // Under the candidate workflow's name the proof fails closed, by name, before registering any native test.
  const candidate = await run({ GITHUB_WORKFLOW: "lean-candidate" })
  expect(candidate.code).toBe(1)
  expect(candidate.output).toContain("LEAN_CANDIDATE_UNSUPPORTED_PLATFORM: proof requires native macOS x64")
  // A portable suite skips every native test: none passes off-host.
  const portable = await run({ ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0" })
  expect(portable.code).toBe(0)
  expect(portable.output).toMatch(/\b0 pass\b/)
  expect(portable.output).toMatch(/\b3 skip\b/)
  expect(portable.output).not.toContain("LEAN_CANDIDATE_UNSUPPORTED_PLATFORM")
}, 30000)

test("recorder bounds deep cause chains, wide objects and whole projections with named overflow markers", () => {
  const recorder = new CandidateRecorder()
  const deep = Array.from({ length: 10_000 }).reduce<Error>((cause, _, index) => new Error(`synthetic level ${index}`, { cause }), new Error("synthetic root"))
  const chain = JSON.parse(recorder.serialize(deep))
  expect(JSON.stringify(chain)).toContain('{"marker":"candidate-diagnostics-overflow","reason":"depth"}')
  expect(chain.message).toBe("synthetic level 9999")
  const wide = recorder.serialize({ items: Array.from({ length: 1000 }, (_, index) => index) })
  expect(wide).toContain('"reason": "nodes"')
  expect(wide).not.toContain("999")
  const large = JSON.parse(recorder.serialize(Array.from({ length: 100 }, () => "x".repeat(4000))))
  expect(large).toEqual({ marker: "candidate-diagnostics-overflow", reason: "output", observedBytes: expect.any(Number) })
  expect(large.observedBytes).toBeGreaterThan(64 << 10)
})

test("recorder truncates long strings only after redaction and omits strings too large to scan", () => {
  const recorder = new CandidateRecorder()
  const password = "Zq9-synthetic-boundary-password"
  recorder.protectBackend("orchestra", password)
  const text = `${"a".repeat(4093)}${password}${"b".repeat(10_000 - 4093 - password.length)}`
  const cleaned = recorder.clean(text)
  expect(JSON.parse(recorder.serialize({ text })).text).toBe(`${cleaned.slice(0, 4096)}[truncated:${cleaned.length}]`)
  expect(recorder.serialize({ text })).not.toContain("Zq9")
  expect(JSON.parse(recorder.serialize({ text: password.repeat(200_000) })).text).toBe(`[omitted-unscanned:${password.length * 200_000}]`)
})

test("recorder streams join split secrets before redaction and replace over-cap streams with a marker, never a prefix", () => {
  const recorder = new CandidateRecorder()
  const password = "synthetic-stream-password-V4"
  const split = recorder.stream("synthetic split stream")
  split.push(password.slice(0, 9))
  split.push(new TextEncoder().encode(password.slice(9)))
  const flood = recorder.stream("synthetic flood stream")
  flood.push("synthetic-flood-head ")
  flood.push(`${password} `)
  flood.push("x".repeat(1 << 20))
  flood.push(password)
  recorder.protectBackend("orchestra", password)
  const output = recorder.serialize(recorder.observations)
  expect(output).not.toContain(password)
  expect(output).not.toContain("synthetic-flood-head")
  expect(output).not.toContain("xxxx")
  expect(JSON.parse(output)).toEqual([
    { label: "synthetic split stream", value: "[redacted]" },
    { label: "synthetic flood stream", value: { marker: "candidate-diagnostics-overflow", label: "synthetic flood stream", reason: "stream",
      observedBytes: 21 + password.length + 1 + (1 << 20) + password.length } },
  ])
})

test("recorder cleans a near-cap word-run stream in linear time", () => {
  const recorder = new CandidateRecorder()
  recorder.stream("synthetic near-cap stream").push(`${"x".repeat((1 << 20) - 64)} password=synthetic-near-cap-password`)
  const started = performance.now()
  const [observation] = recorder.observations
  expect(performance.now() - started).toBeLessThan(5000)
  expect(String(observation!.value)).toEndWith(' password="[redacted]"')
  expect(recorder.serialize(recorder.observations)).toContain(`[truncated:${(1 << 20) - 64 + 22}]`)
})

test("recorder records a throwing observation as a named failure instead of propagating it", () => {
  const recorder = new CandidateRecorder()
  const failure = new Error("synthetic observation failure password=synthetic-observe-password")
  recorder.observe("synthetic throwing stream", () => { throw failure })
  const observations = recorder.observations
  expect(recorder.failures).toEqual([{ id: "failure-1", phase: "cleanup", label: "diagnostic observation: synthetic throwing stream", error: failure }])
  const output = recorder.serialize({ observations, failures: recorder.failures })
  expect(output).toContain("candidate-observation-failed")
  expect(output).not.toContain("synthetic-observe-password")
})

test("published scratch acquisition and missing-manifest failures keep phase identity without private paths", async () => {
  const { desktop, repository } = await import("./lean-candidate-archive.fixture")
  const { typecheckCandidateProof } = await import("./lean-candidate-types.fixture")
  const missing = path.join(desktop, "node_modules/.lean-candidate-synthetic-missing-parent")
  const scratch = await typecheckCandidateProof(missing).then(() => undefined, (error: Error) => error)
  expect(scratch?.name).toBe("CandidateProofError")
  expect(scratch?.message).toContain("ENOENT")
  expect(scratch?.message).toContain('"phase": "primary"')
  expect(scratch?.message).not.toContain('"phase": "cleanup"')
  const recorder = new CandidateRecorder()
  recorder.protectPath(repository, "repository")
  recorder.protectPath(os.homedir(), "runner-home")
  recorder.protectPath(os.tmpdir(), "runner-temp")
  const manifest = await Bun.file(path.join(desktop, "dist-candidate-synthetic-missing/lean-candidate-build.json")).json()
    .then(() => undefined, (error: Error) => error)
  expect(String(manifest)).toContain(desktop)
  recorder.fail("primary", "candidate archive verification", manifest)
  recorder.fail("cleanup", "synthetic archive cleanup", new Error(`rm ${os.tmpdir()}/synthetic-scratch failed`))
  const archive = recorder.publicError("Candidate archive verification diagnostics")
  for (const error of [scratch!, archive]) {
    for (const sink of [error.message, error.stack ?? ""]) {
      expect(sink).not.toContain(desktop)
      expect(sink).not.toContain(os.homedir())
      expect(sink).not.toMatch(/\/(Users|home|private\/var|var\/folders|tmp)\//)
    }
  }
  expect(archive.message).toContain('"phase": "primary"')
  expect(archive.message).toContain('"phase": "cleanup"')
  // The published message is JSON, so a Windows separator appears escaped.
  expect(archive.message).toContain(JSON.stringify(path.join("<repository>", "packages", "desktop", "dist-candidate-synthetic-missing")).slice(1, -1))
})
