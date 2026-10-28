import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"
import { RelaySprint } from "@orchestra/schema/relay-sprint"

const doc = await Bun.file(
  path.resolve(
    import.meta.dirname,
    "../../../../modules/specialists/archie/skills/archie-work-package/native-fields/SKILL.md",
  ),
).text()

// Keys the doc lists as "- `key`:" bullets under a "## <Name> keys" heading.
function documented(heading: string) {
  const section = doc.split(/^## /m).find((part) => part.startsWith(`${heading} keys`))
  if (!section) throw new Error(`native-fields.md has no "${heading} keys" section`)
  return [...section.matchAll(/^- `([^`]+)`:/gm)].map((match) => match[1]).sort()
}

describe("archie native field reference", () => {
  test("example decodes as RelaySprint.Sprint", () => {
    const block = /```json\n([\s\S]*?)\n```/.exec(doc)
    if (!block) throw new Error("native-fields.md has no json example")
    const sprint = Schema.decodeUnknownSync(RelaySprint.Sprint)(JSON.parse(block[1]))
    expect(sprint.work_packages.length).toBe(2)
    expect(sprint.work_packages.at(-1)?.checklist?.map((control) => control.host_check)).toEqual([
      "package-verification",
      "cold-review",
    ])
  })

  test.each([
    ["Sprint", RelaySprint.Sprint],
    ["WorkPackage", RelaySprint.WorkPackage],
    ["Control", RelaySprint.Control],
  ])("%s keys match the schema fields", (heading, schema) => {
    expect(documented(heading)).toEqual(Object.keys(schema.fields).sort())
  })
})
