import type { Catalog, Limits, PackageResult } from "./contracts"

// Frozen dependency scaffold only. No export/import functionality is claimed here.
export function encode(input: unknown, catalog: Catalog, limits?: Partial<Limits>): PackageResult {
  return { ok: false, diagnostics: [{ path: "", code: "invalid-input", messageKey: "fabric.package.scaffold" }] }
}

export function decode(text: string, catalog: Catalog, limits?: Partial<Limits>): PackageResult {
  return { ok: false, diagnostics: [{ path: "", code: "invalid-input", messageKey: "fabric.package.scaffold" }] }
}
