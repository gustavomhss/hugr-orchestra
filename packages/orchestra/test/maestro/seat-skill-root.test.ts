import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { SeatSkillRoot } from "@/maestro/seat-skill-root"
import { backendSkills } from "@/maestro/roster"
import { tmpdir } from "../fixture/fixture"

const SOURCE = path.resolve(import.meta.dir, "../../../backend-specialist/skills")

describe("backend skill root", () => {
  test("running from source resolves the authored tree in place", async () => {
    expect(SeatSkillRoot.roots.backend).toBe(SOURCE)
    expect(backendSkills.root).toBe(SOURCE)
    expect(await fs.exists(path.join(SOURCE, "backend-implement", "SKILL.md"))).toBe(true)
  })

  test("extracts once, reuses a verified copy and replaces a corrupted one", async () => {
    await using tmp = await tmpdir()
    const files = await embed(tmp.path, { "a/SKILL.md": "alpha", "a/references/b.md": "beta" })
    const cache = path.join(tmp.path, "cache")

    const dir = await SeatSkillRoot.extract("backend", files, cache, "1.0.0")
    // The copy is keyed by version and content digest, and the root is canonical (no 8.3 short names or symlinked temp
    // prefixes), so permission checks match it.
    expect(path.basename(dir)).toMatch(/^1\.0\.0-[0-9a-f]{12}$/)
    expect(dir).toBe(await fs.realpath(path.join(cache, "backend-skills", path.basename(dir))))
    expect(await tree(dir)).toEqual({ "a/SKILL.md": "alpha", "a/references/b.md": "beta" })

    // A verified copy is left alone: the directory is not replaced.
    const first = await fs.stat(dir)
    expect(await SeatSkillRoot.extract("backend", files, cache, "1.0.0")).toBe(dir)
    expect((await fs.stat(dir)).ino).toBe(first.ino)

    await Bun.write(path.join(dir, "a", "references", "b.md"), "tampered")
    await SeatSkillRoot.extract("backend", files, cache, "1.0.0")
    expect(await tree(dir)).toEqual({ "a/SKILL.md": "alpha", "a/references/b.md": "beta" })

    // A partial copy (missing file) and a planted extra file are both redone.
    await fs.rm(path.join(dir, "a", "SKILL.md"))
    await Bun.write(path.join(dir, "a", "planted.md"), "x")
    await SeatSkillRoot.extract("backend", files, cache, "1.0.0")
    expect(await tree(dir)).toEqual({ "a/SKILL.md": "alpha", "a/references/b.md": "beta" })
    expect((await fs.readdir(path.dirname(dir))).toSorted()).toEqual([path.basename(dir)])
  })

  test("each installation version keeps its own copy", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const older = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v1"), { "a/SKILL.md": "v1" }), cache, "1.0.0")
    const before = await fs.stat(older)
    const newer = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v2"), { "a/SKILL.md": "v2" }), cache, "1.1.0")

    expect(newer).not.toBe(older)
    expect(await tree(older)).toEqual({ "a/SKILL.md": "v1" })
    expect(await tree(newer)).toEqual({ "a/SKILL.md": "v2" })
    // An older install still running keeps its copy: it was never replaced.
    expect((await fs.stat(older)).ino).toBe(before.ino)
  })

  test("a rollback re-selects the older copy unchanged", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const v1 = await embed(path.join(tmp.path, "v1"), { "a/SKILL.md": "v1" })
    const first = await SeatSkillRoot.extract("backend", v1, cache, "1.0.0")
    const before = await fs.stat(first)
    const second = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v2"), { "a/SKILL.md": "v2" }), cache, "2.0.0")

    expect(await SeatSkillRoot.extract("backend", v1, cache, "1.0.0")).toBe(first)
    expect((await fs.stat(first)).ino).toBe(before.ino)
    expect(await tree(first)).toEqual({ "a/SKILL.md": "v1" })
    expect(await tree(second)).toEqual({ "a/SKILL.md": "v2" })
  })

  test("an install touches nothing outside its own copy", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const other = path.join(cache, "other", "sentinel")
    const sibling = path.join(cache, "backend-skills", "0.9.0-0123456789ab", "a", "SKILL.md")
    await Bun.write(other, "other")
    await Bun.write(sibling, "older install")

    await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v1"), { "a/SKILL.md": "v1" }), cache, "1.0.0")
    expect(await Bun.file(other).text()).toBe("other")
    expect(await Bun.file(sibling).text()).toBe("older install")
  })

  test("two builds with the same version string keep separate copies", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const first = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "a"), { "a/SKILL.md": "first" }), cache, "local")
    const before = await fs.stat(first)
    const second = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "b"), { "a/SKILL.md": "second" }), cache, "local")

    expect(second).not.toBe(first)
    expect(path.basename(second)).toMatch(/^local-[0-9a-f]{12}$/)
    expect((await fs.stat(first)).ino).toBe(before.ino)
    expect(await tree(first)).toEqual({ "a/SKILL.md": "first" })
    expect(await tree(second)).toEqual({ "a/SKILL.md": "second" })
  })

  test("matching external symlink root fails acquisition without touching external bytes", async () => {
    await using tmp = await tmpdir()
    const files = { "a/SKILL.md": "alpha", "a/references/b.md": "βeta 日本語\r\n" }
    const cache = path.join(tmp.path, "cache")
    const dir = await SeatSkillRoot.extract("backend", files, cache, "local")
    const external = path.join(tmp.path, "external")
    await fs.rename(dir, external)
    await fs.symlink(external, dir, process.platform === "win32" ? "junction" : "dir")
    await expect(SeatSkillRoot.extract("backend", files, cache, "local")).rejects.toMatchObject({
      name: "SeatSkillPackagingError",
      message: `Invalid extracted seat skill root: ${dir}`,
    })
    expect(await tree(external)).toEqual(files)
    expect((await fs.lstat(dir)).isSymbolicLink()).toBe(true)
  })

  test("planted companion symlink cannot pass digest verification", async () => {
    await using tmp = await tmpdir()
    const files = { "a/SKILL.md": "alpha", "a/ref.md": "βeta" }
    const dir = await SeatSkillRoot.extract("backend", files, tmp.path, "local")
    const external = path.join(tmp.path, "external.md")
    await Bun.write(external, "βeta")
    await fs.rm(path.join(dir, "a/ref.md"))
    await fs.symlink(external, path.join(dir, "a/ref.md"))
    expect(await SeatSkillRoot.extract("backend", files, tmp.path, "local")).toBe(dir)
    expect((await fs.lstat(path.join(dir, "a/ref.md"))).isFile()).toBe(true)
    expect(await tree(dir)).toEqual(files)
    expect(await Bun.file(external).text()).toBe("βeta")
  })

  test("competing process starts acquire one valid tree without removing its publication", async () => {
    await using tmp = await tmpdir()
    const files = Object.fromEntries(Array.from({ length: 128 }, (_, index) => [`a/references/${index}.md`, `日本語 ${index}\r\n`]))
    const module = path.resolve(import.meta.dir, "../../src/maestro/seat-skill-root.ts")
    const children = Array.from({ length: 4 }, () => Bun.spawn([process.execPath, "--eval", `
      import fs from "node:fs/promises";
      const { SeatSkillRoot } = await import(${JSON.stringify(module)});
      const root = await SeatSkillRoot.extract("backend", ${JSON.stringify(files)}, ${JSON.stringify(tmp.path)}, "local");
      console.log(JSON.stringify({ root, ino: (await fs.stat(root)).ino }));
    `], { cwd: path.resolve(import.meta.dir, "../.."), env: process.env, stdout: "pipe", stderr: "pipe" }))
    const evidence = await Promise.all(children.map(async (child) => {
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      if (exit !== 0) throw new Error(`Competing seat root acquisition failed (${exit}):\n${stdout}\n${stderr}`)
      return JSON.parse(stdout) as { root: string; ino: number }
    }))
    expect(evidence).toEqual(Array.from({ length: 4 }, () => evidence[0]))
    expect(await tree(evidence[0].root)).toEqual(files)
    expect(await fs.readdir(path.dirname(evidence[0].root))).toEqual([path.basename(evidence[0].root)])
  }, 60000)

  test.each(["readFile", "readdir"] as const)("cooperative corrupt-copy repair rechecks after actual %s ENOENT", async (operation) => {
    await using tmp = await tmpdir()
    const files = { "a/SKILL.md": "alpha", "a/ref.md": "日本語\n" }
    const dir = await SeatSkillRoot.extract("backend", files, tmp.path, "local")
    await Bun.write(path.join(dir, "a/SKILL.md"), "corrupt")
    const obsolete = path.join(dir, "a", operation === "readFile" ? "obsolete.md" : "obsolete")
    if (operation === "readFile") await Bun.write(obsolete, "old copy")
    if (operation === "readdir") await fs.mkdir(obsolete)
    expect((await fs.lstat(obsolete))[operation === "readFile" ? "isFile" : "isDirectory"]()).toBe(true)
    const module = path.resolve(import.meta.dir, "../../src/maestro/seat-skill-root.ts")
    // Insert a scheduling barrier only. Both verification and replacement still execute the real filesystem calls:
    // the reader has enumerated an old entry, then another process repairs the corrupt tree before that entry is read.
    const observation = `
      async function observe<T>(target: string, operation: () => Promise<T>): Promise<T> {
        if (target === ${JSON.stringify(obsolete)}) {
          process.stdout.write("verification-ready\\n");
          await new Promise(resolve => process.stdin.once("data", resolve));
        }
        return operation().catch((cause: NodeJS.ErrnoException) => {
          if (target === ${JSON.stringify(obsolete)} && cause.code === "ENOENT")
            process.stdout.write(JSON.stringify({ observedENOENT: target }) + "\\n");
          throw cause;
        });
      }
    `
    const child = Bun.spawn([process.execPath, "--eval", `
      import { plugin } from "bun";
      const needle = ${JSON.stringify(operation === "readFile" ? "await fs.readFile(target)" : "await fs.readdir(current, { withFileTypes: true })")};
      const replacement = ${JSON.stringify(operation === "readFile" ? "await observe(target, () => fs.readFile(target))" : "await observe(current, () => fs.readdir(current, { withFileTypes: true }))")};
      plugin({ name: "seat-repair-scheduling", setup(build) {
        build.onLoad({ filter: /seat-skill-root\\.ts$/ }, async (args) => {
          const source = await Bun.file(args.path).text();
          if (!source.includes(needle)) throw new Error("Seat repair scheduling boundary not found");
          return { loader: "ts", contents: source.replace(needle, replacement) + ${JSON.stringify(observation)} };
        });
      }});
      const { SeatSkillRoot } = await import(${JSON.stringify(module)});
      const root = await SeatSkillRoot.extract("backend", ${JSON.stringify(files)}, ${JSON.stringify(tmp.path)}, "local");
      console.log(JSON.stringify({ root }));
    `], { cwd: path.resolve(import.meta.dir, "../.."), env: process.env, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
    const ready = Promise.withResolvers<void>()
    const stdout = (async () => {
      const chunks: string[] = []
      const decoder = new TextDecoder()
      const reader = child.stdout.getReader()
      const consume = async (): Promise<string> => {
        const chunk = await reader.read()
        if (chunk.done) return chunks.join("")
        chunks.push(decoder.decode(chunk.value, { stream: true }))
        if (chunks.join("").includes("verification-ready\n")) ready.resolve()
        return consume()
      }
      return consume()
    })()
    const stderr = new Response(child.stderr).text()
    try {
      await Promise.race([ready.promise, child.exited.then(async (exit) => {
        throw new Error(`Seat repair reader exited before scheduling barrier (${exit}):\n${await stdout}\n${await stderr}`)
      })])
      expect(await Bun.file(path.join(dir, "a/SKILL.md")).text()).toBe("corrupt")
      expect(await SeatSkillRoot.extract("backend", files, tmp.path, "local")).toBe(dir)
      await expect(fs.lstat(obsolete)).rejects.toMatchObject({ code: "ENOENT" })
      expect(await tree(dir)).toEqual(files)
      child.stdin.write("continue\n")
      child.stdin.end()
      const [out, err, exit] = await Promise.all([stdout, stderr, child.exited])
      // No synthetic exception: the child's real syscall must have reported the vanished old path.
      expect(out).toContain(JSON.stringify({ observedENOENT: obsolete }))
      if (exit !== 0) throw new Error(`Cooperative repair acquisition failed (${exit}):\n${out}\n${err}`)
      expect(out).toContain(JSON.stringify({ root: dir }))
      expect(await tree(dir)).toEqual(files)
    } finally {
      if (child.exitCode === null) child.kill()
      await child.exited
    }
  }, 60000)

  test.each(["../escape.md", "/escape.md", "a/../escape.md", "a\\escape.md", "C:/escape.md", "a//escape.md"])("escaping path %s fails acquisition", async (file) => {
    await using tmp = await tmpdir()
    await expect(SeatSkillRoot.extract("backend", { [file]: "bad" }, tmp.path, "local")).rejects.toMatchObject({
      name: "SeatSkillPackagingError",
      message: `Invalid seat skill path: backend/${file}`,
    })
    expect(await fs.readdir(tmp.path)).toEqual([])
  })

  test("held publication lock fails acquisition by name, never returns an unchecked tree", async () => {
    await using tmp = await tmpdir()
    const files = { "a/SKILL.md": "alpha" }
    const dir = await SeatSkillRoot.extract("backend", files, tmp.path, "local")
    await Bun.write(path.join(dir, "a/SKILL.md"), "tampered")
    await fs.mkdir(`${dir}.lock`)
    await expect(SeatSkillRoot.extract("backend", files, tmp.path, "local")).rejects.toMatchObject({
      name: "SeatSkillPackagingError", message: "Cannot acquire seat skill publication lock: backend",
    })
    expect(await tree(dir)).toEqual({ "a/SKILL.md": "tampered" })
    expect((await fs.stat(`${dir}.lock`)).isDirectory()).toBe(true)
  }, 20000)
})

// Writes `contents` as real files under `dir` and returns the map the generated module would export.
// The generated module maps seat id to tree-relative paths to file text (script/seat-skills.ts).
async function embed(_dir: string, contents: Record<string, string>) {
  return contents
}

async function tree(dir: string) {
  const files = await relativeFiles(dir)
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await Bun.file(path.join(dir, file)).text()] as const)),
  )
}

async function relativeFiles(dir: string) {
  return (await fs.readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .toSorted()
}
