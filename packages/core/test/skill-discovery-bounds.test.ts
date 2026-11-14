import fs from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { SkillDiscovery } from "@orchestra/core/skill/discovery"
import { markdown, remote, sizedMarkdown } from "./fixture/skill-discovery-bounds"

const MiB = 1024 * 1024

describe("remote skill acquisition through actual SkillV2.list", () => {
  test("CONTROL H14: real HTTP, cache reuse and version refresh preserve observable locations and content", async () => {
    expect(SkillDiscovery.MAX_FILE_BYTES).toBe(2 * MiB)
    expect(SkillDiscovery.MAX_INDEX_BYTES).toBe(MiB)
    expect(SkillDiscovery.MAX_PULL_BYTES).toBe(32 * MiB)
    await using f = await remote()
    f.state.skills = [{ name: "deploy", version: "v1", files: ["SKILL.md", "data.txt"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy", "original body"))
    f.files.set("deploy/data.txt", [{ kind: "status", status: 503 }, { kind: "status", status: 503 }, "companion"])
    const first = await f.list()
    expect(first.map((skill) => skill.name)).toEqual(["deploy"])
    expect(first[0].content).toBe("original body")
    const root = path.dirname(first[0].location)
    expect(await fs.readFile(path.join(root, "data.txt"), "utf8")).toBe("companion")
    expect(f.requests.filter((item) => item.file === "deploy/data.txt")).toHaveLength(3)
    expect(await fs.readFile(path.join(root, ".orchestra-version"), "utf8")).toBe("v1")
    const fileRequests = f.requests.filter((item) => item.file !== "index.json").length
    expect((await f.list())[0].location).toBe(first[0].location)
    expect(f.requests.filter((item) => item.file !== "index.json")).toHaveLength(fileRequests)
    f.state.skills[0].version = "v2"
    f.files.set("deploy/SKILL.md", markdown("deploy", "refreshed body"))
    expect((await f.list())[0].content).toBe("refreshed body")
    expect(await fs.readFile(path.join(root, ".orchestra-version"), "utf8")).toBe("v2")
    expect((await f.paths()).some((file) => /\.(tmp|old)-/.test(file))).toBe(false)
  })

  test("CONTROL H14: existing root markdown and nested SKILL selection stays exact while non-markdown files download", async () => {
    await using f = await remote()
    f.state.skills = [{ name: "deploy", files: ["SKILL.md", "guide.md", ".hidden.md", "nested/SKILL.md", "nested/other.md", "asset.bin"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy", "root"))
    f.files.set("deploy/guide.md", markdown("guide", "guide bytes"))
    f.files.set("deploy/.hidden.md", markdown("hidden", "hidden bytes"))
    f.files.set("deploy/nested/SKILL.md", markdown("nested", "nested bytes"))
    f.files.set("deploy/nested/other.md", markdown("unselected", "not a discovery match"))
    f.files.set("deploy/asset.bin", "asset bytes")
    const listed = await f.list()
    expect(listed.map((skill) => skill.name).toSorted()).toEqual(["deploy", "guide", "hidden", "nested"])
    expect(listed.find((skill) => skill.name === "nested")?.content).toBe("nested bytes")
    const root = path.dirname(listed.find((skill) => skill.name === "deploy")!.location)
    expect(await fs.readFile(path.join(root, "nested/other.md"), "utf8")).toContain("unselected")
    expect(await fs.readFile(path.join(root, "asset.bin"), "utf8")).toBe("asset bytes")
    expect(f.requests.filter((item) => item.file !== "index.json")).toHaveLength(6)
  })

  test("CONTROL H14 existing guard: a >1MiB index refuses before file requests", async () => {
    await using f = await remote()
    f.state.index = JSON.stringify({ skills: [{ name: "deploy", files: ["SKILL.md"] }], padding: "x".repeat(SkillDiscovery.MAX_INDEX_BYTES) })
    f.files.set("deploy/SKILL.md", markdown("deploy"))
    expect(await f.list()).toEqual([])
    expect(f.requests.map((item) => item.file)).toEqual(["index.json"])
  })

  test("CONTROL H14: exact 2MiB files and exact 32MiB total remain admissible", async () => {
    await using f = await remote()
    const content = markdown("deploy", "at the actual default limits")
    const files = ["SKILL.md", ...Array.from({ length: 16 }, (_, index) => `part-${index}.bin`)]
    f.state.skills = [{ name: "deploy", files }]
    f.files.set("deploy/SKILL.md", content)
    const body = "x".repeat(SkillDiscovery.MAX_FILE_BYTES)
    files.slice(1).forEach((file, index) => f.files.set(`deploy/${file}`, index === 15 ? body.slice(Buffer.byteLength(content)) : body))
    const listed = await f.list()
    expect(listed.map((skill) => skill.name)).toEqual(["deploy"])
    expect(listed[0].content).toBe("at the actual default limits")
    expect((await fs.stat(path.join(path.dirname(listed[0].location), "part-0.bin"))).size).toBe(SkillDiscovery.MAX_FILE_BYTES)
    expect(await f.storedBytes()).toBe(SkillDiscovery.MAX_PULL_BYTES)
  })

  test("CONTROL H14 existing guard: a >2MiB requested markdown file is not exposed", async () => {
    await using f = await remote()
    f.state.skills = [{ name: "deploy", files: ["SKILL.md"] }]
    f.files.set("deploy/SKILL.md", sizedMarkdown("deploy", SkillDiscovery.MAX_FILE_BYTES + 1))
    expect(await f.list()).toEqual([])
    expect(f.requests.map((item) => item.file)).toContain("deploy/SKILL.md")
  })

  test.each(["headers", "no-eof", "trickle"] as const)("H14: the default complete-get deadline refuses %s and cancels the actual TCP peer", async (mode) => {
    await using f = await remote()
    f.state.skills = [{ name: "deploy", files: ["SKILL.md"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy", "prior bytes"))
    const previous = mode === "no-eof" ? await f.list() : undefined
    if (previous) {
      expect(previous).toHaveLength(1)
      f.state.skills[0].version = "v2"
    }
    f.files.set("deploy/SKILL.md", mode === "headers"
      ? { kind: "headers" }
      : { kind: "stream", first: markdown("deploy"), ...(mode === "trickle" ? { intervalMs: 250 } : {}) })
    const observed = await f.observe(13_000)
    const requested = f.requests.findLast((item) => item.file === "deploy/SKILL.md")
    expect(requested).toBeDefined()
    if (mode !== "headers") expect(requested!.chunks).toBeGreaterThan(0)
    if (mode === "trickle") expect(requested!.chunks).toBeGreaterThan(3)
    // On old source this is an explicit semantic failure, not Bun's setup/test timeout.
    expect(observed.outcome.state).toBe("settled")
    if (observed.outcome.state !== "settled") return
    expect(observed.outcome.skills).toEqual([])
    expect(await f.peerCancelled()).toBe(true)
    expect(f.requests.some((item) => item.cancelled !== undefined)).toBe(true)
    if (previous) {
      expect(await fs.readFile(previous[0].location, "utf8")).toBe(markdown("deploy", "prior bytes"))
      expect((await f.paths()).some((file) => /\.(tmp|old)-/.test(file))).toBe(false)
    }
  }, 90_000)

  test("H14: the default whole-pull deadline stops many individually timely gets and returns no skill", async () => {
    await using f = await remote()
    const files = ["SKILL.md", ...Array.from({ length: 255 }, (_, index) => `part-${index}.txt`)]
    f.state.skills = [{ name: "deploy", version: "v1", files }]
    files.forEach((file) => f.files.set(`deploy/${file}`, { kind: "delay", ms: 2_500, body: file === "SKILL.md" ? markdown("deploy") : "tiny" }))
    const observed = await f.observe(65_000)
    expect(f.requests.filter((item) => item.file !== "index.json").length).toBeGreaterThan(8)
    expect(observed.outcome.state).toBe("settled")
    if (observed.outcome.state !== "settled") return
    expect(observed.outcome.skills).toEqual([])
    expect(await f.peerCancelled()).toBe(true)
    expect((await f.paths()).some((file) => file.includes(".tmp-"))).toBe(false)
  }, 90_000)

  test("H14: concurrent real bodies cannot overdraw the strict 32MiB pull budget", async () => {
    await using f = await remote()
    const files = ["SKILL.md", ...Array.from({ length: 8 }, (_, index) => `part-${index}.bin`)]
    f.state.skills = Array.from({ length: 4 }, (_, index) => ({ name: `skill-${index}`, files }))
    const body = "x".repeat(2 * MiB)
    f.state.skills.forEach((skill) => files.forEach((file) => f.files.set(`${skill.name}/${file}`, file === "SKILL.md" ? markdown(skill.name) : body)))
    // Hold headers until the real 4x8 acquisition fanout is present, so all first-wave limits see the old balance.
    f.state.gate = 32
    const listed = await f.list()
    expect(f.state.gateOpened).toBe(true)
    expect(f.requests.filter((item) => item.file !== "index.json").length).toBeGreaterThanOrEqual(32)
    expect(await f.storedBytes()).toBeLessThanOrEqual(SkillDiscovery.MAX_PULL_BYTES)
    for (const skill of listed) {
      const root = path.dirname(skill.location)
      expect(await Promise.all(files.map((file) => Bun.file(path.join(root, file)).exists()))).toEqual(files.map(() => true))
    }
  })

  test("H14: an oversized cached requested file is bounded and cannot bypass file admission", async () => {
    await using f = await remote()
    f.state.skills = [{ name: "deploy", version: "v1", files: ["SKILL.md"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy"))
    const first = await f.list()
    expect(first).toHaveLength(1)
    const filepath = first[0].location
    const oversized = sizedMarkdown("deploy", SkillDiscovery.MAX_FILE_BYTES + 1)
    await fs.writeFile(filepath, oversized)
    const before = f.requests.length
    expect(await f.list()).toEqual([])
    expect(await fs.readFile(filepath, "utf8")).toBe(oversized)
    expect(f.requests.slice(before).map((item) => item.file)).toEqual(["index.json"])
  })

  test("H14: cached non-markdown companions count against the same strict aggregate budget", async () => {
    await using f = await remote()
    const files = ["SKILL.md", ...Array.from({ length: 8 }, (_, index) => `part-${index}.bin`)]
    f.state.skills = Array.from({ length: 4 }, (_, index) => ({ name: `skill-${index}`, version: "v1", files }))
    f.state.skills.forEach((skill) => files.forEach((file) => f.files.set(`${skill.name}/${file}`, file === "SKILL.md" ? markdown(skill.name) : "tiny")))
    const first = await f.list()
    expect(first).toHaveLength(4)
    const body = "x".repeat(SkillDiscovery.MAX_FILE_BYTES)
    for (const skill of first) await Promise.all(files.slice(1).map((file) => fs.writeFile(path.join(path.dirname(skill.location), file), body)))
    const before = f.requests.length
    const listed = await f.list()
    expect(f.requests.slice(before).map((item) => item.file)).toEqual(["index.json"])
    const admittedBytes = await Promise.all(listed.map(async (skill) => {
      const root = path.dirname(skill.location)
      const sizes = await Promise.all(files.map(async (file) => (await fs.stat(path.join(root, file))).size))
      return sizes.reduce((sum, size) => sum + size, 0)
    }))
    expect(admittedBytes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(SkillDiscovery.MAX_PULL_BYTES)
    expect(await f.storedBytes()).toBeGreaterThan(SkillDiscovery.MAX_PULL_BYTES) // old physical cache is preserved
  })

  test.each(["skills", "per-skill-files", "all-files"] as const)("H14: rejects excess %s before any file HTTP, counting invalid entries too", async (kind) => {
    await using f = await remote()
    const files = ["SKILL.md", ...Array.from({ length: kind === "per-skill-files" ? 256 : 240 }, (_, index) => `part-${index}.txt`)]
    f.state.skills = kind === "skills"
      ? [{ name: "deploy", files: ["SKILL.md"] }, ...Array.from({ length: 128 }, (_, index) => ({ name: `../invalid-${index}`, files: ["SKILL.md"] }))]
      : kind === "per-skill-files"
        ? [{ name: "deploy", files }]
        : Array.from({ length: 17 }, (_, index) => ({ name: index === 0 ? "deploy" : `../invalid-${index}`, files }))
    f.state.skills.filter((skill) => skill.name === "deploy").forEach((skill) => skill.files.forEach((file) => f.files.set(`deploy/${file}`, file === "SKILL.md" ? markdown("deploy") : "tiny")))
    expect(await f.list()).toEqual([])
    expect(f.requests.map((item) => item.file)).toEqual(["index.json"])
    expect(await f.paths()).toEqual([])
  })

  test("H14: an oversized cached version marker fails its root without replacing old physical cache", async () => {
    await using f = await remote()
    f.state.skills = [{ name: "deploy", version: "v1", files: ["SKILL.md"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy", "old bytes"))
    const first = await f.list()
    expect(first).toHaveLength(1)
    const marker = path.join(path.dirname(first[0].location), ".orchestra-version")
    await fs.writeFile(marker, "v".repeat(4_097))
    const before = f.requests.length
    expect(await f.list()).toEqual([])
    expect(await fs.readFile(marker, "utf8")).toBe("v".repeat(4_097))
    expect(f.requests.slice(before).map((item) => item.file)).toEqual(["index.json"])
    expect((await f.paths()).some((file) => /\.(tmp|old)-/.test(file))).toBe(false)
  })

  test.each([false, true])("H14: failed requested companion preserves cache without exposing old root (versioned=%s)", async (versioned) => {
    await using f = await remote()
    f.state.skills = [{ name: "deploy", ...(versioned ? { version: "v1" } : {}), files: ["SKILL.md"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy", "old body"))
    const first = await f.list()
    expect(first).toHaveLength(1)
    const filepath = first[0].location
    const old = await fs.readFile(filepath, "utf8")
    f.state.skills = [{ name: "deploy", ...(versioned ? { version: "v2" } : {}), files: ["SKILL.md", "required.bin"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy", "new body"))
    f.files.set("deploy/required.bin", { kind: "status", status: 404 })
    const listed = await f.list()
    expect(f.requests.some((item) => item.file === "deploy/required.bin")).toBe(true)
    expect(listed).toEqual([])
    expect(await fs.readFile(filepath, "utf8")).toBe(old)
    expect((await f.paths()).some((file) => /\.(tmp|old)-/.test(file))).toBe(false)
  })

  test("H14: independent complete skills remain usable when another requested root is partial", async () => {
    await using f = await remote()
    f.state.skills = [{ name: "broken", files: ["SKILL.md", "required.bin"] }, { name: "good", files: ["SKILL.md"] }]
    f.files.set("broken/SKILL.md", markdown("broken"))
    f.files.set("broken/required.bin", { kind: "status", status: 404 })
    f.files.set("good/SKILL.md", markdown("good", "independent body"))
    const listed = await f.list()
    expect(f.requests.map((item) => item.file)).toContain("broken/required.bin")
    expect(listed.map((skill) => skill.name)).toEqual(["good"])
    expect(listed[0].content).toBe("independent body")
    expect(await fs.readFile(listed[0].location, "utf8")).toBe(markdown("good", "independent body"))
  })

  test("H14: unlisted cached markdown stays physical but never enters the actual SkillV2 snapshot", async () => {
    await using f = await remote()
    f.state.skills = [{ name: "deploy", version: "v1", files: ["SKILL.md"] }]
    f.files.set("deploy/SKILL.md", markdown("deploy", "listed body"))
    const first = await f.list()
    expect(first).toHaveLength(1)
    const rogue = path.join(path.dirname(first[0].location), ".unlisted.md")
    const bytes = sizedMarkdown("unlisted", 3 * MiB)
    await fs.writeFile(rogue, bytes)
    const listed = await f.list()
    expect(await fs.readFile(rogue, "utf8")).toBe(bytes)
    expect(listed.map((skill) => skill.name)).toEqual(["deploy"])
    expect(listed[0].content).toBe("listed body")
    expect(JSON.stringify(listed)).not.toContain("unlisted")
  })
})
