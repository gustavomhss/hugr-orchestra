import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"

// Runs the actual preload in a separate Bun process; neither expectations nor verdict logic are reproduced here.
export function isolatedControl(positive: boolean) {
  return Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    return yield* Effect.acquireUseRelease(
      Effect.tryPromise({ try: () => mkdtemp(path.join(tmpdir(), "omni-control-isolate-")), catch: (cause) => cause }),
      (root) => Effect.gen(function* () {
        const nonce = randomBytes(16).toString("hex")
        const env: Record<string, string> = {
          BUN_BE_BUN: "1", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict",
          ORCHESTRA_OMNI_CONTROL: "declared", ORCHESTRA_OMNI_CONTROL_NONCE: nonce,
          HOME: root, USERPROFILE: root,
          XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"),
          XDG_STATE_HOME: path.join(root, "state"), XDG_CACHE_HOME: path.join(root, "cache"),
        }
        for (const [name, value] of Object.entries(process.env)) {
          if (value !== undefined && (["HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR"].includes(name) ||
            (process.platform === "win32" && ["SYSTEMROOT", "WINDIR"].includes(name.toUpperCase())))) env[name] = value
        }
        const nestedEnv = Object.fromEntries(Object.entries(env).filter(([name]) => name !== "ORCHESTRA_OMNI_CONTROL_NONCE"))
        const config = path.join(root, "bunfig.toml")
        const plain = path.join(root, "01-plain.test.ts")
        const declared = path.join(root, "02-declared.test.ts")
        const modulePath = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)))
        yield* Effect.tryPromise({
          try: async () => {
            await Promise.all(["config", "data", "state", "cache"].map((name) => mkdir(path.join(root, name))))
            await Bun.write(config, "")
            await Bun.write(plain, `import { test, expect } from "bun:test";
test("first isolated file is plain", () => { expect(true).toBe(true); console.log("ISOLATE_CONTROL_PLAIN"); });
`)
            await Bun.write(declared, `import { test, expect } from "bun:test";
import { Effect } from ${JSON.stringify(fileURLToPath(import.meta.resolve("effect")))};
import { ChildProcess } from ${JSON.stringify(fileURLToPath(import.meta.resolve("effect/unstable/process")))};
import { AppProcess } from ${modulePath("../../src/process.ts")};
import { LayerNode } from ${modulePath("../../src/effect/layer-node.ts")};
import { expectSpawn } from ${modulePath("./omni-expect.ts")};
test("second isolated file declares its own spawn", async () => {
  expectSpawn(import.meta.path);
  console.log("ISOLATE_CONTROL_DECLARED");
  ${positive ? `await Effect.runPromise(Effect.gen(function* () {
    const processes = yield* AppProcess.Service;
    const result = yield* processes.run(ChildProcess.make(process.execPath, ["--no-env-file", ${JSON.stringify(`--config=${config}`)}, "-e", "process.stdout.write('ISOLATE_NATIVE_CHILD')"], {
      cwd: ${JSON.stringify(root)}, shell: false, extendEnv: false, env: ${JSON.stringify(nestedEnv)}, stdout: "pipe", stderr: "pipe",
    }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("ISOLATE_NATIVE_CHILD");
    expect(result.stdoutTruncated || result.stderrTruncated).toBe(false);
  }).pipe(Effect.scoped, Effect.provide(LayerNode.compile(AppProcess.node))));` : "expect(true).toBe(true);"}
}, 5000);
`)
          }, catch: (cause) => cause,
        })
        const result = yield* processes.run(ChildProcess.make(process.execPath, [
          "--no-env-file", `--config=${config}`, "test", "--isolate", "--preload",
          fileURLToPath(new URL("../../../../script/test-omni-control.ts", import.meta.url)),
          plain, declared, "--timeout", "5000",
        ], { cwd: root, shell: false, extendEnv: false, env, stdout: "pipe", stderr: "pipe" }))
        return { result, nonce }
      }),
      (root) => Effect.tryPromise({ try: () => rm(root, { recursive: true, force: true }), catch: (cause) => cause }).pipe(Effect.orDie),
    )
  }).pipe(Effect.scoped)
}
