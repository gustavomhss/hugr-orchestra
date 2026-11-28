import fs from "fs/promises"
import path from "path"
import { expect, test } from "bun:test"
import { markdown, remote } from "./fixture/skill-discovery-bounds"

test("CONTROL H14 version: exactly 4096 ASCII bytes publish and reread the same real cache", async () => {
  await using f = await remote()
  const version = "v".repeat(4096)
  f.state.skills = [{ name: "deploy", version, files: ["SKILL.md"] }]
  f.files.set("deploy/SKILL.md", markdown("deploy", "original body"))
  const first = await f.list()
  expect(first.map((skill) => skill.name)).toEqual(["deploy"])
  const marker = path.join(path.dirname(first[0].location), ".orchestra-version")
  expect(await fs.readFile(marker, "utf8")).toBe(version)
  expect((await fs.stat(marker)).size).toBe(4096)
  const before = f.requests.length
  const second = await f.list()
  expect(second.map((skill) => [skill.name, skill.content, skill.location])).toEqual([
    ["deploy", "original body", first[0].location],
  ])
  expect(f.requests.slice(before).map((item) => item.file)).toEqual(["index.json"])
  expect(await fs.readFile(marker, "utf8")).toBe(version)
})

test("H14 version: 4097 ASCII bytes refuse the first pull before file HTTP or cache publication", async () => {
  await using f = await remote()
  f.state.skills = [{ name: "deploy", version: "v".repeat(4097), files: ["SKILL.md"] }]
  f.files.set("deploy/SKILL.md", markdown("deploy", "must not publish"))
  expect(await f.paths()).toEqual([])
  const listed = await f.list()
  expect(f.requests[0]?.file).toBe("index.json")
  expect(listed).toEqual([])
  expect(f.requests.map((item) => item.file)).toEqual(["index.json"])
  expect(await f.paths()).toEqual([])
})

test("H14 version: oversized UTF8 refresh preserves old bytes and admits an independent cached skill", async () => {
  await using f = await remote()
  f.state.skills = [
    { name: "deploy", version: "v1", files: ["SKILL.md"] },
    { name: "good", version: "v1", files: ["SKILL.md"] },
  ]
  const old = markdown("deploy", "old body")
  f.files.set("deploy/SKILL.md", old)
  f.files.set("good/SKILL.md", markdown("good", "independent body"))
  const first = await f.list()
  expect(first.map((skill) => skill.name).toSorted()).toEqual(["deploy", "good"])
  const filepath = first.find((skill) => skill.name === "deploy")!.location
  const root = path.dirname(filepath)
  const marker = path.join(root, ".orchestra-version")
  const sentinel = path.join(root, "owned-sentinel.bin")
  await fs.writeFile(sentinel, "prior unlisted sentinel bytes")
  expect(await fs.readFile(filepath, "utf8")).toBe(old)
  expect(await fs.readFile(marker, "utf8")).toBe("v1")
  const version = "é".repeat(2049)
  expect(Buffer.byteLength(version, "utf8")).toBe(4098)
  f.state.skills[0].version = version
  f.files.set("deploy/SKILL.md", markdown("deploy", "must not replace"))
  const before = f.requests.length
  const listed = await f.list()
  expect(listed.map((skill) => skill.name)).toEqual(["good"])
  expect(listed[0].content).toBe("independent body")
  expect(f.requests.slice(before).map((item) => item.file)).toEqual(["index.json"])
  expect(await fs.readFile(filepath, "utf8")).toBe(old)
  expect(await fs.readFile(marker, "utf8")).toBe("v1")
  expect(await fs.readFile(sentinel, "utf8")).toBe("prior unlisted sentinel bytes")
  expect((await f.paths()).some((file) => /\.(tmp|old)-/.test(file))).toBe(false)
})
