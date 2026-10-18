import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { ActionsGraph } from "../../src/actions/source/graph"
import { diagnostics, limits, object, read } from "../../src/actions/source/document"
import { applyDefaults, gitlab } from "../../src/actions/source/gitlab"

const source = (text: string) => Actions.Source.make({
  bindingID: Actions.BindingID.make("ab_source"), path: ".gitlab-ci.yml",
  ref: "feature/source", version: "immutable-blob", text, editable: false,
})

function inspect(text: string) {
  const report = diagnostics()
  const document = read(text, "gitlab", report)
  if (!document) throw new Error("Fixture must pass bounded structural parsing")
  return { graph: gitlab(document.value, report, document.references), report, document }
}

describe("bounded native GitLab resolution", () => {
  test.each(["missing", "cycle"])("twenty-way repeated %s branches short-circuit without exponential retries", (kind) => {
    const base = kind === "missing" ? ".l0: {extends: .missing}\n" : ".l0: {extends: .cycle}\n.cycle: {extends: .l0}\n"
    const text = base + Array.from({ length: 8 }, (_, index) =>
      `.l${index + 1}: {extends: [${Array.from({ length: 20 }, () => `.l${index}`).join(", ")}]}`).join("\n") + "\njob: {extends: .l8}\n"
    const result = inspect(text)
    expect(result.graph.jobs.map((job) => job.id)).toEqual(["job"])
    expect(result.graph.jobs[0].stage).toBeUndefined()
    expect(result.report.state()).toBe("partial")
    expect(result.report.work.resolutions).toBeLessThanOrEqual(180)
    expect(result.report.work.merges).toBe(0)
    expect(result.report.items.some((message) => message.includes(kind === "missing" ? "extends_missing" : "extends_unresolved"))).toBe(true)
  })

  test("global resolution budget stops many independent failed branches and keeps named limit after diagnostic truncation", () => {
    const text = Array.from({ length: 4100 }, (_, index) => `job${index}: {extends: .missing}`).join("\n")
    const result = inspect(text)
    expect(result.report.work.resolutions).toBe(limits.resolutions)
    expect(result.report.work.merges).toBe(0)
    expect(result.report.state()).toBe("partial")
    expect(result.report.items.some((message) => message.startsWith(`source_partial:resolution_limit:${limits.resolutions} visits`))).toBe(true)
    expect(result.graph.jobs).toHaveLength(4100)
    expect(result.report.items.length).toBeLessThanOrEqual(limits.diagnostics)
  })

  test("reverse deep merge key visits share one global budget", () => {
    const text = ".base:\n  stage: build\n  variables:\n" + Array.from({ length: 1500 }, (_, index) => `    V${index}: base`).join("\n")
      + "\n" + Array.from({ length: 40 }, (_, index) => `job${index}: {extends: .base, variables: {CHILD: value}}`).join("\n")
    const result = inspect(text)
    expect(result.report.work.merges).toBe(limits.merges)
    expect(result.report.work.resolutions).toBeLessThan(limits.resolutions)
    expect(result.report.items.some((message) => message.startsWith(`source_partial:merge_limit:${limits.merges} visits`))).toBe(true)
    expect(result.graph.jobs).toHaveLength(40)
    expect(result.graph.jobs[0].stage).toBe("build")
    expect(result.graph.jobs.at(-1)?.configuration).toEqual({ extends: ".base", variables: { CHILD: "value" } })
  })

  test("deep failure memo cannot poison later shallow resolution of same parent", () => {
    const text = ".base: {stage: build, tags: [native]}\n.shared: {extends: .base}\n"
      + Array.from({ length: 10 }, (_, index) => `.deep${index}: {extends: ${index === 9 ? ".shared" : `.deep${index + 1}`}}`).join("\n")
      + "\ndeep: {extends: .deep0}\nshallow: {extends: .shared}\n"
    const graph = ActionsGraph.parse("gitlab", source(text))
    expect(graph.state).toBe("partial")
    expect(graph.jobs[0].stage).toBeUndefined()
    expect(graph.jobs[1].stage).toBe("build")
    expect(graph.jobs[1].runner).toEqual(["native"])
    expect(graph.diagnostics.some((message) => message.includes("more than 11 levels"))).toBe(true)
  })
})

describe("native keyword defaults", () => {
  const text = `
default:
  tags: [linux, docker]
  image: {name: alpine:3.20, entrypoint: [default]}
  artifacts: {paths: [dist/], expire_in: 1 week}
  retry: 2
all: {script: own}
yes: {inherit: {default: true}, script: own}
none: {inherit: {default: false}, script: own}
tags-only: {inherit: {default: [tags]}, script: own}
image-only: {inherit: {default: [image]}, script: own}
override: {tags: [], image: {entrypoint: [explicit]}, artifacts: {reports: {junit: test.xml}}, script: own}
.base: {inherit: {default: false}}
child: {extends: .base, script: own}
child-yes: {extends: .base, inherit: {default: true}, script: own}
`

  test("default tags apply to runner projection with true/false/allowlist and inherited selectors", () => {
    const input = Object.freeze(source(text))
    const graph = ActionsGraph.parse("gitlab", input)
    expect(graph.state).toBe("complete")
    expect(graph.source).toBe(input)
    expect(graph.jobs.map((job) => job.runner)).toEqual([
      ["linux", "docker"], ["linux", "docker"], undefined, ["linux", "docker"], undefined, [], undefined, ["linux", "docker"],
    ])
    expect(graph.jobs[0].configuration).toEqual({ script: "own" })
    expect(graph.jobs[7].configuration).toEqual({ extends: ".base", inherit: { default: true }, script: "own" })
    expect(graph.source.text).toBe(text)
  })

  test("effective image/artifact/retry defaults copy whole keywords; explicit nested job values never deep-merge", () => {
    const result = inspect(text)
    const all = result.document.value.all
    const override = result.document.value.override
    const imageOnly = result.document.value["image-only"]
    if (!object(all) || !object(override) || !object(imageOnly)) throw new Error("Expected actual parsed jobs")
    expect(applyDefaults(result.document.value, Object.freeze(all), result.report)).toEqual({
      script: "own", tags: ["linux", "docker"], image: { name: "alpine:3.20", entrypoint: ["default"] },
      artifacts: { paths: ["dist/"], expire_in: "1 week" }, retry: 2,
    })
    expect(applyDefaults(result.document.value, Object.freeze(override), result.report)).toEqual({
      script: "own", tags: [], image: { entrypoint: ["explicit"] }, artifacts: { reports: { junit: "test.xml" } }, retry: 2,
    })
    expect(applyDefaults(result.document.value, Object.freeze(imageOnly), result.report)).toEqual({
      inherit: { default: ["image"] }, script: "own", image: { name: "alpine:3.20", entrypoint: ["default"] },
    })
    expect(all).toEqual({ script: "own" })
  })

  test.each(["invalid", "[unsupported]", "'$[[ inputs.inherit ]]'"])("unresolved selector %s never fabricates inherited tags", (selector) => {
    const graph = ActionsGraph.parse("gitlab", source(`default: {tags: [linux]}\njob: {inherit: {default: ${selector}}, script: own}\n`))
    expect(graph.state).toBe("partial")
    expect(graph.jobs[0].runner).toBeUndefined()
    expect(graph.diagnostics.some((message) => message.includes("defaults_unresolved"))).toBe(true)
  })
})
