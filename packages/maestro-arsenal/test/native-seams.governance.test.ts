import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type { ArsenalContext } from "../src/contract.ts"
import { validateArgs } from "../src/validate.ts"
import { type Observations, provenanceSchema, observationsSchema } from "../src/governance/contracts.ts"
import { governanceToolDescriptor, governanceToolDescriptors, GOVERNANCE_DEFINITIONS } from "../src/governance/descriptors.ts"
import { readPreferencesSnapshot } from "../src/index"
import { verifyRulesetReceipt } from "../src/governance/operators.ts"
import { rulesetProposal } from "../src/governance/repository.ts"
import { validateHostSnapshot, telemetry } from "../src/governance/telemetry.ts"
import { readPreferences } from "../src/tools/profile.ts"
import profile from "../src/tools/profile.ts"
import relay from "../src/tools/relay-arm.ts"
import ledger from "../src/tools/wave-ledger.ts"
import scheduler from "../src/tools/wave-scheduler.ts"
import governance from "../src/tools/governance.ts"
import { fixture, operation, result, capture, check, provenance } from "./fixtures.governance.ts"
import { rethrow } from "./rejection.ts"
const digest = (text: string) => createHash("sha256").update(text).digest("hex")

test("authoritative pure descriptors match handlers, include required governance, fit native describe bound", () => {
  expect(Object.keys(governanceToolDescriptors).sort()).toEqual(["governance", "profile", "relay-arm", "wave-ledger", "wave-scheduler"])
  for (const handler of [profile, relay, ledger, scheduler, governance]) {
    const descriptor = governanceToolDescriptors[handler.name as keyof typeof governanceToolDescriptors]
    expect(descriptor).toEqual({ name: handler.name, description: handler.description, inputSchema: handler.inputSchema, effects: handler.effects })
    expect(Object.keys(descriptor).sort()).toEqual(["description", "effects", "inputSchema", "name"])
    expect(Buffer.byteLength(JSON.stringify(descriptor))).toBeLessThanOrEqual(32 * 1024)
  }
  expect(validateArgs(governanceToolDescriptor.inputSchema, { operation: "ruleset-propose", repository: "owner/repo", checks: capture(check("forged")) }).ok).toBe(false)
  expect(validateArgs(governanceToolDescriptor.inputSchema, { operation: "ruleset-propose", repository: "owner/repo" }).ok).toBe(true)
  expect(validateArgs(governanceToolDescriptor.inputSchema, { operation: "release-run", operatorRequest: { requestID: "request", expectedHead: "a".repeat(40), action: "apply-ruleset" }, recipePath: "release.sh", recipeDigest: "a".repeat(64), tag: "v1.0.0" }).ok).toBe(false)
  const fields = new Map<string, string>()
  Object.values(GOVERNANCE_DEFINITIONS).forEach((definition) => Object.entries(definition.properties).forEach(([name, schema]) => {
    if (fields.has(name)) expect(JSON.stringify(schema)).toBe(fields.get(name)!)
    fields.set(name, JSON.stringify(schema))
    expect(validateArgs(schema, null).ok).toBe(false)
  }))
})
test("F readPreferences uses E supplied managed root, exact source bytes, read-only missing/default behavior", async () => {
  const f = await fixture()
  const authorize: ArsenalContext["authorize"] = async (request: { readonly effect: "read" | "write" | "process"; readonly paths: readonly string[]; readonly commands: readonly string[] }) => {
    if (request.effect !== "read") throw new Error("READ_BINDING_CANNOT_WRITE")
  }
  const readContext: ArsenalContext = { ...f.context, authorize }
  const resources: readonly string[] = Object.freeze([f.root])
  await readContext.authorize({ effect: "read", paths: resources, commands: Object.freeze([]) })
  expect(await readPreferences(readContext)).toBeNull()
  expect(await readdir(f.state)).toEqual([])
  await profile.handler({ action: "set", patch: { neverTouch: ["owned.ts"], askBefore: ["publish"] } }, f.context)
  const snapshot = await readPreferencesSnapshot(readContext)
  expect(snapshot.path).toBe(join(f.state, "project", "profile", "preferences.json"))
  expect(snapshot.sourceDigest).toBe(digest(await Bun.file(snapshot.path).text()))
  expect(snapshot.profile?.neverTouch).toEqual(["owned.ts"])
  expect((await readPreferences(readContext))?.askBefore).toEqual(["publish"])
})
test("native snapshots accept actual event identity, absent source revision diagnostic and 64-hex Own/Git identities", async () => {
  const f = await fixture()
  const facts: Observations = { complete: true, usage: [{ provider: "actual-provider", model: "actual-model", input: 17, output: 3, cacheRead: 0, cacheWrite: 0,
    provenance: { source: "session-event", projectID: "project", sessionID: "session", eventID: "session-event:42", revisionUnavailable: "not-captured" } }], actions: [] }
  const snapshot = validateHostSnapshot(f.context, "session", facts)
  expect(Object.isFrozen(snapshot)).toBe(true)
  expect(Object.isFrozen(snapshot.usage[0].provenance)).toBe(true)
  expect(telemetry("project", snapshot).diagnostics).toContain("SOURCE_REVISION_UNAVAILABLE: session/session-event:42")
  expect(telemetry("project", snapshot).usage.costUSD).toBeNull()
  expect(validateArgs(observationsSchema, snapshot).ok).toBe(true)
  expect(validateArgs(provenanceSchema, { ...provenance(), revision: "a".repeat(64), revisionKind: "source" }).ok).toBe(true)
  expect(validateArgs(provenanceSchema, { ...provenance(), revision: "actual-event-version:2", revisionKind: "event" }).ok).toBe(true)
  expect(validateArgs(provenanceSchema, { source: "session-event", projectID: "project", sessionID: "session", eventID: "real-event" }).ok).toBe(false)
  expect(validateArgs(provenanceSchema, { ...provenance(), revisionUnavailable: "not-captured" }).ok).toBe(false)
  expect(() => validateHostSnapshot(f.context, "other-session", facts)).toThrow("HOST_SNAPSHOT_SESSION_MISMATCH")
  expect((await operation<{ diagnostics: string[] }>({ operation: "status", observations: snapshot }, f.context)).diagnostics).toContain("SOURCE_REVISION_UNAVAILABLE: session/session-event:42")
})
test("armed completion contracts are data for the native Relay arm; this package exports no evaluator", async () => {
  const f = await fixture()
  const contract = { sessionID: "session", label: "native-checks", chain: [
    { id: "first", checks: [{ id: "one", hostCheck: "check-one" }] }, { id: "second", checks: [{ id: "two", hostCheck: "check-two" }] },
  ] }
  const armed = result<{ token: string; enforced: boolean; permissionOwner: string; bindingRequired: string[] }>(await relay.handler({ action: "arm", contract }, f.context))
  expect(armed).toMatchObject({ enforced: false, permissionOwner: "native-host", bindingRequired: ["check-one", "check-two"] })
  const exported = Object.keys(await import("../src/index"))
  expect(exported).toContain("validateHostSnapshot")
  expect(exported.filter((name) => /completion/i.test(name))).toEqual([])
  expect(validateArgs(governanceToolDescriptor.inputSchema, { operation: "completion-check", contract, checks: capture(check("one")), bindings: ["check-one"] }).ok).toBe(false)
  expect(GOVERNANCE_DEFINITIONS).not.toHaveProperty("completion-check")
})
test("a release is only a request for the owner's native approval; the package changes no state", async () => {
  const f = await fixture()
  const contract = { sessionID: "session", label: "actual", chain: [{ id: "first", checks: [{ id: "one", hostCheck: "check-one" }] }] }
  const token = result<{ token: string }>(await relay.handler({ action: "arm", contract }, f.context)).token
  const before = await Bun.file(join(f.state, "project", "completion", `${token}.json`)).text()
  expect(result<Record<string, unknown>>(await relay.handler({ action: "release", token, reason: "the fixture is repaired" }, f.context))).toEqual({
    token, release: "owner-approval-required", reason: "the fixture is repaired", enforced: false, permissionOwner: "native-host",
  })
  expect(await Bun.file(join(f.state, "project", "completion", `${token}.json`)).text()).toBe(before)
  expect(await rethrow(relay.handler({ action: "release", token }, f.context))).toThrow("COMPLETION_RELEASE_INPUT_REQUIRED")
  expect(validateArgs(relay.inputSchema, { action: "release", token: "../escape", reason: "x" }).ok).toBe(false)
  expect(validateArgs(relay.inputSchema, { action: "release", token, reason: "" }).ok).toBe(false)
})
async function releaseFixture() {
  const f = await fixture()
  await f.init()
  const recipe = "#!/usr/bin/env bash\nset -euo pipefail\ngit -c user.name='Governance Fixture' -c user.email=fixture@example.invalid tag -a v1.0.0 -m v1.0.0\n"
  await Bun.write(join(f.root, "release.sh"), recipe)
  await f.runGit("add", "release.sh")
  await f.runGit("commit", "-m", "test: repository release policy")
  const head = await f.runGit("rev-parse", "HEAD")
  const input = { operation: "release-run" as const, operatorRequest: { requestID: "operator-request", action: "run-release-recipe" as const, expectedHead: head }, recipePath: "release.sh", recipeDigest: digest(recipe), tag: "v1.0.0" }
  return { ...f, head, input }
}
test("explicit release run executes committed actual repository recipe, verifies real annotated local tag", async () => {
  const f = await releaseFixture()
  expect(await operation(f.input, f.context)).toMatchObject({ executed: true, tag: "v1.0.0", target: f.head, rollbackClaim: false })
  expect(await f.runGit("rev-parse", "v1.0.0^{commit}")).toBe(f.head)
  expect(await f.runGit("cat-file", "-t", "v1.0.0")).toBe("tag")
  expect(await rethrow(operation(f.input, f.context))).toThrow("RELEASE_TAG_EXISTS")
})
test("release recipe path refuses git metadata under either separator before reading it", async () => {
  const f = await releaseFixture()
  await Promise.all([".git\\hooks\\pre-commit", "sub\\.git\\HEAD", ".GIT/config"].map(async (recipePath) =>
    expect(await rethrow(operation({ ...f.input, recipePath }, f.context))).toThrow("RELEASE_RECIPE_PATH_INVALID")))
  expect(f.permissions.filter((request) => request.effect === "read").flatMap((request) => request.paths).every((path) => path === f.root)).toBe(true)
  expect(await f.runGit("tag", "--list")).toBe("")
})
test("release native process denial, changed recipe and userApproved boolean cannot authorize local tag", async () => {
  const f = await releaseFixture()
  expect(await rethrow(operation(f.input, { ...f.context, async authorize(request) { if (request.commands.some((command) => command.startsWith("'bash'"))) throw new Error("NATIVE_RELEASE_DENIED") } }))).toThrow("NATIVE_RELEASE_DENIED")
  expect(await f.runGit("tag", "--list")).toBe("")
  expect(validateArgs(governanceToolDescriptor.inputSchema, { ...f.input, userApproved: true }).ok).toBe(false)
  expect(await rethrow(operation({ ...f.input, recipeDigest: "0".repeat(64) }, f.context))).toThrow("RELEASE_RECIPE_CHANGED")
  expect(await f.runGit("tag", "--list")).toBe("")
})
test("release recipe exit zero without real tag cannot report completed adaptation", async () => {
  const f = await releaseFixture()
  const noTagRecipe = "#!/usr/bin/env bash\nset -euo pipefail\ntrue\n"
  await Bun.write(join(f.root, "release.sh"), noTagRecipe)
  await f.runGit("add", "release.sh")
  await f.runGit("commit", "-m", "test: missing tag postcondition")
  const head = await f.runGit("rev-parse", "HEAD")
  expect(await rethrow(operation({ ...f.input, recipeDigest: digest(noTagRecipe), operatorRequest: { ...f.input.operatorRequest, expectedHead: head } }, f.context))).toThrow("PROCESS_ACQUISITION_FAILED")
  expect(await f.runGit("tag", "--list")).toBe("")
})
test("ruleset run native denial happens before real gh invocation, leaves repository/state untouched", async () => {
  const f = await fixture()
  const head = await f.init()
  const before = await readdir(f.root)
  const input = { operation: "ruleset-run" as const, operatorRequest: { requestID: "operator-request", action: "apply-ruleset" as const, expectedHead: head }, repository: "owner/repo" }
  expect(await rethrow(operation(input, { ...f.context, async authorize(request) { if (request.commands.some((command) => command.startsWith("'gh'"))) throw new Error("NATIVE_REMOTE_DENIED") } }))).toThrow("NATIVE_REMOTE_DENIED")
  expect(await readdir(f.root)).toEqual(before)
  expect(await readdir(f.state)).toEqual([])
  expect(await f.runGit("rev-parse", "HEAD")).toBe(head)
  expect(await f.runGit("tag", "--list")).toBe("")
})
test("pure ruleset receipt validation rejects absent/wrong scope and missing actual rules; no live API claim", () => {
  const body = rulesetProposal("owner/repo", "dev", ["verify"]).body
  expect(verifyRulesetReceipt({ id: 42, ...body }, body).id).toBe(42)
  expect(() => verifyRulesetReceipt({ id: 42, ...body, rules: [] }, body)).toThrow("RULESET_API_RULES_MISSING")
  expect(() => verifyRulesetReceipt({ id: 42, ...body, rules: body.rules.filter((rule) => rule.type !== "pull_request") }, body)).toThrow("RULESET_API_RULE_MISSING: pull_request")
  expect(() => verifyRulesetReceipt({ id: 42, ...body, conditions: { ref_name: { include: ["refs/heads/other"], exclude: [] } } }, body)).toThrow("RULESET_API_SCOPE_MISMATCH")
  expect(() => verifyRulesetReceipt(null, body)).toThrow("RULESET_API_RECEIPT_INVALID")
})
test("changelog write performs authorized atomic edit, preserves published entry, refuses stale digest and denied edit", async () => {
  const f = await fixture()
  const head = await f.init()
  const current = await Bun.file(join(f.root, "CHANGELOG.md")).text()
  const input = { operation: "changelog-write" as const, operatorRequest: { requestID: "operator-request", action: "write-changelog" as const, expectedHead: head }, changelogPath: "CHANGELOG.md", expectedDigest: digest(current), version: "1.1.0", title: "Operator release", date: "2026-10-01" }
  expect(await rethrow(operation(input, { ...f.context, async authorize(request) { if (request.effect === "write") throw new Error("NATIVE_CHANGELOG_DENIED") } }))).toThrow("NATIVE_CHANGELOG_DENIED")
  expect(await Bun.file(join(f.root, "CHANGELOG.md")).text()).toBe(current)
  expect(await operation(input, f.context)).toMatchObject({ written: true, version: "1.1.0", curated: false })
  const next = await Bun.file(join(f.root, "CHANGELOG.md")).text()
  expect(next).toContain("## [1.1.0]")
  expect(next).toContain(current.slice(current.indexOf("## [1.0.0]")))
  expect(await rethrow(operation(input, f.context))).toThrow("CHANGELOG_CHANGED")
})
test("actual SHA-256 Git repositories work for acquisition, preflight and selective restoration", async () => {
  const f = await fixture()
  const head = await f.init("sha256")
  expect(head.length).toBe(64)
  expect(await operation({ operation: "change-budget" }, f.context)).toMatchObject({ status: "PASS", baseSHA: head })
  expect(await operation({ operation: "preflight-arm", wave: "wave", checks: capture(check("FULL", "pass", head)), requiredChecks: ["FULL"] }, f.context)).toMatchObject({ armed: true })
  await operation({ operation: "recovery-begin", wave: "recover", ownedPaths: ["owned.ts"] }, f.context)
  await Bun.write(join(f.root, "owned.ts"), "changed\n")
  const plan = await operation<{ token: string }>({ operation: "recovery-prepare", wave: "recover" }, f.context)
  expect(await operation({ operation: "recovery-restore", token: plan.token }, f.context)).toMatchObject({ baseline: head, status: "RESTORED_OWNED_FILES" })
  expect(await Bun.file(join(f.root, "owned.ts")).text()).toBe("export const value = 1\n")
})
