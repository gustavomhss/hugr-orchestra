export * as CapabilityAssetSources from "./sources"

export const hermes = {
  repository: "https://github.com/NousResearch/hermes-agent",
  SHA: "134e08ca6d272c9b9610ce5889e2ecff9c73adf0",
  license: "MIT",
  notice: "licenses/hermes.LICENSE",
} as const

export const openclaw = {
  repository: "https://github.com/openclaw/openclaw",
  SHA: "2a305612539ccbb63a19b2030a05158dddd42a64",
  license: "MIT",
  notice: "licenses/openclaw.LICENSE",
} as const

// Source qualification records provenance, not runtime or dependency qualification.
export const manifest = {
  status: "source-qualified",
  plan: "specs/orchestra-capabilities/ASSET-MAP.md",
  importedContent: "license notices and provider preset data only",
  plannedAdaptations: {
    skill: "Rename frontmatter/body names; adapt referenced recipes, scripts and companions in separate owning WPs.",
    provider: "Adapt endpoint/OAuth/filter declarations to first-party connections; qualify discovered schemas per route.",
    native: "Extract operation mappings and algorithms into typed Orchestra adapters with permissions and receipts.",
  },
  pendingEvidence: ["copied-file digests", "dependency integrity/licenses", "operation conformance", "live acceptance"],
} as const
