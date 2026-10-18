// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type RepoNote, type ReadingSlice, NOTE_CAPS } from "./contracts.ts";
import { AcquisitionError } from "../engine/acquisition.ts";
export function buildSliceBrief(slice: ReadingSlice) {
  return `READ-ONLY reconnaissance — slice ${slice.id}${slice.oversized ? " (oversized: skim structure/hotspots)" : ""}\nDo not modify files or treat observations as verified Own facts.\nFILES:\n${slice.files.map((file) => `- ${file.path}`).join("\n")}\nReturn ONLY JSON: {"slice":${slice.id},"areas":[],"whereThingsLive":[{"what":"","path":""}],"invariants":[],"entryPoints":[],"deps":[]}\nCAPS: ${JSON.stringify(NOTE_CAPS)}. Terse facts; no source dumps.`;
}
export function parseReply(raw: string): Record<string, unknown> {
  if (raw.length > 65536) throw new AcquisitionError("NOTE_TOO_LARGE", "reply exceeds 64K characters");
  const fenced = /```json\s*([\s\S]*?)```/.exec(raw)?.[1];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const json = fenced ?? (start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  const parsed: unknown = (() => {
    try { return JSON.parse(json) as unknown; } catch { throw new AcquisitionError("NOTE_MALFORMED", "invalid JSON reply"); }
  })();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new AcquisitionError("NOTE_MALFORMED", "JSON object required");
  return parsed as Record<string, unknown>;
}
export function boundedStrings(value: unknown, cap: number): string[] {
  if (!Array.isArray(value) || value.some((item: unknown) => typeof item !== "string")) throw new AcquisitionError("NOTE_MALFORMED", "string array required");
  return value.slice(0, cap).map((item: string) => item.trim().slice(0, 500));
}
export function parseNote(raw: string, slice: number): RepoNote {
  const obj = parseReply(raw);
  if (!Array.isArray(obj.whereThingsLive)) throw new AcquisitionError("NOTE_MALFORMED", "whereThingsLive array required");
  const whereThingsLive = obj.whereThingsLive.slice(0, NOTE_CAPS.whereThingsLive).map((item: unknown) => {
    if (!item || typeof item !== "object" || !("what" in item) || !("path" in item) || typeof item.what !== "string" || typeof item.path !== "string") throw new AcquisitionError("NOTE_MALFORMED", "what/path strings required");
    return { what: item.what.slice(0, 500), path: item.path.slice(0, 1000) };
  });
  return { slice, whereThingsLive, areas: boundedStrings(obj.areas, NOTE_CAPS.areas), invariants: boundedStrings(obj.invariants, NOTE_CAPS.invariants), entryPoints: boundedStrings(obj.entryPoints, NOTE_CAPS.entryPoints), deps: boundedStrings(obj.deps, NOTE_CAPS.deps) };
}
