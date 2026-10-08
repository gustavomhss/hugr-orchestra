import { expect, test } from "bun:test"
import { link, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { PrivateFile } from "../../src/util/private-file"
import { SiwcHost } from "../../src/auth/siwc-host"
import { assertPrivateFile, broadenPrivateFile, preventNativeProtection } from "../fixture/private-file"

test("native protection removes broad explicit and inherited permissions; oracle rejects unsafe files", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-file-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  // Metacharacters must stay filename data, including PowerShell quotes and '$'.
  const filename = join(root, "fixture ' $ ; [file].json")
  await writeFile(filename, "fixture-only", { mode: 0o644 })
  for (const inheritance of [false, true]) {
    await broadenPrivateFile(filename, inheritance)
    await expect(assertPrivateFile(filename)).rejects.toThrow("Private-file oracle")
    await PrivateFile.protect(filename)
    await assertPrivateFile(filename)
    expect(await readFile(filename, "utf8")).toBe("fixture-only")
  }
  await PrivateFile.protect(filename)
  await assertPrivateFile(filename)
})

test("host production publisher sees a complete private source before hardlink admission", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-publication-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  const destination = join(root, "published")
  const sources: string[] = []
  const protectedSources: string[] = []
  const id = await SiwcHost.load(destination, {
    protect: async (filename) => {
      // Start broad even on POSIX, where writeFile's mode alone would hide omission.
      await broadenPrivateFile(filename, true)
      await PrivateFile.protect(filename)
      protectedSources.push(filename)
    },
    publish: async (source, target) => {
      sources.push(source)
      await assertPrivateFile(source)
      expect(protectedSources).toContain(source)
      expect(await readFile(source, "utf8")).toMatch(/^urn:uuid:[0-9a-f-]{36}\n$/i)
      expect(await readdir(root)).not.toContain("published")
      await link(source, target)
    },
  })
  expect(sources).toHaveLength(1)
  expect(await readFile(destination, "utf8")).toBe(`${id}\n`)
  await assertPrivateFile(destination)
  expect(await readdir(root)).toEqual(["published"])
})

test("host native protection failure forbids publication and cleans completed scratch source", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-failure-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  const sources: string[] = []
  const published: string[] = []
  const failures: Error[] = []
  await expect(SiwcHost.load(join(root, "host"), {
    protect: async (source) => {
      sources.push(source)
      expect(await readFile(source, "utf8")).toMatch(/^urn:uuid:[0-9a-f-]{36}\n$/i)
      await using failure = await preventNativeProtection(source)
      expect((await lstat(source)).isFile()).toBe(true)
      await PrivateFile.protect(source).catch((cause: unknown) => {
        if (!(cause instanceof Error)) throw cause
        failures.push(cause)
        throw cause
      })
    },
    publish: async (source, target) => { published.push(target); await link(source, target) },
  })).rejects.toThrow("PrivateFile.protect failed")
  expect(sources).toHaveLength(1)
  expect(published).toEqual([])
  expect(failures).toHaveLength(1)
  if (process.platform === "win32") expect(failures[0].cause).toMatchObject({ code: "ENOENT" })
  if (process.platform === "linux") expect(failures[0].cause).toMatchObject({ code: "EPERM", syscall: "chmod" })
  expect(await readdir(root)).toEqual([])
})

test("real Node runtime protects normal and broad files and propagates native backend failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-node-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "../../src/util/private-file.ts")],
    target: "node", format: "esm", outdir: root, naming: "[name].mjs",
  })
  expect(built.success).toBe(true)
  expect(built.outputs).toHaveLength(1)
  const run = async (filename: string, operation: "create" | "protect" | "failure", env = process.env) => {
    const child = Bun.spawn(["node", "--input-type=module", "-e", `
      import { strict } from "node:assert";
      import { lstat, readFile, writeFile } from "node:fs/promises";
      const { PrivateFile } = await import(process.env.ORCHESTRA_NODE_PRIVATE_MODULE);
      strict.equal(typeof Bun, "undefined");
      strict.ok(process.versions.node);
      const filename = process.env.ORCHESTRA_NODE_PRIVATE_FILE;
      const operation = process.env.ORCHESTRA_NODE_PRIVATE_OPERATION;
      if (operation === "create") await writeFile(filename, "node fixture-only", { mode: 0o644 });
      strict.equal((await lstat(filename)).isFile(), true);
      if (operation === "failure") {
        await strict.rejects(() => PrivateFile.protect(filename), (error) => {
          strict.match(error.message, /^PrivateFile.protect failed/);
          strict.equal(error.cause.code, process.platform === "win32" ? "ENOENT" : "EPERM");
          if (process.platform !== "win32") strict.equal(error.cause.syscall, "chmod");
          return true;
        });
      } else {
        strict.ok(["create", "protect"].includes(operation));
        await PrivateFile.protect(filename);
      }
      strict.equal(await readFile(filename, "utf8"), "node fixture-only");
      console.log(JSON.stringify({ runtime: "node", version: process.version, operation }));
    `], {
      cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000,
      env: { ...env, ORCHESTRA_NODE_PRIVATE_MODULE: pathToFileURL(built.outputs[0].path).href,
        ORCHESTRA_NODE_PRIVATE_FILE: filename, ORCHESTRA_NODE_PRIVATE_OPERATION: operation },
    })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    if (child.signalCode || code !== 0) throw new Error(`Node private-file conformance failed (${child.signalCode ?? code}): ${stderr.trim()}`)
    expect(JSON.parse(stdout)).toMatchObject({ runtime: "node", version: expect.stringMatching(/^v\d+\./), operation })
  }
  const normal = join(root, "node normal ' $ ; [file].json")
  await run(normal, "create")
  await assertPrivateFile(normal)
  const broad = join(root, "node broad ' $ ; [file].json")
  await writeFile(broad, "node fixture-only")
  await broadenPrivateFile(broad, true)
  await expect(assertPrivateFile(broad)).rejects.toThrow("Private-file oracle")
  await run(broad, "protect")
  await assertPrivateFile(broad)
  if (process.platform === "win32") {
    // Child-only environment fault: real Node execFile must report native ENOENT.
    await run(broad, "failure", { ...process.env, SystemRoot: join(root, "unavailable-windows-backend") })
  }
  if (process.platform === "linux") {
    await using failure = await preventNativeProtection(broad)
    await run(broad, "failure")
  }
  await assertPrivateFile(broad)
})
