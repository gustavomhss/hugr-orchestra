// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type DeterministicMap, type FileSymbols, type DistilledInsight, NOTE_CAPS } from "./contracts.ts";
import { boundedStrings, parseReply } from "./note.ts";
export function buildDistillBrief(map: DeterministicMap, files: FileSymbols[]) {
  return ["RECONNAISSANCE structural map — not verified Own facts. No automatic model call.",
    "## Files & exported symbols", ...files.slice(0, 20).map((file) => `- ${file.path}: ${file.symbols.filter((symbol) => symbol.exported).map((symbol) => symbol.name).slice(0, 50).join(", ") || "(no exports)"}`),
    `Omitted files: ${Math.max(0, files.length - 20)}; ranked map omissions: ${JSON.stringify(map.omitted)}`,
    "## Entry points", ...map.entryPoints.slice(0, NOTE_CAPS.entryPoints), "## Where things live", ...map.whereThingsLive.slice(0, NOTE_CAPS.whereThingsLive).map((item) => `${item.what} → ${item.path}`),
    "## Cross-file imports", ...map.deps.slice(0, NOTE_CAPS.deps), "## Areas", map.areas.slice(0, NOTE_CAPS.areas).join(", "),
    'Infer ONLY candidate architectural invariants (≤6 terse lines) and refined areas (≤5). Return ONLY JSON: {"areas":[],"invariants":[]}. Validate claims against source before authority.',
  ].join("\n");
}
export function parseDistill(raw: string): DistilledInsight {
  const obj = parseReply(raw);
  return { areas: boundedStrings(obj.areas, NOTE_CAPS.areas), invariants: boundedStrings(obj.invariants, NOTE_CAPS.invariants) };
}
