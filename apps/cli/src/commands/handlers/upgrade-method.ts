export type UpgradeMethod = "npm" | "pnpm" | "yarn" | "bun" | "curl" | "desktop" | "unknown"

// Package managers install the binary under their own global directory, so the executable path names the one to upgrade with.
// Order matters: pnpm, yarn and bun globals also live under a node_modules directory.
export function upgradeMethod(execPath: string): UpgradeMethod {
  const exec = execPath.replaceAll("\\", "/").toLowerCase()
  if (exec.includes("/resources/cli/")) return "desktop"
  if (exec.includes("/.orchestra/bin/") || exec.includes("/.local/bin/")) return "curl"
  if (exec.includes("/pnpm/") || exec.includes("/.pnpm/")) return "pnpm"
  if (exec.includes("/.yarn/") || exec.includes("/yarn/global/")) return "yarn"
  if (exec.includes("/.bun/")) return "bun"
  if (exec.includes("/node_modules/")) return "npm"
  return "unknown"
}

export function upgradeCommand(method: UpgradeMethod, spec: string) {
  if (method === "npm") return ["npm", "install", "-g", spec] as const
  if (method === "pnpm") return ["pnpm", "add", "-g", spec] as const
  if (method === "yarn") return ["yarn", "global", "add", spec] as const
  if (method === "bun") return ["bun", "add", "-g", spec] as const
  return undefined
}
