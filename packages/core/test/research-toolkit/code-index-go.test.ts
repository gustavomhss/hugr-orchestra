import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { CodeIndexFilter } from "../../src/research-toolkit/code-index/filter"
import { CodeIndexGo } from "../../src/research-toolkit/code-index/go"
import { CodeIndexResolve } from "../../src/research-toolkit/code-index/resolve"
import { CodeIndexTreeSitter } from "../../src/research-toolkit/code-index/tree-sitter"
import { tmpdir } from "../fixture/tmpdir"

// X6, Go: the scip-go run, the structural layer over the Go grammar and module-path import resolution.

const SOURCE = `package helpers

import (
	"fmt"
	str "strings"
	_ "embed"
	"example.com/fixture/util"
)

const Limit = 3
var hidden = 1

type Box struct {
	Name string
	size int
}

type Runner interface {
	Run() int
}

func (b *Box) Run() int { return len(b.Name) }

func DoubleIt(value int) int {
	local := 2
	return value * local
}
`

describe("the Go half of the code index", () => {
  // Mutation control: drop `--module-version 0` from CodeIndexGo.args; the version then comes from git and this fails.
  test("scip-go indexes the module root at a pinned version into the host's output, offline", () => {
    expect(CodeIndexGo.args("/s/index.scip")).toEqual([
      "index", "--quiet", "--module-root", ".", "--module-version", "0", "--output", "/s/index.scip",
    ])
    expect(CodeIndexGo.ENV).toEqual({ GOPROXY: "off", GOTOOLCHAIN: "local" })
    expect(CodeIndexGo.TOOLCHAIN).toBe("go")
  })

  test("Go sources select the Go grammar and generated protobuf code is skipped", () => {
    expect(CodeIndexFilter.select(["main.go", "api/x.pb.go"])).toEqual({
      files: [{ path: "main.go", grammar: "go" }],
      skipped: [{ path: "api/x.pb.go", reason: "generated" }],
    })
  })

  // Mutation control: make CodeIndexGo.exported return true; `hidden` and `Box.size` go red.
  test("definitions carry kinds, members and the upper-case export rule; imports keep aliases", async () => {
    const result = await Effect.runPromise(CodeIndexTreeSitter.extract("helpers/helpers.go", SOURCE, "go"))
    const by = Object.fromEntries(result.definitions.map((item) => [item.qualified, item]))
    expect(result.coverage).toEqual({ complete: true })
    expect(by.Limit).toMatchObject({ kind: "constant", startLine: 10, exported: true })
    expect(by.hidden).toMatchObject({ kind: "variable", exported: false })
    expect(by.Box).toMatchObject({ kind: "type", startLine: 13, endLine: 16, exported: true })
    expect(by["Box.Name"]).toMatchObject({ kind: "property", exported: true })
    expect(by["Box.size"]).toMatchObject({ kind: "property", exported: false })
    expect(by["Runner.Run"]).toMatchObject({ kind: "method", startLine: 19 })
    expect(by.Run).toMatchObject({ kind: "method", startLine: 22 })
    expect(by.DoubleIt).toMatchObject({ kind: "function", startLine: 24, endLine: 27, exported: true })
    // Locals inside bodies are not outline entries.
    expect(by.local).toBeUndefined()
    expect(result.imports).toEqual([
      { specifier: "fmt", line: 4, form: "static", names: [] },
      { specifier: "strings", line: 5, form: "static", names: ["str"] },
      { specifier: "embed", line: 6, form: "static", names: [] },
      { specifier: "example.com/fixture/util", line: 7, form: "static", names: [] },
    ])
  })

  // Mutation control: make CodeIndexGo.resolver return `{ kind: "package" }` for every path; the module cases go red.
  test("a path under the importing file's module resolves to the package's first non-test file", async () => {
    await using dir = await tmpdir()
    const files: Record<string, string> = {
      "go/go.mod": "module example.com/fixture\n\ngo 1.21\n",
      "go/util/b.go": "package util\n",
      "go/util/a_test.go": "package util\n",
      "go/util/c.go": "package util\n",
      "go/cmd/main.go": "package main\n",
    }
    await Promise.all(Object.entries(files).map(async ([file, text]) => {
      await fs.mkdir(path.join(dir.path, path.dirname(file)), { recursive: true })
      await Bun.write(path.join(dir.path, file), text)
    }))
    const resolver = await Effect.runPromise(CodeIndexResolve.make(dir.path))
    expect(resolver.resolve("go/cmd/main.go", "example.com/fixture/util")).toEqual({ kind: "alias", to: "go/util/b.go" })
    expect(resolver.resolve("go/cmd/main.go", "example.com/fixture/absent")).toEqual({ kind: "unresolved" })
    expect(resolver.resolve("go/cmd/main.go", "example.com/fixturex/util")).toEqual({ kind: "package" })
    expect(resolver.resolve("go/cmd/main.go", "fmt")).toEqual({ kind: "package" })
  })
})
