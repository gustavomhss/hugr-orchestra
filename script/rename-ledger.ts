// The opencode -> Orchestra rename ledger. One list feeds both sides:
// - script/rename-codemod.ts never rewrites a kept path or a protected string;
// - packages/core/test/rename-guard.test.ts fails on any "opencode" (any case) that neither covers.
// Every entry must still match something in the tree; the guard fails on dead entries. Exemption changes require
// diff review. An entry with `requires` is checked only once that directory is tracked,
// so a branch that has not landed yet (packages/relay) can rely on it when it runs the codemod before merging.

export type Kept = { path: RegExp; reason: string; requires?: string }
export type Protected = { pattern: RegExp; reason: string; paths?: RegExp }

// Whole files the codemod leaves alone and the guard does not scan.
export const keptPaths: Kept[] = [
  {
    path: /^script\/rename-(?:codemod|ledger)\.ts$|^packages\/core\/test\/rename-(?:guard|codemod)\.test\.ts$/,
    reason: "the rename tooling names the old strings it replaces",
  },
  { path: /(?:^|\/)(?:LICENSE|NOTICE)(?:\.[a-z]+)?$/, reason: "license and notice texts keep their copyright lines" },
  { path: /^specs\/orchestra-visual\/(?:handoff|evidence)\//, reason: "hash-pinned evidence archives" },
  { path: /^specs\/hugr-maestro\/BASELINE-EVIDENCE\.md$/, reason: "baseline evidence record" },
  {
    path: /^packages\/relay\/docs\/reviews\/[^/]+\.json$/,
    reason: "relay review records; their approvals bind artifact hashes taken before the rename",
    requires: "packages/relay",
  },
  {
    path: /^packages\/desktop\/docs\/plans\/dock-accessibility\/(?:recovery-\d+|handoff(?:-claude)?)\.md$/,
    reason: "recovery and handoff records that cite the real paths of past sessions",
  },
  {
    path: /^patches\/install-korean-ime-fix\.sh$/,
    reason: "third-party installer script that builds upstream opencode from a community fork",
  },
  {
    path: /^packages\/codemode\/test\/fixtures\/opencode-v2-openapi\.json$/,
    reason: "frozen upstream OpenAPI fixture",
  },
  {
    path: /^packages\/[^/]+\/test\/fixtures\/recordings\//,
    reason:
      "recorded HTTP cassettes; replay matches request bodies byte for byte, so they are re-recorded, not renamed",
  },
  {
    path: /^packages\/(?:opencode|orchestra)\/test\/tool\/fixtures\/models-api\.json$/,
    reason: "snapshot of the third-party models.dev catalog, which lists the Zen provider",
  },
  {
    path: /^packages\/tui\/test\/cli\/tui\/(?:inline-tool-wrap-snapshot\.test\.tsx|__snapshots__\/inline-tool-wrap-snapshot\.test\.tsx\.snap)$/,
    reason: "line-wrap fixture whose arbitrary transcript text fixes the wrap points of its snapshot",
  },
]

// Strings that keep the old name wherever they appear (or only in `paths`).
export const protectedStrings: Protected[] = [
  // Integrity
  { pattern: /opencode:event-seal:v1/g, reason: "hashed into every stored event seal" },

  // Upstream project and hosted services Orchestra does not run
  {
    pattern: /(?:[A-Za-z0-9-]+\.)*opencode\\?\.(?:ai|cafe)\b/g,
    reason: "upstream-hosted domain; renaming would point at an unrelated domain",
  },
  { pattern: /\b(?:anomalyco|sst|claudianus)(?:\/|\\+)opencode\b/g, reason: "upstream repository" },
  { pattern: /\bsst-dev\.opencode\b/g, reason: "upstream VS Code extension id" },
  { pattern: /\bupstream (?:opencode|OpenCode)\b/g, reason: "sentence about the upstream project" },
  { pattern: /\bOpenCode's historical\b/g, reason: "sentence about upstream history" },
  { pattern: /\bopencode 2\.0\b/g, reason: "sentence about an upstream release" },
  {
    pattern:
      /Older releases named these branches `opencode\/<name>`|older worktrees keep their `opencode\/<name>` branch|legacy opencode\/ branch/g,
    reason: "sentence about branches created by older releases",
  },
  {
    pattern: /`opencode\/\$\{name\}`/g,
    paths: /^packages\/(?:opencode|orchestra)\/test\/project\/worktree\.test\.ts$/,
    reason: "legacy branch name the worktree test creates on purpose",
  },
  {
    pattern: /opencode\/legacy|`opencode\/\$\{directory/g,
    paths: /^packages\/app\/e2e\/orchestra\/chapter-workspaces\.spec\.ts$/,
    reason: "legacy branch name the worktree e2e test creates on purpose",
  },

  // Third-party packages
  {
    // app and session-ui depend on upstream's published @opencode-ai/client 1.17.13, vendored as a tarball that cannot
    // be rebuilt from this tree. It keeps its published name and exports until it is replaced by the workspace client.
    pattern: /@opencode-ai\/client\b|opencode-ai-client-1\.17\.13-v2\.tgz/g,
    paths: /^packages\/(?:app|session-ui)\/|^bun\.lock$/,
    reason: "vendored upstream @opencode-ai/client tarball, kept under its published name",
  },
  {
    pattern: /\bOpenCode(?:Event|Client)\b|\bOpenCode(?=\.make\b)|(?<=import \{ (?:ClientError, )?)OpenCode\b/g,
    paths: /^packages\/app\/src\//,
    reason: "names exported by the vendored upstream @opencode-ai/client tarball",
  },
  {
    pattern: /(?:@gitlab\/)?opencode-(?:gitlab|poe|openai-codex|copilot)-auth\b/g,
    reason: "third-party plugin package",
  },
  { pattern: /\boh-my-opencode\b/g, reason: "third-party plugin package" },

  // OpenCode Zen and Go: a third-party provider whose id, env var, console and wire protocol are not ours.
  // Context patterns come before the plain `opencode-go` entry, which would otherwise hide their context.
  { pattern: /"opencode"(?=,\s*"opencode-go")/g, reason: "the Zen provider id in a provider list" },
  { pattern: /(?<=connected[^\n]{0,40})"opencode"/g, reason: "the Zen provider id in a connected-provider fixture" },
  { pattern: /\bOpenCode (?:Zen|Go)\b/g, reason: "third-party provider name" },
  {
    pattern: /\bopencode-go\b|\bopencode(?:Zen|Go)\b/g,
    reason: "Zen/Go provider id and the i18n keys derived from it",
  },
  { pattern: /OPENCODE_API_KEY\b/g, reason: "Zen's own API key variable, as published by models.dev" },
  {
    pattern: /\bx-opencode-(?:project|session|request|client)\b/g,
    reason: "Zen request headers read by Zen's backend",
  },
  { pattern: /(?<=client_?id["'\s,:=]{1,6})opencode-(?:cli|desktop)\b/gi, reason: "Zen console OAuth client id" },
  {
    pattern: /\b(?:providerID|provider|id|router)\s*[!=]==?\s*(["'])opencode\1/g,
    reason: "comparison with the Zen provider id",
  },
  { pattern: /\.startsWith\((["'])opencode\1\)/g, reason: "match on the Zen provider id prefix" },
  {
    pattern:
      /\bproviderID:\s*(["'])opencode\1|\bID\.opencode\b|\bID\.make\((["'])opencode\2\)|\bopencode: schema\.make\("opencode"\)/g,
    reason: "the Zen provider id",
  },
  {
    pattern:
      /\bid:\s*(["'])opencode\1|\b(?:v[12]Provider|v2Model|renderConnection|selectOption)\("opencode"|data-provider-id="opencode"/g,
    reason: "the Zen provider id in a provider object or fixture",
  },
  {
    pattern: /(?<![\w./-])opencode(?=:\s*\{)|\?\.\[(["'])opencode\1\]|(?<=providerOptions\??\.)opencode\b/g,
    reason: "the Zen provider id as a provider config, auth or options key",
  },
  { pattern: /\bdialog\.provider\.opencode\b/g, reason: "i18n key derived from the Zen provider id" },
  { pattern: /\bopencode\/(?:gpt-[\w.-]+|big-pickle|mimo|other|next)\b/g, reason: "Zen model reference" },
  {
    pattern: /\bprovider\/opencode(?:-go)?(?:\.svg)?\b|\bprovider-opencode\b|\bOpencodePlugin\b/g,
    reason: "the Zen provider plugin, its test and its icons keep the provider id as file name",
  },
  {
    pattern:
      /"opencode"|'opencode'|\bOpencodePlugin\b|\bOpenCode Console\b|\bOpenCode (?:provider|server)\b|\bnon-opencode\b|\bopencode small model\b|"OpenCode"/g,
    paths: /^packages\/core\/(?:src\/plugin\/provider\/opencode\.ts|test\/plugin\/provider-opencode\.test\.ts)$/,
    reason: "the Zen provider plugin",
  },
  {
    pattern: /"opencode"/g,
    paths:
      /^packages\/ui\/src\/components\/provider-icons\/(?:sprite\.svg|types\.ts)$|^packages\/app\/src\/hooks\/use-providers\.ts$|^packages\/storybook\/\.storybook\/mocks\/app\/(?:hooks\/use-providers|context\/server-sdk)\.ts$|^packages\/app\/src\/orchestra\/(?:model-logo-resolver(?:\.test)?\.ts|chapters\/providers-data\.test\.ts)$|\/test\/session\/retry\.test\.ts$/,
    reason: "the Zen provider id",
  },
  {
    pattern: /\["opencode", "/g,
    paths: /\/test\/provider\/transform\.test\.ts$/,
    reason: "the Zen provider id in a transform table",
  },
  {
    pattern: /\bopencode-v2-openapi\.json\b/g,
    paths: /^packages\/codemode\/test\/openapi\.test\.ts$/,
    reason: "reference to the frozen upstream OpenAPI fixture, whose basename is kept",
  },

  // Provider identity still under a live probe (rename-external-plan.md items 8b-8e, 8i)
  { pattern: /\boriginator(?:["']?\]?\s*[:=]\s*["']?|=)opencode\b/g, reason: "Codex originator, kept until probed" },
  {
    pattern:
      /(?<=["'](?:X-Title|X-Source|X-Cerebras-3rd-Party-Integration|X-BILLING-INVOKE-ORIGIN)["']\]?\s*(?:\?\?=|=|:)\s*["'])(?:opencode|OpenCode)\b/g,
    reason: "provider attribution header, kept until probed",
  },
  { pattern: /\breferrer:\s*"opencode"/g, reason: "xAI referrer, kept until probed" },
  {
    pattern: /opencode\/\$\{InstallationVersion\}/g,
    paths: /(?:github-copilot\/copilot|openai\/codex|plugin\/xai|plugin\/provider\/openai)\.ts$/,
    reason: "User-Agent sent with upstream-registered OAuth apps, kept until probed",
  },
  {
    pattern: /\^opencode\\\/|toBe\("opencode"\)/g,
    paths: /\/test\/plugin\/xai\.test\.ts$/,
    reason: "xAI User-Agent and referrer, kept until probed",
  },

  // Upstream build artifacts the tree downloads until Orchestra publishes its own
  {
    pattern: /@opencode-ai\/cli-(?=[a-z])|\bopencode2\b/g,
    paths: /^packages\/desktop\/scripts\/utils\.ts$/,
    reason: "upstream's published CLI binary, which the desktop dev build downloads from npm",
  },

  // Unrelated words
  {
    pattern: /\bopenCode\b/g,
    paths: /^packages\/session-ui\/src\/components\/markdown-stream\.ts$/,
    reason: "opens a code fence; not the product name",
  },
]

export const OLD_NAME = /opencode/i

export function kept(file: string) {
  return keptPaths.some((entry) => entry.path.test(file))
}

// The old names left in a file (and its path) once protected strings are taken out, as "file:line: text".
export function oldNames(file: string, text: string) {
  const strip = (value: string) =>
    protectedStrings.reduce(
      (current, item) => (item.paths && !item.paths.test(file) ? current : current.replace(item.pattern, "")),
      value,
    )
  const found = OLD_NAME.test(strip(file)) ? [`${file}: path`] : []
  if (!OLD_NAME.test(text)) return found
  return [
    ...found,
    ...strip(text)
      .split("\n")
      .flatMap((line, index) => (OLD_NAME.test(line) ? [`${file}:${index + 1}: ${line.trim().slice(0, 160)}`] : [])),
  ]
}
