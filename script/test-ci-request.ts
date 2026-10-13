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

export function validateRequest(
  input: unknown,
  isFile: (file: string) => boolean,
  resolvePackage?: (selector: string) => { package: string; directory: string },
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(".ci-run.json must be an object")
  const request = input as Record<string, unknown>
  if (typeof request.package !== "string" || !request.package || /[\x00-\x1f\x7f]/.test(request.package) ||
    (!resolvePackage && !/^[\w-]+(?:\/[\w-]+)*$/.test(request.package)))
    throw new Error(".ci-run.json names no valid package")
  const resolved = resolvePackage?.(request.package)
  const name = resolved?.package ?? request.package
  if (typeof name !== "string" || !/^[\w-]+(?:\/[\w-]+)*$/.test(name)) throw new Error(".ci-run.json names no valid resolved package")
  const directory = resolved?.directory ?? `packages/${name}`
  if (typeof directory !== "string" || /[\x00-\x1f\x7f:\\]/.test(directory) ||
    directory.split("/").some((part) => !part || part === "." || part === ".."))
    throw new Error(".ci-run.json has an invalid package directory")
  if (request.directory !== undefined && request.directory !== directory)
    throw new Error(".ci-run.json directory does not match resolved package location")
  const location = resolved ? { directory } : {}
  if (!Array.isArray(request.args) || !request.args.every((arg): arg is string => typeof arg === "string" && !/[\r\n\0]/.test(arg)))
    throw new Error(".ci-run.json args must be a string array without control characters")
  const env = requireEnv(request.env ?? {}, ".ci-run.json env")
  const dir = `${directory}/`
  const runner = request.runner === undefined || request.runner === null || request.runner === ""
    ? (isFile(`${dir}package.json`) ? "bun" : "pytest") : request.runner
  const required = runner === "pytest" ? "requirements-dev.txt" : "package.json"
  if (typeof runner !== "string" || !["bun", "node", "pytest", "playwright"].includes(runner) || !isFile(dir + required))
    throw new Error(`${directory} cannot run ${String(runner)} tests`)
  if (runner !== "playwright") {
    if (request.config !== undefined) throw new Error("config requires runner playwright")
    if (request.benchmarkRenderer !== undefined) throw new Error("--benchmark-renderer requires Playwright performance config")
    return { package: name, ...location, runner: String(runner), args: request.args, env, config: undefined }
  }
  if (name !== "app") throw new Error("playwright requires package app")
  if (typeof request.config !== "string" || !Object.hasOwn(configs, request.config))
    throw new Error(`playwright config must be ${Object.keys(configs).join(" or ")}`)
  if (!isFile(dir + request.config)) throw new Error(`playwright config missing: ${request.config}`)
  if (request.args.length === 0) throw new Error("playwright requires a nonempty spec file list")
  const config = configs[request.config as keyof typeof configs]
  const benchmarkRenderer = requireBenchmarkRenderer(request.config, request.benchmarkRenderer)
  const args = request.args.map((arg) => {
    const relative = arg.replaceAll("\\", "/").replace(/^\.\//, "")
    const prefix = [`${directory}/`, "packages/app/"].find((prefix) => relative.startsWith(prefix))
    const file = prefix === undefined ? relative : relative.slice(prefix.length).replace(/^\.\//, "")
    if (
      !/^[\w./-]+\.spec\.ts$/.test(file) || file.split("/").some((part) => !part || part === "." || part === "..") ||
      !file.startsWith(config.prefix) || (config.repeat === 1 && file.startsWith("e2e/performance/"))
    )
      throw new Error(`playwright invalid spec path for ${request.config}: ${arg}`)
    if (!isFile(dir + file)) throw new Error(`playwright spec missing: ${file}`)
    return file
  })
  if (new Set(args).size !== args.length) throw new Error("playwright spec files repeated")
  return { package: name, ...location, runner: "playwright", args, env, config: request.config, benchmarkRenderer }
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

// Bun switches test-ci.ts may pass through that change neither the file selection nor the test-name filter.
const switches = new Set(["--bail", "--pass-with-no-tests", "--only", "--todo", "--concurrent", "--randomize",
  "--only-failures", "--update-snapshots", "-u"])

// The omni positive control's scope for a bun request (script/test-omni-control.ts). A request that names no file,
// directory or filter and no -t pattern runs the whole package, exactly what a test.yml lane runs, so it is "suite":
// the run must spawn through omni. Any narrower selection is "declared": only tests that declared an omni spawn are
// held to one. An option this does not know might hide a selection, so it keeps the stronger "suite".
export function omniControlScope(request: { runner: string; args: string[] }) {
  if (request.runner !== "bun") return "suite"
  let narrowed = false
  for (let index = 0; index < request.args.length; index++) {
    const arg = request.args[index]!
    if (arg === "--timeout") {
      index++
      continue
    }
    if (arg === "-t" || arg === "--test-name-pattern") {
      index++
      narrowed = true
      continue
    }
    if (switches.has(arg)) continue
    if (arg.startsWith("-")) return "suite"
    narrowed = true
  }
  return narrowed ? "declared" : "suite"
}

// Whether a package's bunfig.toml preloads the omni positive control, read from the file itself.
export function preloadsControl(bunfig: { test?: { preload?: unknown } }) {
  const preload = bunfig.test?.preload
  return Array.isArray(preload) && preload.some((entry) => typeof entry === "string" && /(^|[\\/])script[\\/]test-omni-control\.ts$/.test(entry))
}

// The omni positive control's verdict for one job, apart from the test results: a failing control otherwise shows up
// only as Bun's "(fail) (unnamed)". test-ci.yml's "Omni control nonce" step prints "omni control nonce: <32 hex>" and
// hands the nonce to the run, whose preload removes it from the environment before any test loads and prints exactly
// one "omni positive control [<nonce>]: ..." line. Only a line carrying this job's nonce counts, wherever it sits in a
// line, so interleaved output and a test that prints a lookalike line can neither add nor fake a verdict. Throws when
// the nonce is missing or repeated, or when the run printed no verdict or more than one.
export function controlVerdict(job: { name: string }, log: string) {
  const rows = log.split(/\r?\n/).map((line) => {
    const fields = line.split("\t")
    return { step: fields[1], text: (fields.length > 2 ? fields.slice(2).join("\t") : line)
      .replace(/^\uFEFF?\S+Z /, "").replace(/\x1b\[[0-9;]*m/g, "") }
  })
  const nonces = rows.filter((row) => row.step !== "Run tests").flatMap((row) => {
    const match = /^omni control nonce: ([0-9a-f]{32})$/.exec(row.text.trim())
    return match ? [match[1]!] : []
  })
  if (nonces.length !== 1) throw new Error(`${job.name}: expected one omni control nonce, found ${nonces.length}`)
  const tag = `omni positive control [${nonces[0]}]: `
  const verdicts = rows.flatMap((row) => {
    const at = row.text.indexOf(tag)
    return at < 0 ? [] : [`omni positive control: ${row.text.slice(at + tag.length).trim()}`]
  })
  if (verdicts.length !== 1)
    throw new Error(`${job.name}: expected one omni positive control verdict for this run's nonce, found ${verdicts.length}`)
  return verdicts[0]!
}
