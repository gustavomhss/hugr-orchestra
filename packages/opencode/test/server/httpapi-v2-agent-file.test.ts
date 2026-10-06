import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Context } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function request(route: string, directory: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("x-opencode-directory", directory)
  if (init.body) headers.set("content-type", "application/json")
  return HttpApiApp.webHandler().handler(new Request(`http://localhost${route}`, { ...init, headers }), context)
}

type V2Agent = {
  id: string
  description?: string
  mode: string
  steps?: number
  system?: string
  model?: { id: string; providerID: string }
  permissions: { action: string; resource: string; effect: string }[]
}

async function agents(directory: string) {
  const response = await request("/api/agent", directory)
  expect(response.status).toBe(200)
  return ((await response.json()) as { data: V2Agent[] }).data
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("v2 agent file HttpApi", () => {
  test("creates a project agent file that both protocols load", async () => {
    await using tmp = await tmpdir({ git: true })
    expect(await agents(tmp.path)).not.toContainEqual(expect.objectContaining({ id: "reviewer" }))

    const saved = await request("/api/agent/reviewer/file", tmp.path, {
      method: "PUT",
      body: JSON.stringify({
        description: "Reviews the diff",
        mode: "subagent",
        model: "example/reasoner",
        steps: 7,
        system: "Read the diff before answering.",
        permission: { bash: "deny", edit: "ask" },
      }),
    })
    expect(saved.status).toBe(200)
    const body = (await saved.json()) as { data: { path: string; exists: boolean } }
    const filepath = path.join(tmp.path, ".opencode", "agent", "reviewer.md")
    expect(body.data).toMatchObject({ path: filepath, exists: true, steps: 7, permission: { bash: "deny" } })
    expect(await fs.readFile(filepath, "utf8")).toContain("Read the diff before answering.")

    // The `.opencode` directory did not exist when the location opened; the reload still scans it.
    const reviewer = (await agents(tmp.path)).find((agent) => agent.id === "reviewer")
    expect(reviewer).toMatchObject({
      description: "Reviews the diff",
      mode: "subagent",
      steps: 7,
      system: "Read the diff before answering.",
      model: { id: "reasoner", providerID: "example" },
    })
    expect(reviewer?.permissions.at(-2)).toEqual({ action: "bash", resource: "*", effect: "deny" })
    expect(reviewer?.permissions.at(-1)).toEqual({ action: "edit", resource: "*", effect: "ask" })

    const read = await request("/api/agent/reviewer/file", tmp.path)
    expect(read.status).toBe(200)
    expect(((await read.json()) as { data: unknown }).data).toEqual(body.data)

    expect((await request("/instance/dispose", tmp.path, { method: "POST" })).status).toBe(200)
    const legacy = await request("/agent", tmp.path)
    expect(legacy.status).toBe(200)
    const v1 = ((await legacy.json()) as { name: string; description?: string; steps?: number; prompt?: string }[]).find(
      (agent) => agent.name === "reviewer",
    )
    expect(v1).toMatchObject({ description: "Reviews the diff", steps: 7, prompt: "Read the diff before answering." })
  })

  test("edits the existing definition in place and keeps keys the editor does not own", async () => {
    await using tmp = await tmpdir({ git: true })
    const filepath = path.join(tmp.path, ".opencode", "agents", "docs.md")
    await fs.mkdir(path.dirname(filepath), { recursive: true })
    await fs.writeFile(filepath, "---\ndescription: Old\ncolor: '#336699'\ntools:\n  write: false\n---\nOld prompt\n")

    const before = await request("/api/agent/docs/file", tmp.path)
    expect(((await before.json()) as { data: unknown }).data).toEqual({
      path: filepath,
      exists: true,
      revision: expect.stringMatching(/^[0-9a-f]{64}$/),
      description: "Old",
      system: "Old prompt",
      permission: { edit: "deny" },
    })

    const saved = await request("/api/agent/docs/file", tmp.path, {
      method: "PUT",
      body: JSON.stringify({
        description: "Keeps docs current",
        mode: "primary",
        system: "New prompt",
        permission: { edit: "deny" },
      }),
    })
    expect(saved.status).toBe(200)
    expect(await fs.readFile(filepath, "utf8")).toBe(
      "---\ndescription: Keeps docs current\ncolor: '#336699'\nmode: primary\npermission:\n  edit: deny\n---\nNew prompt\n",
    )
    await expect(fs.stat(path.join(tmp.path, ".opencode", "agent"))).rejects.toThrow()
    expect((await agents(tmp.path)).find((agent) => agent.id === "docs")).toMatchObject({
      description: "Keeps docs current",
      mode: "primary",
      system: "New prompt",
    })
  })

  test("a file without instructions keeps the built-in instructions on both protocols", async () => {
    await using tmp = await tmpdir({ git: true })
    const legacy = async () =>
      ((await (await request("/agent", tmp.path)).json()) as { name: string; prompt?: string }[]).find(
        (agent) => agent.name === "explore",
      )
    const before = { v2: (await agents(tmp.path)).find((agent) => agent.id === "build"), v1: await legacy() }
    expect(before.v2?.system).toBeTruthy()
    expect(before.v1?.prompt).toBeTruthy()
    for (const name of ["build", "explore"]) {
      const saved = await request(`/api/agent/${name}/file`, tmp.path, {
        method: "PUT",
        body: JSON.stringify({ permission: { bash: "deny" } }),
      })
      expect(saved.status).toBe(200)
    }
    const build = (await agents(tmp.path)).find((agent) => agent.id === "build")
    expect(build?.system).toBe(before.v2?.system)
    expect(build?.permissions.at(-1)).toEqual({ action: "bash", resource: "*", effect: "deny" })
    expect((await request("/instance/dispose", tmp.path, { method: "POST" })).status).toBe(200)
    expect((await legacy())?.prompt).toBe(before.v1?.prompt)
  })

  test("disabling an agent removes it from the roster", async () => {
    await using tmp = await tmpdir({ git: true })
    await fs.mkdir(path.join(tmp.path, ".opencode"), { recursive: true })
    expect(await agents(tmp.path)).toContainEqual(expect.objectContaining({ id: "plan" }))
    const saved = await request("/api/agent/plan/file", tmp.path, {
      method: "PUT",
      body: JSON.stringify({ disable: true }),
    })
    expect(saved.status).toBe(200)
    expect(await agents(tmp.path)).not.toContainEqual(expect.objectContaining({ id: "plan" }))
  })

  test("edits the definition discovery applies last and refuses a stale revision", async () => {
    await using tmp = await tmpdir({ git: true })
    const early = path.join(tmp.path, ".opencode", "agent", "docs.md")
    const late = path.join(tmp.path, ".opencode", "agents", "docs.md")
    await fs.mkdir(path.dirname(early), { recursive: true })
    await fs.mkdir(path.dirname(late), { recursive: true })
    await fs.writeFile(early, "---\ndescription: Early\n---\n")
    await fs.writeFile(late, "---\ndescription: Late\n---\n")
    const read = (await (await request("/api/agent/docs/file", tmp.path)).json()) as {
      data: { path: string; revision: string; description: string }
    }
    expect(read.data).toMatchObject({ path: late, description: "Late" })

    await fs.writeFile(late, "---\ndescription: Changed elsewhere\n---\n")
    const stale = await request("/api/agent/docs/file", tmp.path, {
      method: "PUT",
      body: JSON.stringify({ description: "Mine", revision: read.data.revision }),
    })
    expect(stale.status).toBe(409)
    expect(await fs.readFile(late, "utf8")).toContain("Changed elsewhere")

    const fresh = (await (await request("/api/agent/docs/file", tmp.path)).json()) as { data: { revision: string } }
    const saved = await request("/api/agent/docs/file", tmp.path, {
      method: "PUT",
      body: JSON.stringify({ description: "Mine", revision: fresh.data.revision }),
    })
    expect(saved.status).toBe(200)
    expect(await fs.readFile(late, "utf8")).toBe("---\ndescription: Mine\n---\n")
    expect(await fs.readFile(early, "utf8")).toBe("---\ndescription: Early\n---\n")
    expect((await fs.readdir(path.dirname(late))).sort()).toEqual(["docs.md"])
  })

  test("never writes over unparseable, outside, case-colliding or unreadable files", async () => {
    await using tmp = await tmpdir({ git: true })
    await using outside = await tmpdir()
    const folder = path.join(tmp.path, ".opencode", "agent")
    await fs.mkdir(folder, { recursive: true })
    const broken = path.join(folder, "broken.md")
    await fs.writeFile(broken, "---\ndescription: [unclosed\n  - : :\n---\nBody\n")
    const read = await request("/api/agent/broken/file", tmp.path)
    expect(((await read.json()) as { data: unknown }).data).toMatchObject({ exists: true, invalid: true })
    const put = (name: string) =>
      request(`/api/agent/${name}/file`, tmp.path, { method: "PUT", body: JSON.stringify({ description: "x" }) })
    expect((await put("broken")).status).toBe(400)
    expect(await fs.readFile(broken, "utf8")).toContain("[unclosed")

    await fs.writeFile(path.join(folder, "Plan.md"), "---\ndescription: Capital\n---\n")
    expect((await put("plan")).status).toBe(400)
    expect(await fs.readFile(path.join(folder, "Plan.md"), "utf8")).toContain("Capital")

    await fs.symlink(outside.path, path.join(tmp.path, ".opencode", "agents"))
    await fs.writeFile(path.join(outside.path, "escape.md"), "---\ndescription: Outside\n---\n")
    expect((await put("escape")).status).toBe(400)
    expect(await fs.readFile(path.join(outside.path, "escape.md"), "utf8")).toContain("Outside")

    // chmod cannot make a file unreadable on Windows, so the unreadable case is POSIX-only.
    if (process.platform === "win32") return
    const locked = path.join(folder, "locked.md")
    await fs.writeFile(locked, "---\ndescription: Locked\n---\n")
    await fs.chmod(locked, 0o000)
    expect((await request("/api/agent/locked/file", tmp.path)).status).toBe(500)
    await fs.chmod(locked, 0o644)
  })

  test("rejects names that are not a plain file name", async () => {
    await using tmp = await tmpdir({ git: true })
    for (const name of ["../escape", ".hidden", "a b", "con", "a".repeat(65)]) {
      const response = await request(`/api/agent/${encodeURIComponent(name)}/file`, tmp.path, {
        method: "PUT",
        body: JSON.stringify({ description: "x" }),
      })
      expect(response.status).toBe(400)
    }
    await expect(fs.stat(path.join(tmp.path, ".opencode"))).rejects.toThrow()
  })
})
