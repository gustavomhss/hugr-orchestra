import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Seats } from "@orchestra/maestro/seats"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { tmpdir } from "../../../../packages/core/test/fixture/tmpdir"

// JE-AC-M1 (specs/jimmy-engine/acceptance.md, method.md §2 and §4). The method lives in the host and the tools, so the
// prompt stays short, never asks the model to write the card the host assembles from `inquiry close`, names only the
// seat's own tools, and the seat ships one optional reference skill. Every check also runs on a mutated input, so a
// check that cannot fail does not pass.

const prompt = Seats.all.jimmy.prompt
const tools: readonly string[] = [...ResearchSeatTools.OWN, ...ResearchSeatTools.RETAINED]

const words = (text: string) => text.split(/\s+/).filter(Boolean).length
// A fence, the word "fenced" or the card's own field names mean the prose still tells the model to write the card.
const writesCard = (text: string) =>
  /```|~~~|\bfenced\b|\b(?:findingRefs|evidenceRefs|documentRefs)\b|jimmy-result\s+(?:JSON|block|card)/i.test(text)
const unknownTools = (text: string) =>
  [...text.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((match) => match[0]).filter((name) => !tools.includes(name))
const entries = async (dir: string) => (await fs.readdir(dir)).toSorted()

describe("JE-AC-M1 jimmy method", () => {
  test("the prompt is under 400 words", () => {
    expect(words(prompt)).toBeLessThan(400)
    expect(words(`${prompt} ${"word ".repeat(400 - words(prompt))}`)).toBeGreaterThanOrEqual(400)
  })

  test("the prompt never tells the seat to write a card", () => {
    expect(prompt).toContain("`inquiry close`")
    expect(writesCard(prompt)).toBe(false)
    expect(writesCard(`${prompt}\nEnd with exactly one fenced jimmy-result JSON card.`)).toBe(true)
    expect(writesCard(`${prompt}\nfindingRefs is an array of RecordRef objects.`)).toBe(true)
  })

  test("every tool the prompt names is one of the seat's own", () => {
    expect(tools).toContain("inquiry")
    expect(unknownTools(prompt)).toEqual([])
    expect(unknownTools(`${prompt} Use repo_symbols first.`)).toEqual(["repo_symbols"])
  })

  test("the seat ships only the optional jimmy-reference skill, within its word caps", async () => {
    const root = Seats.skillSource("jimmy")
    expect(Seats.all.jimmy.skills).toEqual(["jimmy-reference"])
    expect(prompt).toContain("`jimmy-reference`")
    expect(await entries(root)).toEqual(["jimmy-reference"])
    const files = await entries(path.join(root, "jimmy-reference"))
    expect(files).toEqual(["SKILL.md", "calibration.md", "web-research.md"])
    // method.md §4: a one-paragraph index of at most 150 words and companions of at most 600 each.
    const over = (await Promise.all(files.map(async (file) =>
      ({ file, words: words(await Bun.file(path.join(root, "jimmy-reference", file)).text()) }))))
      .filter((item) => item.words > (item.file === "SKILL.md" ? 150 : 600))
    expect(over).toEqual([])

    await using tmp = await tmpdir()
    await fs.mkdir(path.join(tmp.path, "jimmy-reference"))
    await fs.mkdir(path.join(tmp.path, "jimmy-discovery"))
    expect(await entries(tmp.path)).not.toEqual(["jimmy-reference"])
  })
})
