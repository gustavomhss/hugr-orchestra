import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { aggregate, join, label, notes, placement } from "./matrix"

const bindingID = Actions.BindingID.make("ab_matrix")
const definition = (id: string, input: Partial<Actions.GraphJob> = {}): Actions.GraphJob => ({ id, name: id, needs: [], steps: [], ...input })
const execution = (id: string, name: string, conclusion = "success", input: Partial<Actions.Job> = {}): Actions.Job =>
  ({ id, bindingID, runID: "38177025125", name, status: "completed", conclusion, steps: [], ...input })
const map = (jobs: Actions.GraphJob[]) => new Map(jobs.map((job) => [job.id, job]))
const ids = (joined: ReadonlyMap<string, Actions.Job[]>) => Object.fromEntries([...joined].map(([id, jobs]) => [id, jobs.map((job) => job.id)]))

// Definitions as the GitHub source reader projects `.github/workflows/test.yml` at e4045f16c04fefb8127ccdac5d653691b8211139.
const reference = map([
  definition("atlas-scope", { name: "atlas scope" }),
  definition("atlas", { needs: ["atlas-scope"] }),
  definition("omni", { name: "omni test binaries (${{ matrix.host }})", matrix: { host: ["ubuntu-latest", "windows-latest"] }, runner: "${{ matrix.host }}" }),
  definition("unit", { name: "unit (${{ matrix.name }} orchestra ${{ matrix.shard }}/${{ matrix.shards }})", needs: ["omni"], matrix: { include: [
    { name: "linux", host: "ubuntu-latest", shard: 1, shards: 2 }, { name: "linux", host: "ubuntu-latest", shard: 2, shards: 2 },
    { name: "windows", host: "windows-latest", shard: 1, shards: 3 }, { name: "windows", host: "windows-latest", shard: 2, shards: 3 },
    { name: "windows", host: "windows-latest", shard: 3, shards: 3 },
  ] } }),
  definition("unit-rest", { name: "unit (${{ matrix.settings.name }} other packages${{ matrix.settings.name == 'linux' && ', godfile, httpapi, relay' || '' }})", needs: ["omni"],
    matrix: { settings: [{ name: "linux", host: "ubuntu-latest" }, { name: "windows", host: "windows-latest" }] } }),
  definition("legacy", { name: "legacy rollback (windows)", needs: ["omni"] }),
  definition("e2e", { name: "e2e (${{ matrix.settings.name }} ${{ matrix.shard }}/3)", matrix: { shard: [1, 2, 3],
    settings: "${{ fromJSON(inputs.windows_e2e && '[{\"name\":\"linux\",\"host\":\"ubuntu-latest\"},{\"name\":\"windows\",\"host\":\"windows-latest\"}]' || '[{\"name\":\"linux\",\"host\":\"ubuntu-latest\"}]') }}" } }),
])
// The 15 job names of run 38177025125, derived from the YAML above (windows_e2e false). The unit-rest names
// evaluate its `&&`/`||` name expression; the other names are visible in the audit screenshot.
const run = [
  "atlas scope", "atlas", "omni test binaries (ubuntu-latest)", "omni test binaries (windows-latest)",
  "unit (linux orchestra 1/2)", "unit (linux orchestra 2/2)", "unit (windows orchestra 1/3)", "unit (windows orchestra 2/3)", "unit (windows orchestra 3/3)",
  "unit (linux other packages, godfile, httpapi, relay)", "unit (windows other packages)", "legacy rollback (windows)",
  "e2e (linux 1/3)", "e2e (linux 2/3)", "e2e (linux 3/3)",
].map((name, index) => execution(String(index + 1), name))

describe("matrix join", () => {
  test("joins all 15 executions of the reference run to its 7 definitions", () => {
    expect(ids(join(reference, run, true))).toEqual({
      "atlas-scope": ["1"], atlas: ["2"], omni: ["3", "4"], unit: ["5", "6", "7", "8", "9"], "unit-rest": ["10", "11"], legacy: ["12"], e2e: ["13", "14", "15"],
    })
  })

  test("joins by name only for GitHub; a native definition identity always wins", () => {
    expect(join(reference, run, false).size).toBe(0)
    expect(ids(join(reference, [execution("1", "anything", "success", { definitionID: "atlas" })], false))).toEqual({ atlas: ["1"] })
  })

  test("names must match whole: extra prefix or suffix stays unjoined", () => {
    expect(join(reference, [execution("1", "xatlas scope"), execution("2", "atlas scope (retry)"), execution("3", "e2e (linux 1/3) extra"),
      execution("4", "pre unit (windows other packages)"), execution("5", "unit (linux orchestra 9/9)")], true).size).toBe(0)
  })

  test("builds exact default names from known cells, honoring exclude", () => {
    const lint = map([definition("lint", { matrix: { os: ["linux", "windows"], node: [20, 22], exclude: [{ os: "windows", node: 20 }] } })])
    expect(ids(join(lint, [execution("1", "lint (linux, 20)"), execution("2", "lint (windows, 22)"), execution("3", "lint (windows, 20)"), execution("4", "lint (anything)")], true)))
      .toEqual({ lint: ["1", "2"] })
  })

  test("excluded cells of a templated name stay unjoined", () => {
    const build = map([definition("build", { name: "build ${{ matrix.os }}", matrix: { os: ["linux", "windows"], exclude: [{ os: "windows" }] } })])
    expect(ids(join(build, [execution("1", "build linux"), execution("2", "build windows")], true))).toEqual({ build: ["1"] })
  })

  test("called workflow jobs join as `<caller> / <called job>`", () => {
    const deploy = map([definition("deploy", { reusable: "./.github/workflows/deploy.yml" })])
    expect(ids(join(deploy, [execution("1", "deploy / release"), execution("2", "deploy"), execution("3", "predeploy / release")], true))).toEqual({ deploy: ["1", "2"] })
  })

  test("adjacent expressions form one hole; ambiguous names stay unjoined", () => {
    const jobs = map([definition("pair", { name: "${{ inputs.a }}${{ inputs.b }}-x" }), definition("a", { name: "build" }), definition("b", { name: "build" })])
    expect(ids(join(jobs, [execution("1", "ab-x"), execution("2", "build"), execution("3", `${"a".repeat(4000)}-y`)], true))).toEqual({ pair: ["1"] })
  })

  test("matrices above GitHub's 256-job limit are not expanded", () => {
    const values = Array.from({ length: 17 }, (_, index) => index)
    const big = map([definition("big", { name: "big ${{ matrix.a }}", matrix: { a: values, b: values } })])
    // Unknown cells fall back to the template pattern.
    expect(ids(join(big, [execution("1", "big 99")], true))).toEqual({ big: ["1"] })
  })
})

describe("matrix presentation", () => {
  test("aggregates a matrix result with GitHub run semantics", () => {
    expect(aggregate([execution("1", "a"), execution("2", "b", "skipped")])).toEqual({ status: "completed", conclusion: "success" })
    expect(aggregate([execution("1", "a"), execution("2", "b", "failure")])).toEqual({ status: "completed", conclusion: "failure" })
    expect(aggregate([execution("1", "a", "failure"), execution("2", "b", "", { status: "in_progress" })])).toEqual({ status: "in_progress" })
    expect(aggregate([])).toEqual({ status: undefined, conclusion: undefined })
  })

  test("labels never show unresolved expressions", () => {
    expect(label(reference.get("omni")!)).toBe("omni")
    expect(label(reference.get("atlas-scope")!)).toBe("atlas-scope")
    expect(placement(reference.get("omni")!)).toBeUndefined()
  })

  test("maps source diagnostics to user copy with job keys", () => {
    expect(notes(["source_partial:matrix_dynamic:jobs.e2e", "source_partial:matrix_dynamic:jobs.unit", "source_unresolved:needs_missing:jobs.a->b", "source_unresolved:job_invalid:jobs.x"])).toEqual([
      { key: "orchestra.actions.graph.note.matrixDynamic", jobs: ["e2e", "unit"] },
      { key: "orchestra.actions.graph.note.needs", jobs: ["a"] },
      { key: "orchestra.actions.graph.note.unresolved", jobs: ["x"] },
    ])
  })
})
