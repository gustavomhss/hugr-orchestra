import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "crypto"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Context } from "effect"
import { Global } from "@orchestra/core/global"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

// The Relay document, publish and hook routes through the whole V2 server: Location resolution, the project's
// authoring store and Relay data under Global.data, hooks.json in the ToolSafety profile, receipts in install ledgers.
// This server has no password, so the Authorization middleware lets every request through and a Basic credential only
// names who acts.

const context = Context.empty() as Context.Context<unknown>
const ALICE = { authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}` }

type Json = Record<string, any>

async function call(directory: string, method: string, route: string, body?: unknown, headers?: Json) {
  const sent = new Headers(headers)
  sent.set("x-orchestra-directory", directory)
  if (body !== undefined) sent.set("content-type", "application/json")
  const response = await HttpApiApp.webHandler().handler(
    new Request(`http://localhost${route}`, {
      method,
      headers: sent,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    context,
  )
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Json }
}

// The `data` of a Location envelope, after asserting the status.
async function ok(directory: string, method: string, route: string, body?: unknown, headers?: Json) {
  const result = await call(directory, method, route, body, headers)
  if (result.status !== 200) throw new Error(`${method} ${route}: ${result.status} ${JSON.stringify(result.body)}`)
  return result.body.data
}

async function refused(directory: string, method: string, route: string, body?: unknown) {
  const result = await call(directory, method, route, body)
  return { status: result.status, tag: result.body?._tag, code: result.body?.code, message: result.body?.message }
}

async function relayRoot(directory: string) {
  const location = (await call(directory, "GET", "/api/relay/scope")).body.location
  const data = await fs.realpath(Global.Path.data)
  return { projectID: location.project.id as string, data, root: path.join(data, "relay", location.project.id) }
}

async function ledger(root: string, installID: string) {
  const text = await fs.readFile(path.join(root, "hooks", installID, "ledger.jsonl"), "utf8")
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Json)
}

function hookDocument(message: string) {
  return {
    name: "No generated edits",
    // Canvas positions arrive fractional; ledgers and exports carry whole numbers.
    nodes: [
      node("event", "Before edit", "relay.hookEventTrigger", [0.4, 10.6], { operation: "edit", timing: "before" }),
      node("generated", "Generated path", "relay.hookCondition", [224, 0], {
        field: "path",
        pattern: "src/generated/**",
      }),
      node("block", "Block generated edits", "relay.hookBlock", [448, 0], { message }),
    ],
    connections: { "Before edit": edge("Generated path"), "Generated path": edge("Block generated edits") },
    meta: { relay: { kind: "hook" } },
  }
}

function workflowDocument(cmd: string, skill = "") {
  return {
    name: "Ship it",
    nodes: [
      node("start", "Workflow start", "relay.startTrigger", [0, 0], { relayBrief: "Ship it", relayRetryBudget: 2 }),
      node("build", "Build", "relay.execute", [224, 0], {
        instructions: "Build it",
        checklist: JSON.stringify([{ id: "marker", cmd }]),
        skill,
        skillMode: "combine",
      }),
    ],
    connections: { "Workflow start": edge("Build") },
  }
}

function node(id: string, name: string, type: string, position: number[], parameters: Json) {
  return { id, name, type, position, parameters }
}

function edge(target: string) {
  return { main: [[{ node: target, type: "main", index: 0 }]] }
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("relay documents", () => {
  test("the shipped profiles are listed once, with the four that cannot run marked so", async () => {
    await using tmp = await tmpdir({ git: true })
    const listed = (await ok(tmp.path, "GET", "/api/relay/document")) as Json[]
    const profiles = Object.fromEntries(
      listed.filter((item) => item.id.startsWith("relay-")).map((item) => [item.id, item.runnable]),
    )
    expect(profiles).toEqual({
      "relay-design": false,
      "relay-planning": false,
      "relay-research-v2": false,
      "relay-spec-decompose": false,
      "relay-tdd_feature": true,
      "relay-wp-execute": true,
    })
    // Seeding happens once per server: a removed profile does not come back on the next list.
    expect((await call(tmp.path, "DELETE", "/api/relay/document/relay-design")).status).toBe(204)
    const again = (await ok(tmp.path, "GET", "/api/relay/document")) as Json[]
    expect(again.map((item) => item.id)).not.toContain("relay-design")
  })

  test("a save rounds positions, keeps an uncompilable draft with its diagnostic, and guards its version", async () => {
    await using tmp = await tmpdir({ git: true })
    const draft = await ok(tmp.path, "POST", "/api/relay/document", { name: "Empty" })
    expect(draft).toMatchObject({ versionCounter: 1, active: false, activeVersionId: null, runnable: true })
    expect(draft.meta.relay.diagnostics).toEqual(["Add at least one step before running"])

    const hook = await ok(tmp.path, "POST", "/api/relay/document", hookDocument("Regenerate the SDK"))
    expect(hook.nodes[0].position).toEqual([0, 11])
    expect(hook.meta.relay).toMatchObject({ kind: "hook", diagnostics: [] })

    const route = `/api/relay/document/${hook.id}`
    expect(await refused(tmp.path, "PATCH", route, { name: "Unguarded" })).toMatchObject({
      status: 400,
      tag: "RelayInvalidError",
    })
    expect(await refused(tmp.path, "PATCH", route, { name: "Stale", versionId: "other" })).toMatchObject({
      status: 409,
      tag: "RelayConflictError",
      code: "version-conflict",
    })
    expect(await refused(tmp.path, "PATCH", route, { name: "Stale", expectedChecksum: "0".repeat(64) })).toMatchObject({
      status: 409,
      code: "version-conflict",
    })
    const saved = await ok(tmp.path, "PATCH", route, {
      name: "Renamed",
      versionId: hook.versionId,
      expectedChecksum: hook.checksum,
    })
    expect(saved).toMatchObject({ name: "Renamed", versionCounter: 2 })
    // The old version is stale now; only force overwrites it.
    expect((await call(tmp.path, "PATCH", route, { name: "Again", versionId: hook.versionId })).status).toBe(409)
    expect(
      await ok(tmp.path, "PATCH", route, { name: "Forced", versionId: hook.versionId, force: true }),
    ).toMatchObject({
      name: "Forced",
      versionCounter: 3,
    })
    expect(((await ok(tmp.path, "GET", `${route}/version`)) as Json[]).map((item) => item.versionCounter)).toEqual([
      3, 2, 1,
    ])
    expect(await refused(tmp.path, "GET", "/api/relay/document/missing")).toMatchObject({
      status: 404,
      tag: "RelayNotFoundError",
      code: "not-found",
    })
  })

  test("publish records the machine user, never the shared credential name, and refuses a stale version or checksum", async () => {
    await using tmp = await tmpdir({ git: true })
    const empty = await ok(tmp.path, "POST", "/api/relay/document", { name: "Empty" })
    // What does not compile is not published.
    expect(
      await refused(tmp.path, "POST", `/api/relay/document/${empty.id}/publish`, { versionId: empty.versionId }),
    ).toMatchObject({ status: 400, message: "Add at least one step before running" })

    const document = await ok(tmp.path, "POST", "/api/relay/document", workflowDocument("true"))
    const route = `/api/relay/document/${document.id}`
    expect(await refused(tmp.path, "POST", `${route}/publish`, { versionId: "other" })).toMatchObject({
      status: 409,
      code: "version-conflict",
    })
    expect(
      await refused(tmp.path, "POST", `${route}/publish`, {
        versionId: document.versionId,
        expectedChecksum: "0".repeat(64),
      }),
    ).toMatchObject({ status: 409, code: "version-conflict" })
    const published = await ok(
      tmp.path,
      "POST",
      `${route}/publish`,
      { versionId: document.versionId, expectedChecksum: document.checksum },
      ALICE,
    )
    expect(published).toMatchObject({
      active: true,
      activeVersionId: document.versionId,
      publishedBy: os.userInfo().username,
    })
    expect(published.activeVersion).toMatchObject({ versionId: document.versionId, workflowId: document.id })
    expect(await ok(tmp.path, "GET", route)).toMatchObject({ publishedBy: os.userInfo().username })

    // Without a credential, the account the server runs as is the one acting.
    const unpublished = await ok(tmp.path, "POST", `${route}/unpublish`, { expectedChecksum: published.checksum })
    expect(unpublished).toMatchObject({ active: false, activeVersionId: null, unpublishedBy: os.userInfo().username })
    expect(unpublished.publishedBy).toBeUndefined()
  })

  test("export, sprint and node types compile with the skill catalog", async () => {
    await using tmp = await tmpdir({ git: true })
    const workflow = await ok(tmp.path, "POST", "/api/relay/document", workflowDocument("true"))
    const sprint = await ok(tmp.path, "GET", `/api/relay/document/${workflow.id}/sprint`)
    expect(sprint.sprint).toMatchObject({ brief: "Ship it", retry_budget: 2, work_packages: [{ id: "build" }] })
    expect(sprint.skillBindings).toEqual([])
    expect(await ok(tmp.path, "GET", `/api/relay/document/${workflow.id}/export`)).toMatchObject({
      kind: "workflow",
      definition: { work_packages: [{ id: "build", kind: "execute" }] },
    })

    const hook = await ok(tmp.path, "POST", "/api/relay/document", hookDocument("Regenerate the SDK"))
    const exported = await ok(tmp.path, "GET", `/api/relay/document/${hook.id}/export`)
    expect(exported).toMatchObject({ kind: "hook", definition: { schema: "relay.hook.v1", installed: false } })
    expect(exported.definition.connections).toEqual([
      { from: "event", port: 0, to: "generated" },
      { from: "generated", port: 0, to: "block" },
    ])

    const skilled = await ok(tmp.path, "POST", "/api/relay/document", workflowDocument("true", "no-such-skill"))
    expect(skilled.meta.relay.diagnostics).toEqual(["Skill unavailable"])
    expect(await refused(tmp.path, "GET", `/api/relay/document/${skilled.id}/sprint`)).toMatchObject({
      status: 404,
      code: "skill-unavailable",
    })

    const types = await ok(tmp.path, "GET", "/api/relay/node-types")
    expect(types.workflow.map((item: Json) => item.type)).toContain("relay.execute")
    expect(types.hook.map((item: Json) => item.type)).toContain("relay.hookBlock")
  })

  test("check grades a step in the project directory and records nothing", async () => {
    await using tmp = await tmpdir({ git: true })
    const workflow = await ok(tmp.path, "POST", "/api/relay/document", workflowDocument("test -f marker.txt"))
    const route = `/api/relay/document/${workflow.id}/check`
    expect(await ok(tmp.path, "POST", route, {})).toEqual({ outcome: "check", i: 0, wp: "build", failing: ["marker"] })
    await fs.writeFile(path.join(tmp.path, "marker.txt"), "")
    expect(await ok(tmp.path, "POST", route, { position: "build" })).toEqual({
      outcome: "check",
      i: 0,
      wp: "build",
      failing: [],
    })
    expect(await ok(tmp.path, "POST", route, { counter: 1 })).toEqual({ outcome: "complete", i: 1 })
    const { root } = await relayRoot(tmp.path)
    expect(await fs.stat(path.join(root, "arms")).catch(() => undefined)).toBeUndefined()
    expect(await fs.stat(path.join(root, "hooks")).catch(() => undefined)).toBeUndefined()
  })

  test("scopes are case-insensitive names, expanded on the documents that carry them", async () => {
    await using tmp = await tmpdir({ git: true })
    const scope = await ok(tmp.path, "POST", "/api/relay/scope", { name: " Backend " })
    expect(scope).toMatchObject({ name: "Backend", description: "" })
    expect(await refused(tmp.path, "POST", "/api/relay/scope", { name: "backend" })).toMatchObject({
      status: 409,
      code: "duplicate-scope",
    })
    const document = await ok(tmp.path, "POST", "/api/relay/document", { name: "Scoped", tags: [scope.id] })
    expect(document.tags).toEqual([scope])
    expect((await call(tmp.path, "DELETE", `/api/relay/scope/${scope.id}`)).status).toBe(204)
    expect(await ok(tmp.path, "GET", `/api/relay/document/${document.id}`)).toMatchObject({ tags: [] })
  })
})

describe("relay hooks", () => {
  test("an install pins the published version and every change is receipted with its principal", async () => {
    await using tmp = await tmpdir({ git: true })
    const { root } = await relayRoot(tmp.path)
    const hook = await ok(tmp.path, "POST", "/api/relay/document", hookDocument("Regenerate the SDK"))
    expect(await refused(tmp.path, "POST", "/api/relay/hook", { document: hook.id })).toMatchObject({
      status: 409,
      code: "not-published",
    })
    const published = await ok(tmp.path, "POST", `/api/relay/document/${hook.id}/publish`, {
      versionId: hook.versionId,
    })
    expect(await refused(tmp.path, "POST", "/api/relay/hook", { document: hook.id, version: "another" })).toMatchObject(
      { status: 409, code: "not-published" },
    )

    const installed = await ok(tmp.path, "POST", "/api/relay/hook", { document: hook.id }, ALICE)
    expect(installed).toMatchObject({
      document: hook.id,
      version: published.activeVersionId,
      order: 0,
      enabled: true,
      installedBy: os.userInfo().username,
      snapshot: { schema: "relay.hook.v1", name: "No generated edits" },
    })
    const exported = await ok(tmp.path, "GET", `/api/relay/document/${hook.id}/export`)
    // The pin is sha256(json.compact(export)); for ASCII without DEL that is JSON.stringify's bytes.
    expect(installed.sha256).toBe(createHash("sha256").update(JSON.stringify(exported.definition)).digest("hex"))
    expect(await refused(tmp.path, "POST", "/api/relay/hook", { document: hook.id })).toMatchObject({
      status: 409,
      code: "document-installed",
    })

    const workflow = await ok(tmp.path, "POST", "/api/relay/document", workflowDocument("true"))
    await ok(tmp.path, "POST", `/api/relay/document/${workflow.id}/publish`, { versionId: workflow.versionId })
    expect(await refused(tmp.path, "POST", "/api/relay/hook", { document: workflow.id })).toMatchObject({
      status: 400,
      code: "not-a-hook",
    })

    const install = `/api/relay/hook/${installed.installID}`
    expect(await ok(tmp.path, "POST", `${install}/disable`, undefined, ALICE)).toMatchObject({ enabled: false })
    expect(await ok(tmp.path, "POST", `${install}/enable`, undefined, ALICE)).toMatchObject({ enabled: true })

    // Republishing changes nothing until an explicit update.
    const edited = await ok(tmp.path, "PATCH", `/api/relay/document/${hook.id}`, {
      ...hookDocument("Run ./packages/sdk/js/script/build.ts"),
      versionId: published.versionId,
    })
    const republished = await ok(tmp.path, "POST", `/api/relay/document/${hook.id}/publish`, {
      versionId: edited.versionId,
    })
    expect((await ok(tmp.path, "GET", "/api/relay/hook")).installs[0].version).toBe(published.activeVersionId)
    const updated = await ok(tmp.path, "POST", `${install}/update`, {}, ALICE)
    expect(updated).toMatchObject({ installID: installed.installID, version: republished.activeVersionId, order: 0 })
    expect(updated.snapshot.nodes[2].parameters.message).toBe("Run ./packages/sdk/js/script/build.ts")

    expect(await ok(tmp.path, "PATCH", "/api/relay/hook/order", { installIDs: [installed.installID] })).toMatchObject({
      installs: [{ installID: installed.installID, order: 0 }],
    })
    expect(await refused(tmp.path, "PATCH", "/api/relay/hook/order", { installIDs: [] })).toMatchObject({
      status: 409,
      code: "order-mismatch",
    })

    expect((await call(tmp.path, "DELETE", install)).status).toBe(204)
    expect((await ok(tmp.path, "GET", "/api/relay/hook")).installs).toEqual([])
    expect(await refused(tmp.path, "POST", `${install}/enable`)).toMatchObject({ status: 404, code: "install-missing" })

    const receipts = await ledger(root, installed.installID)
    expect(receipts.map((line) => [line.event, line.principal, line.seq])).toEqual([
      ["hook-installed", os.userInfo().username, 0],
      ["hook-disabled", os.userInfo().username, 1],
      ["hook-enabled", os.userInfo().username, 2],
      ["hook-updated", os.userInfo().username, 3],
      ["hook-uninstalled", os.userInfo().username, 4],
    ])
    expect(receipts[0]).toMatchObject({ install: installed.installID, document: hook.id, sha256: installed.sha256 })
    expect(receipts[3]).toMatchObject({ version: republished.activeVersionId, sha256: updated.sha256 })
  })

  test("decisions are the hook-decision lines of the install's ledger", async () => {
    await using tmp = await tmpdir({ git: true })
    const { root } = await relayRoot(tmp.path)
    const hook = await ok(tmp.path, "POST", "/api/relay/document", hookDocument("Regenerate the SDK"))
    await ok(tmp.path, "POST", `/api/relay/document/${hook.id}/publish`, { versionId: hook.versionId })
    const installed = await ok(tmp.path, "POST", "/api/relay/hook", { document: hook.id })
    const route = `/api/relay/hook/${installed.installID}/decisions`
    expect(await ok(tmp.path, "GET", route)).toEqual([])

    // The receipt shipper writes these; the route only reads them back, lifecycle lines left out.
    const decision = {
      ts: 1_700_000_000,
      event: "hook-decision",
      decision: "dec-1",
      install: installed.installID,
      version: installed.version,
      node: "block",
      action: "block",
      trigger: "edit.before",
      tool: "edit",
      session: "ses_1",
      call: "call_1",
      subject: "src/generated/types.ts",
      outcome: "blocked",
    }
    const file = path.join(root, "hooks", installed.installID, "ledger.jsonl")
    await fs.appendFile(file, JSON.stringify({ ...decision, gen: 0, prev: "0".repeat(64), seq: 1 }) + "\n")
    expect(await ok(tmp.path, "GET", route)).toEqual([{ ...decision, seq: 1 }])

    await fs.appendFile(file, JSON.stringify({ event: "hook-decision", seq: 2 }) + "\n")
    expect(await refused(tmp.path, "GET", route)).toMatchObject({ status: 409, code: "ledger-invalid" })
    expect(await ok(tmp.path, "GET", "/api/relay/hook/h-never-installed/decisions")).toEqual([])
    expect(await refused(tmp.path, "GET", "/api/relay/hook/..%2Fescape/decisions")).toMatchObject({ status: 404 })
  })

  test("repair runs only on request, backs up a corrupt hooks.json and resets it, and leaves anything else alone", async () => {
    await using tmp = await tmpdir({ git: true })
    const { data, projectID } = await relayRoot(tmp.path)
    const file = RelayHookInstall.file(data, projectID)
    expect(await refused(tmp.path, "POST", "/api/relay/hook/repair", { confirm: true })).toMatchObject({
      status: 409,
      code: "repair-not-needed",
    })

    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "{not json")
    expect(await refused(tmp.path, "GET", "/api/relay/hook")).toMatchObject({ status: 409, code: "profile-invalid" })
    // Reading never repairs, and a repair must be asked for in so many words.
    expect((await call(tmp.path, "POST", "/api/relay/hook/repair", {})).status).toBe(400)
    expect(await fs.readFile(file, "utf8")).toBe("{not json")

    const repaired = await ok(tmp.path, "POST", "/api/relay/hook/repair", { confirm: true }, ALICE)
    expect(repaired.installs).toEqual([])
    // The server reports its own spelling of the data path; Windows may short-name it (RUNNER~1), so both sides are
    // compared resolved.
    expect(await fs.realpath(path.dirname(repaired.backup))).toBe(path.dirname(file))
    expect(path.basename(repaired.backup)).toMatch(/^hooks\.json\.corrupt-\d+-[0-9a-f]{8}$/)
    expect(await fs.readFile(repaired.backup, "utf8")).toBe("{not json")
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ installs: [] })
    expect((await ok(tmp.path, "GET", "/api/relay/hook")).installs).toEqual([])

    // A regular file over the loader's cap is corrupt too.
    await fs.writeFile(file, " ".repeat(RelayHookInstall.MAX_BYTES + 1))
    const oversized = await ok(tmp.path, "POST", "/api/relay/hook/repair", { confirm: true })
    expect((await fs.stat(oversized.backup)).size).toBe(RelayHookInstall.MAX_BYTES + 1)

    // A symlink or a directory is not corruption the server can prove: it stays for the owner to inspect.
    const elsewhere = path.join(tmp.path, "elsewhere.json")
    await fs.writeFile(elsewhere, "{not json")
    await fs.rm(file)
    await fs.symlink(elsewhere, file)
    expect(await refused(tmp.path, "POST", "/api/relay/hook/repair", { confirm: true })).toMatchObject({
      status: 409,
      code: "repair-refused",
    })
    expect((await fs.lstat(file)).isSymbolicLink()).toBe(true)
    expect(await fs.readFile(elsewhere, "utf8")).toBe("{not json")
    await fs.rm(file)
    await fs.mkdir(file)
    expect(await refused(tmp.path, "POST", "/api/relay/hook/repair", { confirm: true })).toMatchObject({
      status: 409,
      code: "repair-refused",
    })
    expect((await fs.stat(file)).isDirectory()).toBe(true)
  })
})
