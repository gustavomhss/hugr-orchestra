import type { Finding, Report, Rule } from "./contract"
import catalog from "./rules.fixture.json"

// Fixture data in the exact contract shapes (brief §5) until the Guardrail side ships the runner's JSON output and a
// server route. The rules are generated from script/guards/rules/*.toml; the reports cover every state in §7.
export const rules = catalog as Rule[]

const base = "8f3c2a1d9e0b7c6f5a4e3d2c1b0a9f8e7d6c5b4a"

function hit(rule: string, path: string, line: number | null, excerpt: string | null, needle?: string): Finding {
  const source = rules.find((item) => item.id === rule)
  if (!source) throw new Error(`fixture names unknown rule ${rule}`)
  const start = needle && excerpt ? excerpt.indexOf(needle) : -1
  return {
    rule,
    severity: source.severity,
    path,
    line,
    message: source.message,
    excerpt,
    match: start < 0 || !needle ? null : [start, start + needle.length],
  }
}

function report(input: Partial<Report>): Report {
  return {
    base,
    bootstrap: false,
    rules: rules.length,
    files: 14,
    findings: [],
    errors: [],
    approved: [],
    touchesGuards: false,
    ...input,
  }
}

const warnings = [
  hit("js-console-log", "packages/app-shell/src/pages/session/timeline.tsx", 214, '    console.log("scroll", top)', "console.log("),
  hit("ts-any-added", "packages/core/src/session/runner.ts", 88, "  const payload: any = await read(input)", ": any"),
]

const blocked = [
  hit("ts-ignore", "packages/core/src/session/runner.ts", 131, "    // @ts-ignore", "@ts-ignore"),
  hit(
    "secret-token",
    "packages/app-shell/src/orchestra/chapters/integrations/providers/very-long-folder-name/credentials.ts",
    12,
    'export const token = "ghp_8x2LkQ9vT4nR7wB1yZ5cM3dF6hJ0pS"',
    "ghp_8x2LkQ9vT4nR7wB1yZ5cM3dF6hJ0pS",
  ),
  hit("js-test-skipped", "packages/core/test/session/runner.test.ts", 47, '  test.skip("resumes after a crash", async () => {', "test.skip("),
  hit("protected-paths", ".github/workflows/guards.yml", null, null),
  hit("test-file-deleted", "packages/core/test/session/legacy-loop.test.ts", null, null),
  hit(
    "guardrail-ignore-added",
    "packages/app-shell/src/pages/session/timeline.tsx",
    90,
    "  const raw = el as any // guardrail-ignore: ts-any-added DOM typings lag the spec",
    "guardrail-ignore:",
  ),
  ...warnings,
]

// A change that adds thousands of lines: hundreds of findings across many files.
const large = Array.from({ length: 600 }, (_, index) => {
  const file = `packages/app-shell/src/generated-like/module-${String(index % 48).padStart(2, "0")}/view.tsx`
  return index % 9 === 0
    ? hit("js-debugger", file, 10 + index, "    debugger", "debugger")
    : hit("js-console-log", file, 10 + index, `    console.log("step ${index}")`, "console.log(")
})

export const scenarios = {
  clean: report({}),
  warnings: report({ findings: warnings }),
  blocked: report({ findings: blocked }),
  large: report({ files: 48, findings: large }),
  bootstrap: report({ bootstrap: true, findings: warnings }),
  guards: report({
    touchesGuards: true,
    approved: ["protected-paths"],
    findings: blocked.filter((finding) => finding.rule !== "protected-paths"),
  }),
  empty: report({ files: 0 }),
  noRepository: report({
    base: null,
    files: 0,
    errors: [{ kind: "no-repository", message: "This folder is not inside a git repository." }],
  }),
  noBase: report({
    base: null,
    files: 0,
    errors: [{ kind: "base-not-found", message: "No merge base with dev. Fetch it with: git fetch origin dev" }],
  }),
  invalid: report({
    files: 0,
    errors: [{ kind: "rules-invalid", message: "rules/ts-ignore.toml: positive sample 2 did not fire." }],
  }),
  noRules: report({ rules: 0 }),
} satisfies Record<string, Report>

export type Scenario = keyof typeof scenarios
