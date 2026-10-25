import { beforeAll, expect, spyOn, test } from "bun:test"
import type { SubagentModelPolicy } from "../subagent-model-rules"
import { createPromptState } from "@/context/prompt-state"
import { clearPending, pendingPolicy, togglePending } from "../draft-subagent-models"
import type { createSubmissionPolicy } from "./submission-policy"
import { createPromptSubmit, policyFixture, promptInputs, promoted, state, submitInput } from "./submit-harness"

// Read the qualified B producer as one module; never copy its serialization/barrier implementation.
const producer = "7a2626a51458d12ea4c2acfc0ac22ab19fccce27"
let createManagement: typeof import("@/utils/session-management").createSessionManagementForServer
beforeAll(async () => {
  const local = await import("@/utils/session-management")
  const server = { url: "https://capability-probe.invalid" }
  const fetcher = Object.assign(async () => { throw new Error("Unexpected transport probe request") }, { preconnect: fetch.preconnect })
  const probe = local.createSessionManagementForServer({ server, fetch: fetcher, protocol: Promise.resolve("v2") })
  if ("subagentModelsWriteVersion" in probe && typeof probe.subagentModelsWriteVersion === "function") {
    createManagement = local.createSessionManagementForServer
    return
  }
  // The isolated own branch lacks B; local proof loads its immutable qualified blob. Joined builds use their real module above.
  Bun.plugin({ name: "qualified-subagent-write-version", setup(build) {
    build.onLoad({ filter: /session-management\.ts\?qualified-write-version$/ }, () => {
      const source = Bun.spawnSync(["git", "show", `${producer}:packages/app/src/utils/session-management.ts`], { cwd: import.meta.dir })
      if (source.exitCode) throw new Error(source.stderr.toString())
      return { contents: source.stdout.toString(), loader: "ts" }
    })
  } })
  const module = await import(`${Bun.resolveSync("@/utils/session-management", import.meta.dir)}?qualified-write-version`)
  createManagement = module.createSessionManagementForServer
})

test.each(["same-policy", "changed-policy", "failed"])("real writers join SET during canonical GET: %s", async (outcome) => {
  const key = `canonical-get-race-${outcome}`
  const allow: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "provider", id: "a" }] }
  const changed: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "provider", id: "b" }] }
  const backend = { policy: { mode: "inherit" } as SubagentModelPolicy, reads: 0, writes: 0, released: false }
  const observed = { readsAtPromotion: 0 }
  state.promoteProbe = () => { observed.readsAtPromotion = backend.reads }
  const getStarted = Promise.withResolvers<void>()
  const releaseGet = Promise.withResolvers<void>()
  const writeStarted = Promise.withResolvers<void>()
  const releaseWrite = Promise.withResolvers<void>()
  const rejoined = Promise.withResolvers<void>()
  const server = { url: "https://canonical-race.invalid" }
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    if (request.method === "GET") {
      backend.reads++
      const snapshot = structuredClone(backend.policy)
      if (backend.writes === 1 && backend.reads === 2) { getStarted.resolve(); await releaseGet.promise }
      return Response.json({ data: {
        id: "session-1", projectID: "project", title: "Admitted", location: { directory: "/repo/main" },
        cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1, updated: backend.writes + 1 }, subagentModels: snapshot,
      } })
    }
    const body = await request.json() as { policy: SubagentModelPolicy }
    if (++backend.writes === 2) {
      writeStarted.resolve()
      await releaseWrite.promise
      if (outcome === "failed") return Response.json({ message: "Latest write failed" }, { status: 503 })
    }
    backend.policy = body.policy
    return Response.json({ data: body.policy })
  }, { preconnect: fetch.preconnect })
  const management = createManagement({ server, fetch: fetcher, protocol: Promise.resolve("v2") }) as Parameters<typeof createSubmissionPolicy>[0]["management"]
  if (!management.waitSubagentModels || !management.subagentModelsWriteVersion) throw new Error("Qualified producer lacks frozen ports")
  const wait = management.waitSubagentModels.bind(management)
  const probe = spyOn(management, "waitSubagentModels").mockImplementation((id) => {
    const joined = wait(id)
    if (backend.released) rejoined.resolve()
    return joined
  })
  state.serverOverride = { ...policyFixture.server, sessionManagement: management }
  togglePending(key, "provider", "a", true)
  const real = createPromptState({ prompt: "must remain until latest ACK" })
  const contents = real.current()
  const sending = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key }).handleSubmit(new Event("submit"))
  try {
    await getStarted.promise
    const second = management.setSubagentModels("session-1", outcome === "changed-policy" ? changed : allow)
      .then(() => true, () => false)
    await writeStarted.promise
    expect(management.subagentModelsWriteVersion("session-1")).toBe(2)
    backend.released = true
    releaseGet.resolve()
    expect(await Promise.race([
      rejoined.promise.then(() => "joined"), state.promoteStarted.promise.then(() => "promoted"),
    ])).toBe("joined")
    expect(promoted).toEqual([])
    expect(promptInputs).toEqual([])
    expect(real.current()).toBe(contents)
    releaseWrite.resolve()
    expect(await second).toBe(outcome !== "failed")
    await sending
    if (outcome === "same-policy") {
      expect(observed.readsAtPromotion).toBeGreaterThan(2)
      expect(promptInputs).toHaveLength(1)
    } else {
      expect(promoted).toEqual([])
      expect(promptInputs).toEqual([])
      expect(real.current()).toBe(contents)
      expect(pendingPolicy(key)).toEqual(allow)
    }
  } finally {
    releaseGet.resolve()
    releaseWrite.resolve()
    await sending
    probe.mockRestore()
    clearPending(key)
  }
})
