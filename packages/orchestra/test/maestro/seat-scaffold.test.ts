import { describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { add } from "../../script/seat"
import { canonicalMemberId, createRoster, LEGACY_BACKEND_ID, roster } from "../../src/maestro/roster"
import { Seats } from "../../src/maestro/seats"
import { define } from "../../src/maestro/seats/seat"
import { tmpdir } from "../fixture/fixture"

const source = path.resolve(import.meta.dirname, "../..")
const sample = { ...Seats.all.backend, id: "sample-seat", skills: ["sample-seat-work"], atlasMemory: false, toolkit: false }

async function fixture() {
  return tmpdir({
    init: async (dir) => {
      const root = path.join(dir, "packages/orchestra")
      await fs.mkdir(path.join(root, "src/agent/prompt"), { recursive: true })
      await fs.mkdir(path.join(root, "src/maestro/seats"), { recursive: true })
      const index = path.join(root, "src/maestro/seats/index.ts")
      await fs.copyFile(path.join(source, "src/maestro/seats/index.ts"), index)
      return { root, index, lock: `${index}.seat-lock` }
    },
  })
}

function targets(root: string, id = "sample-seat") {
  return [path.join(root, `src/maestro/seats/${id}.ts`), path.join(root, `src/agent/prompt/${id}.txt`), path.resolve(root, "..", `${id}-specialist`)]
}

async function absent(root: string, id = "sample-seat") {
  for (const file of targets(root, id)) await expect(fs.lstat(file)).rejects.toMatchObject({ code: "ENOENT" })
}

// Include directories, links and bytes: leftovers or changes to existing artifacts cannot hide behind a missing file.
async function snapshot(root: string) {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true })
  return Promise.all(entries.toSorted((left, right) => path.join(left.parentPath, left.name).localeCompare(path.join(right.parentPath, right.name))).map(async (entry) => {
    const file = path.join(entry.parentPath, entry.name)
    return [path.relative(root, file), entry.isSymbolicLink() ? await fs.readlink(file) : entry.isDirectory() ? "directory" : (await fs.readFile(file)).toString("base64")]
  }))
}

describe("seat scaffold validation", () => {
  test("invalid and Windows reserved ids leave the filesystem unchanged", async () => {
    await using tmp = await fixture()
    const before = await snapshot(tmp.path)
    for (const id of ["", "../escape", "Backend", "bad_underscore", "foo.ts", "maestro", "constructor", "con", "prn", "aux", "nul", "com1", "lpt9"]) {
      await expect(add(id, "role", tmp.extra.root)).rejects.toThrow("Invalid native seat id")
      expect(await snapshot(tmp.path)).toEqual(before)
    }
    for (const role of ["", " ", "two\nlines"]) await expect(add("sample-seat", role, tmp.extra.root)).rejects.toThrow("Seat role must be nonempty and single-line")
    await absent(tmp.extra.root)
    expect(await snapshot(tmp.path)).toEqual(before)
  })

  test("legacy alias is rejected before every target exists", async () => {
    await using tmp = await fixture()
    const before = await snapshot(tmp.path)
    expect(canonicalMemberId(LEGACY_BACKEND_ID)).toBe("backend")
    await expect(add(LEGACY_BACKEND_ID, "role", tmp.extra.root)).rejects.toThrow("Native seat id must be canonical")
    await absent(tmp.extra.root, LEGACY_BACKEND_ID)
    expect(await snapshot(tmp.path)).toEqual(before)
    expect(() => createRoster([{ ...roster[1]!, memberId: LEGACY_BACKEND_ID }])).toThrow("Roster memberId must be canonical")
  })

  test("execution skills require confinement; review skills and skill-free execution remain valid", () => {
    expect(() => define({ ...sample, writeRoots: false })).toThrow("Execution seats with entry skills require write roots: sample-seat")
    expect(define({ ...sample, writeRoots: true }).id).toBe("sample-seat")
    expect(define({ ...sample, skills: [], writeRoots: false }).id).toBe("sample-seat")
    expect(define({ ...sample, profile: "review", writeRoots: false }).id).toBe("sample-seat")
  })

  test("published registry rejects legacy ids and empty required fields", async () => {
    for (const [change, error] of [
      [{ id: LEGACY_BACKEND_ID, skills: [] }, "Native seat id must be canonical"],
      [{ role: " " }, "Native seat role and description must be nonempty"],
      [{ description: " " }, "Native seat role and description must be nonempty"],
      [{ prompt: " " }, "Native seat prompt must be nonempty"],
      [{ id: "con", skills: [] }, "Invalid native seat id"],
    ] as const) {
      await using tmp = await tmpdir()
      const registry = path.join(tmp.path, "registry.ts")
      await fs.writeFile(registry, `import backend from ${JSON.stringify(path.join(source, "src/maestro/seats/backend.ts"))}\nexport const Seats = { all: { backend, sample: ${JSON.stringify({ ...sample, ...change })} } }\n`)
      const copied = path.join(tmp.path, "roster.ts")
      await fs.writeFile(copied, (await fs.readFile(path.join(source, "src/maestro/roster.ts"), "utf8"))
        .replace('from "./seats"', `from ${JSON.stringify(registry)}`)
        .replace('from "./seats/seat"', `from ${JSON.stringify(path.join(source, "src/maestro/seats/seat.ts"))}`)
        .replace('from "./seat-skill-root"', `from ${JSON.stringify(path.join(source, "src/maestro/seat-skill-root.ts"))}`)
        .replace('from "../tool/truncation-dir"', `from ${JSON.stringify(path.join(source, "src/tool/truncation-dir.ts"))}`))
      await expect(import(copied)).rejects.toThrow(error)
    }
  })
})

describe("seat scaffold transaction", () => {
  test("pre-existing definition, prompt or empty skill tree is preserved", async () => {
    for (const target of [0, 1, 2]) {
      await using tmp = await fixture()
      const file = targets(tmp.extra.root)[target]!
      if (target === 2) await fs.mkdir(file)
      if (target !== 2) await fs.writeFile(file, "existing artifact\n")
      const before = await snapshot(tmp.path)
      await expect(add("sample-seat", "role", tmp.extra.root)).rejects.toThrow("Seat scaffold collision")
      expect(await snapshot(tmp.path)).toEqual(before)
    }
  })

  test("symlinked registry and lock are refused before writes", async () => {
    for (const kind of ["registry", "lock"]) {
      await using tmp = await fixture()
      const outside = path.join(tmp.path, "untouched.txt")
      await fs.writeFile(outside, kind === "lock" ? `${process.pid}\n` : await fs.readFile(tmp.extra.index))
      if (kind === "registry") await fs.unlink(tmp.extra.index)
      await fs.symlink(outside, kind === "registry" ? tmp.extra.index : tmp.extra.lock, "file")
      const before = await snapshot(tmp.path)
      await expect(add("sample-seat", "role", tmp.extra.root)).rejects.toThrow("regular non-symlink file")
      await absent(tmp.extra.root)
      expect(await snapshot(tmp.path)).toEqual(before)
    }
  })

  test("symlinked package and artifact parents are refused before writes", async () => {
    for (const kind of ["package", "seats", "prompt"]) {
      await using tmp = await fixture()
      const original = kind === "package" ? tmp.extra.root : path.join(tmp.extra.root, kind === "seats" ? "src/maestro/seats" : "src/agent/prompt")
      const redirected = `${original}-real`
      await fs.rename(original, redirected)
      await fs.symlink(redirected, original, process.platform === "win32" ? "junction" : "dir")
      const before = await snapshot(tmp.path)
      await expect(add("sample-seat", "role", tmp.extra.root)).rejects.toThrow("canonical directory")
      await absent(tmp.extra.root)
      expect(await snapshot(tmp.path)).toEqual(before)
    }
  })

  test("filesystem failures roll back staged and published artifacts; retry succeeds", async () => {
    for (const phase of ["stage", "commit"]) {
      await using tmp = await fixture()
      const before = await snapshot(tmp.path)
      const rename = fs.rename
      const writeFile = fs.writeFile
      const fault = phase === "commit"
        ? spyOn(fs, "rename").mockImplementation(async (from, to) => {
          if (to === tmp.extra.index) {
            for (const file of targets(tmp.extra.root)) expect(await fs.lstat(file)).toBeDefined()
            throw Object.assign(new Error("injected filesystem failure"), { code: "EIO" })
          }
          return rename(from, to)
        })
        : spyOn(fs, "writeFile").mockImplementation(async (...args) => {
          if (String(args[0]).endsWith(`${path.sep}references${path.sep}README.md`))
            throw Object.assign(new Error("injected filesystem failure"), { code: "EIO" })
          return writeFile(...args)
        })
      try {
        await expect(add("sample-seat", "role", tmp.extra.root)).rejects.toThrow("injected filesystem failure")
      } finally {
        fault.mockRestore()
      }
      await absent(tmp.extra.root)
      expect(await snapshot(tmp.path)).toEqual(before)
      const created = await add("sample-seat", "retry role", tmp.extra.root)
      expect(await fs.readFile(created.prompt, "utf8")).toContain("retry role")
      expect(await fs.readFile(tmp.extra.index, "utf8")).toContain("[seatSampleSeat.id]: seatSampleSeat")
      expect(await fs.readFile(path.join(created.tree, "skills/sample-seat-work/SKILL.md"), "utf8")).toContain("name: sample-seat-work")
      await expect(fs.lstat(tmp.extra.lock)).rejects.toMatchObject({ code: "ENOENT" })
      expect((await fs.readdir(tmp.path, { recursive: true })).filter((file) => file.endsWith(".tmp"))).toEqual([])
    }
  })

  test("registry identity change aborts without overwriting concurrent edit", async () => {
    await using tmp = await fixture()
    const before = await fs.readFile(tmp.extra.index, "utf8")
    const rename = fs.rename
    const fault = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(to).endsWith(`${path.sep}sample-seat-specialist${path.sep}skills`)) {
        const replacement = `${tmp.extra.index}.replacement`
        await fs.writeFile(replacement, `${before}// concurrent edit\n`)
        await rename(replacement, tmp.extra.index)
      }
      return rename(from, to)
    })
    try {
      await expect(add("sample-seat", "role", tmp.extra.root)).rejects.toThrow("Seat registry changed during scaffold")
    } finally {
      fault.mockRestore()
    }
    await absent(tmp.extra.root)
    expect(await fs.readFile(tmp.extra.index, "utf8")).toBe(`${before}// concurrent edit\n`)
    await expect(fs.lstat(tmp.extra.lock)).rejects.toMatchObject({ code: "ENOENT" })
  })
})

describe("seat scaffold lock", () => {
  test("live owner refuses another writer without changing existing artifacts", async () => {
    await using tmp = await fixture()
    process.kill(process.pid, 0)
    await fs.writeFile(tmp.extra.lock, `${process.pid}\n`)
    const before = await snapshot(tmp.path)
    await expect(add("sample-seat", "role", tmp.extra.root)).rejects.toThrow("Seat scaffold lock owner is alive")
    await absent(tmp.extra.root)
    expect(await snapshot(tmp.path)).toEqual(before)
  })

  test("interrupted owner's lock recovers only after observed process exit", async () => {
    await using tmp = await fixture()
    const child = Bun.spawn([process.execPath, "-e", "process.exit(0)"], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    expect(() => process.kill(child.pid, 0)).toThrow()
    await fs.writeFile(tmp.extra.lock, `${child.pid}\n`)
    await add("sample-seat", "role", tmp.extra.root)
    expect(await fs.readFile(tmp.extra.index, "utf8")).toContain('import seatSampleSeat from "./sample-seat"')
    await expect(fs.lstat(tmp.extra.lock)).rejects.toMatchObject({ code: "ENOENT" })
  })
})

test("legacy negative test detects isolated mutation and passes after restoration", async () => {
  await using tmp = await fixture()
  const original = await fs.readFile(path.join(source, "script/seat.ts"), "utf8")
  const binding = '  if (canonicalMemberId(id) !== id) throw new Error(`Native seat id must be canonical: ${id}`)'
  expect(original.split(binding)).toHaveLength(2)
  const copied = path.join(tmp.path, "scaffold.ts")
  const copy = original.replaceAll('from "../src/', `from "${path.join(source, "src").replaceAll("\\", "/")}/`)
  const config = path.join(tmp.path, "bunfig.toml")
  await fs.writeFile(config, `[test]\npreload = ${JSON.stringify([path.resolve(source, "../../script/test-guard.ts")])}\n`)
  const negative = path.join(tmp.path, "legacy.test.ts")
  await fs.writeFile(negative, `import { expect, test } from "bun:test"
import { add } from "./scaffold"
test("legacy scaffold rejection", async () => {
  await expect(add(${JSON.stringify(LEGACY_BACKEND_ID)}, "role", ${JSON.stringify(tmp.extra.root)})).rejects.toThrow("Native seat id must be canonical")
})
`)
  const before = await fs.readFile(tmp.extra.index, "utf8")
  for (const mode of ["mutation", "restored"]) {
    if (mode === "restored") {
      for (const file of targets(tmp.extra.root, LEGACY_BACKEND_ID)) await fs.rm(file, { recursive: true })
      await fs.writeFile(tmp.extra.index, before)
    }
    await fs.writeFile(copied, mode === "mutation" ? copy.replace(binding, "") : copy)
    const child = Bun.spawn([process.execPath, "test", `--config=${config}`, negative], { cwd: source, stdout: "pipe", stderr: "pipe", env: process.env })
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect(stderr, stdout).toContain("legacy scaffold rejection")
    if (mode === "mutation") {
      expect(exit, stderr).not.toBe(0)
      expect(stderr).toMatch(/\b1 fail\b/)
      expect(await fs.readFile(tmp.extra.index, "utf8")).toContain(`"./${LEGACY_BACKEND_ID}"`)
      for (const file of targets(tmp.extra.root, LEGACY_BACKEND_ID)) expect(await fs.lstat(file)).toBeDefined()
    }
    if (mode === "restored") {
      expect(exit, stderr).toBe(0)
      expect(stderr).toMatch(/\b1 pass\b/)
      await absent(tmp.extra.root, LEGACY_BACKEND_ID)
      expect(await fs.readFile(tmp.extra.index, "utf8")).toBe(before)
    }
    console.log(JSON.stringify({ scaffoldMutation: { mode, exit, oracle: "legacy scaffold rejection" } }))
  }
  expect(await fs.readFile(path.join(source, "script/seat.ts"), "utf8")).toBe(original)
})
