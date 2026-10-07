import { expect, test } from "bun:test";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { fixture, git } from "./fixture.ts";

// On the assembled branch, the sibling Core/A sources are the actual implementation.
// An isolated WP supplies MAESTRO_CONFORMANCE_ROOT to read the assembled sources only.
async function conformance(scenario: "allow" | "deny" | "inputs" | "brief") {
  const f = await fixture({ "target.ts": "export const Target = 1" });
  try {
    await git(f.context.directory, "init", "-b", "dev");
    const root = process.env.MAESTRO_CONFORMANCE_ROOT ?? resolve(import.meta.dir, "../../..");
    const hostSource = join(root, "packages/core/src/tool/maestro-arsenal.ts");
    if (!await Bun.file(hostSource).exists()) throw new Error(`CONFORMANCE_SOURCE_MISSING: ${hostSource}`);
    const assembly = join(f.base, "assembled-arsenal");
    if (scenario === "brief" || scenario === "inputs") {
      // Actual A registry/validator and assembled handlers, copied without edits.
      // Overlay only this WP's two changed modules; native E stays read-only.
      const source = join(root, "packages/maestro-arsenal");
      for await (const file of new Bun.Glob("src/**/*.ts").scan({ cwd: source })) {
        await mkdir(dirname(join(assembly, file)), { recursive: true });
        await writeFile(join(assembly, file), await Bun.file(join(source, file)).bytes());
      }
      await writeFile(join(assembly, "package.json"), await Bun.file(join(source, "package.json")).bytes());
      // Link the node_modules the package actually resolves from: its own under the isolated linker,
      // the repository root under the hoisted linker that Windows CI installs with.
      const modules = [resolve(import.meta.dir, "../node_modules"), join(root, "node_modules")].find((path) => existsSync(join(path, "typescript/package.json")));
      if (!modules) throw new Error("CONFORMANCE_DEPENDENCIES_MISSING: typescript");
      await symlink(modules, join(assembly, "node_modules"), "dir");
      for (const file of ["src/engine/descriptors.ts", "src/engine/brief-usage.ts"]) {
        await writeFile(join(assembly, file), await Bun.file(resolve(import.meta.dir, "..", file)).bytes());
      }
    }
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures/resource-conformance.mjs"), scenario], {
      cwd: f.context.directory, stdout: "pipe", stderr: "pipe",
      env: {
        ...process.env, MAESTRO_CONFORMANCE_ROOT: root,
        MAESTRO_BRIEF_ASSEMBLY: scenario === "brief" || scenario === "inputs" ? assembly : "",
        MAESTRO_CONFORMANCE_DIRECTORY: f.context.directory, MAESTRO_CONFORMANCE_STATE: f.context.stateDirectory,
        OPENCODE_DB: ":memory:", OPENCODE_TEST_HOME: f.base,
        XDG_DATA_HOME: join(f.base, "xdg-data"), XDG_CONFIG_HOME: join(f.base, "xdg-config"),
        XDG_STATE_HOME: join(f.base, "xdg-state"), XDG_CACHE_HOME: join(f.base, "xdg-cache"),
      },
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (exit !== 0) throw new Error(`CONFORMANCE_FAILED: ${stderr}`);
    const report: unknown = JSON.parse(stdout);
    return report;
  } finally { await f.cleanup(); }
}

test("actual E/B allowed data-scoped process acquires Git, compiler and parser evidence", async () => {
  expect(await conformance("allow")).toMatchObject({ scenario: "allow", git: "actual status", compiler: "actual TS2322 and clean control", parser: "actual tree-sitter", permission: "actual E and PermissionV2" });
}, 90000);

test("actual E/B bash denial prevents process side effect", async () => {
  expect(await conformance("deny")).toMatchObject({ scenario: "deny", permission: "actual PermissionV2 bash denial", sideEffect: "marker absent" });
}, 90000);

test("actual E/B external data and actual A unknown compiler input are rejected", async () => {
  expect(await conformance("inputs")).toMatchObject({ scenario: "inputs", data: "external data rejected by actual E/B", schema: "actual A unknown tscPath rejected before authorization", control: "valid strict input executed" });
}, 90000);

test("actual A brief modes reject dual/missing/empty inputs before native effects and compile supplied source", async () => {
  expect(await conformance("brief")).toMatchObject({ scenario: "brief", source: "actual TS2322 and clean source control", modes: "invalid_arguments before authorization", available: "complete nonempty universe", defense: "named handler failures" });
}, 90000);
