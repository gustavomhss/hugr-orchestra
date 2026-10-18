import { expect, test } from "bun:test";
import { readdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { compile } from "../src/engine/compiler.ts";
import { detectBriefUsage } from "../src/engine/brief-usage.ts";
import { detectSymbolFlow } from "../src/engine/symbol-flow.ts";
import { runDecompose } from "../src/engine/run-decompose.ts";
import { computeBaseline, verifyInProject } from "../src/engine/verify-in-project.ts";
import { rethrow } from "./rejection.ts";

test("compiler oracle sees known bad source before clean source", async () => {
  const f = await fixture();
  try {
    const bad = await compile({ files: { "bad.ts": "export const x: number = 'wrong'" } }, f.context);
    expect(bad.diagnostics.some((item) => item.code === 2322)).toBe(true);
    const good = await compile({ files: { "good.ts": "export const x: number = 1" } }, f.context);
    expect(good.diagnostics).toEqual([]);
    expect(f.requests.some((request) => request.effect === "process" && request.commands[0].includes('"typescript:compile"') && request.commands[0].includes('"--noEmit"'))).toBe(true);
    expect(await readdir(f.context.directory)).toEqual([]);
  } finally { await f.cleanup(); }
});

test("compiler acquisition failure: invalid tsconfig never empty diagnostics", async () => {
  const f = await fixture({ "tsconfig.json": "{ invalid json", "target.ts": "export const x = 1" });
  try {
    expect(await rethrow(compile({ files: { "target.ts": "export const x = 1" }, targetPath: "target.ts" }, f.context))).toThrow("COMPILER_CONFIG_FAILED");
    expect(await rethrow(runDecompose({ targetPath: "target.ts", k: 0 }, f.context))).toThrow("PARTITION_COUNT_INVALID");
  } finally { await f.cleanup(); }
});

test("brief set difference and real unused compiler harvest; omitted acquisition rejected", async () => {
  const f = await fixture();
  try {
    expect(await rethrow(detectBriefUsage({ declared: ["x"] }))).toThrow("BRIEF_ACQUISITION_MISSING");
    expect(await detectBriefUsage({ declared: ["x", "y"], available: { exports: [], helpers: ["x"], importNames: [] } })).toMatchObject({ overSpec: ["y"], ok: false });
    expect(await detectBriefUsage({ declared: ["unused"], source: "const unused = 1; export const used = 2;" }, f.context)).toMatchObject({ overSpec: ["unused"], ok: false });
    expect(await detectBriefUsage({ declared: ["used"], source: "const used = 1; export const consumer = used;" }, f.context)).toMatchObject({ overSpec: [], ok: true });
  } finally { await f.cleanup(); }
});

test("actual cross-WP flow and valid import, malicious file paths rejected", async () => {
  const f = await fixture();
  try {
    const wps = [{ id: "owner", files: [{ path: "owner.ts", source: "const helper = 1;" }] }, { id: "consumer", files: [{ path: "consumer.ts", source: "export const consumer = helper;" }] }];
    expect(await detectSymbolFlow({ wps }, f.context)).toMatchObject({ ok: false, undeclaredFlows: [{ symbol: "helper", from: "owner", to: "consumer" }] });
    expect(await detectSymbolFlow({ wps: [{ id: "owner", files: [{ path: "owner.ts", source: "export const helper = 1;" }] }, { id: "consumer", files: [{ path: "consumer.ts", source: "import { helper } from './owner'; export const consumer = helper;" }] }] }, f.context)).toMatchObject({ ok: true, undeclaredFlows: [] });
    expect(await rethrow(detectSymbolFlow({ wps: [{ id: "evil", files: [{ path: "../escape.ts", source: "export const x = 1" }] }] }, f.context))).toThrow("FLOW_PATH_INVALID");
    expect(await rethrow(detectSymbolFlow({ wps: [] }, f.context))).toThrow("FLOW_EMPTY_INPUT");
  } finally { await f.cleanup(); }
});

test("project aliases, sibling configs, consumers and differential baseline preserved", async () => {
  const f = await fixture({
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, baseUrl: ".", paths: { "@/*": ["src/*"] } }, include: ["src/**/*.ts"] }),
    "src/tsconfig.json": JSON.stringify({ extends: "../tsconfig.json", compilerOptions: { target: "ES2022" }, include: ["*.ts"] }),
    "src/sibling.ts": "export const sibling = 2;",
    "src/target.ts": "import { sibling } from '@/sibling';\nexport const A = sibling;\nconst helper = 1;\nexport function B() { return helper + A; }\n",
    "src/consumer.ts": "import { A, B } from './target';\nexport const C = A + B();",
  });
  try {
    const before = await Bun.file(join(f.context.directory, "src/target.ts")).text();
    const result = await runDecompose({ targetPath: "src/target.ts", k: 2 }, f.context);
    expect(result.verified).toBe(true);
    expect(result.plan.frozenSurface).toEqual(["A", "B"]);
    expect(result.plan.edges.some((edge) => edge.via.includes("A"))).toBe(true);
    expect(result.files?.modules.some((module) => module.content.includes("helper"))).toBe(true);
    expect(await Bun.file(join(f.context.directory, "src/target.ts")).text()).toBe(before);
    expect((await readdir(join(f.context.directory, "src"))).sort()).toEqual(["consumer.ts", "sibling.ts", "target.ts", "tsconfig.json"]);
    await writeFile(join(f.context.directory, "src/target.ts"), "export const A: number = 'baseline';\nexport const B = 2;");
    const baseline = await computeBaseline("src/target.ts", f.context);
    expect(baseline.diagnostics.some((item) => item.code === 2322)).toBe(true);
    const bad = await verifyInProject({ godfilePath: "src/target.ts", barrelName: "barrel", baseline: baseline.diagnostics, files: { barrel: "export * from './m1.js';", modules: [{ id: "m1", content: "export const A: number = 'baseline';\nexport const B: number = 'baseline';" }] } }, f.context);
    expect(bad.ok).toBe(false);
    expect(bad.errors.filter((error) => error.includes("TS2322"))).toHaveLength(1);
  } finally { await f.cleanup(); }
}, 90000);

test("compiler symlink escape and denied process fail closed", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.base, "outside.ts"), "export const outside = 1");
    await symlink(join(f.base, "outside.ts"), join(f.context.directory, "outside.ts"));
    expect(await rethrow(compile({ files: { "input.ts": "import { outside } from './outside'; export const x = outside" } }, f.context))).toThrow("COMPILER_PATH_ESCAPE");
    expect(await rethrow(compile({ files: { "input.ts": "export const x = 1" } }, { ...f.context, async authorize(request) { if (request.effect === "process") throw new Error("PROCESS_DENIED"); } }))).toThrow("PROCESS_DENIED");
  } finally { await f.cleanup(); }
});

test("decompose explicit authorized materialization, denied writes and overwrite refusal", async () => {
  const f = await fixture({ "target.ts": "export const A = 1;\nexport const B = 2;\n" });
  try {
    expect(await rethrow(runDecompose({ targetPath: "target.ts", k: 2, materialize: { directory: "output" } }, { ...f.context, async authorize(request) { if (request.effect === "write") throw new Error("WRITE_DENIED"); } }))).toThrow("WRITE_DENIED");
    expect(await readdir(f.context.directory)).toEqual(["target.ts"]);
    const result = await runDecompose({ targetPath: "target.ts", k: 2, materialize: { directory: "output" } }, f.context);
    expect(result.mode).toBe("GREEN");
    expect((await readdir(join(f.context.directory, "output"))).sort()).toEqual(["barrel.ts", "m1.ts", "m2.ts"]);
    expect(await rethrow(runDecompose({ targetPath: "target.ts", k: 2, materialize: { directory: "output" } }, f.context))).toThrow("MATERIALIZATION_COLLISION");
    expect(await Bun.file(join(f.context.directory, "target.ts")).text()).toBe("export const A = 1;\nexport const B = 2;\n");
    await writeFile(join(f.context.directory, "unsupported.ts"), "export const A = 1, B = 2;\nexport const C = 3;");
    expect(await rethrow(runDecompose({ targetPath: "unsupported.ts", k: 2 }, f.context))).toThrow("DECOMPOSE_UNSUPPORTED_SYNTAX");
  } finally { await f.cleanup(); }
}, 90000);
