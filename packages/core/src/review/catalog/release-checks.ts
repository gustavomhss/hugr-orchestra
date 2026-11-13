// Static release proof ids. Not a pack and not wired into Catalog.current here.
export const releaseChecks = {
  ids: ["release:provenance", "release:signing", "release:updater", "release:sbom", "release:notes"],
  options: [
    { id: "tool:release-provenance", rung: "tool", cost: "low" },
    { id: "tool:release-signing", rung: "tool", cost: "low" },
    { id: "tool:release-updater", rung: "tool", cost: "low" },
    { id: "tool:release-sbom", rung: "tool", cost: "low" },
    { id: "tool:release-notes", rung: "tool", cost: "low" },
  ],
  lens: { id: "security-release", node: "lucy-lens-security-release", classes: ["security.supply-chain"] },
} as const
