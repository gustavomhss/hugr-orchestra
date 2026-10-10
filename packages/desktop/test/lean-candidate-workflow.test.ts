import { expect, test } from "bun:test"

// Closed YAML structure and exact command/path fields, not arbitrary shell analysis.
const source = await Bun.file(new URL("../../../.github/workflows/lean-candidate.yml", import.meta.url)).text()
const document: unknown = Bun.YAML.parse(source)
const pins = {
  checkout: "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
  node: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  bun: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
  cache: "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
  upload: "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
}
const artifacts = [
  "packages/desktop/dist-candidate/ownedappArtifact.zip",
  "packages/desktop/dist-candidate/lean-candidate-build.json",
  "packages/desktop/dist-candidate/proof/renderer.png",
  "packages/desktop/dist-candidate/proof/proof.log",
]

function object(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull()
  expect(typeof value).toBe("object")
  expect(Array.isArray(value)).toBe(false)
  return value as Record<string, unknown>
}

function keys(value: Record<string, unknown>, names: string[]) {
  expect(Object.keys(value).sort()).toEqual(names.toSorted())
}

function check(input: unknown) {
  const workflow = object(input)
  keys(workflow, ["name", "on", "permissions", "concurrency", "jobs"])
  expect(workflow.on).toEqual({ workflow_dispatch: null, push: { branches: ["lean-candidate-build"] } })
  expect(workflow.permissions).toEqual({ contents: "read" })
  const jobs = object(workflow.jobs)
  keys(jobs, ["candidate"])
  const job = object(jobs.candidate)
  keys(job, ["runs-on", "timeout-minutes", "defaults", "env", "steps"])
  expect(job["runs-on"]).toBe("macos-15-intel")
  expect(job["timeout-minutes"]).toBe(90)
  expect(job.defaults).toEqual({ run: { shell: "bash", "working-directory": "." } })
  expect(job.env).toEqual({
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    CANDIDATE_SHA: "${{ github.sha }}",
    WORKFLOW_SHA: "${{ github.workflow_sha }}",
  })
  expect(Array.isArray(job.steps)).toBe(true)
  const steps = (job.steps as unknown[]).map(object)
  expect(steps.map((step) => step.id)).toEqual([
    "checkout", "host", "node", "bun", "cache", "install", "versions", "contract", "build", "package",
    "typecheck", "verify", "archive", "upload",
  ])
  for (const step of steps) {
    keys(step, step.uses ? ["name", "id", "uses", "with"] :
      ["name", "id", "run", ...(["contract", "typecheck", "verify"].includes(String(step.id)) ? ["working-directory"] : []), ...(step.id === "install" ? ["env"] : [])])
  }
  const by = Object.fromEntries(steps.map((step) => [String(step.id), step]))
  for (const [id, pin] of Object.entries(pins)) expect(by[id].uses).toBe(pin)
  expect(by.checkout.with).toEqual({ ref: "${{ github.sha }}", "persist-credentials": false })
  expect(by.node.with).toEqual({ "node-version": "24", architecture: "x64" })
  expect(by.bun.with).toEqual({ "bun-version": "1.3.14", "bun-download-url":
    "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-darwin-x64-baseline.zip" })
  expect(by.cache.with).toEqual({ path: "${{ runner.temp }}/lean-candidate-bun-cache", key:
    "lean-candidate-${{ runner.os }}-${{ runner.arch }}-bun-1.3.14-${{ hashFiles('bun.lock', 'package.json', 'packages/*/package.json', 'patches/**') }}" })
  expect(by.install.env).toEqual({ BUN_INSTALL_CACHE_DIR: "${{ runner.temp }}/lean-candidate-bun-cache" })
  const host = String(by.host.run).split("\n")
  for (const line of [
    'test "$GITHUB_REF" = refs/heads/lean-candidate-build',
    'test "$(git rev-parse HEAD)" = "$CANDIDATE_SHA"',
    'test "$WORKFLOW_SHA" = "$CANDIDATE_SHA"',
    'test "$RUNNER_OS" = macOS', 'test "$RUNNER_ARCH" = X64', 'test "$(uname -m)" = x86_64',
  ]) expect(host).toContain(line)
  for (const [id, command] of Object.entries({
    install: "bun install --frozen-lockfile", contract: "bun test test/lean-candidate-workflow.test.ts",
    build: "bun run packages/desktop/scripts/lean-candidate.ts build",
    package: "bun run packages/desktop/scripts/lean-candidate.ts package", typecheck: "bun typecheck",
    verify: "bun test --timeout 1200000 test/lean-candidate-package.test.ts",
  })) expect(by[id].run).toBe(command)
  for (const id of ["contract", "typecheck", "verify"]) expect(by[id]["working-directory"]).toBe("packages/desktop")
  expect(by.upload.with).toEqual({ name: "ownedappArtifact-${{ github.sha }}", path: artifacts.join("\n") + "\n",
    "if-no-files-found": "error", "include-hidden-files": false, "retention-days": 7, "compression-level": 0 })
}

test("candidate workflow has closed triggers, read-only permissions, pinned native toolchain and bounded artifacts", () => {
  check(document)
})

test("workflow contract rejects empty extraction and planted YAML regressions", () => {
  for (const input of [null, {}, { jobs: {} }]) expect(() => check(input)).toThrow()
  const mutations = [
    (doc: Record<string, unknown>) => { doc.on = { push: { branches: ["dev"] } } },
    (doc: Record<string, unknown>) => { doc.permissions = { contents: "write" } },
    (doc: Record<string, unknown>) => { object(object(doc.jobs).candidate)["runs-on"] = "macos-15" },
    (doc: Record<string, unknown>) => { object(object(doc.jobs).candidate)["continue-on-error"] = true },
    ...["checkout", "cache", "build", "verify", "upload"].map((id) => (doc: Record<string, unknown>) => {
      const job = object(object(doc.jobs).candidate)
      const step = (job.steps as Record<string, unknown>[]).find((item) => item.id === id)!
      if (id === "checkout") step.with = { ref: "dev" }
      if (id === "cache") object(step.with).path = "node_modules"
      if (id === "build") step.run = "true"
      if (id === "verify") step.if = "false"
      if (id === "upload") object(step.with).path = "packages/desktop/**"
    }),
  ]
  for (const mutate of mutations) {
    const copy = object(structuredClone(document))
    mutate(copy)
    expect(() => check(copy)).toThrow()
  }
})
