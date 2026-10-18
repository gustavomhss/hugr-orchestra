import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { createHash } from "node:crypto"
import { ActionsGraph } from "../../src/actions/source/graph"

const fixture = await Bun.file(new URL("./fixtures/source-github.yml", import.meta.url)).text()
const source = (text: string) => Object.freeze(Actions.Source.make({
  bindingID: Actions.BindingID.make("ab_source"), path: ".github/workflows/build.yml",
  ref: "feature/source", commit: "commit-at-read", version: "immutable-blob", text, editable: false,
}))

describe("GitHub source definitions", () => {
  test("public Orchestra test.yml yields seven definitions, never fifteen recorded executions", async () => {
    // Exact public source at e4045f16c04fefb8127ccdac5d653691b8211139; restore LF after Windows Git checkout.
    const text = (await Promise.all(["public-test-1.yml", "public-test-2.yml"].map((name) =>
      Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text()))).join("").replaceAll("\r\n", "\n")
    expect(createHash("sha256").update(text).digest("hex")).toBe("59e0d277d475267e372ac3fe27b2abde5370939455f16ccae45ca3c2e7955738")
    const input = Object.freeze({ ...source(text), path: ".github/workflows/test.yml", commit: "e4045f16c04fefb8127ccdac5d653691b8211139" })
    const graph = ActionsGraph.parse("github", input)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(text)
    expect(graph.state).toBe("partial")
    expect(graph.jobs.map((job) => job.id)).toEqual(["atlas-scope", "atlas", "omni", "unit", "unit-rest", "legacy", "e2e"])
    expect(graph.jobs.map((job) => job.needs)).toEqual([[], ["atlas-scope"], [], ["omni"], ["omni"], ["omni"], []])
    expect(graph.jobs[3].matrix).toMatchObject({ include: [
      { name: "linux", host: "ubuntu-latest", shard: 1, shards: 2 },
      { name: "linux", host: "ubuntu-latest", shard: 2, shards: 2 },
      { name: "windows", host: "windows-latest", shard: 1, shards: 3 },
      { name: "windows", host: "windows-latest", shard: 2, shards: 3 },
      { name: "windows", host: "windows-latest", shard: 3, shards: 3 },
    ] })
    expect(graph.jobs[3].steps.find((step) => step.name === "Run orchestra tests")?.condition).toBe("steps.previous.outputs.hit != 'true'")
    expect(graph.jobs[3].steps.find((step) => step.name === "Run orchestra tests")?.run).toContain("bun script/test-shard.ts")
    expect(graph.jobs[3].steps.find((step) => step.name === "Linux sandbox dependencies")?.condition).toBe("runner.os == 'Linux'")
    expect(graph.diagnostics).toEqual(["source_partial:matrix_dynamic:jobs.e2e"])
    expect(graph.stages).toBeUndefined()
    expect(graph.triggers).toMatchObject({ workflow_dispatch: { inputs: { windows_e2e: { type: "boolean", default: false } } } })
  })

  test("preserves native jobs, dependency edges, raw matrix and immutable commented source", () => {
    const input = source(fixture)
    const graph = ActionsGraph.parse("github", input)
    expect(Schema.is(Actions.Graph)(graph)).toBe(true)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(fixture)
    expect(graph.source.commit).toBe("commit-at-read")
    expect(graph.source.version).toBe("immutable-blob")
    expect(graph.state).toBe("partial")
    expect(graph.jobs.map((job) => job.id)).toEqual(["build", "audit", "call", "dynamic"])
    expect(graph.jobs.map((job) => job.needs)).toEqual([[], ["build"], ["build", "audit"], ["build"]])
    expect(graph.stages).toBeUndefined()
    expect(graph.jobs.every((job) => job.stage === undefined)).toBe(true)
    expect(graph.jobs[0].runner).toEqual(["self-hosted", "linux", "x64"])
    expect(graph.jobs[0].matrix).toEqual({
      os: ["linux", "windows"], version: [20, 22],
      include: [{ os: "macos", version: 24 }], exclude: [{ os: "windows", version: 20 }],
    })
    expect(graph.jobs[0].configuration).toMatchObject({
      "unknown-native-key": { nested: [true, null, 3] },
      environment: { name: "staging", url: "${{ steps.deploy.outputs.url }}" },
      strategy: { "fail-fast": false },
    })
    expect(graph.jobs[0].steps).toEqual([
      { name: "checkout", uses: "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5", run: undefined, condition: undefined },
      { name: "Build", run: "echo keep unknown job keys\nnpm run build\n", uses: undefined, condition: "${{ vendor.unknown('leave me literal') }}" },
    ])
    expect(graph.jobs[1].condition).toBe("false")
    expect(graph.jobs[2].reusable).toBe("owner/repository/.github/workflows/release.yml@0123456789abcdef")
    expect(graph.jobs[2].steps).toEqual([])
    expect(graph.jobs[3].matrix).toBe("${{ fromJSON(needs.build.outputs.matrix) }}")
    expect(graph.diagnostics).toContain("source_partial:matrix_dynamic:jobs.dynamic")
    expect(graph.diagnostics).toContain("source_partial:reusable_unresolved:jobs.call")
    expect(graph.triggers).toEqual({
      push: { branches: ["dev"] }, workflow_dispatch: { inputs: { target: {
        type: "choice", required: true, options: ["staging", "production"], default: "staging",
      } } },
    })
  })

  test("static matrix remains one complete definition with sequential steps", () => {
    const graph = ActionsGraph.parse("github", source("on: [push, workflow_dispatch]\njobs:\n  build:\n    strategy:\n      matrix:\n        os: [linux, windows]\n    runs-on: '${{ matrix.os }}'\n    steps:\n      - run: build\n      - run: test\n"))
    expect(graph.state).toBe("complete")
    expect(graph.jobs).toHaveLength(1)
    expect(graph.jobs[0].steps.map((step) => step.run)).toEqual(["build", "test"])
    expect(graph.triggers).toEqual(["push", "workflow_dispatch"])
  })

  test("missing needs and cycles retain inspectable source jobs, fail with named diagnostics", () => {
    const missing = ActionsGraph.parse("github", source("on: push\njobs:\n  present: {needs: missing, steps: []}\n"))
    expect(missing.state).toBe("unresolved")
    expect(missing.jobs.map((job) => job.id)).toEqual(["present"])
    expect(missing.jobs[0].needs).toEqual(["missing"])
    expect(missing.diagnostics).toContain("source_unresolved:needs_missing:jobs.present->missing")
    const cycle = ActionsGraph.parse("github", source("on: push\njobs:\n  a: {needs: b}\n  b: {needs: [a]}\n  independent: {steps: []}\n"))
    expect(cycle.state).toBe("unresolved")
    expect(cycle.jobs.map((job) => job.id)).toEqual(["a", "b", "independent"])
    expect(cycle.diagnostics).toContain("source_unresolved:needs_cycle:a,b")
  })

  test("nested dynamic matrix stays raw and invalid needs never become a complete DAG", () => {
    const graph = ActionsGraph.parse("github", source("on: push\njobs:\n  a:\n    needs: {guess: no}\n    strategy:\n      matrix: {version: '${{ fromJSON(inputs.versions) }}'}\n"))
    expect(graph.state).toBe("unresolved")
    expect(graph.jobs[0].matrix).toEqual({ version: "${{ fromJSON(inputs.versions) }}" })
    expect(graph.diagnostics).toContain("source_unresolved:needs_invalid:jobs.a")
    expect(graph.diagnostics).toContain("source_partial:matrix_dynamic:jobs.a")
  })
})
