import { expect, test } from "bun:test"
import { createSdkForServer } from "@/utils/server"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"

// These exercise the generated Promise runtime at the HTTP boundary. They require the lead's client regeneration.
test("canonical policy read uses generated Session.Info as the timestamp fence", async () => {
  const { createSessionManagementForServer } = await import("@/utils/session-management")
  const server = { url: "https://origin.test" }
  const policy = { mode: "allowlist" as const, models: [{ providerID: "router", id: "full/slash/model" }] }
  const fetcher = Object.assign(async () => Response.json({ data: {
    id: "ses_origin", projectID: "project", title: "Origin", location: { directory: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 20 }, subagentModels: policy,
  } }), { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, protocol: Promise.resolve("v2"), legacy: createSdkForServer({ server, fetch: fetcher }) })
  expect(await management.readSubagentModels("ses_origin")).toEqual({ policy, timestamp: 20 })
})

test("generated session management captures origin credentials and replaces policies, including deny-all and Inherit", async () => {
  const { createSessionManagementForServer } = await import("@/utils/session-management")
  const server = { url: "https://origin.test", username: "owner", password: "secret" }
  const requests: Request[] = []
  const bodies: unknown[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    const body: unknown = request.body ? await request.json() : undefined
    bodies.push(body)
    if (body && typeof body === "object" && "archived" in body) return new Response(null, { status: 204 })
    return Response.json({ data: body && typeof body === "object" && "policy" in body ? body.policy : { mode: "inherit" } })
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, protocol: Promise.resolve("v2"), legacy: createSdkForServer({ server, fetch: fetcher }) })
  server.url = "https://other.test"
  server.password = "changed"
  expect(await management.getSubagentModels("ses_origin")).toEqual({ mode: "inherit" })
  expect(await management.setSubagentModels("ses_origin", { mode: "allowlist", models: [] })).toEqual({ mode: "allowlist", models: [] })
  const policy = { mode: "allowlist" as const, models: [{ providerID: "router", id: "full/slash/model" }] }
  expect(await management.setSubagentModels("ses_origin", policy)).toEqual(policy)
  expect(await management.setSubagentModels("ses_origin", { mode: "inherit" })).toEqual({ mode: "inherit" })
  await management.archive("ses_origin", true, "/repo")
  await management.archive("ses_origin", false, "/repo")
  expect(bodies.slice(1, 4)).toEqual([{ policy: { mode: "allowlist", models: [] } }, { policy }, { policy: { mode: "inherit" } }])
  expect(bodies.slice(4)).toEqual([{ archived: true }, { archived: false }])
  expect(requests.every((request) => new URL(request.url).origin === "https://origin.test")).toBe(true)
  expect(requests.every((request) => request.headers.get("authorization") === `Basic ${btoa("owner:secret")}`)).toBe(true)
})

test.each([404, 405, 501, 401, 403, 500])("generated runtime classifies HTTP %s without masking auth/server failures", async (status) => {
  const { createSessionManagementForServer } = await import("@/utils/session-management")
  const server = { url: "https://origin.test" }
  const fetcher = Object.assign(async () => Response.json({ _tag: "UnauthorizedError" }, { status }), { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, protocol: Promise.resolve("v2"), legacy: createSdkForServer({ server, fetch: fetcher }) })
  const result = await management.getSubagentModels("ses_origin").then(() => undefined, (error: unknown) => error)
  expect(result).toBeDefined()
  expect(sessionManagementUnsupported(result)).toBe([404, 405, 501].includes(status))
})

test("V1 archive still uses the real legacy update SDK; V1 restore is explicitly unsupported", async () => {
  const { createSessionManagementForServer } = await import("@/utils/session-management")
  const server = { url: "https://legacy.test" }
  const requests: { url: string; body: unknown }[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push({ url: request.url, body: await request.json() })
    return Response.json({ id: "ses_legacy" })
  }, { preconnect: fetch.preconnect })
  const management = createSessionManagementForServer({ server, fetch: fetcher, protocol: Promise.resolve("v1"), legacy: createSdkForServer({ server, fetch: fetcher, throwOnError: true }) })
  await management.archive("ses_legacy", true, "/repo")
  expect(requests).toEqual([{ url: "https://legacy.test/session/ses_legacy?directory=%2Frepo", body: { time: { archived: expect.any(Number) } } }])
  const error = await management.archive("ses_legacy", false, "/repo").catch((error: unknown) => error)
  expect(sessionManagementUnsupported(error)).toBe(true)
  expect(requests).toHaveLength(1)
})
