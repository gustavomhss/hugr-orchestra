// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { statfs } from "node:fs/promises";
import { type Tool, type ArsenalContext, text } from "../contract.ts";
import { AcquisitionError, boundRoot, requireContext } from "../engine/acquisition.ts";
import { runProcess } from "../engine/process.ts";
import { acquisitionDescriptors } from "../engine/descriptors.ts";
export type ItemStatus = "pass" | "fail" | "unknown";
export interface HygieneItem { name: string; status: ItemStatus; detail?: string }
export interface HygieneState {
  dirty: boolean | null; trackedArtifacts: string[] | null; staleWorktrees: string[] | null; orphanBranches: string[] | null;
  conflictMarkers: number | null; diskOk: boolean | null; secretsFound: number | null; lockfileConsistent: boolean | null; validatorRegressed: boolean | null;
  failures?: string[];
}
export function evaluate(state: HygieneState) {
  const check = (name: string, good: boolean | null, detail?: string): HygieneItem => ({ name, status: good === null ? "unknown" : good ? "pass" : "fail", detail });
  const items = [
    check("clean-tree", state.dirty === null ? null : !state.dirty),
    check("no-build-artifacts", state.trackedArtifacts === null ? null : !state.trackedArtifacts.length, state.trackedArtifacts?.join(", ")),
    check("worktrees-pruned", state.staleWorktrees === null ? null : !state.staleWorktrees.length, state.staleWorktrees?.join(", ")),
    check("no-orphan-branches", state.orphanBranches === null ? null : !state.orphanBranches.length, state.orphanBranches?.join(", ")),
    check("no-conflict-markers", state.conflictMarkers === null ? null : state.conflictMarkers === 0),
    check("disk-sane", state.diskOk), check("no-secrets", state.secretsFound === null ? null : state.secretsFound === 0, "requires real secret scanner"),
    check("lockfiles-consistent", state.lockfileConsistent, "requires package manager"),
    check("validators-no-regress", state.validatorRegressed === null ? null : !state.validatorRegressed, "requires configured validator"),
  ];
  const blockers = items.filter((item) => item.status === "fail").map((item) => item.name);
  const unknowns = items.filter((item) => item.status === "unknown").map((item) => item.name);
  return { items, clean: blockers.length ? false : unknowns.length ? null : true, blockers, unknowns, failures: state.failures ?? [] };
}

export async function gitRead(root: string, args: string[], context: ArsenalContext, noMatch = false) {
  const command = ["git", "--no-optional-locks", "-c", "core.fsmonitor=false", "-C", root, ...args];
  const result = await runProcess(command, root, context);
  if (result.exit !== 0 && !(noMatch && result.exit === 1 && !result.stdout && !result.stderr)) throw new AcquisitionError("GIT_ACQUISITION_FAILED", `exit ${result.exit}: ${result.stderr.trim()}`);
  return result.stdout;
}

export async function gather(root: string, context: ArsenalContext): Promise<HygieneState> {
  const state: HygieneState = { dirty: null, trackedArtifacts: null, staleWorktrees: null, orphanBranches: null, conflictMarkers: null, diskOk: null, secretsFound: null, lockfileConsistent: null, validatorRegressed: null, failures: [] };
  const acquire = async <T>(name: string, operation: () => Promise<T>): Promise<T | null> => operation().catch((error: unknown) => {
    state.failures!.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  state.dirty = await acquire("clean-tree", async () => (await gitRead(root, ["status", "--porcelain=v1", "-z"], context)).length > 0);
  state.trackedArtifacts = await acquire("no-build-artifacts", async () => (await gitRead(root, ["ls-files", "-z"], context)).split("\0").filter((path) => /(^|\/)(node_modules|dist|target|build)\//.test(path)));
  state.conflictMarkers = await acquire("no-conflict-markers", async () => (await gitRead(root, ["grep", "-z", "-lE", "^(<<<<<<<|>>>>>>>) "], context, true)).split("\0").filter(Boolean).length);
  const branches = await acquire("branches", async () => {
    const merged = (await gitRead(root, ["for-each-ref", "--merged=HEAD", "--format=%(refname:short)", "refs/heads"], context)).trim().split("\n").filter(Boolean);
    const current = (await gitRead(root, ["symbolic-ref", "--short", "HEAD"], context)).trim();
    const worktrees = (await gitRead(root, ["worktree", "list", "--porcelain"], context)).split("\n\n").filter(Boolean);
    return { orphanBranches: merged.filter((name) => ![current, "dev", "main", "master"].includes(name)), staleWorktrees: worktrees.slice(1).flatMap((block) => {
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      return branch && path && merged.includes(branch) ? [path] : [];
    }) };
  });
  state.orphanBranches = branches?.orphanBranches ?? null;
  state.staleWorktrees = branches?.staleWorktrees ?? null;
  await context.authorize({ effect: "read", paths: [root], commands: [] });
  state.diskOk = await acquire("disk-sane", async () => {
    const disk = await statfs(root);
    if (!Number.isFinite(disk.bavail * disk.bsize)) throw new AcquisitionError("DISK_ACQUISITION_FAILED", "invalid statfs");
    return disk.bavail * disk.bsize > 1_024_000_000;
  });
  return state;
}

const tool: Tool<{ root?: string }> = {
  ...acquisitionDescriptors["repo-hygiene-check"],
  async handler(input, supplied) {
    const context = requireContext(supplied);
    const root = await boundRoot(context, input.root);
    return text({ root, ...evaluate(await gather(root, context)) }, { next: "resolve blockers and unknown checks before claiming hygiene", invariant: "failed Git acquisition never means clean" });
  },
};
export default tool;
