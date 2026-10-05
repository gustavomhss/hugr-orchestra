import { describe, expect, test } from "bun:test"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { documentationRoots, isDocument, resolveDocumentLink } from "./orchestra-evidence-docs-path"

const node = (path: string, type: FileNode["type"] = "file"): FileNode => ({
  name: path.split("/").at(-1)!,
  path,
  absolute: `/repo/${path}`,
  type,
  ignored: false,
})

describe("documentationRoots", () => {
  test("takes README.md and AGENTS.md at the root, in that order, and the docs folder", () => {
    const roots = documentationRoots([
      node("AGENTS.md"),
      node("docs", "directory"),
      node("README.md"),
      node("CHANGELOG.md"),
      node("src", "directory"),
    ])
    expect(roots.files.map((item) => item.path)).toEqual(["README.md", "AGENTS.md"])
    expect(roots.folder?.path).toBe("docs")
  })

  test("a workspace without them has no documentation entries", () => {
    const roots = documentationRoots([node("readme.txt"), node("docs"), node("src", "directory")])
    expect(roots.files).toEqual([])
    expect(roots.folder).toBeUndefined()
  })
})

describe("isDocument", () => {
  test("accepts Markdown, MDX and text only", () => {
    expect(["a.md", "b.MDX", "c.txt"].every(isDocument)).toBe(true)
    expect(["a.tsx", "b.html", "c.md.js", "md"].some(isDocument)).toBe(false)
  })
})

describe("resolveDocumentLink", () => {
  test("relative document links resolve from the document's folder", () => {
    expect(resolveDocumentLink("docs/guide/intro.md", "setup.md")).toEqual({
      type: "document",
      path: "docs/guide/setup.md",
    })
    expect(resolveDocumentLink("docs/guide/intro.md", "../api.mdx#types")).toEqual({
      type: "document",
      path: "docs/api.mdx",
    })
    expect(resolveDocumentLink("README.md", "./docs/notes.txt")).toEqual({ type: "document", path: "docs/notes.txt" })
  })

  test("nothing climbs above the workspace root or leaves through another scheme", () => {
    for (const href of ["../outside.md", "docs/../../outside.md", "..\\..\\outside.md", "%2e%2e/outside.md"])
      expect(resolveDocumentLink("README.md", href)).toEqual({ type: "inert" })
    for (const href of ["/etc/passwd.md", "file:///etc/passwd.md", "javascript:alert(1)", "data:text/plain,x.md"])
      expect(resolveDocumentLink("docs/a.md", href)).toEqual({ type: "inert" })
    expect(resolveDocumentLink("docs/a.md", "#section")).toEqual({ type: "inert" })
    expect(resolveDocumentLink("docs/a.md", "../src/index.ts")).toEqual({ type: "inert" })
  })

  test("web links open outside the app", () => {
    expect(resolveDocumentLink("README.md", "https://opencode.ai/docs?x=1")).toEqual({
      type: "external",
      url: "https://opencode.ai/docs?x=1",
    })
    expect(resolveDocumentLink("README.md", "http://")).toEqual({ type: "inert" })
  })
})
