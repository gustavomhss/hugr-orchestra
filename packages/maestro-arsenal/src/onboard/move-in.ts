// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
// Scan/extract/derive and reader planning retained; native host controls dispatch and persistence.
import { join } from "node:path";
import { type ArsenalContext } from "../contract.ts";
import { mapRepository } from "../tools/repo-mapper.ts";
import { AcquisitionError, projectPath, statePath, physical, inside } from "../engine/acquisition.ts";
import { shouldRead } from "./filter.ts";
import { planReadingSlices, type PlanOpts, type ReadingPlan } from "./plan.ts";
import { buildSliceBrief, parseNote } from "./note.ts";
import { mergeNotes, renderMemoryMd } from "./absorb.ts";
import { extractSymbols } from "./extract.ts";
import { deriveMap } from "./derive.ts";
import { buildDistillBrief, parseDistill } from "./distill.ts";
import { type ProjectMemory } from "./contracts.ts";

async function scan(context: ArsenalContext, root?: string) {
  const result = await mapRepository({ root }, context, { all: true });
  return { entries: result.entries.filter((entry) => entry.type === "file" && entry.loc !== undefined && shouldRead(entry.path)), coverage: result.coverage };
}

export async function planMoveIn(context: ArsenalContext, opts: PlanOpts = {}, root?: string) {
  const result = await scan(context, root);
  const plan = planReadingSlices(result.entries.map((entry) => ({ path: entry.path, loc: entry.loc! })), opts);
  return { plan, briefs: plan.slices.map((slice) => ({ slice: slice.id, brief: buildSliceBrief(slice) })), coverage: result.coverage };
}

export async function mapMoveIn(context: ArsenalContext, root?: string) {
  const result = await scan(context, root);
  const files = [];
  for (const entry of result.entries.slice(0, 200)) {
    const path = await projectPath(context, entry.path);
    files.push(await extractSymbols(entry.path, await Bun.file(path).text(), context));
  }
  const map = deriveMap(files);
  const parserIssues = [...files.filter((file) => !file.coverage.complete).map((file) => ({ path: file.path, reason: file.coverage.reason! as string })), ...result.entries.slice(200).map((entry) => ({ path: entry.path, reason: "parser-file-cap" })), ...result.entries.length ? [] : [{ path: ".", reason: "no-readable-source" }]];
  const coverage = { ...result.coverage, complete: result.coverage.complete && parserIssues.length === 0, issues: [...result.coverage.issues, ...parserIssues].slice(0, 100), issueCount: result.coverage.issueCount + parserIssues.length, scope: `${result.coverage.scope}; generated/vendored/data paths filtered; top-level supported TS/Python syntax; parser file cap 200` };
  return { map, files, fileLoc: result.entries.map((entry) => ({ path: entry.path, loc: entry.loc! })), distillBrief: buildDistillBrief(map, files), stats: { files: result.entries.length, parsedFiles: files.length, totalLoc: result.entries.reduce((sum, entry) => sum + entry.loc!, 0) }, coverage };
}
export type MapMoveIn = Awaited<ReturnType<typeof mapMoveIn>>;
export type MovePlan = { mode: "deterministic"; mm: MapMoveIn } | { mode: "reader"; mm: MapMoveIn; plan: ReadingPlan; briefs: { slice: number; brief: string }[]; fallback: { path: string; reason: string }[] };

export async function planMove(context: ArsenalContext, opts: PlanOpts = {}, root?: string): Promise<MovePlan> {
  const mm = await mapMoveIn(context, root);
  const fallback = [...mm.coverage.issues];
  if (!fallback.length) return { mode: "deterministic", mm };
  const plan = planReadingSlices(mm.fileLoc, opts);
  return { mode: "reader", mm, plan, briefs: plan.slices.map((slice) => ({ slice: slice.id, brief: buildSliceBrief(slice) })), fallback };
}

export function structuralMemory(mm: MapMoveIn): ProjectMemory {
  return { generatedFrom: { slices: 0, ...mm.stats, capped: !mm.coverage.complete }, areas: mm.map.areas, whereThingsLive: mm.map.whereThingsLive, invariants: [], entryPoints: mm.map.entryPoints, deps: mm.map.deps };
}
export function absorbMoveIn(plan: ReadingPlan, replies: { slice: number; raw: string }[]): ProjectMemory {
  if (replies.length !== plan.slices.length || new Set(replies.map((reply) => reply.slice)).size !== replies.length || replies.some((reply) => !plan.slices.some((slice) => slice.id === reply.slice)))
    throw new AcquisitionError("READER_REPLIES_INCOMPLETE", "one reply per planned slice required");
  const notes = replies.map((reply) => {
    const note = parseNote(reply.raw, reply.slice);
    const paths = new Set(plan.slices.find((slice) => slice.id === reply.slice)!.files.map((file) => file.path));
    if ([...note.entryPoints, ...note.whereThingsLive.map((item) => item.path)].some((path) => !paths.has(path))) throw new AcquisitionError("NOTE_PATH_OUTSIDE_SLICE", "observed paths must belong to reader slice");
    return note;
  });
  return mergeNotes(notes, { slices: plan.slices.length, files: plan.fileCount, totalLoc: plan.totalLoc, capped: plan.capped });
}
export function absorbDistill(mm: MapMoveIn, raw: string): ProjectMemory {
  const insight = parseDistill(raw);
  return { ...structuralMemory(mm), areas: [...new Set([...mm.map.areas, ...insight.areas])].sort(), invariants: insight.invariants };
}
export function absorbMove(plan: MovePlan, replies: { slice: number; raw: string }[]) {
  if (plan.mode === "reader") return absorbMoveIn(plan.plan, replies);
  if (replies.length !== 1) throw new AcquisitionError("DISTILL_REPLY_REQUIRED", "one explicit distill reply required");
  return absorbDistill(plan.mm, replies[0].raw);
}

export async function persistMemory(context: ArsenalContext, memory: ProjectMemory, coverage: MapMoveIn["coverage"]) {
  const directory = await statePath(context, "reconnaissance", "write");
  const files = [{ path: join(directory, "map.json"), content: JSON.stringify({ projectID: context.projectID, authority: "advice", coverage, memory }, null, 2) }, { path: join(directory, "MAP.md"), content: renderMemoryMd(memory) }];
  for (const file of files) {
    await context.authorize({ effect: "write", paths: [file.path], commands: [] });
    const actual = await physical(file.path);
    if (!inside(directory, actual)) throw new AcquisitionError("STATE_ESCAPE", file.path);
    await context.authorize({ effect: "write", paths: [actual], commands: [] });
  }
  const { open, mkdir, realpath } = await import("node:fs/promises");
  const { constants } = await import("node:fs");
  await mkdir(directory, { recursive: true });
  if (await realpath(directory) !== directory) throw new AcquisitionError("STATE_ESCAPE", directory);
  for (const file of files) {
    const output = await open(file.path, constants.O_NOFOLLOW | constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, 0o600);
    try { await output.writeFile(file.content); } finally { await output.close(); }
  }
  return directory;
}
