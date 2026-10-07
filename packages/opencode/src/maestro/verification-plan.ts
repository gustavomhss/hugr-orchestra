const checks = [
  "docs",
  "opencode-unit",
  "core-unit",
  "schema-unit",
  "godfile",
  "generated",
  "linux-unit",
  "windows-unit",
  "atlas",
] as const

const risks = ["docs", "package", "workflow", "api", "persistence", "security", "concurrency", "unknown"] as const
const packageIDs = ["opencode", "core", "schema"] as const

type CheckID = (typeof checks)[number]
type PackageID = (typeof packageIDs)[number]

export type CompileVerificationPlanInput = {
  baseSHA: string
  headSHA: string
  changedPaths: readonly string[]
  risk: "docs" | "package" | "workflow" | "api" | "persistence" | "security" | "concurrency" | "unknown"
  packages: readonly PackageID[]
  reverseDependencies: readonly PackageID[]
}

export type VerificationPlan = {
  baseSHA: string
  headSHA: string
  required: readonly CheckID[]
  skipped: readonly { id: CheckID; reason: "not-selected" }[]
  fallback: boolean
}

export function compileVerificationPlan(input: CompileVerificationPlanInput): VerificationPlan {
  if (
    !validSHA(input.baseSHA) ||
    !validSHA(input.headSHA) ||
    input.baseSHA === input.headSHA ||
    !validPaths(input.changedPaths) ||
    !risks.includes(input.risk) ||
    !validPackages(input.packages) ||
    !validPackages(input.reverseDependencies)
  ) {
    return fallback(input)
  }

  if (["unknown", "api", "persistence", "security", "concurrency"].includes(input.risk)) return fallback(input)

  if (input.risk === "workflow") {
    if (!input.changedPaths.every((path) => path.startsWith(".github/workflows/") || path === "script/godfile.ts")) {
      return fallback(input)
    }
    return selected(input, ["godfile", "generated", "linux-unit", "windows-unit", "atlas"])
  }

  if (input.risk === "docs") {
    if (!input.changedPaths.every((path) => path.endsWith(".md"))) return fallback(input)
    return selected(input, ["docs"])
  }

  if (
    input.packages.length === 0 ||
    !input.changedPaths.every((path) => input.packages.some((pkg) => path.startsWith(`packages/${pkg}/`)))
  ) {
    return fallback(input)
  }

  return selected(input, [
    ...new Set([...input.packages, ...input.reverseDependencies].map((pkg) => `${pkg}-unit` as CheckID)),
    "linux-unit",
  ])
}

function validSHA(value: string) {
  return /^[0-9a-f]{40}$/i.test(value)
}

function validPaths(paths: unknown) {
  return (
    Array.isArray(paths) &&
    paths.every((path) => typeof path === "string") &&
    paths.length > 0 &&
    new Set(paths).size === paths.length &&
    paths.every(
      (path) =>
        path.length > 0 &&
        !path.startsWith("/") &&
        !path.startsWith("\\") &&
        !/^[a-z]:/i.test(path) &&
        !path.split(/[\\/]/).includes(".."),
    )
  )
}

function validPackages(packages: unknown) {
  return (
    Array.isArray(packages) &&
    packages.every((pkg) => typeof pkg === "string") &&
    new Set(packages).size === packages.length &&
    packages.every((pkg) => packageIDs.some((id) => id === pkg))
  )
}

function fallback(input: CompileVerificationPlanInput): VerificationPlan {
  return { baseSHA: input.baseSHA, headSHA: input.headSHA, required: sorted(checks), skipped: [], fallback: true }
}

function selected(input: CompileVerificationPlanInput, required: readonly CheckID[]): VerificationPlan {
  const selected = new Set(required)
  return {
    baseSHA: input.baseSHA,
    headSHA: input.headSHA,
    required: sorted(required),
    skipped: sorted(checks.filter((check) => !selected.has(check))).map((id) => ({ id, reason: "not-selected" })),
    fallback: false,
  }
}

function sorted<T extends string>(values: readonly T[]) {
  return [...values].sort((left, right) => left.localeCompare(right))
}
