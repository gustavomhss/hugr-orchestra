// Artifact-gate teeth: fixtures cover malformed/empty inputs; post-build probes mutate actual shipped bytes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspect, PLATFORMS, validateBinaries, validateRuntimeIdentity } from "../bindings/node/npm/pack.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("platform schema matches shipped optional dependencies exactly", () => {
  const main = JSON.parse(readFileSync(join(root, "bindings/node/package.json")));
  assert.deepEqual(main.optionalDependencies, Object.fromEntries(Object.keys(PLATFORMS).map((id) => [`hugr-omni-${id}`, main.version])));
  for (const p of Object.values(PLATFORMS)) {
    assert(["linux", "darwin", "win32"].includes(p.os));
    assert(["x64", "arm64"].includes(p.cpu));
    assert(p.addon && p.supervisor && p.lib);
  }
});

test("empty, truncated, unknown and wrong-CPU artifact inputs fail closed", () => {
  const tmp = mkdtempSync(join(tmpdir(), "omni-artifact-control-"));
  try {
    const addon = join(tmp, "addon.node");
    const sup = join(tmp, "supervisor");
    writeFileSync(addon, Buffer.alloc(0));
    assert.throws(() => inspect(addon), /empty or truncated binary/);
    writeFileSync(addon, Buffer.alloc(64));
    assert.throws(() => inspect(addon), /unknown binary format/);
    assert.throws(() => validateBinaries("darwin-arm64", addon, sup), /supervisor is missing/);
    const macho = Buffer.alloc(64);
    macho.writeUInt32LE(0xfeedfacf, 0);
    macho.writeUInt32LE(0x0100000c, 4);
    writeFileSync(addon, macho);
    writeFileSync(sup, macho);
    assert.equal(validateBinaries("darwin-arm64", addon, sup).addon.cpu, "arm64");
    macho.writeUInt32LE(0x01000007, 4);
    writeFileSync(addon, macho);
    assert.throws(() => validateBinaries("darwin-arm64", addon, sup), /not a darwin-arm64 addon/);
    writeFileSync(addon, readFileSync(sup));
    writeFileSync(sup, macho);
    assert.throws(() => validateBinaries("darwin-arm64", addon, sup), /not a darwin-arm64 supervisor/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("pack command rejects empty Cargo artifact directory", () => {
  const tmp = mkdtempSync(join(tmpdir(), "omni-empty-pack-"));
  try {
    const result = spawnSync(process.execPath, [join(root, "bindings/node/npm/pack.mjs"), join(tmp, "out"), "darwin-arm64"], {
      cwd: root, encoding: "utf8", env: { ...process.env, CARGO_TARGET_DIR: tmp },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /libhugr_omni_node\.dylib is missing/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("runtime identity rejects emulated CPU, wrong OS and wrong launcher", () => {
  const identity = { runtime: "bun", os: "win32", cpu: "arm64", version: "1.4.2", execPath: "bun.exe" };
  validateRuntimeIdentity(identity, "bun", "win32-arm64-msvc");
  assert.throws(() => validateRuntimeIdentity({ ...identity, cpu: "x64" }, "bun", "win32-arm64-msvc"), /wrong runtime CPU/);
  assert.throws(() => validateRuntimeIdentity({ ...identity, os: "linux" }, "bun", "win32-arm64-msvc"), /wrong runtime OS/);
  assert.throws(() => validateRuntimeIdentity({ ...identity, runtime: "node" }, "bun", "win32-arm64-msvc"), /launcher did not execute bun/);
  assert.throws(() => validateRuntimeIdentity({ ...identity, version: "" }, "bun", "win32-arm64-msvc"), /empty runtime identity/);
});

if (process.env.HUGR_PROOF_REAL === "true") test("real shipped binaries pass; empty and wrong architecture mutations go red", () => {
  const id = process.env.HUGR_PROOF_ID;
  assert(PLATFORMS[id], "HUGR_PROOF_ID must name the built target");
  const addon = join(root, "dist/omni", id, "hugr_omni.node");
  const supervisor = join(root, "dist/omni", id, `hugr-omni-supervisor${PLATFORMS[id].os === "win32" ? ".exe" : ""}`);
  const tmp = mkdtempSync(join(tmpdir(), "omni-real-mutation-"));
  try {
    validateBinaries(id, addon, supervisor);
    const broken = join(tmp, "mutant");
    writeFileSync(broken, Buffer.alloc(0));
    assert.throws(() => validateBinaries(id, broken, supervisor), /empty or truncated binary/);
    for (const file of [addon, supervisor]) {
      const bytes = readFileSync(file);
      const format = inspect(file).format;
      if (format === "elf") bytes.writeUInt16LE(PLATFORMS[id].cpu === "x64" ? 183 : 62, 18);
      if (format === "macho") bytes.writeUInt32LE(PLATFORMS[id].cpu === "x64" ? 0x0100000c : 0x01000007, 4);
      if (format === "pe") bytes.writeUInt16LE(PLATFORMS[id].cpu === "x64" ? 0xaa64 : 0x8664, bytes.readUInt32LE(0x3c) + 4);
      writeFileSync(broken, bytes);
      assert.throws(() => validateBinaries(id, file === addon ? broken : addon, file === supervisor ? broken : supervisor), new RegExp(`not a ${id} ${file === addon ? "addon" : "supervisor"}`));
    }
    console.log(`mutation proof ${id}: empty artifact, addon CPU and supervisor CPU rejected; original bytes accepted`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
