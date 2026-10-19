import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdir, symlink, writeFile } from "fs/promises"
import { Effect } from "effect"
import { ResearchProcess } from "../src/research-toolkit/process"
import { ProbeAssets } from "../src/research-toolkit/probe/assets"
import { ProbeRunners } from "../src/research-toolkit/probe/runners"
import { ProbeTypecheck } from "../src/research-toolkit/probe/typecheck"
import { tmpdir } from "./fixture/tmpdir"

describe("T-P1 sanitized environment", () => {
  test("drops git, node and guard switches and secrets; pins git to no config, prompt or locks", () => {
    const env = ResearchProcess.environment({
      PATH: "/usr/bin", GIT_DIR: "/elsewhere", GIT_ASKPASS: "x", NODE_OPTIONS: "--require evil", NODE_PATH: "/x",
      ORCHESTRA_LOCAL_TESTS: "1", CI: "true", GITHUB_TOKEN: "secret", SAFE: "kept",
    })
    expect(env).toEqual({
      PATH: "/usr/bin", SAFE: "kept",
      GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    })
  })
})

describe("T-P2 compiler oracle", () => {
  const snapshot = { root: "/scratch/snapshot", origin: "/work/repo" }

  test("tsc plain lines become diagnostics in original coordinates, with continuations", () => {
    const output = [
      "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "/work/repo/node_modules/x/index.d.ts(1,1): error TS2307: Cannot find module 'y' or its corresponding type declarations.",
      "src/b.ts(10,2): error TS2345: Argument of type 'A' is not assignable to parameter of type 'B'.",
      "  Property 'c' is missing in type 'A'.",
      "error TS5058: The specified path does not exist: 'missing.json'.",
      "unrelated line",
    ].join("\n")
    expect(ProbeTypecheck.parse(output, snapshot.root, snapshot)).toEqual([
      { path: "src/a.ts", line: 3, column: 7, code: "TS2322", message: "Type 'string' is not assignable to type 'number'." },
      { path: "node_modules/x/index.d.ts", line: 1, column: 1, code: "TS2307", message: "Cannot find module 'y' or its corresponding type declarations." },
      { path: "src/b.ts", line: 10, column: 2, code: "TS2345", message: "Argument of type 'A' is not assignable to parameter of type 'B'.\nProperty 'c' is missing in type 'A'." },
      { path: "", line: 0, column: 0, code: "TS5058", message: "The specified path does not exist: 'missing.json'." },
    ])
  })

  test("causes reduce repeated errors to one line each and name the missing pieces (diagnose-red)", () => {
    const at = (code: string, message: string, file = "src/a.ts") => ({ path: file, line: 1, column: 1, code, message })
    const lines = ProbeTypecheck.causes([
      at("TS2304", "Cannot find name 'describe'."),
      at("TS2304", "Cannot find name 'describe'.", "src/b.ts"),
      at("TS2307", "Cannot find module 'zod' or its corresponding type declarations."),
    ])
    expect(lines).toEqual([
      "cause: test-runner globals (describe/it/expect) have no types in this project",
      "cause: unresolved modules: zod",
      "cause: names not found: describe",
      "2x error TS2304: Cannot find name 'describe'. (first at src/a.ts:1:1)",
      "error TS2307: Cannot find module 'zod' or its corresponding type declarations. (first at src/a.ts:1:1)",
    ])
  })
})

describe("T-P3 unused symbols", () => {
  test("unused: true adds the compiler's unused checks to a fixed argv", () => {
    const base = { node: "/bin/node", tsc: "/p/tsc", project: "tsconfig.json", heapMiB: 1024 }
    expect(ProbeTypecheck.argv(base)).toEqual(["/bin/node", "--max-old-space-size=1024", "/p/tsc", "-p", "tsconfig.json", "--noEmit", "--pretty", "false"])
    expect(ProbeTypecheck.argv({ ...base, unused: true }).slice(-2)).toEqual(["--noUnusedLocals", "--noUnusedParameters"])
  })
})

describe("T-P4 trusted assets", () => {
  const pkg = async (root: string, name: string, info: object) => {
    const dir = path.join(root, "node_modules", name)
    await mkdir(path.join(dir, "bin"), { recursive: true })
    await writeFile(path.join(dir, "package.json"), JSON.stringify(info))
    return dir
  }

  // Windows runners cannot create symlinks without developer mode; the probe is darwin and linux only (J4.5).
  test.skipIf(process.platform === "win32")("accepts the named package's declared bin; refuses a wrong name or a bin that escapes the package", async () => {
    await using dir = await tmpdir()
    const good = await pkg(dir.path, "typescript", { name: "typescript", version: "5.8.2", bin: { tsc: "./bin/tsc" } })
    await writeFile(path.join(good, "bin", "tsc"), "")
    const found = await Effect.runPromise(ProbeAssets.project("typescript", path.join(dir.path, "src"), dir.path))
    expect(found).toMatchObject({ kind: "typescript", version: "5.8.2", entry: path.join(good, "bin", "tsc") })

    const impostor = await pkg(dir.path, "vitest", { name: "not-vitest", bin: "./bin/vitest" })
    await writeFile(path.join(impostor, "bin", "vitest"), "")
    expect(await Effect.runPromise(ProbeAssets.project("vitest", dir.path, dir.path).pipe(Effect.flip))).toMatchObject({ code: "probe_denied", reason: "trusted-asset-package-invalid: vitest" })

    const escaping = await pkg(dir.path, "jest", { name: "jest", bin: "./bin/jest.js" })
    await writeFile(path.join(dir.path, "outside.js"), "")
    await symlink(path.join(dir.path, "outside.js"), path.join(escaping, "bin", "jest.js"))
    expect(await Effect.runPromise(ProbeAssets.project("jest", dir.path, dir.path).pipe(Effect.flip))).toMatchObject({ code: "probe_denied", reason: "trusted-asset-escape: jest" })
  })
})

describe("J4.2 / J4.3 runner selection", () => {
  test.skipIf(process.platform === "win32")("a symlink out of the snapshot is refused after realpath", async () => {
    await using dir = await tmpdir()
    await mkdir(path.join(dir.path, "snap"))
    await writeFile(path.join(dir.path, "secret.json"), "{}")
    await symlink(path.join(dir.path, "secret.json"), path.join(dir.path, "snap", "tsconfig.json"))
    const error = await Effect.runPromise(ProbeRunners.inside(path.join(dir.path, "snap"), "tsconfig.json").pipe(Effect.flip))
    expect(error.reason).toBe("path-outside-snapshot: tsconfig.json")
  })

  test("the nearest config picks the test runner; two configs in one directory are ambiguous", async () => {
    await using dir = await tmpdir()
    await mkdir(path.join(dir.path, "pkg", "test"), { recursive: true })
    await writeFile(path.join(dir.path, "bunfig.toml"), "")
    await writeFile(path.join(dir.path, "pkg", "vitest.config.ts"), "")
    await writeFile(path.join(dir.path, "pkg", "test", "a.test.ts"), "")
    await writeFile(path.join(dir.path, "b.test.ts"), "")
    expect(await ProbeRunners.detect(path.join(dir.path, "pkg", "test", "a.test.ts"), dir.path)).toEqual({ dir: path.join(dir.path, "pkg"), runners: ["vitest"] })
    expect(await ProbeRunners.detect(path.join(dir.path, "b.test.ts"), dir.path)).toEqual({ dir: dir.path, runners: ["bun"] })
    await writeFile(path.join(dir.path, "pkg", "package.json"), JSON.stringify({ jest: {} }))
    expect((await ProbeRunners.detect(path.join(dir.path, "pkg", "test", "a.test.ts"), dir.path))?.runners).toEqual(["vitest", "jest"])
  })
})
