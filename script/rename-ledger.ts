// The opencode -> Orchestra rename ledger. packages/core/test/rename-guard.test.ts fails on any "opencode" (any case)
// that neither entry covers. Every entry must still match something in the tree; the guard fails on dead entries.
// Exemption changes require diff review. An entry with `requires` is checked only once that directory is tracked,
// so a branch that has not landed yet (packages/relay) can rely on it.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

// FROZEN_GENESIS_ARCHIVE_BEGIN
export const frozenResearch: readonly { file: string; sha256: string }[] = [
  { file: "modules/atlas/docs/design/genesis-ownership-operational-supplement.md", sha256: "88f0c0a3cdde2ffe69ecbf7a36db5dd086647c1cc9f59019879bc705cb6934db" },
  { file: "modules/atlas/docs/design/genesis-ownership-plan.md", sha256: "6164db5c520fd86f12f36b0165bae8cd5b4091a62d7b80596b77774f9a26d697" },
  { file: "modules/atlas/docs/design/genesis-ownership-prompts/common.md", sha256: "232a8051ca30a0a58082ab3e4116a81a2083d31cb66190aa880105314058ceee" },
  { file: "modules/atlas/docs/design/genesis-ownership-prompts/legacy-ownership.md", sha256: "3c959e9e324d3588de4ba03f901b119be230ef5313b4929d5d07a90acd4db274" },
  { file: "modules/atlas/docs/design/genesis-ownership-prompts/legacy-skill.md", sha256: "c289fbf068017aaaec34c31bba5a7eac69bc0ecd74f67bd20991805c0b86a691" },
  { file: "modules/atlas/docs/design/genesis-ownership-prompts/opencode-1.md", sha256: "5971fbbfa7b970ebbf737b684c84d652527753d66dc08adc55427b323656d252" },
  { file: "modules/atlas/docs/design/genesis-ownership-prompts/opencode-2.md", sha256: "9f9bcf8333617fa6c61060371450140fa99e542ec883ec83a51c98ab930cd415" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/layer-1/L1-review-manifest-v3.json", sha256: "d7d823df7c1ff0b20f1dbb6be169746b22a2d78fa32601c4d02c9dacbfc77341" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/layer-1/four-receipts.json", sha256: "f615524aa09c04364551ddb1de01aca24120761bc09840c20a9c945fc31e45e1" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/layer-4-sol/README.md", sha256: "6a5b68d95a6f289e6423c7a08304c8969475fa6f44274a79bbda4742e4f4e18d" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/layer-4-sol/operational-supplement-v1.body.md", sha256: "88f0c0a3cdde2ffe69ecbf7a36db5dd086647c1cc9f59019879bc705cb6934db" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/cold-consumer.py.txt", sha256: "fd2f8b25ffe1900feff7671cfa180e21583f117c1f2fea2b10d5e33d3573670f" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-E1-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-E1-turn-1.atlas-call.json", sha256: "d4d69ac08a2035525a5fdd3ef3f6aeb06373c08d1b80834d19f0c0106064f2a2" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-E1-turn-2.atlas-call.json", sha256: "78511cb8c1efed10e509cf0723604ed3c185821cb2c7c4060e050330da879ff0" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-E2-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-E2-turn-1.atlas-call.json", sha256: "d4d69ac08a2035525a5fdd3ef3f6aeb06373c08d1b80834d19f0c0106064f2a2" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-E2-turn-2.atlas-call.json", sha256: "1dafe62c551ac1a88ee637e9f0f0a30926acc1c466c87a9f3bc8751a93981046" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-H1-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-H1-turn-1.atlas-call.json", sha256: "4d1b05b8d4a3af6445891bde82b3c2616cbcd5f2b71f81ab00337546c270cd70" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-H1-turn-2.atlas-call.json", sha256: "5c238a2ccc0457d5eeb97cc98f009916104589b1f265eb4aff87ef3bf92c2451" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-H2-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-H3-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/N2-result.json", sha256: "44fc93ba68e8a7d459f3c9bc30203631543f755ba6a15a683476da6ef26d9468" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N1-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N1-turn-1.atlas-call.json", sha256: "d4d69ac08a2035525a5fdd3ef3f6aeb06373c08d1b80834d19f0c0106064f2a2" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N1-turn-2.atlas-call.json", sha256: "78511cb8c1efed10e509cf0723604ed3c185821cb2c7c4060e050330da879ff0" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N2-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N2-turn-1.atlas-call.json", sha256: "46e06180c0f0d48ce05fb70a11b802ddc9cc42fe62a5bbfe8c748f215ae5f7bd" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N2-turn-2.atlas-call.json", sha256: "90fefb62e19dff3848cb78d7fad89a9bdbd9c035ca73fb3652c43ee762b344f0" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N3-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N3-turn-1.atlas-call.json", sha256: "e2e600798b6f5cd95f628a5e064e1f0a447e874fc3f21e57452a58410e6b2eef" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-N3-turn-2.atlas-call.json", sha256: "9c7340a12957db6028372aa689dc761e491d5dba36380d816563b293f5bbccb0" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R1-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R1-turn-1.atlas-call.json", sha256: "dfe7dd946edb6b20e224815c714f5fbb855013fb8052222967856f2816a86719" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R1-turn-2.atlas-call.json", sha256: "78511cb8c1efed10e509cf0723604ed3c185821cb2c7c4060e050330da879ff0" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R1-turn-3.atlas-call.json", sha256: "5c238a2ccc0457d5eeb97cc98f009916104589b1f265eb4aff87ef3bf92c2451" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R2-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R2-turn-1.atlas-call.json", sha256: "dfe7dd946edb6b20e224815c714f5fbb855013fb8052222967856f2816a86719" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R3-entry.atlas-call.json", sha256: "b1136d4ebea73c0dd5394884b1f5b69f8ffd817bcd34fbe0ad3c8b16135ab901" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v2/consumer-v2-R3-turn-1.atlas-call.json", sha256: "4d1b05b8d4a3af6445891bde82b3c2616cbcd5f2b71f81ab00337546c270cd70" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-T1-entry.atlas-call.json", sha256: "c99808e0acc3dc159b472a760c5cb4f0cb448d22c4ab2adb80aaba229775256b" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-T1-turn-1.atlas-call.json", sha256: "e385b41e0ebbfd3dd9dfa1cd070f707683029207b4a398f4f663b5bb419f60bb" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-T2-entry.atlas-call.json", sha256: "c99808e0acc3dc159b472a760c5cb4f0cb448d22c4ab2adb80aaba229775256b" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-T2-turn-1.atlas-call.json", sha256: "e385b41e0ebbfd3dd9dfa1cd070f707683029207b4a398f4f663b5bb419f60bb" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U1-entry.atlas-call.json", sha256: "c99808e0acc3dc159b472a760c5cb4f0cb448d22c4ab2adb80aaba229775256b" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U1-turn-1.atlas-call.json", sha256: "e385b41e0ebbfd3dd9dfa1cd070f707683029207b4a398f4f663b5bb419f60bb" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U1-turn-2.atlas-call.json", sha256: "fe0b9efb1e74a1ce7f43b9422376a4a5a1847130c2d7eb586e88acb8e4e60637" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U2-entry.atlas-call.json", sha256: "c99808e0acc3dc159b472a760c5cb4f0cb448d22c4ab2adb80aaba229775256b" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U2-turn-1.atlas-call.json", sha256: "e385b41e0ebbfd3dd9dfa1cd070f707683029207b4a398f4f663b5bb419f60bb" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U3-entry.atlas-call.json", sha256: "c99808e0acc3dc159b472a760c5cb4f0cb448d22c4ab2adb80aaba229775256b" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U3-turn-1.atlas-call.json", sha256: "a467d8592275d64a3e532e5df7292f7f5a1dcf1c402af4f4d61d5d01a10eefcb" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/consumer-v3-U3-turn-2.atlas-call.json", sha256: "fe0b9efb1e74a1ce7f43b9422376a4a5a1847130c2d7eb586e88acb8e4e60637" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/prepare-native-v1.json", sha256: "6028fc26e84c1d109e7cc47d78fceb9c5f6b470abbb7993f2451301976dec85e" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/prepare-native-v2.json", sha256: "c46e86db21777d8e8250027c894e84958ee7bf093ce2b998781751f9f0a2b395" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/provenance-revision/source-corrected-operational-supplement-v1.body.md", sha256: "abffba16ff229e19e933d577c32a452b8bcd0be82691d358d9144ff6a531777c" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/publication-native-v1.json", sha256: "137fab6c7e048a7b2a245f602808d96e11fb2637c2360f1f33c61d75e3936c2e" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/consumer-v3/source-corrected-operational-supplement-v1.body.md", sha256: "abffba16ff229e19e933d577c32a452b8bcd0be82691d358d9144ff6a531777c" },
  { file: "modules/atlas/docs/design/genesis-ownership-results/runtime-pilot/final-validation/integrated-snapshot-v1.json", sha256: "ae1cbcf97acaea5c92600f594080771075655e00edf4405e5c4a2b37f9cb0053" },
  { file: "modules/atlas/docs/design/genesis-ownership-seats.md", sha256: "5c7754fb9fb17c4626947fe233209091f0f48e99ef53f2609de16112d52250c1" },
  { file: "modules/atlas/docs/design/genesis-ownership-slice.md", sha256: "4f90c9d85cbbf6bd1e95b7f273b6f69ab306f331acff1ce27ba4b2b1e01a1b88" },
  { file: "modules/atlas/docs/design/genesis-recovery-worklist.md", sha256: "fd139e2b16a611f6865b176b270f563264b0233e416800cfdb53c11feb265e49" },
]
// FROZEN_GENESIS_ARCHIVE_END

export type Kept = { path: RegExp; reason: string; requires?: string }
export type Protected = { pattern: RegExp; reason: string; paths?: RegExp }

// Whole files the codemod leaves alone and the guard does not scan.
export const keptPaths: Kept[] = [
  {
    path: /^script\/rename-(?:codemod|ledger)\.ts$|^packages\/core\/test\/rename-(?:guard|codemod)\.test\.ts$/,
    reason: "the rename tooling names the old strings it replaces",
  },
  { path: /(?:^|\/)(?:LICENSE|NOTICE)(?:\.[a-z]+)?$/, reason: "license and notice texts keep their copyright lines" },
  {
    path: /^packages\/app(?:-shell)?\/src\/i18n\/branding\.test\.ts$/,
    reason: "branding detector and its planted old-product counterexamples must keep the name they reject",
  },
  { path: /^docs\/specs\/hugr-maestro\/BASELINE-EVIDENCE\.md$/, reason: "baseline evidence record" },
  ...frozenResearch.map((entry) => ({
    path: new RegExp(`^${entry.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    reason: "exact hash-pinned Genesis campaign record retains external executor/provider provenance; changed bytes and new paths are not exempt",
  })),
  {
    path: /^docs\/architecture\/(?:monolith-map|restructure-plan|phase-plans\/(?:70-90|80-90-source|convergence|70c\/v2-route-inventory))\.md$/,
    reason: "restructure plans inventory the upstream names and vendored client they schedule for removal",
  },
  {
    path: /^specs\/atlas-ui\/build\/|^specs\/atlas-ui\/mock\/data-spawns\.js$/,
    reason: "the Atlas UI build runner drives external executor CLIs, and the mock replays recorded spawn logs verbatim",
  },
  {
    path: /^nix\/W5-readiness\.md$/,
    reason: "Nix readiness record naming the upstream npm packages it pins and replaces",
  },
  {
    path: /^(?:packages|modules)\/relay\/docs\/reviews\/[^/]+\.json$/,
    reason: "relay review records; their approvals bind artifact hashes taken before the rename",
    requires: "modules/relay",
  },
  {
    path: /^(?:packages|modules)\/relay\/test\/golden\/PARITY-EXCEPTIONS\.md$/,
    reason: "frozen golden corpus exception register; historical test paths retain pre-rename provenance",
    requires: "modules/relay",
  },
  {
    path: /^apps\/desktop\/docs\/plans\/dock-accessibility\/(?:recovery-\d+|handoff(?:-claude)?)\.md$/,
    reason: "recovery and handoff records that cite the real paths of past sessions",
  },
  {
    path: /^packages\/codemode\/test\/fixtures\/opencode-v2-openapi\.json$/,
    reason: "frozen upstream OpenAPI fixture",
  },
  {
    path: /^(?:(?:packages|apps)\/[^/]+|tooling\/http-recorder)\/test\/fixtures\/recordings\//,
    reason:
      "recorded HTTP cassettes; replay matches request bodies byte for byte, so they are re-recorded, not renamed",
    // Dormant where apps/orchestra is gone: no tracked cassette there names the old name, so the entry would match nothing.
    requires: "apps/orchestra",
  },
  {
    path: /^packages\/tui\/test\/cli\/tui\/(?:inline-tool-wrap-snapshot\.test\.tsx|__snapshots__\/inline-tool-wrap-snapshot\.test\.tsx\.snap)$/,
    reason: "line-wrap fixture whose arbitrary transcript text fixes the wrap points of its snapshot",
  },
]

// Strings that keep the old name wherever they appear (or only in `paths`).
export const protectedStrings: Protected[] = [
  // Integrity
  { pattern: /opencode:event-seal:v1/g, reason: "legacy seal domain, still accepted when verifying stored event seals" },

  // Upstream project and hosted services Orchestra does not run
  {
    pattern: /(?:[A-Za-z0-9-]+\.)*opencode\\?\.(?:ai|cafe)\b/g,
    reason: "upstream-hosted domain; renaming would point at an unrelated domain",
  },
  { pattern: /\b(?:sst|claudianus)(?:\/|\\+)opencode\b/g, reason: "upstream repository" },
  { pattern: /\bupstream (?:opencode|OpenCode)\b/g, reason: "sentence about the upstream project" },
  { pattern: /\bOpenCode's historical\b/g, reason: "sentence about upstream history" },

  // Third-party packages
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
  { pattern: /\bx-opencode-session\b/g, reason: "the session header Zen and Go require on every call" },
  {
    pattern: /opencode(?:#credential|-test)\b|\bheaders\("opencode"\)/g,
    paths: /^packages\/core\/test\/session-runner-model\.test\.ts$/,
    reason: "Zen provider-family fixture proving the configured User-Agent is never overridden",
  },
  {
    pattern: /opencode:free-model/g,
    paths: /^packages\/app(?:-shell)?\/e2e\/regression\/model-picker-virtual-list\.spec\.ts$/,
    reason: "Zen provider id in the model picker's selected-row locator",
  },
  {
    pattern: /opencode\|OC-2/g,
    paths: /^packages\/app(?:-shell)?\/e2e\/orchestra\/chapter-settings\.spec\.ts$/,
    reason: "negative assertion against the inherited theme names, not against Orchestra",
  },
  {
    pattern: /\b(?:providerID|provider|id|router)\s*[!=]==?\s*(["'])opencode\1/g,
    reason: "comparison with the Zen provider id",
  },
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
      /^packages\/ui\/src\/components\/provider-icons\/(?:sprite\.svg|types\.ts)$|^packages\/app(?:-shell)?\/src\/hooks\/use-providers\.ts$|^apps\/storybook\/\.storybook\/mocks\/app\/(?:hooks\/use-providers|context\/server-sdk)\.ts$|^packages\/app(?:-shell)?\/src\/orchestra\/(?:model-logo-resolver(?:\.test)?\.ts|chapters\/providers-data\.test\.ts)$|\/test\/session\/retry\.test\.ts$/,
    reason: "the Zen provider id",
  },
  {
    pattern: /(?<=catalog\.all\.get\()"opencode"/g,
    paths: /^packages\/app-shell\/src\/context\/global-sync\/provider-bootstrap\.test\.ts$/,
    reason: "Zen provider map lookups after normalization through the vendored promise client",
  },
  {
    pattern: /\bcatalog\("opencode"\)/g,
    paths: /^packages\/app-shell\/src\/context\/server-provider-refresh\.test\.ts$/,
    reason: "Zen provider id in the pre-auth catalog refresh fixture",
  },
  {
    pattern: /"opencode\/zen-free"/g,
    paths: /^packages\/app-shell\/src\/hooks\/model-execution\.test\.ts$/,
    reason: "Zen provider/model wire reference retained among API execution choices",
  },
  {
    pattern: /\bprovider\("opencode"\)|\bmodel\("opencode", "zen-free"\)/g,
    paths: /^packages\/app-shell\/src\/testing\/model-execution-fixture\.ts$/,
    reason: "Zen provider and free-model wire ids in the mixed-engine normalization fixture",
  },
  {
    pattern: /\bprovider\("opencode"|"opencode\/free"/g,
    paths: /^packages\/app-shell\/test-browser\/model-catalog\.test\.ts$/,
    reason: "Zen provider/model wire ids used to prove older free models remain selectable",
  },
  {
    pattern: /\bproviders: \["opencode"\]/g,
    paths: /^packages\/app-shell\/test-browser\/provider-resource\.test\.ts$/,
    reason: "Zen provider id in the catalog returned before and after an auth refresh failure",
  },
  {
    pattern: /\bresource: "opencode"/g,
    paths: /^packages\/core\/test\/catalog\.test\.ts$/,
    reason: "provider.use policy resource must match the external Zen provider id",
  },
  {
    pattern: /\b(?:enabled|disabled)_providers: \["opencode"|"provider\.use", "opencode", "allow"/g,
    paths: /^packages\/core\/test\/config\/provider-policy-migration\.test\.ts$/,
    reason: "legacy provider restrictions and migrated policy decisions retain the Zen wire id",
  },
  {
    pattern: /"opencode"(?=:\s*\{)|"id": "opencode"|"name": "OpenCode"/g,
    paths: /^packages\/core\/test\/plugin\/fixtures\/models-dev-public\.json$/,
    reason: "verbatim models.dev snapshot retains its external Zen provider key, id and published name",
  },
  {
    pattern: /\["deepinfra", "poe", "opencode"\]/g,
    paths: /^packages\/core\/test\/plugin\/models-dev\.test\.ts$/,
    reason: "decoded provider keys must equal the raw models.dev snapshot's external ids",
  },
  {
    pattern: /\bopencode-v2-openapi\.json\b/g,
    paths: /^packages\/codemode\/test\/openapi\.test\.ts$/,
    reason: "reference to the frozen upstream OpenAPI fixture, whose basename is kept",
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
  if (frozenResearch.some((entry) => entry.file === file))
    return frozenResearchMatches(file, readFileSync(resolve(fileURLToPath(new URL("..", import.meta.url)), file)))
  return keptPaths.some((entry) => entry.path.test(file))
}

export function frozenResearchMatches(file: string, bytes: Uint8Array) {
  const entry = frozenResearch.find((entry) => entry.file === file)
  return entry !== undefined && createHash("sha256").update(bytes).digest("hex") === entry.sha256
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
