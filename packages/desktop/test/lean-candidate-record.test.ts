import { expect, test } from "bun:test"
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

test("actual native proof entry fails by name on unsupported CI hosts before registering native tests", async () => {
  if (process.env.CI !== "true" || !process.env.GITHUB_RUN_ID) throw new Error("LEAN_CANDIDATE_NEGATIVE_PROBE_CI_REQUIRED")
  if (process.platform === "darwin" && process.arch === "x64") throw new Error("LEAN_CANDIDATE_NEGATIVE_PROBE_REQUIRES_UNSUPPORTED_HOST")
  const { desktop } = await import("./lean-candidate-archive.fixture")
  const child = Bun.spawn([process.execPath, "test", "test/lean-candidate-package.test.ts"], { cwd: desktop,
    env: { PATH: process.env.PATH!, CI: "true", GITHUB_ACTIONS: "false" }, stdout: "pipe", stderr: "pipe", timeout: 10000, killSignal: "SIGKILL" })
  const [out, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect(code).toBe(1)
  expect(child.signalCode).not.toBe("SIGKILL")
  expect(out + error).toContain("LEAN_CANDIDATE_UNSUPPORTED_PLATFORM: proof requires native macOS x64")
}, 15000)
