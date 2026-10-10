import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
// WP-C cold-review repair: host Intel/sysctl semantics; versions/archive were unguarded.
// Hash exact parsed run bodies. Legitimate edits require review plus an explicit pin update.
const bodyPins = {
  host: "0a3543170a00c3b60fc173a7a02cb94fdfd99d433ec217145603cbb36829d9ee",
  versions: "5d8d002f9c8dc80f9d9010c8d475b7554a2aa42695a5607e4a29848a342af66f",
  archive: "f64433a7dad8df6ce6550bd30c93cb3cb78de1008fc068add8a39583ca146ee4",
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

function reviewedBodies(input: unknown) {
  keys(bodyPins, ["host", "versions", "archive"])
  if (!Array.isArray(input) || input.length === 0) throw new Error("candidate.steps missing or empty")
  const steps = input.map(object)
  return Object.entries(bodyPins).map(([id, pin]) => {
    const matches = steps.filter((step) => step.id === id)
    if (matches.length !== 1) throw new Error(`Reviewed step ${id} missing or duplicated`)
    const body = matches[0].run
    if (typeof body !== "string" || !body.trim()) throw new Error(`Reviewed body ${id}.run missing or empty`)
    if (createHash("sha256").update(body, "utf8").digest("hex") !== pin) {
      throw new Error(`Reviewed body SHA-256 mismatch: ${id}`)
    }
    return { id, body }
  })
}

function check(input: unknown) {
  const workflow = object(input)
  keys(workflow, ["name", "on", "permissions", "concurrency", "jobs"])
  expect(workflow.on).toEqual({ workflow_dispatch: null, push: { branches: ["lean-candidate-build"] } })
  expect(workflow.permissions).toEqual({ contents: "read" })
  const jobs = object(workflow.jobs)
  keys(jobs, ["candidate"])
  const job = object(jobs.candidate)
  reviewedBodies(job.steps)
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
  check(Bun.YAML.parse(source + "\n# No-op YAML comment: parsed reviewed bodies are unchanged.\n"))
})

test("reviewed body pins reject stubs, removed dependencies/identity and widened archives by name", () => {
  const steps = object(object(object(document).jobs).candidate).steps
  for (const input of [undefined, [], null]) {
    expect(() => reviewedBodies(input)).toThrow("candidate.steps missing or empty")
  }
  for (const id of Object.keys(bodyPins)) {
    const without = (steps as Record<string, unknown>[]).filter((step) => step.id !== id)
    expect(() => reviewedBodies(without)).toThrow(`Reviewed step ${id} missing or duplicated`)
    const duplicate = [...(steps as Record<string, unknown>[]), (steps as Record<string, unknown>[]).find((step) => step.id === id)!]
    expect(() => reviewedBodies(duplicate)).toThrow(`Reviewed step ${id} missing or duplicated`)
    for (const body of [undefined, "", " \n"]) {
      const copy = structuredClone(steps) as Record<string, unknown>[]
      copy.find((step) => step.id === id)!.run = body
      expect(() => reviewedBodies(copy)).toThrow(`Reviewed body ${id}.run missing or empty`)
    }
  }
  const mutations: [string, (body: string) => string][] = [
    ["versions", () => "true"],
    ["host", (body) => body.slice(0, body.indexOf("for required"))],
    ["archive", (body) => body.split("\n").filter((line) => !line.includes("if (identity.")).join("\n")],
    ["archive", (body) => body.replace('"packages/desktop/dist-candidate/mac/HuGR Lean Candidate.app"', '"packages/desktop/dist-candidate"')],
  ]
  for (const [id, mutate] of mutations) {
    const copy = object(structuredClone(document))
    const step = (object(object(copy.jobs).candidate).steps as Record<string, unknown>[]).find((step) => step.id === id)!
    const changed = mutate(String(step.run))
    expect(changed).not.toBe(step.run)
    step.run = changed
    expect(() => check(copy)).toThrow(`Reviewed body SHA-256 mismatch: ${id}`)
  }
})

test("actual host shell preserves sysctl diagnostics and accepts only closed native Intel results", async () => {
  const host = reviewedBodies(object(object(object(document).jobs).candidate).steps).find((step) => step.id === "host")!
  const root = await mkdtemp(path.join(tmpdir(), "lean-candidate-host-"))
  try {
    await mkdir(path.join(root, "bin"))
    for (const [name, body] of Object.entries({
      git: 'printf "%s\\n" "$CANDIDATE_SHA"',
      uname: 'printf "%s\\n" "$TEST_UNAME"',
      sysctl: 'case "$*" in "-n machdep.cpu.vendor") printf "%s\\n" "$TEST_VENDOR"; exit "$TEST_VENDOR_CODE";; "-n sysctl.proc_translated") printf "%s" "$TEST_STDOUT"; printf "%s" "$TEST_STDERR" >&2; exit "$TEST_CODE";; *) exit 99;; esac',
    })) {
      const file = path.join(root, "bin", name)
      await Bun.write(file, "#!/bin/bash\n" + body + "\n")
      await chmod(file, 0o755)
    }
    const run = (env: Record<string, string>) => Bun.spawnSync(["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", "-c", host.body], {
      cwd: root, timeout: 10000,
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, RUNNER_TEMP: root,
        GITHUB_REF: "refs/heads/lean-candidate-build", CANDIDATE_SHA: "synthetic-sha", WORKFLOW_SHA: "synthetic-sha",
        RUNNER_OS: "macOS", RUNNER_ARCH: "X64", TEST_UNAME: "x86_64", TEST_VENDOR: "GenuineIntel", TEST_VENDOR_CODE: "0",
        TEST_CODE: "0", TEST_STDOUT: "0\n", TEST_STDERR: "", ...env },
    })
    for (const file of ["scripts/lean-candidate.ts", "electron-builder.candidate.config.ts", "electron.vite.candidate.config.ts", "test/lean-candidate-package.test.ts"]) {
      const target = path.join(root, "packages/desktop", file)
      await mkdir(path.dirname(target), { recursive: true })
      await Bun.write(target, "synthetic host fixture\n")
    }
    const unknown = "sysctl: unknown oid 'sysctl.proc_translated'\n"
    const cases = [
      { code: "0", out: "0\n", err: "", expected: 0 },
      { code: "1", out: "", err: unknown, expected: 0 },
      { code: "0", out: "1\n", err: "", expected: 1 },
      { code: "0", out: "", err: "", expected: 1 },
      { code: "0", out: "unknown\n", err: "", expected: 1 },
      { code: "0", out: "0\n", err: "unexpected warning\n", expected: 1 },
      { code: "1", out: "", err: "sysctl: unexpected failure\n", expected: 1 },
      { code: "2", out: "", err: unknown, expected: 1 },
      { code: "1", out: "0\n", err: unknown, expected: 1 },
    ]
    for (const entry of cases) {
      const result = run({ TEST_CODE: entry.code, TEST_STDOUT: entry.out, TEST_STDERR: entry.err })
      expect(result.exitCode).toBe(entry.expected)
      expect(result.stdout.toString()).toContain(`sysctl.proc_translated exit=${entry.code} stdout=<${entry.out.trim()}>`)
      if (entry.err) expect(result.stderr.toString()).toContain(entry.err)
      if (entry.expected) expect(result.stderr.toString()).toContain("Rejected sysctl.proc_translated result")
    }
    for (const [env, failure] of [
      [{ TEST_VENDOR: "AuthenticAMD" }, "Native GenuineIntel CPU required"],
      [{ TEST_VENDOR: "" }, "Native GenuineIntel CPU required"],
      [{ TEST_VENDOR_CODE: "2" }, "Cannot read native Intel CPU vendor"],
      [{ TEST_UNAME: "arm64" }, "Native x86_64 kernel required"],
      [{ RUNNER_ARCH: "ARM64" }, "Native X64 runner required"],
      [{ RUNNER_OS: "Linux" }, "Native macOS runner required"],
    ] as [Record<string, string>, string][]) {
      const result = run(env)
      expect(result.exitCode).toBe(1)
      expect(result.stderr.toString()).toContain(failure)
      expect(result.stdout.toString()).toBe("") // Absent-OID exception cannot precede positive Intel identity.
    }
    const required = "packages/desktop/test/lean-candidate-package.test.ts"
    await rm(path.join(root, required))
    const missing = run({})
    expect(missing.exitCode).toBe(1)
    expect(missing.stdout.toString()).toContain(`Missing dependency: ${required}`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
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
