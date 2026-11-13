export * as ReviewLocalCheckCards from "./local-checks"

import shfmtPin from "../../backend-toolkit/packs/shfmt"
import cargoMachetePin from "../../backend-toolkit/packs/cargo-machete"

const card = (pin: typeof shfmtPin | typeof cargoMachetePin, extensions: string[], paths: string[], languages: "any" | string[], cost: "low" | "medium", template: string) => ({ pack: {
  id: pin.id, tool: pin.id, version: pin.version,
  pin: { source: `backend-toolkit/packs/${pin.id}`, integrity: { "linux-x64": pin.targets["linux-x64"].artifact.integrity } },
  licence: "pinned", backend: "pinned", languages,
  detection: { manifests: [], extensions, absent: [], paths },
  lane: "no-build", tiers: ["standard", "deep"], output: { format: "check" }, cost,
  network: { kind: "none" }, scratchWrites: false, template, lenses: ["correctness-logic"], status: "probation",
} } as const)

// Linux x64 raw check cards; host preparation remains explicit.
export const shfmt = card(shfmtPin, [".sh", ".bash", ".bats", ".ksh"], [], "any", "low", "shfmt-local-check")
export const cargoMachete = card(cargoMachetePin, [".rs"], ["Cargo.toml", "**/Cargo.toml", "Cargo.lock", "**/Cargo.lock"], ["rust"], "medium", "cargo-machete-local-check")
