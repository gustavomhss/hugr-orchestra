import { expect, test } from "bun:test";
import { readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, git } from "./fixture.ts";
import { projectPath } from "../src/engine/acquisition.ts";
import { mapRepository } from "../src/tools/repo-mapper.ts";
import hygiene, { gitRead } from "../src/tools/repo-hygiene-check.ts";
import moveIn from "../src/tools/move-in.ts";
import { runProcess } from "../src/engine/process.ts";
import { rethrow } from "./rejection.ts";

test("mapper physical fences, aliases, caps and pagination expose partial coverage", async () => {
  const f = await fixture({ "src/a.ts": "export const A = 1\n", "src/b.ts": "export const B = 2\n", "big.ts": "x".repeat(200) });
  try {
    expect(await rethrow(mapRepository({ root: f.base }, f.context))).toThrow("ROOT_MISMATCH");
    await writeFile(join(f.base, "outside.ts"), "SECRET");
    await symlink(join(f.base, "outside.ts"), join(f.context.directory, "escape.ts"));
    await symlink(join(f.context.directory, "src/a.ts"), join(f.context.directory, "alias.ts"));
    expect(await rethrow(projectPath(f.context, "escape.ts"))).toThrow("PATH_ESCAPE");
    expect(await projectPath(f.context, "alias.ts")).toBe(join(f.context.directory, "src/a.ts"));
    const first = await mapRepository({ limit: 2, maxFileBytes: 100 }, f.context);
    expect(first.coverage.complete).toBe(false);
    expect(first.coverage.issues.map((item) => item.reason)).toEqual(expect.arrayContaining(["symlink-outside-or-broken", "symlink-not-followed", "file-byte-cap"]));
    expect(first.page.nextOffset).toBe(2);
    const second = await mapRepository({ offset: 2, limit: 2 }, f.context);
    expect(first.entries.map((item) => item.path).some((path) => second.entries.some((item) => item.path === path))).toBe(false);
    expect((await mapRepository({ maxEntries: 1 }, f.context)).coverage.truncated).toBe(true);
    expect(f.requests.some((request) => request.effect === "write")).toBe(false);
  } finally { await f.cleanup(); }
});

test("actual Git defects detected; failed Git stays unknown rather than clean", async () => {
  const f = await fixture({ "dist/output.js": "generated\n", "conflict.ts": "<<<<<<< ours\nconst bad = 1\n>>>>>>> theirs\n" });
  try {
    const unknown = JSON.parse((await hygiene.handler({}, f.context)).content[0].text);
    expect(unknown.clean).not.toBe(true);
    expect(unknown.unknowns).toContain("clean-tree");
    expect(unknown.failures.join("\n")).toContain("GIT_ACQUISITION_FAILED");
    expect(await rethrow(gitRead(join(f.base, "missing"), ["status"], f.context))).toThrow("PROCESS_LAUNCH_FAILED");
    await git(f.context.directory, "init", "-b", "dev");
    await git(f.context.directory, "add", "dist/output.js", "conflict.ts");
    const bad = JSON.parse((await hygiene.handler({}, f.context)).content[0].text);
    expect(bad.blockers).toEqual(expect.arrayContaining(["clean-tree", "no-build-artifacts", "no-conflict-markers"]));
    expect(f.requests.filter((request) => request.effect === "process").every((request) => request.commands[0].includes("--no-optional-locks"))).toBe(true);
  } finally { await f.cleanup(); }
});

test("denied acquisition effects never write or spawn", async () => {
  const f = await fixture({ "a.ts": "export const A = 1" }, async () => { throw new Error("DENIED"); });
  try {
    expect(await rethrow(mapRepository({}, f.context))).toThrow("DENIED");
    expect(await rethrow(moveIn.handler({ operation: "persist" }, f.context))).toThrow("DENIED");
    expect(await readdir(f.base)).toEqual(["repo"]);
  } finally { await f.cleanup(); }
});

test("process launch failure named; denied process cannot produce side effect", async () => {
  const f = await fixture();
  try {
    expect(await rethrow(runProcess([join(f.base, "missing-executable")], f.context.directory, f.context))).toThrow("PROCESS_LAUNCH_FAILED");
    expect(await rethrow(runProcess(["node", "-e", "process.stdout.write('x'.repeat(9000000))"], f.context.directory, f.context))).toThrow("PROCESS_OUTPUT_CAP");
    expect(await rethrow(runProcess(["node", "-e", "require('fs').writeFileSync('escape', 'bad')"], f.context.directory, { ...f.context, async authorize() { throw new Error("PROCESS_DENIED"); } }))).toThrow("PROCESS_DENIED");
    expect(await readdir(f.context.directory)).toEqual([]);
  } finally { await f.cleanup(); }
});

test("file-specific denied persistence leaves state directory uncreated", async () => {
  const f = await fixture({ "a.ts": "export const A = 1" }, async (request) => {
    if (request.effect === "write" && request.paths.some((path) => path.endsWith("map.json"))) throw new Error("FILE_WRITE_DENIED");
  });
  try {
    expect(await rethrow(moveIn.handler({ operation: "persist" }, f.context))).toThrow("FILE_WRITE_DENIED");
    expect(await readdir(f.base)).toEqual(["repo"]);
  } finally { await f.cleanup(); }
});

test("move-in persistence isolated outside repository; symlink state escape rejected", async () => {
  const f = await fixture({ "a.ts": "export const A = 1" });
  try {
    const result = JSON.parse((await moveIn.handler({ operation: "persist" }, f.context)).content[0].text);
    expect(result.memoryPath.startsWith(f.context.stateDirectory)).toBe(true);
    expect(await readdir(f.context.directory)).toEqual(["a.ts"]);
    expect(await Bun.file(join(result.memoryPath, "map.json")).json()).toMatchObject({ projectID: "project-a", authority: "advice" });
    const other = JSON.parse((await moveIn.handler({ operation: "persist" }, { ...f.context, projectID: "project-b" })).content[0].text);
    expect(other.memoryPath).not.toBe(result.memoryPath);
    const { unlink } = await import("node:fs/promises");
    await unlink(join(result.memoryPath, "map.json"));
    await symlink(join(f.base, "outside.json"), join(result.memoryPath, "map.json"));
    expect(await rethrow(moveIn.handler({ operation: "persist" }, f.context))).toThrow("PATH_ESCAPE");
  } finally { await f.cleanup(); }
});
