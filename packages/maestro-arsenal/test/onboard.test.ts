import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { fixture } from "./fixture.ts";
import { extractSymbols } from "../src/onboard/extract.ts";
import { planMove } from "../src/onboard/move-in.ts";
import { planReadingSlices } from "../src/onboard/plan.ts";
import { parseNote } from "../src/onboard/note.ts";
import { mergeNotes } from "../src/onboard/absorb.ts";
import moveIn from "../src/tools/move-in.ts";

test("real tree parser extracts TS and Python; partial and unsupported parse trigger fallback", async () => {
  const f = await fixture({ "good.ts": "export const A = 1", "bad.ts": "export function broken( {", "unknown.rs": "fn main() {}" });
  try {
  const ts = await extractSymbols("file.ts", "import { z } from './other';\nexport const A = 1, B = 2;\nexport function f(x: number): number { return x; }", f.context);
  expect(ts.coverage.complete).toBe(true);
  expect(ts.symbols.map((symbol) => symbol.name)).toEqual(["A", "B", "f"]);
  expect(ts.imports).toEqual([{ from: "./other", names: ["z"] }]);
  const py = await extractSymbols("file.py", "from other import Thing\n\ndef f(x):\n    return x\n", f.context);
  expect(py.coverage.complete).toBe(true);
  expect(py.symbols[0].name).toBe("f");
  expect((await extractSymbols("bad.ts", "export function broken( {", f.context)).coverage).toMatchObject({ complete: false, reason: "partial-parse" });
  expect((await extractSymbols("main.rs", "fn main() {}", f.context)).coverage).toMatchObject({ complete: false, reason: "unsupported-language" });
    const plan = await planMove(f.context);
    expect(plan.mode).toBe("reader");
    if (plan.mode !== "reader") throw new Error("reader fallback expected");
    expect(plan.fallback).toEqual(expect.arrayContaining([{ path: "bad.ts", reason: "partial-parse" }, { path: "unknown.rs", reason: "unsupported-language" }]));
    expect(plan.briefs.length).toBeGreaterThan(0);
  } finally { await f.cleanup(); }
});

test("deterministic map ranks core deps and performs no model call or permanent write", async () => {
  const f = await fixture({ "src/central.ts": "export const Central = 1", "src/main.ts": "import { Central } from './central';\nexport const Main = Central;", "tests/example.ts": "export const Example = 1" });
  try {
    const result = JSON.parse((await moveIn.handler({}, f.context)).content[0].text);
    expect(result.mode).toBe("deterministic");
    expect(result.memory.whereThingsLive[0]).toEqual({ what: "const Central", path: "src/central.ts" });
    expect(result.memory.deps).toEqual(["src/main.ts imports Central from src/central.ts"]);
    expect(result.authority).toBe("advice");
    expect(await readdir(f.base)).toEqual(["repo"]);
    expect(f.requests.some((request) => request.effect === "write")).toBe(false);
    expect(f.requests.filter((request) => request.effect === "process").every((request) => request.commands[0].includes("parser-worker.ts"))).toBe(true);
  } finally { await f.cleanup(); }
});

test("reader packing bounded/disjoint; note parse failures named; merge dedupes", () => {
  const files = Array.from({ length: 20 }, (_, i) => ({ path: `src/${i}.ts`, loc: 100 }));
  const plan = planReadingSlices(files, { budgetLoc: 200, maxAgents: 3 });
  expect(plan.capped).toBe(true);
  expect(plan.agentCount).toBeLessThanOrEqual(3);
  expect(new Set(plan.slices.flatMap((slice) => slice.files.map((file) => file.path))).size).toBe(20);
  expect(() => planReadingSlices(files, { maxAgents: 0 })).toThrow("READING_LIMIT_INVALID");
  expect(() => parseNote("not json", 0)).toThrow();
  const note = parseNote(JSON.stringify({ areas: ["core"], whereThingsLive: [], invariants: ["no drift"], entryPoints: [], deps: [] }), 1);
  expect(mergeNotes([note, note], { slices: 2, files: 20, totalLoc: 2000, capped: true }).invariants).toEqual(["no drift"]);
});

test("parser acquisition cap stays named and reader plan retains all observed files", async () => {
  const f = await fixture(Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`notes/${i}.md`, "manual reading required"])));
  try {
    const plan = await planMove(f.context);
    expect(plan.mode).toBe("reader");
    expect(plan.mm.coverage.complete).toBe(false);
    expect(plan.mm.stats.parsedFiles).toBe(200);
    if (plan.mode !== "reader") throw new Error("reader fallback required");
    expect(plan.plan.fileCount).toBe(201);
    expect(plan.mm.coverage.issueCount).toBe(201);
    // First 100 issue details are bounded; scope explicitly names acquisition cap.
    expect(plan.mm.coverage.scope).toContain("parser file cap 200");
  } finally { await f.cleanup(); }
});
