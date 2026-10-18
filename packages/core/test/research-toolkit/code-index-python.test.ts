import { describe, expect, test } from "bun:test"
import { CodeIndexPython } from "../../src/research-toolkit/code-index/python"
import { Scip } from "../../src/research-toolkit/code-index/scip"

describe("the Python half of the indexer run", () => {
  test("the arguments pin the version, name the shard's directory and write to the host's output", () => {
    expect(CodeIndexPython.args({ project: ".", output: "/s/index.scip" })).toEqual([
      "index", "--quiet", "--project-name", "root", "--project-version", "0", "--output", "/s/index.scip",
    ])
    expect(CodeIndexPython.args({ project: "services/api", output: "/s/o" })).toContain("services-api")
  })

  test("a module's __init__ symbol is not a stored definition, and a function or class is", () => {
    expect(CodeIndexPython.indexable("scip-python python demo 0 `pkg.core`/__init__:")).toBe(false)
    expect(CodeIndexPython.indexable("scip-python python demo 0 `pkg.core`/compute().")).toBe(true)
    expect(CodeIndexPython.indexable("scip-python python demo 0 `pkg.core`/Box#run().")).toBe(true)
    // The descriptor name of a backtick-quoted module path still reads as the function's own name.
    expect(Scip.descriptorName("scip-python python demo 0 `pkg.core`/compute().")).toBe("compute")
    expect(Scip.descriptorName("scip-python python demo 0 `pkg.core`/Box#run().")).toBe("run")
  })
})
