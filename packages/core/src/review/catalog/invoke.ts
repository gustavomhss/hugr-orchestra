// GPL tools, invoke if installed (design §7.1). No pin, no extra flag, no install.
// A missing binary is `not run: <tool> absent` and does not block. Standard and Deep route them; Quick does not.
const invoke = (id: string, extensions: readonly string[], paths: readonly string[] = []) => ({
  id,
  tool: id,
  version: "project",
  licence: "invoke" as const,
  backend: "path" as const,
  languages: "any" as const,
  detection: { manifests: [], extensions: [...extensions], absent: [], ...(paths.length > 0 ? { paths: [...paths] } : {}) },
  lane: "no-build" as const,
  tiers: ["standard", "deep"],
  output: { format: "json" as const, parser: id },
  cost: "low" as const,
  network: { kind: "none" as const },
  scratchWrites: false,
  template: "invoke",
  lenses: ["correctness-logic"],
  status: "probation" as const,
})

export const shellcheck = { pack: invoke("shellcheck", [".sh", ".bash"]) }
export const hadolint = { pack: invoke("hadolint", [".dockerfile"], ["Dockerfile", "**/Dockerfile"]) }
