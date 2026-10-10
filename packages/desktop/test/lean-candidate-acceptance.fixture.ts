import assert from "node:assert/strict"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import type { LeanDashboard } from "../../schema/src/lean-dashboard"
import { desktop, packagedCandidate } from "./lean-candidate-archive.fixture"
import { bounded, expect, launchCandidate, type OwnedCandidate } from "./lean-candidate-runtime.fixture"
import { nativeFixture, nativePtySmoke, type NativeRun } from "./lean-candidate-native.fixture"
import { nativeHistory, nativeItemToggle, nativeMasterToggle, seedNativeRenderer, selectNativeProfile, verifyNativeRows } from "./lean-candidate-ui.fixture"

export async function proveNativeCandidate() {
  const candidate = await packagedCandidate()
  const errors: unknown[] = []
  const resources: { label: string; close: () => Promise<unknown> }[] = []
  const proof: Record<string, unknown> = { sourceCommit: candidate.manifest.sourceCommit,
    scope: "native macOS x64 CI packaged Electron; public synthetic/native fixtures", status: "started" }
  const artifacts = path.join(desktop, "dist-candidate/proof")
  await mkdir(artifacts, { recursive: true })
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), "lean-candidate-owned-")))
  resources.push({ label: "owned candidate scratch", close: () => rm(parent, { recursive: true, force: true }) })
  const owned: { current?: OwnedCandidate } = {}
  try {
    const root = path.join(parent, "candidate")
    const app = await launchCandidate(candidate.executable, root, errors)
    owned.current = app
    resources.push({ label: "owned packaged Electron", close: app.close })
    const directories = [path.join(root, "public-profile-a"), path.join(root, "public-profile-b")]
    await Promise.all(directories.map((directory) => mkdir(directory)))
    const [a, b] = directories as [string, string]
    assert.deepEqual(await app.request("session", "GET", undefined, a), [], "Default candidate startup admitted prompts")
    assert.deepEqual(await app.request("pty", "GET", undefined, a), [], "Default candidate startup executed PTY tools")
    // Two instances of the same packaged executable in fresh owned roots must coexist.
    // Identity + isolated userData + held locks bind this control without launching production.
    const independent = await launchCandidate(candidate.executable, path.join(parent, "lock-control"), errors)
    resources.push({ label: "independent owned lock control", close: independent.close })
    assert.notEqual(independent.application.process().pid, app.application.process().pid)
    assert.notEqual(independent.backend.url, app.backend.url)
    assert.deepEqual(await independent.request("session"), [], "Fresh independent root reused candidate sessions")
    await independent.close()
    assert.equal(errors.length, 0, "Independent lock control cleanup failed")
    await nativePtySmoke(app, a)
    assert.ok(Bun.which("go"), "LEAN_CANDIDATE_GO_REQUIRED: native Go30 fixture needs runner Go")
    const fixture = await nativeFixture(app, a, errors)
    resources.push({ label: "owned public loopback model", close: fixture.close })
    const on = await fixture.execute("call_go_on")
    assert.equal(on.metric.status, "applied", `Enabled native Go30 declined: ${JSON.stringify(on.metric)}\n${on.raw.output}`)
    assert.equal(on.metric.filterProfile, "go-test-verbose")
    assert.ok(on.metric.bytes.saved > 0)
    const aggregate = (runs: NativeRun[]) => ({ bytesSaved: runs.reduce((sum, run) => sum + run.metric.bytes.saved, 0),
      tokensSaved: runs.reduce((sum, run) => { assert.ok(run.metric.tokens.kind === "estimated"); return sum + run.metric.tokens.saved }, 0),
      calls: runs.length, tokenCalls: runs.length })
    for (let i = 0; i < 30; i++) assert.ok(on.raw.output.includes(`=== RUN   TestCase${i}\n`))
    const read = (directory: string) => app.request<LeanDashboard.Info>("project/lean", "GET", undefined, directory)
    const first = await read(a)
    const other = await read(b)
    assert.equal(first.complete, true)
    assert.deepEqual(first.savings, aggregate([on]), "Profile economy differs from actual durable native call")
    assert.equal(first.scope.projectID, other.scope.projectID, "Public non-Git fixtures must share project identity")
    assert.notEqual(first.scope.profileID, other.scope.profileID, "Directory profiles collided under shared non-Git project")
    assert.deepEqual(other.savings, { bytesSaved: 0, tokensSaved: 0, calls: 0, tokenCalls: 0 })
    await seedNativeRenderer(app, directories)
    await verifyNativeRows(app, first)
    await nativeItemToggle(app, "go", false)
    const changed = await read(a)
    assert.deepEqual(changed, { ...first, items: first.items.map((item) => item.id === "go" ? { ...item, enabled: false } : item) },
      "Item-off altered another item, profile master or economy")
    const config = await app.request("global/config")
    // Explicit real HTTP PATCH is also idempotent and cannot broaden the scope.
    assert.deepEqual(await app.request("project/lean", "PATCH", { itemID: "go", enabled: false }, a), changed)
    assert.deepEqual(await app.request("global/config"), config)
    assert.deepEqual(await read(b), other)
    const off = await fixture.execute("call_go_off")
    assert.equal(off.metric.status, "passthrough")
    assert.equal(off.metric.reason, "item_disabled")
    assert.equal(off.metric.bytes.saved, 0)
    assert.deepEqual(Buffer.from(off.tool.state.status === "completed" ? off.tool.state.output : ""), Buffer.from(off.raw.output))
    assert.equal(off.raw.output.match(/=== RUN/g)?.length, 30)
    const cargo: NativeRun[] = []
    if (Bun.which("cargo")) {
      const rust = path.join(a, "public-cargo-fixture")
      await mkdir(path.join(rust, "src"), { recursive: true })
      await Bun.write(path.join(rust, "Cargo.toml"), '[package]\nname = "candidate_fixture"\nversion = "0.1.0"\nedition = "2021"\n[lib]\ndoctest = false\n')
      await Bun.write(path.join(rust, "src/lib.rs"), Array.from({ length: 30 }, (_, i) => `#[test] fn case_${i}() { assert_eq!(2 + 2, 4); }`).join("\n") + "\n")
      const enabled = await fixture.execute("call_cargo_on", "cargo test --offline --color never", rust)
      assert.equal(enabled.metric.status, "applied", `Supported native Cargo fixture declined: ${JSON.stringify(enabled.metric)}\n${enabled.raw.output}`)
      assert.ok(enabled.metric.bytes.saved > 0)
      await app.request("project/lean", "PATCH", { itemID: "cargo", enabled: false }, a)
      const disabled = await fixture.execute("call_cargo_off", "cargo test --offline --color never", rust)
      assert.equal(disabled.metric.reason, "item_disabled")
      assert.deepEqual(Buffer.from(disabled.tool.state.status === "completed" ? disabled.tool.state.output : ""), Buffer.from(disabled.raw.output))
      await app.request("project/lean", "PATCH", { itemID: "cargo", enabled: true }, a)
      cargo.push(enabled, disabled)
    }
    proof.cargo = cargo.length ? "actual supported fixture on/off" : "unavailable: cargo executable absent from runner PATH"
    const refresh = async () => {
      const response = app.page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === "/project/lean")
      await app.page.locator(".lean-caption button").click()
      await response
    }
    await refresh()
    const saved = await read(a)
    assert.deepEqual(saved.savings, aggregate([on, off, ...cargo]), "Profile economy failed durable identity conservation")
    assert.deepEqual(saved.items.find((item) => item.id === "go")!.savings, aggregate([on, off]))
    assert.deepEqual(saved.items.find((item) => item.id === "cargo")!.savings, aggregate(cargo))
    await verifyNativeRows(app, saved)
    await nativeHistory(app, a, "go", [on, off])
    await selectNativeProfile(app, b, other)
    await nativeItemToggle(app, "cargo", false)
    await nativeMasterToggle(app, false)
    const savedB = await read(b)
    assert.deepEqual(savedB, { ...other, enabled: false, items: other.items.map((item) => item.id === "cargo" ? { ...item, enabled: false } : item) })
    await selectNativeProfile(app, a, saved)
    await nativeMasterToggle(app, false)
    assert.deepEqual(await read(a), { ...saved, enabled: false })
    await nativeMasterToggle(app, true)
    assert.deepEqual(await read(a), saved)
    assert.deepEqual(await read(b), savedB)
    await nativeHistory(app, a, "go", [on, off])
    if (cargo.length) {
      await app.page.locator("#lean-trigger-go").click()
      await nativeHistory(app, a, "cargo", cargo)
    }
    assert.ok(await Bun.file(path.join(root, "db/orchestra.sqlite")).exists(), "Actual backend DB missing inside ROOT")
    const preferences = async (profileID: string) => {
      assert.match(profileID, /^[a-zA-Z0-9_-]+$/)
      return Bun.file(path.join(root, "data/orchestra/lean/profiles", `${profileID}.json`)).json()
    }
    const prefsA = await preferences(first.scope.profileID)
    const prefsB = await preferences(other.scope.profileID)
    assert.equal(prefsA.items.go, false)
    assert.equal(prefsB.items.cargo, false)
    proof.profiles = { a: saved, b: savedB }
    proof.native = [on, off, ...cargo].map((run) => ({ callID: run.tool.callID, raw: run.raw.output,
      durable: run.tool.state.status === "completed" ? run.tool.state.output : run.tool.state, metric: run.metric }))
    proof.ownedBackend = { url: app.backend.url, sidecarChildren: 1, ptyChildrenObserved: 1 }
    await app.close()
    assert.equal(errors.length, 0, "Owned quit/port-closure failed; refusing relaunch")
    const again = await launchCandidate(candidate.executable, root, errors)
    owned.current = again
    resources.push({ label: "owned candidate relaunch", close: again.close })
    assert.deepEqual(await again.request("project/lean", "GET", undefined, a), saved)
    assert.deepEqual(await again.request("project/lean", "GET", undefined, b), savedB)
    assert.deepEqual(await preferences(first.scope.profileID), prefsA)
    assert.deepEqual(await preferences(other.scope.profileID), prefsB)
    const replay = await again.request<{ parts: { id: string; state?: unknown }[] }[]>(`session/${fixture.session.id}/message`, "GET", undefined, a)
    for (const run of [on, off, ...cargo]) {
      assert.deepEqual(replay.flatMap((message) => message.parts).find((part) => part.id === run.tool.id)?.state, run.tool.state,
        "Relaunched durable tool bytes/metadata differ from the observed native call")
      assert.deepEqual(Buffer.from((await Bun.file(path.join(root, `${run.tool.callID}.json`)).json()).output), Buffer.from(run.raw.output))
    }
    // Relaunch receives no fixture state reseed. Actual MemoryRouter/persist restores the page/owner.
    await expect(again.page.locator('[data-component="orchestra-chapter"][data-chapter="lean"]')).toBeVisible()
    await verifyNativeRows(again, saved)
    await nativeHistory(again, a, "go", [on, off])
    await selectNativeProfile(again, b, savedB)
    await selectNativeProfile(again, a, saved)
    await nativeHistory(again, a, "go", [on, off])
    await bounded("owned packaged renderer PNG", again.page.screenshot({ path: path.join(artifacts, "renderer.png") }))
    proof.persistence = "same candidate ROOT; retained independent preferences, history and paired savings"
  } catch (error) {
    errors.push(error)
    if (owned.current) {
      proof.rendererDiagnostics = owned.current.diagnostics
      try { await bounded("owned failure renderer PNG", owned.current.page.screenshot({ path: path.join(artifacts, "renderer.png") }), 5000) }
      catch (error) { errors.push(error) }
    }
  }
  for (const resource of resources.reverse()) {
    try { await bounded(resource.label, resource.close(), 30000) } catch (error) { errors.push(error) }
  }
  proof.status = errors.length ? "failed" : "accepted"
  proof.diagnostics = errors.map((error) => error instanceof Error ? `${error.stack}\n${error instanceof AggregateError ? error.errors.map(String).join("\n") : ""}` : String(error))
  try { await Bun.write(path.join(artifacts, "proof.log"), JSON.stringify(proof, null, 2) + "\n") } catch (error) { errors.push(error) }
  if (errors.length) throw new AggregateError(errors, "Native candidate primary and owned cleanup diagnostics")
  console.log(`native candidate accepted: source=${candidate.manifest.sourceCommit}; actual Go30 on/off; Cargo=${proof.cargo}; actual renderer A/B/A; same-ROOT relaunch`)
}
