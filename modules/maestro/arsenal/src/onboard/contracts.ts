// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
export type { FileLoc, ReadingSlice, ReadingPlan, PlanOpts } from "./plan.ts";
export interface RepoNote { slice: number; areas: string[]; whereThingsLive: { what: string; path: string }[]; invariants: string[]; entryPoints: string[]; deps: string[] }
export const NOTE_CAPS = { areas: 5, whereThingsLive: 8, invariants: 6, entryPoints: 5, deps: 6 } as const;
export interface ProjectMemory { generatedFrom: { slices: number; files: number; totalLoc: number; capped: boolean }; areas: string[]; whereThingsLive: { what: string; path: string }[]; invariants: string[]; entryPoints: string[]; deps: string[] }
export type SymbolKind = "function" | "class" | "interface" | "type" | "const" | "enum" | "method" | "other";
export interface SymbolInfo { name: string; kind: SymbolKind; signature: string; line: number; exported: boolean }
export interface FileImport { from: string; names: string[] }
export interface FileSymbols {
  path: string; symbols: SymbolInfo[]; imports: FileImport[];
  coverage: { complete: boolean; reason?: "unsupported-language" | "parser-unavailable" | "partial-parse" | "unsupported-syntax"; scope: string; detail?: string };
}
export interface DeterministicMap { whereThingsLive: { what: string; path: string }[]; deps: string[]; entryPoints: string[]; areas: string[]; omitted: { symbols: number; deps: number; entryPoints: number } }
export interface DistilledInsight { areas: string[]; invariants: string[] }
// Profile remains D-owned; no duplicate state/authority model here.
