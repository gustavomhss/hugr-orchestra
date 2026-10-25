import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { seatSkillsFiles, seatSkillsModule } from "@orchestra/maestro/seat-skills-module"
import { SeatSkillContent } from "@orchestra/maestro/seat-skill-content"
import { Seats } from "@orchestra/maestro/seats"
import { PlaybookContent } from "@orchestra/maestro/playbook-content"
import { tmpdir } from "../../../../packages/core/test/fixture/tmpdir"

const entry = "cold-review/SKILL.md"
const valid = "---\nname: cold-review\ndescription: Review: implementation\n---\nReview body.\n"
const skills = ["cold-review"]
const moduleName = "orchestra-seat-skills.gen.ts"

describe("seat skill packaging", () => {
  test("production files map is exact and shared with the public module helper", async () => {
    expect(await seatSkillsFiles()).toEqual({ [moduleName]: await seatSkillsModule() })
  })

  test("source reader preserves non-ASCII, BOM and CRLF companion bytes through embedding", async () => {
    await using tmp = await tmpdir()
    const files = { [entry]: valid, "cold-review/references/notes.md": "\uFEFFRevisão 日本語 🪨\r\nSecond line\n" }
    await Promise.all(Object.entries(files).map(([file, text]) => Bun.write(path.join(tmp.path, file), text)))
    const read = await SeatSkillContent.read("cold", tmp.path, skills)
    expect(read).toEqual(files)
    const { SeatSkillRoot } = await import("@orchestra/maestro/seat-skill-root")
    const root = await SeatSkillRoot.extract("cold", read, path.join(tmp.path, "cache"), "local")
    await Promise.all(Object.keys(files).map(async (file) => {
      expect(await fs.readFile(path.join(root, file))).toEqual(await fs.readFile(path.join(tmp.path, file)))
    }))
  })

  test("invalid binary UTF-8 companion fails source acquisition", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, entry), valid)
    await Bun.write(path.join(tmp.path, "cold-review/references/binary.bin"), new Uint8Array([0xff, 0xfe, 0x80]))
    await expect(SeatSkillContent.read("cold", tmp.path, skills)).rejects.toMatchObject({
      name: "SeatSkillPackagingError", message: "Invalid UTF-8 seat skill content: cold/cold-review/references/binary.bin",
    })
  })

  test("missing, file and symlink source roots fail acquisition", async () => {
    await using tmp = await tmpdir()
    await expect(SeatSkillContent.read("cold", path.join(tmp.path, "missing"), skills)).rejects.toMatchObject({
      name: "SeatSkillPackagingError", message: "Cannot acquire seat skill source root: cold",
    })
    const file = path.join(tmp.path, "file")
    await Bun.write(file, "file")
    await expect(SeatSkillContent.read("cold", file, skills)).rejects.toThrow("Invalid seat skill source root: cold")
    const root = path.join(tmp.path, "real")
    await Bun.write(path.join(root, entry), valid)
    const link = path.join(tmp.path, "link")
    await fs.symlink(root, link, process.platform === "win32" ? "junction" : "dir")
    await expect(SeatSkillContent.read("cold", link, skills)).rejects.toThrow("Invalid seat skill source root: cold")
    await fs.symlink(root, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir")
    await expect(SeatSkillContent.read("cold", root, skills)).rejects.toThrow("Non-file in seat skill tree: cold")
  })

  test.each([
    ["missing", { "cold-review/ref.md": "companion" }],
    ["foreign", { [entry]: valid, "foreign/SKILL.md": valid }],
    ["duplicate", { [entry]: valid, "cold-review/nested/SKILL.md": valid }],
  ])("%s entry definition fails declared-entry validation", (_kind, files) => {
    expect(() => SeatSkillContent.validate("cold", files, skills)).toThrow("Seat entry skills differ from declared skills: cold")
  })

  test.each([
    "body without frontmatter",
    "---\nname: 123\n---\n",
    "---\nname: cold-review\ndescription: 123\n---\n",
    "---\nname: cold-review\ndescription: null\n---\n",
    "---\nname: cold-review\ndescription: [list]\n---\n",
    "---\nname: [\n---\n",
  ])("runtime-unsupported frontmatter fails: %s", (text) => {
    expect(() => SeatSkillContent.validate("cold", { [entry]: text }, skills)).toThrow("Invalid seat skill frontmatter: cold/cold-review")
  })

  test("runtime-supported optional description and sanitization stay accepted; wrong names fail", () => {
    expect(() => SeatSkillContent.validate("cold", { [entry]: "---\nname: cold-review\n---\n" }, skills)).not.toThrow()
    expect(() => SeatSkillContent.validate("cold", { [entry]: valid }, skills)).not.toThrow()
    expect(() => SeatSkillContent.validate("cold", { [entry]: valid.replace("name: cold-review", "name: cold-other") }, skills))
      .toThrow("Seat skill name mismatch: cold/cold-review")
    expect(() => SeatSkillContent.validate("cold", { [entry]: valid }, [...skills, ...skills]))
      .toThrow("Invalid declared seat entry skills: cold")
    expect(() => SeatSkillContent.validate("cold", { [entry]: "\ud800" })).toThrow("Nonlossless UTF-8 seat skill content")
  })

  test.each((["bun", "node"] as const).flatMap((target) => (["backend", "archie", "jimmy"] as const).map((seat) => ({ target, seat }))))(
    "$target compiled bundle extracts the $seat production files map without authored source", async ({ target, seat }) => {
    await using tmp = await tmpdir()
    const result = await bundle(tmp.path, target, await seatSkillsFiles(), seat)
    if (result.exit !== 0) throw new Error(`Compiled seat root acquisition failed (${target}, ${result.exit}):\n${result.stderr}`)
    const evidence = JSON.parse(result.stdout) as { root: string; files: Record<string, string>; sourceAvailable: boolean; playbooks: Record<string, string> }
    expect(evidence.playbooks).toEqual(await PlaybookContent.read(path.resolve(import.meta.dir, "../playbooks")))
    expect(evidence.sourceAvailable).toBe(false)
    expect(evidence.root).not.toBe(Seats.skillSource(seat))
    expect(path.basename(evidence.root)).toMatch(/^local-[0-9a-f]{12}$/)
    expect(evidence.files).toEqual(await SeatSkillContent.read(seat, Seats.skillSource(seat), Seats.all[seat].skills))
  }, 60000)

  test("compiled generated-module import failure is named, never source fallback", async () => {
    await using tmp = await tmpdir()
    const result = await bundle(tmp.path, "bun", {})
    expect(result.exit).not.toBe(0)
    expect(result.stderr).toContain("SeatSkillPackagingError: Cannot import compiled seat skill module")
  }, 60000)

  test.each(["missing maestro", "missing companion", "missing override"])("compiled %s cannot publish empty playbook success", async (kind) => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "inventory.mjs"), await seatSkillsModule())
    const inventory = await import(path.join(tmp.path, "inventory.mjs"))
    const tree = kind === "missing maestro"
      ? Object.fromEntries(Object.entries(inventory.default).filter(([id]) => id !== "maestro"))
      : { ...inventory.default, maestro: kind === "missing companion"
        ? Object.fromEntries(Object.entries(inventory.default.maestro).filter(([file]) => file !== "maestro-verify/review-checks.md"))
        : inventory.default.maestro }
    const result = await bundle(tmp.path, "bun", { [moduleName]: `export default ${JSON.stringify(tree)}` }, "backend",
      kind === "missing override" ? { ORCHESTRA_PLAYBOOKS_DIR: path.join(tmp.path, "absent") } : {})
    expect(result.exit).not.toBe(0)
    expect(result.stderr).toContain(kind === "missing maestro" ? "Missing embedded Maestro playbook tree" :
      kind === "missing companion" ? "Maestro playbook files differ from required source inventory" : "Cannot acquire seat skill source root: maestro")
  }, 60000)

  test.each([
    ["missing seat", "export default {}", "Missing embedded seat skill tree: backend"],
    ["empty tree", 'export default { backend: {} }', "Invalid or empty seat skill tree: backend"],
    ["missing entry", 'export default { backend: { "backend-implement/ref.md": "reference" } }', "Seat entry skills differ from declared skills: backend"],
    ["foreign seat", 'export default { foreign: {} }', "Foreign embedded seat skill tree"],
    ["invalid module", "export default null", "Invalid compiled seat skill module"],
  ])("compiled %s fails before roots publish", async (_kind, module, error) => {
    await using tmp = await tmpdir()
    const result = await bundle(tmp.path, "bun", { [moduleName]: module })
    expect(result.exit).not.toBe(0)
    expect(result.stderr).toContain(`SeatSkillPackagingError: ${error}`)
  }, 60000)

  test("specialist Markdown, JSON and TypeScript stay LF under LF and CRLF checkouts; binary stays exact", async () => {
    await using tmp = await tmpdir()
    const root = path.resolve(import.meta.dir, "../../../..")
    await Bun.write(path.join(tmp.path, ".gitattributes"), Bun.file(path.join(root, ".gitattributes")))
    const trees = [
      ...["cold", "backend"].map((id) => `packages/${id}-specialist/skills/${id}-review`),
      ...["backend", "archie"].map((id) => `modules/specialists/${id}/skills/${id}-review`),
    ]
    const files = Object.fromEntries(trees.flatMap((tree) => [
      [`${tree}/SKILL.md`, valid],
      [`${tree}/references/notes.md`, "日本語\n"],
      [`${tree}/references/config.json`, '{"name":"日本語"}\n'],
      [`${tree}/references/example.ts`, 'export const name = "日本語"\n'],
    ]))
    files["tooling/httpapi-codegen/test/generated/control.ts"] = 'export const generated = "日本語"\n'
    const binary = trees.map((tree) => `${tree}/references/data.bin`)
    const bytes = new Uint8Array([0, 0xff, 10, 13, 10])
    await Promise.all(Object.entries(files).map(([file, text]) => Bun.write(path.join(tmp.path, file), text)))
    await Promise.all(binary.map((file) => Bun.write(path.join(tmp.path, file), bytes)))
    // Outside the packaged tree the same checkout must really exercise CRLF conversion.
    await Bun.write(path.join(tmp.path, "control.ts"), "export const control = true\n")
    await git(tmp.path, ["init"])
    await git(tmp.path, ["-c", "core.autocrlf=false", "add", "."])
    await Promise.all(["false", "true"].map(async (autocrlf) => {
      const checkout = path.join(tmp.path, `checkout-${autocrlf}`)
      await fs.mkdir(checkout)
      await git(tmp.path, ["-c", `core.autocrlf=${autocrlf}`, "checkout-index", "--all", "--force", `--prefix=${checkout}${path.sep}`])
      await Promise.all(Object.entries(files).map(async ([file, text]) => {
        expect(await Bun.file(path.join(checkout, file)).text()).toBe(text)
      }))
      await Promise.all(binary.map(async (file) => {
        expect(new Uint8Array(await Bun.file(path.join(checkout, file)).arrayBuffer())).toEqual(bytes)
      }))
      expect(await Bun.file(path.join(checkout, "control.ts")).text()).toBe(`export const control = true${autocrlf === "true" ? "\r\n" : "\n"}`)
    }))
  })
})

async function bundle(dir: string, target: "bun" | "node", files: Record<string, string>, seat = "backend", env: Record<string, string> = {}) {
  const rootModule = path.resolve(import.meta.dir, "../../../../modules/maestro/coordination/src/seat-skill-root.ts").replaceAll("\\", "/")
  const seatsModule = path.resolve(import.meta.dir, "../../../../modules/maestro/coordination/src/seats/index.ts").replaceAll("\\", "/")
  const config = {
    target,
    format: "esm",
    entrypoints: ["seat-proof.ts"],
    files: {
      ...files,
      "seat-proof.ts": `
        import fs from "node:fs/promises";
        import path from "node:path";
        import { SeatSkillRoot } from ${JSON.stringify(rootModule)};
        import { Seats } from ${JSON.stringify(seatsModule)};
        const sourceAvailable = await fs.stat(Seats.skillSource(${JSON.stringify(seat)})).then(() => true, (error) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
        const root = SeatSkillRoot.roots[${JSON.stringify(seat)}];
        const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
        const files = Object.fromEntries(await Promise.all(entries.filter(e => e.isFile()).map(async e => {
          const target = path.join(e.parentPath, e.name);
          return [path.relative(root, target).split(path.sep).join("/"), await fs.readFile(target, "utf8")];
        })));
        const playbookEntries = await fs.readdir(SeatSkillRoot.playbooks, { recursive: true, withFileTypes: true });
        const playbooks = Object.fromEntries(await Promise.all(playbookEntries.filter(e => e.isFile()).map(async e => {
          const target = path.join(e.parentPath, e.name);
          return [path.relative(SeatSkillRoot.playbooks, target).split(path.sep).join("/"), await fs.readFile(target, "utf8")];
        })));
        // Await the complete pipe write before natural exit; the production map can exceed one buffered chunk.
        await new Promise((resolve, reject) => process.stdout.write(JSON.stringify({ root, files, sourceAvailable, playbooks }), error => error ? reject(error) : resolve(undefined)));
      `,
    },
    external: Object.hasOwn(files, moduleName) ? [] : [moduleName],
    define: { ORCHESTRA_COMPILED: "true" },
  }
  const outfile = path.join(dir, "seat-proof.mjs")
  // Separate build processes avoid Bun virtual-files resolver state leaking between builds with different maps.
  const builder = path.join(dir, "seat-build.ts")
  await Bun.write(builder, `
    const built = await Bun.build(${JSON.stringify(config)});
    if (!built.success || built.outputs.length !== 1) throw new Error("Seat proof build failed: " + built.logs.join("\\n"));
    await Bun.write(${JSON.stringify(outfile)}, built.outputs[0]);
  `)
  const build = Bun.spawn([process.execPath, builder], { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" })
  const [buildout, builderr, buildexit] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
  if (buildexit !== 0) throw new Error(`Seat proof build failed (${buildexit}):\n${buildout}\n${builderr}`)
  const child = Bun.spawn([target === "bun" ? process.execPath : "node", outfile], {
    env: {
      ...process.env,
      ...env,
      XDG_CACHE_HOME: path.join(dir, "cache"),
      XDG_DATA_HOME: path.join(dir, "data"),
      XDG_CONFIG_HOME: path.join(dir, "config"),
      XDG_STATE_HOME: path.join(dir, "state"),
    },
    stdout: "pipe", stderr: "pipe",
  })
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { stdout, stderr, exit }
}

async function git(cwd: string, args: string[]) {
  const child = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (exit !== 0) throw new Error(`Git checkout proof failed (${exit}):\n${stdout}\n${stderr}`)
}
