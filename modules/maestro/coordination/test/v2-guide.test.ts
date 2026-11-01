import fs from "fs"
import path from "path"
import { expect, test } from "bun:test"
import { TaskTool } from "@orchestra/core/tool/task"
import { roster } from "@orchestra/maestro/roster"
import { PlaybookContent } from "../src/playbook-content"
import { SeatSkillRoot } from "../src/seat-skill-root"
import { ConductorV2 } from "../src/v2/conductor"
import { MaestroGuideIndexV2 } from "../src/v2/guide-index-source"

// Maestro's Orchestra guide must cover every app, package and module, name agents only by id, and agree with the code.

const REPO = path.resolve(import.meta.dir, "../../../..")
const GUIDE = path.join(SeatSkillRoot.playbooks, "maestro-orchestra")
const leaves = Object.entries(PlaybookContent.guide).flatMap(([group, names]) =>
  names.map((leaf) => ({ name: `${group}/${leaf}`, text: fs.readFileSync(path.join(GUIDE, group, leaf, "SKILL.md"), "utf8") })),
)

// A unit is a directory under apps, packages or modules with files of its own; a directory holding only directories
// (modules/maestro) is a group, and its children are the units.
function units() {
  return ["apps", "packages", "modules"].flatMap((top) =>
    fs
      .readdirSync(path.join(REPO, top), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const dir = path.join(top, entry.name)
        const children = fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })
        if (children.some((child) => child.isFile() && child.name !== ".DS_Store")) return [dir]
        return children.filter((child) => child.isDirectory()).map((child) => path.join(dir, child.name))
      }),
  )
}

function covers(text: string) {
  const match = text.match(/^covers: \[(.*)\]$/m)
  if (!match) return undefined
  return match[1].split(",").map((unit) => unit.trim()).filter(Boolean)
}

test("every app, package and module is covered by a guide leaf with its own heading", () => {
  const all = units()
  expect(all.length).toBeGreaterThanOrEqual(25)
  expect(all).toEqual(
    expect.arrayContaining(["apps/desktop", "packages/core", "modules/maestro/coordination", "modules/engine-adapters/claude-code", "modules/specialists/backend"]),
  )
  const covered = leaves.flatMap((leaf) => {
    const list = covers(leaf.text)
    if (!list) throw new Error(`${leaf.name} has no covers: frontmatter`)
    for (const unit of list) {
      expect(all).toContain(unit)
      expect(leaf.text).toContain(`## \`${unit}\``)
    }
    return list
  })
  expect(all.filter((unit) => !covered.includes(unit))).toEqual([])
  expect(new Set(covered).size).toBe(covered.length)
})

const labels = roster.filter((member) => member.memberId !== "maestro").map((member) => member.displayName)

// Prose outside code spans and fences; an id in backticks is how a leaf names an agent.
function named(text: string) {
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "")
  return labels.filter((label) => new RegExp(`\\b${label}\\b`).test(prose))
}

test("positive control: the name check sees a default display name in prose and not in an id", () => {
  const label = roster.find((member) => member.memberId === "archie")!.displayName
  expect(named(`Send it to ${label}.`)).toEqual([label])
  expect(named("Send it to `archie`.")).toEqual([])
})

test("the guide names agents by id, never by a default display name", () => {
  const files = fs.readdirSync(GUIDE, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".md"))
  expect(files.length).toBeGreaterThan(Object.keys(PlaybookContent.guide).length)
  const hits = files.flatMap((file) => named(fs.readFileSync(path.join(GUIDE, file), "utf8")).map((label) => `${file}: ${label}`))
  expect(hits).toEqual([])
})

test("the guide states the limits the code enforces", () => {
  const leaf = (name: string) => leaves.find((item) => item.name === name)!.text
  expect(leaf("work/board")).toContain(`After ${ConductorV2.READS} reads without sending work out`)
  expect(leaf("work/board")).toContain(`under ${ConductorV2.LINES} lines and ${ConductorV2.FILES} files`)
  expect(leaf("work/sessions")).toContain(`Depth is capped at ${TaskTool.MAX_DEPTH}`)
})

test("Maestro's guide index lists every leaf within its budget", () => {
  const text = MaestroGuideIndexV2.render()
  expect(text.length).toBeLessThanOrEqual(2000)
  for (const [group, names] of Object.entries(PlaybookContent.guide))
    expect(text).toContain(`- ${group}: ${names.join(", ")}`)
  expect(text).toContain("`maestro-orchestra-<group>-<leaf>`")
})
