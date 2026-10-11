// Pure request/report rules shared by the uploader, snapshot runner and cache-scoped controls.
// Each key is also a ci-run-<os>-* branch prefix that test-ci.yml maps to the same runners.
const systems = {
  linux: ["ubuntu-latest"], windows: ["windows-latest"], both: ["ubuntu-latest", "windows-latest"],
  macos: ["macos-14"], "macos-intel": ["macos-15-intel"], all: ["ubuntu-latest", "windows-latest", "macos-14"],
}
// Variables a run may set (--env), and the only shape their values may take. test-ci.yml checks the same.
const envKeys = ["ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER"]
const envValue = /^[A-Za-z0-9_]+$/
const configs = {
  "e2e/playwright.production.config.ts": { prefix: "e2e/", repeat: 1 },
  "e2e/performance/playwright.config.ts": { prefix: "e2e/performance/", repeat: 3 },
}

export function parseOptions(argv: string[]) {
  const positional: string[] = []
  const options = {
    os: "linux", timeout: "120000", pattern: undefined as string | undefined,
    runner: undefined as string | undefined, config: undefined as string | undefined,
    benchmarkRenderer: undefined as string | undefined,
  }
  const env: Record<string, string> = {}
  const flags = {
    "--os": "os", "--timeout": "timeout", "-t": "pattern", "--test-name-pattern": "pattern",
    "--runner": "runner", "--config": "config",
    "--benchmark-renderer": "benchmarkRenderer",
  } as const
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!
    if (arg === "--env") {
      const pair = argv[++index] ?? ""
      env[pair.slice(0, pair.indexOf("="))] = pair.slice(pair.indexOf("=") + 1)
      continue
    }
    if (!Object.hasOwn(flags, arg)) {
      positional.push(arg)
      continue
    }
    const key = flags[arg as keyof typeof flags]
    if (seen.has(key) && ["os", "runner", "config", "benchmarkRenderer"].includes(key)) throw new Error(`${arg} repeated`)
    seen.add(key)
    const value = argv[++index]
    if (value === undefined || (key !== "pattern" && (!value || value.startsWith("-"))))
      throw new Error(`${arg} needs a value`)
    options[key] = value
  }
  if (!Object.hasOwn(systems, options.os)) throw new Error(`--os must be one of ${Object.keys(systems).join(", ")}`)
  if (!/^\d+$/.test(options.timeout)) throw new Error("--timeout must be milliseconds")
  if (options.runner !== undefined && !["bun", "node", "playwright"].includes(options.runner))
    throw new Error("--runner must be bun, node or playwright")
  requireEnv(env, "--env")
  if (options.config !== undefined && options.runner !== "playwright") throw new Error("--config requires --runner playwright")
  if (options.benchmarkRenderer !== undefined && options.runner !== "playwright")
    throw new Error("--benchmark-renderer requires Playwright performance config")
  requireBenchmarkRenderer(options.config, options.benchmarkRenderer)
  if (options.runner === "playwright" && (options.pattern !== undefined || seen.has("timeout")))
    throw new Error("playwright accepts only named spec files, --config, --os and --benchmark-renderer")
  return { positional, options, env }
}

export function validateRequest(input: unknown, isFile: (file: string) => boolean) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(".ci-run.json must be an object")
  const request = input as Record<string, unknown>
  if (typeof request.package !== "string" || !/^[\w-]+(?:\/[\w-]+)*$/.test(request.package))
    throw new Error(".ci-run.json names no valid package")
  if (!Array.isArray(request.args) || !request.args.every((arg): arg is string => typeof arg === "string" && !/[\r\n\0]/.test(arg)))
    throw new Error(".ci-run.json args must be a string array without control characters")
  const env = requireEnv(request.env ?? {}, ".ci-run.json env")
  const dir = `packages/${request.package}/`
  const runner = request.runner === undefined || request.runner === null || request.runner === ""
    ? (isFile(`${dir}package.json`) ? "bun" : "pytest") : request.runner
  const required = runner === "pytest" ? "requirements-dev.txt" : "package.json"
  if (typeof runner !== "string" || !["bun", "node", "pytest", "playwright"].includes(runner) || !isFile(dir + required))
    throw new Error(`packages/${request.package} cannot run ${String(runner)} tests`)
  if (runner !== "playwright") {
    if (request.config !== undefined) throw new Error("config requires runner playwright")
    if (request.benchmarkRenderer !== undefined) throw new Error("--benchmark-renderer requires Playwright performance config")
    return { package: request.package, runner: String(runner), args: request.args, env, config: undefined }
  }
  if (request.package !== "app") throw new Error("playwright requires package app")
  if (typeof request.config !== "string" || !Object.hasOwn(configs, request.config))
    throw new Error(`playwright config must be ${Object.keys(configs).join(" or ")}`)
  if (!isFile(dir + request.config)) throw new Error(`playwright config missing: ${request.config}`)
  if (request.args.length === 0) throw new Error("playwright requires a nonempty spec file list")
  const config = configs[request.config as keyof typeof configs]
  const benchmarkRenderer = requireBenchmarkRenderer(request.config, request.benchmarkRenderer)
  const args = request.args.map((arg) => {
    const file = arg.replaceAll("\\", "/").replace(/^(\.\/)?packages\/app\//, "").replace(/^\.\//, "")
    if (
      !/^[\w./-]+\.spec\.ts$/.test(file) || file.split("/").some((part) => !part || part === "." || part === "..") ||
      !file.startsWith(config.prefix) || (config.repeat === 1 && file.startsWith("e2e/performance/"))
    )
      throw new Error(`playwright invalid spec path for ${request.config}: ${arg}`)
    if (!isFile(dir + file)) throw new Error(`playwright spec missing: ${file}`)
    return file
  })
  if (new Set(args).size !== args.length) throw new Error("playwright spec files repeated")
  return { package: request.package, runner: "playwright", args, env, config: request.config, benchmarkRenderer }
}

function requireEnv(env: unknown, source: string) {
  if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error(`${source} must be an object`)
  return Object.fromEntries(Object.entries(env).map(([key, value]) => {
    if (!envKeys.includes(key)) throw new Error(`${source} takes KEY=VALUE with KEY one of ${envKeys.join(", ")}`)
    if (typeof value !== "string" || !envValue.test(value)) throw new Error(`${source} ${key} needs a value matching ${envValue}`)
    return [key, value]
  }))
}

function requireBenchmarkRenderer(config: string | undefined, renderer: unknown) {
  const performance = config !== undefined && Object.hasOwn(configs, config) && configs[config as keyof typeof configs].repeat === 3
  if (!performance && renderer !== undefined) throw new Error("--benchmark-renderer requires Playwright performance config")
  if (performance && renderer !== "current" && renderer !== "legacy") throw new Error("--benchmark-renderer must be current or legacy")
  return performance ? renderer as "current" | "legacy" : undefined
}

export function benchmarkEnvironment(renderer: string | undefined, sha: string | undefined) {
  if (renderer === undefined) return {}
  if (renderer !== "current" && renderer !== "legacy") throw new Error("--benchmark-renderer must be current or legacy")
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error("benchmark requires actual GITHUB_SHA")
  return { RESEARCH_BENCH_RENDERER: renderer, RESEARCH_BENCH_REVISION: sha }
}

export function playwrightArgs(request: ReturnType<typeof validateRequest>) {
  if (!request.config || !Object.hasOwn(configs, request.config)) throw new Error("playwright config required")
  // Playwright treats CLI filenames as regexes against absolute paths, including Windows separators.
  const files = request.args.map((file) => `(^|[\\\\/])${file.replaceAll(".", "\\.").replaceAll("/", "[\\\\/]")}$`)
  return [
    "--config", request.config, "--workers", "1", "--retries", "0",
    "--repeat-each", String(configs[request.config as keyof typeof configs].repeat), ...files,
  ]
}

export function validateSelection(expected: string[], selected: string[]) {
  if (expected.length === 0) throw new Error("playwright requires a nonempty spec file list")
  expected.forEach((file) => {
    if (!selected.includes(file)) throw new Error(`playwright empty selection: ${file}`)
  })
  selected.forEach((file) => {
    if (!expected.includes(file)) throw new Error(`playwright unexpected selection: ${file}`)
  })
}

export function requireTestJobs<T extends { name: string }>(os: string, jobs: T[]) {
  if (!Object.hasOwn(systems, os)) throw new Error(`test-ci: unknown OS ${os}`)
  if (!Array.isArray(jobs)) throw new Error("test-ci: missing matrix jobs")
  const expected = systems[os as keyof typeof systems].map((host) => `test (${host})`)
  const tests = jobs.filter((job) => job.name.startsWith("test "))
  expected.forEach((name) => {
    if (tests.filter((job) => job.name === name).length !== 1) throw new Error(`${name}: missing or repeated matrix job`)
  })
  tests.forEach((job) => {
    if (!expected.includes(job.name)) throw new Error(`${job.name}: unexpected matrix job for ${os}`)
  })
  return tests
}

export function reportLines(job: { name: string; conclusion: string; steps?: { name: string; conclusion: string }[] }, log: string) {
  if (!log.trim()) throw new Error(`${job.name}: empty job log`)
  const rows = log.split(/\r?\n/).map((line) => {
    const fields = line.split("\t")
    return { step: fields[1], text: (fields.length > 2 ? fields.slice(2).join("\t") : line)
      .replace(/^\uFEFF?\S+Z /, "").replace(/\x1b\[[0-9;]*m/g, "") }
  })
  if (job.conclusion !== "success") {
    const failed = job.steps?.filter((step) => step.conclusion === "failure").map((step) => step.name) ?? []
    const diagnostics = rows.filter((row) => failed.length === 0 || failed.includes(row.step ?? ""))
    return (diagnostics.length ? diagnostics : rows).map((row) => row.text)
  }
  const steps = job.steps?.filter((step) => step.name === "Run tests") ?? []
  if (steps.length !== 1 || steps[0]?.conclusion !== "success") throw new Error(`${job.name}: missing successful Run tests step`)
  const lines = rows.filter((row) => row.step === "Run tests").map((row) => row.text)
  if (lines.length === 0) throw new Error(`${job.name}: missing Run tests log`)
  const end = lines.indexOf("##[endgroup]")
  if (end < 0) throw new Error(`${job.name}: missing Run tests endgroup marker`)
  const output = lines.slice(end + 1).filter((line) => line.trim())
  if (output.length === 0) throw new Error(`${job.name}: empty Run tests output`)
  return output
}
