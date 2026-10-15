// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { readdir, lstat, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { type Tool, type ArsenalContext, text } from "../contract.ts";
import { AcquisitionError, boundRoot, inside, projectPath, requireContext } from "../engine/acquisition.ts";
import { acquisitionDescriptors } from "../engine/descriptors.ts";

export interface RepoMapInput { root?: string; maxDepth?: number; ignore?: string[]; oversizedThreshold?: number; maxEntries?: number; maxFileBytes?: number; offset?: number; limit?: number }
export interface RepoEntry { path: string; type: "file" | "dir" | "symlink"; loc?: number; bytes?: number }
export interface CoverageIssue { path: string; reason: string }
export interface RepoMapOutput {
  root: string; entries: RepoEntry[]; fileCount: number; dirCount: number; oversized: RepoEntry[]; oversizedThreshold: number;
  coverage: { complete: boolean; issues: CoverageIssue[]; issueCount: number; ignored: number; inspected: number; scope: string; truncated: boolean };
  page: { offset: number; limit: number; total: number; nextOffset: number | null };
}
const DEFAULT_IGNORE = [".git", "node_modules", "dist", "target", ".DS_Store"];

export async function mapRepository(input: RepoMapInput, context: ArsenalContext, acquisition?: { all: true }): Promise<RepoMapOutput> {
  const root = await boundRoot(context, input.root);
  const cap = input.maxEntries ?? 10000;
  const byteCap = input.maxFileBytes ?? 1_000_000;
  const limit = input.limit ?? 200;
  const offset = input.offset ?? 0;
  if (![cap, byteCap, limit].every((value) => Number.isInteger(value) && value > 0) || cap > 10000 || limit > 500 || byteCap > 10_000_000 || !Number.isInteger(offset) || offset < 0 || input.maxDepth !== undefined && (!Number.isInteger(input.maxDepth) || input.maxDepth < 0))
    throw new AcquisitionError("MAP_LIMIT_INVALID", "invalid acquisition bounds");
  const ignore = new Set([...DEFAULT_IGNORE, ...(input.ignore ?? [])]);
  const entries: RepoEntry[] = [];
  const issues: CoverageIssue[] = [];
  const stats = { ignored: 0, inspected: 0, issueCount: 0, truncated: false };
  const issue = (path: string, reason: string) => { stats.issueCount++; if (issues.length < 100) issues.push({ path, reason }); };
  const visited = new Set<string>();
  const walk = async (directory: string, depth: number): Promise<void> => {
    await projectPath(context, directory);
    const actual = await realpath(directory);
    if (!inside(root, actual)) throw new AcquisitionError("PATH_ESCAPE", directory);
    if (visited.has(actual)) { issue(relative(root, directory), "symlink-alias-or-cycle"); return; }
    visited.add(actual);
    const children = await readdir(actual, { withFileTypes: true }).catch((error: unknown) => {
      throw new AcquisitionError("MAP_DIRECTORY_UNREADABLE", `${directory}: ${error instanceof Error ? error.message : String(error)}`);
    });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (ignore.has(child.name)) { stats.ignored++; continue; }
      if (entries.length >= cap) { stats.truncated = true; issue(relative(root, directory), "entry-cap"); return; }
      const path = join(directory, child.name);
      const rel = relative(root, path).replaceAll("\\", "/");
      stats.inspected++;
      await context.authorize({ effect: "read", paths: [path], commands: [] });
      if (child.isSymbolicLink()) {
        const destination = await realpath(path).catch(() => undefined);
        entries.push({ path: rel, type: "symlink" });
        issue(rel, destination && inside(root, destination) ? "symlink-not-followed" : "symlink-outside-or-broken");
        continue;
      }
      if (child.isDirectory()) {
        entries.push({ path: rel, type: "dir" });
        if (input.maxDepth !== undefined && depth >= input.maxDepth) { issue(rel, "depth-cap"); continue; }
        await walk(path, depth + 1);
        continue;
      }
      if (!child.isFile()) { issue(rel, "unsupported-filesystem-entry"); continue; }
      const fenced = await projectPath(context, path);
      const stat = await lstat(fenced);
      const entry: RepoEntry = { path: rel, type: "file", bytes: stat.size };
      entries.push(entry);
      if (stat.size > byteCap) { issue(rel, "file-byte-cap"); continue; }
      const bytes = await Bun.file(fenced).bytes().catch(() => undefined);
      if (!bytes) { issue(rel, "unreadable-file"); continue; }
      if (bytes.includes(0)) { issue(rel, "binary-file"); continue; }
      const content = await Promise.resolve().then(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes)).catch(() => undefined);
      if (content === undefined) { issue(rel, "non-utf8-file"); continue; }
      entry.loc = content.split("\n").length;
    }
  };
  await walk(root, 0);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const page = acquisition?.all ? entries : entries.slice(offset, offset + limit);
  const threshold = input.oversizedThreshold ?? 400;
  return {
    root, entries: page, fileCount: entries.filter((entry) => entry.type === "file").length,
    dirCount: entries.filter((entry) => entry.type === "dir").length,
    oversized: page.filter((entry) => entry.loc !== undefined && entry.loc > threshold).sort((a, b) => b.loc! - a.loc!), oversizedThreshold: threshold,
    coverage: { complete: stats.issueCount === 0, issues, issueCount: stats.issueCount, ignored: stats.ignored, inspected: stats.inspected, truncated: stats.truncated, scope: "non-ignored entries only; symlinks not followed; counts cover inspected scan" },
    page: { offset, limit: acquisition?.all ? cap : limit, total: entries.length, nextOffset: !acquisition?.all && offset + limit < entries.length ? offset + limit : null },
  };
}

const tool: Tool<RepoMapInput> = {
  ...acquisitionDescriptors["repo-mapper"],
  async handler(input, context) { return text(await mapRepository(input, requireContext(context)), { next: "page remaining entries; inspect named coverage gaps before decomposition advice", invariant: "repository map is reconnaissance, never verified Own authority" }); },
};
export default tool;
