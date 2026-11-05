import type { FabricCapability } from "@orchestra/schema/fabric-capability"
import type { Catalog, Compilation } from "./contracts"

// Dependency scaffold only; never an implementation or delivery claim.
export function compile(input: unknown, catalog: Catalog, availability?: Readonly<Record<string, FabricCapability.Availability>>): Compilation {
  return { ok: false, diagnostics: [{ path: "", code: "invalid-input", messageKey: "fabric.declaration.scaffold" }] }
}
