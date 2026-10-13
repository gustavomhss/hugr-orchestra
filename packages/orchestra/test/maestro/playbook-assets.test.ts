import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { PlaybookContent } from "@/maestro/playbook-content"
import { SeatSkillRoot } from "@/maestro/seat-skill-root"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import { seatSkillsModule } from "../../script/seat-skills"
import { tmpdir } from "../fixture/fixture"

const source = path.resolve(import.meta.dir, "../../playbooks")

test("known required playbooks and companions survive embedding and extraction into standalone plugin output", async () => {
  await using tmp = await tmpdir()
  const authored = await PlaybookContent.read(source)
  // Load the exact production virtual module, rather than duplicating its build logic.
  await Bun.write(path.join(tmp.path, "embedded.mjs"), await seatSkillsModule())
  const embedded = await import(path.join(tmp.path, "embedded.mjs"))
  expect(embedded.default.maestro).toEqual(authored)
  expect(Object.keys(embedded.default.maestro).toSorted()).toEqual(PlaybookContent.files)
  const root = await SeatSkillRoot.extract(
    "maestro",
    embedded.default.maestro,
    path.join(tmp.path, "deployed"),
    "asset-fixture",
  )
  const plugin = await ClaudeHostPlugin.build({
    seats: [],
    tools: {},
    root: path.join(tmp.path, "plugins"),
    playbooks: root,
  })
  expect(Object.keys(await PlaybookContent.read(path.join(plugin.path, "skills"))).toSorted()).toEqual(
    PlaybookContent.files,
  )
  expect(await PlaybookContent.read(path.join(plugin.path, "skills"))).toEqual(authored)
})

test("missing required companion, empty and foreign playbook inventories fail before extraction", async () => {
  const authored = await PlaybookContent.read(source)
  expect(() => PlaybookContent.validate({})).toThrow("Invalid or empty")
  const missing = Object.fromEntries(
    Object.entries(authored).filter(([file]) => file !== "maestro-verify/review-checks.md"),
  )
  expect(() => PlaybookContent.validate(missing)).toThrow("differ from required source inventory")
  expect(() => PlaybookContent.validate({ ...authored, "unexpected.md": "foreign" })).toThrow(
    "differ from required source inventory",
  )
  await using tmp = await tmpdir()
  await expect(PlaybookContent.read(path.join(tmp.path, "missing"))).rejects.toThrow(
    "Cannot acquire seat skill source root: maestro",
  )
  await fs.mkdir(path.join(tmp.path, "empty"))
  await expect(PlaybookContent.read(path.join(tmp.path, "empty"))).rejects.toThrow("Invalid or empty")
})
