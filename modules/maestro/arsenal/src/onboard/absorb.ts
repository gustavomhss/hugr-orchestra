// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type RepoNote, type ProjectMemory } from "./contracts.ts";
export function mergeNotes(notes: RepoNote[], generatedFrom: ProjectMemory["generatedFrom"]): ProjectMemory {
  const unique = (strings: string[]) => [...new Set(strings.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const whereThingsLive = [...new Map(notes.flatMap((note) => note.whereThingsLive).map((item) => [`${item.what} ${item.path}`, item])).values()].sort((a, b) => a.path.localeCompare(b.path) || a.what.localeCompare(b.what));
  return { generatedFrom, whereThingsLive, areas: unique(notes.flatMap((note) => note.areas)), invariants: unique(notes.flatMap((note) => note.invariants)), entryPoints: unique(notes.flatMap((note) => note.entryPoints)), deps: unique(notes.flatMap((note) => note.deps)) };
}
export function renderMemoryMd(memory: ProjectMemory) {
  return [`# Reconnaissance advice — ${memory.generatedFrom.slices} slice(s) · ${memory.generatedFrom.files} file(s) · ${memory.generatedFrom.totalLoc} LOC${memory.generatedFrom.capped ? " · CAPPED (skimmed)" : ""}`,
    "Structural observations and candidate invariants; not Atlas context or verified Own facts.",
    ...[{ name: "Where things live", entries: memory.whereThingsLive.map((item) => `${item.what} → \`${item.path}\``) }, { name: "Candidate invariants", entries: memory.invariants }, { name: "Entry points", entries: memory.entryPoints }, { name: "Dependencies", entries: memory.deps }, { name: "Areas", entries: memory.areas }].flatMap((section) => section.entries.length ? ["", `## ${section.name}`, ...section.entries.map((entry) => `- ${entry}`)] : []), "",
  ].join("\n");
}
