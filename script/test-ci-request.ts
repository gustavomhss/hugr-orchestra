// Pure request rules shared by the uploader and the snapshot runner (Node's TypeScript stripping).
const systems = ["linux", "windows", "both", "macos", "all"]
const configs = {
  "e2e/playwright.production.config.ts": { prefix: "e2e/", repeat: 1 },
  "e2e/performance/playwright.config.ts": { prefix: "e2e/performance/", repeat: 3 },
}

export function parseOptions(argv: string[]) {
  const positional: string[] = []
  const options = {
    os: "linux", timeout: "120000", pattern: undefined as string | undefined,
    runner: undefined as string | undefined, config: undefined as string | undefined,
  }
  const flags = {
    "--os": "os", "--timeout": "timeout", "-t": "pattern", "--test-name-pattern": "pattern",
    "--runner": "runner", "--config": "config",
  } as const
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!
    if (!Object.hasOwn(flags, arg)) {
      positional.push(arg)
      continue
    }
    const key = flags[arg as keyof typeof flags]
    if (seen.has(key) && ["os", "runner", "config"].includes(key)) throw new Error(`${arg} repeated`)
    seen.add(key)
    const value = argv[++index]
    if (value === undefined || (key !== "pattern" && (!value || value.startsWith("-"))))
      throw new Error(`${arg} needs a value`)
    options[key] = value
  }
  if (!systems.includes(options.os)) throw new Error("--os must be linux, windows, both, macos or all")
  if (!/^\d+$/.test(options.timeout)) throw new Error("--timeout must be milliseconds")
  if (options.runner !== undefined && options.runner !== "playwright") throw new Error("--runner must be playwright")
  if (options.config !== undefined && options.runner !== "playwright") throw new Error("--config requires --runner playwright")
  if (options.runner === "playwright" && (options.pattern !== undefined || seen.has("timeout")))
    throw new Error("playwright accepts only named spec files, --config and --os")
  return { positional, options }
}

export function validateRequest(input: unknown, isFile: (file: string) => boolean) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(".ci-run.json must be an object")
  const request = input as Record<string, unknown>
  if (typeof request.package !== "string" || !/^[\w-]+(?:\/[\w-]+)*$/.test(request.package))
    throw new Error(".ci-run.json names no valid package")
  if (!Array.isArray(request.args) || !request.args.every((arg): arg is string => typeof arg === "string" && !/[\r\n\0]/.test(arg)))
    throw new Error(".ci-run.json args must be a string array without control characters")
  const dir = `packages/${request.package}/`
  const runner = request.runner === undefined || request.runner === null || request.runner === ""
    ? (isFile(`${dir}package.json`) ? "bun" : "pytest") : request.runner
  const required = runner === "pytest" ? "requirements-dev.txt" : "package.json"
  if (typeof runner !== "string" || !["bun", "pytest", "playwright"].includes(runner) || !isFile(dir + required))
    throw new Error(`packages/${request.package} cannot run ${String(runner)} tests`)
  if (runner !== "playwright") {
    if (request.config !== undefined) throw new Error("config requires runner playwright")
    return { package: request.package, runner: String(runner), args: request.args, config: undefined }
  }
  if (request.package !== "app") throw new Error("playwright requires package app")
  if (typeof request.config !== "string" || !Object.hasOwn(configs, request.config))
    throw new Error(`playwright config must be ${Object.keys(configs).join(" or ")}`)
  if (!isFile(dir + request.config)) throw new Error(`playwright config missing: ${request.config}`)
  if (request.args.length === 0) throw new Error("playwright requires a nonempty spec file list")
  const config = configs[request.config as keyof typeof configs]
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
  return { package: request.package, runner: "playwright", args, config: request.config }
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
