import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { aggregate, join, label, notes, placement } from "./matrix"

const bindingID = Actions.BindingID.make("ab_matrix")
const definition = (id: string, input: Partial<Actions.GraphJob> = {}): Actions.GraphJob => ({ id, name: id, needs: [], steps: [], ...input })
const execution = (id: string, name: string, conclusion = "success", input: Partial<Actions.Job> = {}): Actions.Job =>
  ({ id, bindingID, runID: "38177025125", name, status: "completed", conclusion, steps: [], ...input })
const definitions = new Map([
  definition("atlas-scope", { name: "atlas scope" }),
  definition("atlas", { needs: ["atlas-scope"] }),
  definition("omni", { name: "omni test binaries (${{ matrix.host }})", matrix: { host: ["ubuntu-latest", "windows-latest"] }, runner: "${{ matrix.host }}" }),
  definition("unit", { name: "unit (${{ matrix.name }} orchestra ${{ matrix.shard }}/${{ matrix.shards }})", needs: ["omni"], matrix: { include: [
    { name: "linux", shard: 1, shards: 2 }, { name: "linux", shard: 2, shards: 2 }, { name: "windows", shard: 1, shards: 1 },
  ] } }),
  definition("unit-rest", { name: "unit (${{ matrix.name }} ${{ matrix.label }})", needs: ["omni"], matrix: { include: [
    { name: "linux", label: "httpapi, relay" }, { name: "windows", label: "core" },
  ] } }),
  definition("e2e", { name: "e2e (${{ matrix.settings.name }} ${{ matrix.shard }}/3)", matrix: "${{ fromJSON(needs.plan.outputs.matrix) }}" }),
  definition("lint", { matrix: { os: ["linux", "windows"], node: [20, 22], exclude: [{ os: "windows", node: 20 }] } }),
].map((job) => [job.id, job]))

describe("matrix join", () => {
  test("joins GitHub executions to the one definition that can produce their name", () => {
    const joined = join(definitions, [
      execution("1", "atlas scope"), execution("2", "atlas"),
      execution("3", "omni test binaries (ubuntu-latest)"), execution("4", "omni test binaries (windows-latest)"),
      execution("5", "unit (linux orchestra 1/2)"), execution("6", "unit (linux orchestra 2/2)"), execution("7", "unit (windows orchestra 1/1)"),
      execution("8", "unit (linux httpapi, relay)"), execution("9", "unit (windows core)"),
      execution("10", "e2e (linux 1/3)"), execution("11", "e2e (windows 3/3)"),
      execution("12", "lint (linux, 20)"),
    ])
    expect(Object.fromEntries([...joined].map(([id, jobs]) => [id, jobs.map((job) => job.id)]))).toEqual({
      "atlas-scope": ["1"], atlas: ["2"], omni: ["3", "4"], unit: ["5", "6", "7"], "unit-rest": ["8", "9"], e2e: ["10", "11"], lint: ["12"],
    })
  })

  test("leaves unknown and ambiguous executions unjoined", () => {
    const twins = new Map([definition("a", { name: "build" }), definition("b", { name: "build" }), definition("c", { name: "${{ inputs.name }}" })].map((job) => [job.id, job]))
    // `build` fits a, b and the open template c; only c can produce `deploy`.
    expect([...join(twins, [execution("1", "build"), execution("2", "deploy")])].map(([id, jobs]) => [id, jobs.map((job) => job.id)])).toEqual([["c", ["2"]]])
    expect(join(definitions, [execution("1", "unit (linux orchestra 9/9)"), execution("2", "omni test binaries (macos-latest)")]).size).toBe(0)
  })

  test("keeps a native definition identity and a never-expanded matrix name", () => {
    const joined = join(definitions, [execution("1", "anything", "success", { definitionID: "atlas" }), execution("2", "omni test binaries (${{ matrix.host }})", "skipped")])
    expect([...joined.keys()]).toEqual(["atlas", "omni"])
  })
})

describe("matrix presentation", () => {
  test("aggregates a matrix result", () => {
    expect(aggregate([execution("1", "a"), execution("2", "b", "skipped")])).toEqual({ status: "completed", conclusion: "success" })
    expect(aggregate([execution("1", "a"), execution("2", "b", "failure")])).toEqual({ status: "completed", conclusion: "failure" })
    expect(aggregate([execution("1", "a"), execution("2", "b", "", { status: "in_progress" })])).toEqual({ status: "in_progress" })
    expect(aggregate([])).toEqual({ status: undefined, conclusion: undefined })
  })

  test("labels never show unresolved expressions", () => {
    expect(label(definitions.get("omni")!)).toBe("omni")
    expect(label(definitions.get("atlas-scope")!)).toBe("atlas scope")
    expect(placement(definitions.get("omni")!)).toBeUndefined()
  })

  test("maps source diagnostics to user copy with job keys", () => {
    expect(notes(["source_partial:matrix_dynamic:jobs.e2e", "source_partial:matrix_dynamic:jobs.unit", "source_unresolved:needs_missing:jobs.a->b", "source_unresolved:job_invalid:jobs.x"])).toEqual([
      { key: "orchestra.actions.graph.note.matrixDynamic", jobs: ["e2e", "unit"] },
      { key: "orchestra.actions.graph.note.needs", jobs: ["a"] },
      { key: "orchestra.actions.graph.note.unresolved", jobs: ["x"] },
    ])
  })
})
