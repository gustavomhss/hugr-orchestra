import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { WebSearchTool } from "@orchestra/core/tool/websearch"

const parallel = JSON.stringify({ search_id: "s", results: [
  { url: "https://docs.python.org/3/library/re.html", title: "re", excerpts: ["re"] },
  { url: "https://evil.example/re", title: "copy", excerpts: ["copy"] },
  { url: "https://python.org.evil.example/re", title: "lookalike", excerpts: ["x"] },
] })
const exa = [
  "Title: re\nURL: https://docs.python.org/3/library/re.html\nHighlights:\nregex docs\n\n",
  "Title: copy\nURL: https://evil.example/re\nHighlights:\ncopied docs\n",
].join("")

describe("websearch domain restriction (J1.9)", () => {
  test("a domain admits itself and its subdomains, never a lookalike or a non-web scheme", () => {
    expect(WebSearchTool.allows(["python.org"], "https://docs.python.org/x")).toBe(true)
    expect(WebSearchTool.allows(["python.org"], "https://python.org")).toBe(true)
    expect(WebSearchTool.allows(["python.org"], "https://python.org.evil.example/")).toBe(false)
    expect(WebSearchTool.allows(["python.org"], "https://notpython.org/")).toBe(false)
    expect(WebSearchTool.allows(["python.org"], "ftp://python.org/")).toBe(false)
    expect(WebSearchTool.allows(["python.org"], "not a url")).toBe(false)
  })

  test("the domain list decodes only lower-case host names, 1-32 of them", () => {
    const decode = Schema.decodeUnknownSync(WebSearchTool.Domains)
    expect(decode(["docs.python.org", "github.com"])).toEqual(["docs.python.org", "github.com"])
    for (const bad of [[], ["Python.org"], ["https://python.org"], ["python.org/x"], ["localhost"], Array(33).fill("a.com")])
      expect(() => decode(bad)).toThrow()
  })

  test("Parallel results outside the list are withheld and counted", () => {
    const restricted = WebSearchTool.restrict("parallel", parallel, ["python.org"])
    expect(restricted.withheld).toBe(2)
    expect(restricted.text).toContain("docs.python.org")
    expect(restricted.text).not.toContain("evil.example")
  })

  test("Exa blocks outside the list are withheld and counted", () => {
    const restricted = WebSearchTool.restrict("exa", exa, ["python.org"])
    expect(restricted.withheld).toBe(1)
    expect(restricted.text).toContain("regex docs")
    expect(restricted.text).not.toContain("evil.example")
  })

  test("a response that cannot be attributed to URLs returns no result", () => {
    for (const [provider, text] of [["parallel", "not json"], ["exa", "Title: x\nno url line\n"], ["exa", "free text https://evil.example"]] as const) {
      const restricted = WebSearchTool.restrict(provider, text, ["python.org"])
      expect(restricted.withheld).toBeUndefined()
      expect(restricted.text).not.toContain("evil.example")
    }
  })

  test("Parallel queries carry one site: operator per domain, at most four", () => {
    expect(WebSearchTool.parallelQueries("regex", undefined)).toEqual(["regex"])
    expect(WebSearchTool.parallelQueries("regex", ["python.org", "a.com", "b.com", "c.com", "d.com"]))
      .toEqual(["regex site:python.org", "regex site:a.com", "regex site:b.com", "regex site:c.com"])
  })
})
