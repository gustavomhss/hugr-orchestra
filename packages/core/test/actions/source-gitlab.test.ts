import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { ActionsGraph } from "../../src/actions/source/graph"

const fixture = await Bun.file(new URL("./fixtures/source-gitlab.yml", import.meta.url)).text()
const source = (text: string) => Actions.Source.make({
  bindingID: Actions.BindingID.make("ab_source"), path: ".gitlab-ci.yml",
  ref: "feature/source", version: "immutable-blob", text, editable: false,
})

describe("GitLab native source", () => {
  test("native header plus body exposes exact inputs and preserves literal DAG/raw comments without evaluation", async () => {
    const text = (await Bun.file(new URL("./fixtures/source-gitlab-inputs.yml", import.meta.url)).text()).replaceAll("\r\n", "\n")
    const input = Object.freeze(source(text))
    const graph = ActionsGraph.parse("gitlab", input)
    expect(Schema.is(Actions.Graph)(graph)).toBe(true)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(text)
    expect(graph.state).toBe("partial")
    expect(graph.jobs.map((job) => job.id)).toEqual(["build", "test", "deploy"])
    expect(graph.jobs.map((job) => job.needs)).toEqual([[], ["build"], ["build"]])
    expect(graph.jobs.map((job) => job.stage)).toEqual(["build", "test", undefined])
    expect(graph.header).toMatchObject({ spec: { inputs: {
      "future-native-input": { type: "string", unknown: { keep: "native" } },
    } } })
    expect(graph.inputs).toEqual([
      { name: "environment", type: "string", required: false, description: "Deploy target", default: "staging", options: ["staging", "production"] },
      { name: "retries", type: "number", required: false, description: undefined, default: 0, options: [0, 1, 2] },
      { name: "publish", type: "boolean", required: false, description: undefined, default: false, options: undefined },
      { name: "services", type: "array", required: false, description: undefined, default: [], options: ["api", "worker"] },
      { name: "required-string", type: "string", required: true, description: undefined, default: undefined, options: undefined },
      { name: "future-native-input", type: "string", required: true, description: undefined, default: undefined, options: undefined },
    ])
    expect(graph.jobs[0].configuration).toMatchObject({ script: "echo literal separator below\n---\n" })
    expect(graph.jobs[2].configuration).toMatchObject({ stage: "$[[ inputs.environment ]]", tags: "$[[ inputs.services ]]" })
    expect(graph.diagnostics.some((message) => message.includes("inputs_unresolved"))).toBe(true)
  })

  test("header-only inputs keep defaults/required identity; conditional definitions stay raw and partial", () => {
    const graph = ActionsGraph.parse("gitlab", source("spec:\n  inputs:\n    literal: {type: boolean, default: false, options: [true, false]}\n    conditional: {rules: [{if: '$[[ inputs.literal ]]', default: value}]}\n---\njob: {script: own}\n"))
    expect(graph.state).toBe("partial")
    expect(graph.inputs).toEqual([{ name: "literal", type: "boolean", required: false, description: undefined, default: false, options: [true, false] }])
    expect(graph.header).toMatchObject({ spec: { inputs: { conditional: { rules: [{ if: "$[[ inputs.literal ]]", default: "value" }] } } } })
    expect(graph.diagnostics.some((message) => message.includes("input_unresolved:conditional"))).toBe(true)
  })

  test.each([
    "first: {script: first}\n---\nsecond: {script: second}\n",
    "spec: {inputs: {}}\n---\njob: {script: own}\n---\nextra: {script: extra}\n",
    "spec: {inputs: {}}\njob: {script: own}\n",
    "spec: {inputs: {}}\n---\nspec: {inputs: {}}\njob: {script: own}\n",
  ])("arbitrary GitLab multi-doc or mixed header never concatenates jobs", (text) => {
    const graph = ActionsGraph.parse("gitlab", source(text))
    expect(graph.state).toBe("unresolved")
    expect(graph.jobs).toEqual([])
    expect(graph.source.text).toBe(text)
    expect(graph.diagnostics.some((message) => message.includes("gitlab_header_invalid") || message.includes("yaml_MULTIPLE_DOCS"))).toBe(true)
  })

  test("pipeline-status needs mapping stays native external metadata without fake local dependencies", () => {
    const graph = ActionsGraph.parse("gitlab", source("upstream_status: {stage: test, needs: {pipeline: other/project}, script: own}\n"))
    expect(graph.state).toBe("partial")
    expect(graph.jobs.map((job) => job.id)).toEqual(["upstream_status"])
    expect(graph.jobs[0].needs).toEqual([])
    expect(graph.jobs[0].configuration).toMatchObject({ needs: { pipeline: "other/project" } })
    expect(graph.diagnostics).toEqual(["source_partial:needs_pipeline_status:upstream_status"])
  })

  test("preserves native stages/needs/rules/parallel/includes/downstream without template or external nodes", () => {
    const input = Object.freeze(source(fixture))
    const graph = ActionsGraph.parse("gitlab", input)
    expect(Schema.is(Actions.Graph)(graph)).toBe(true)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(fixture)
    expect(graph.state).toBe("partial")
    expect(graph.stages).toEqual([".pre", "compile", "verify", "publish", ".post"])
    expect(graph.jobs.map((job) => job.id)).toEqual(["build", "test", "local-child", "deploy"])
    expect(graph.jobs.map((job) => job.stage)).toEqual(["compile", "verify", undefined, "publish"])
    expect(graph.jobs.map((job) => job.needs)).toEqual([[], ["build"], [], ["test"]])
    expect(graph.jobs[0].matrix).toEqual([{ OS: ["linux", "windows"], ARCH: ["amd64", "arm64"] }])
    expect(graph.jobs[0].runner).toEqual(["linux", "docker"])
    expect(graph.jobs[0].configuration).toMatchObject({ artifacts: { paths: ["dist/"], expire_in: "1 week" } })
    expect(graph.jobs[1].configuration).toMatchObject({
      needs: [{ job: "build", artifacts: true }, { job: "absent", optional: true, artifacts: false }],
      rules: [{ if: '$CI_COMMIT_BRANCH == "dev"', when: "manual", allow_failure: true }, { when: "never" }],
    })
    expect(graph.jobs[2].configuration).toEqual({ extends: ".base", variables: { COMMON: "child" } })
    expect(graph.jobs[3].configuration).toMatchObject({
      trigger: { project: "downstream/application", branch: "main", strategy: "depend" }, resource_group: "production",
    })
    expect(graph.jobs.every((job) => job.steps.length === 0)).toBe(true)
    expect(graph.includes).toEqual([
      { local: "ci/base.yml" }, { project: "infrastructure/templates", ref: "v2", file: "/build.yml" },
    ])
    expect(graph.triggers).toEqual({ name: "$CI_COMMIT_REF_NAME", rules: [{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }] })
    expect(graph.diagnostics).toContain("source_partial:include_unresolved:external GitLab configuration not fetched")
    expect(graph.diagnostics).toContain("source_partial:needs_external:deploy->package")
  })

  test("local extends uses reverse deep merge and replaces arrays; raw configuration never rewrites scripts", () => {
    const graph = ActionsGraph.parse("gitlab", source(`
stages: [build, verify, publish]
.first: {stage: build, needs: [first], tags: [runner-a], script: [echo first]}
.last: {stage: verify, needs: [last], tags: [runner-b], script: [echo last]}
first: {stage: build, script: [make first]}
last: {stage: build, script: [make last]}
child: {extends: [.first, .last], script: [echo child]}
override: {extends: child, stage: publish, needs: [], tags: null}
`))
    expect(graph.state).toBe("complete")
    expect(graph.jobs.map((job) => job.id)).toEqual(["first", "last", "child", "override"])
    expect(graph.jobs[2].stage).toBe("verify")
    expect(graph.jobs[2].needs).toEqual(["last"])
    expect(graph.jobs[2].runner).toEqual(["runner-b"])
    expect(graph.jobs[2].configuration).toEqual({ extends: [".first", ".last"], script: ["echo child"] })
    expect(graph.jobs[3].stage).toBe("publish")
    expect(graph.jobs[3].needs).toEqual([])
    expect(graph.jobs[3].runner).toBeNull()
  })

  test("default documented stages apply only without unknown includes; stage order never fabricates needs", () => {
    const graph = ActionsGraph.parse("gitlab", source("default: {image: alpine}\ncompile: {stage: build, script: build}\nverify: {script: test}\npublish: {stage: deploy, script: ship}\n"))
    expect(graph.state).toBe("complete")
    expect(graph.stages).toEqual([".pre", "build", "test", "deploy", ".post"])
    expect(graph.jobs.map((job) => job.stage)).toEqual(["build", "test", "deploy"])
    expect(graph.jobs.map((job) => job.needs)).toEqual([[], [], []])
    const external = ActionsGraph.parse("gitlab", source("include: ci/external.yml\nlocal: {script: build}\n"))
    expect(external.state).toBe("partial")
    expect(external.jobs.map((job) => job.id)).toEqual(["local"])
    expect(external.jobs[0].stage).toBeUndefined()
    expect(external.stages).toBeUndefined()
  })

  test("unknown include cannot protect a fictional complete graph or invent external job definitions", () => {
    const graph = ActionsGraph.parse("gitlab", source("include: {remote: 'https://ci.example/config.yml'}\nlocal: {extends: .external, needs: [external], script: local}\n"))
    expect(graph.state).toBe("partial")
    expect(graph.jobs.map((job) => job.id)).toEqual(["local"])
    expect(graph.jobs[0].configuration).toMatchObject({ extends: ".external", script: "local" })
    expect(graph.diagnostics.some((message) => message.includes("extends_unresolved"))).toBe(true)
    expect(graph.diagnostics).toContain("source_partial:needs_missing:local->external")
    const only = ActionsGraph.parse("gitlab", source("include: ci/all.yml\n"))
    expect(only.state).toBe("partial")
    expect(only.jobs).toEqual([])
  })

  test("optional missing needs are absent; required missing, unknown stages and dependency cycles are named", () => {
    const optional = ActionsGraph.parse("gitlab", source("local: {needs: [{job: absent, optional: true}], script: test}\n"))
    expect(optional.state).toBe("complete")
    expect(optional.jobs[0].needs).toEqual([])
    const invalid = ActionsGraph.parse("gitlab", source("local: {stage: missing, needs: [absent], script: test}\n"))
    expect(invalid.state).toBe("unresolved")
    expect(invalid.diagnostics).toContain("source_unresolved:stage_missing:local->missing")
    expect(invalid.diagnostics).toContain("source_unresolved:needs_missing:local->absent")
    const cycle = ActionsGraph.parse("gitlab", source("a: {needs: [b], script: a}\nb: {needs: [a], script: b}\n"))
    expect(cycle.state).toBe("unresolved")
    expect(cycle.diagnostics).toContain("source_unresolved:needs_cycle:a,b")
  })

  test("cyclic or missing local extends leaves source visible with no invented inherited stage/script", () => {
    const cycle = ActionsGraph.parse("gitlab", source(".one: {extends: .two, stage: build}\n.two: {extends: .one, script: inherited}\njob: {extends: .one}\n"))
    expect(cycle.state).toBe("partial")
    expect(cycle.jobs[0].stage).toBeUndefined()
    expect(cycle.jobs[0].configuration).toEqual({ extends: ".one" })
    const missing = ActionsGraph.parse("gitlab", source("job: {extends: .missing, script: own}\n"))
    expect(missing.state).toBe("partial")
    expect(missing.jobs[0].configuration).toEqual({ extends: ".missing", script: "own" })
  })

  test("native YAML anchors and merge keys resolve bounded local inheritance", () => {
    const graph = ActionsGraph.parse("gitlab", source(".base: &base\n  stage: build\n  tags: [linux]\njob:\n  <<: *base\n  script: build\n"))
    expect(graph.state).toBe("complete")
    expect(graph.jobs[0].stage).toBe("build")
    expect(graph.jobs[0].runner).toEqual(["linux"])
  })

  test("opaque native references never become literal needs, stages or invented extends results", () => {
    const graph = ActionsGraph.parse("gitlab", source(`
stages: !reference [.stages, names]
.template:
  needs: !reference [.template, needs]
.anchor: &anchor
  needs: !reference [.template, needs]
known: {stage: build, script: build}
opaque:
  stage: !reference [.template, stage]
  needs: !reference [.template, needs]
  script: own
child: {extends: .template, script: own}
child-visible: {extends: opaque, script: own}
alias: *anchor
merge:
  <<: *anchor
  script: own
`))
    expect(graph.state).toBe("partial")
    expect(graph.jobs.map((job) => job.id)).toEqual(["known", "opaque", "child", "child-visible", "alias", "merge"])
    expect(graph.stages).toBeUndefined()
    expect(graph.jobs[0].stage).toBe("build")
    expect(graph.jobs[1].stage).toBeUndefined()
    expect(graph.jobs[1].needs).toEqual([])
    expect(graph.jobs[1].configuration).toMatchObject({ needs: [".template", "needs"], script: "own" })
    expect(graph.jobs[2].configuration).toEqual({ extends: ".template", script: "own" })
    expect(graph.jobs[3].needs).toEqual([])
    expect(graph.jobs[4].needs).toEqual([])
    expect(graph.jobs[3].stage).toBeUndefined()
    expect(graph.jobs[5].needs).toEqual([])
    expect(graph.diagnostics.some((message) => message.includes("extends_unresolved"))).toBe(true)
  })

  test("cached visible parents cannot bypass native eleven-level extends limit", () => {
    const text = "cached0: {stage: build, script: base}\n" + Array.from({ length: 12 }, (_, index) =>
      `cached${index + 1}: {extends: cached${index}, script: own}`).join("\n")
    const graph = ActionsGraph.parse("gitlab", source(text))
    expect(graph.state).toBe("partial")
    expect(graph.jobs).toHaveLength(13)
    expect(graph.jobs[11].stage).toBe("build")
    expect(graph.jobs[12].stage).toBeUndefined()
    expect(graph.jobs[12].configuration).toEqual({ extends: "cached11", script: "own" })
    expect(graph.diagnostics).toContain("source_partial:extends_unresolved:cycle or more than 11 levels at cached11")
  })
})
