#!/usr/bin/env bun
import fs, { type FileHandle } from "node:fs/promises"
import { constants, type Stats } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { parseArgs } from "node:util"
import { define, validateInstalled } from "../src/maestro/seats/seat"
import { canonicalMemberId } from "../src/maestro/roster"

// Source scaffold only. Registration is the existing barrel, not a runtime plugin loader.
export async function add(id: string, role: string, directory = path.resolve(import.meta.dirname, "..")) {
  if (canonicalMemberId(id) !== id) throw new Error(`Native seat id must be canonical: ${id}`)
  if (!role.trim() || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(role)) throw new Error("Seat role must be nonempty and single-line")
  const seat = define({
    id, role: role.trim(), abilityClass: "scoped repository write", returnCard: `${id}-result`,
    forbiddenActions: ["delegation", "self-review", "publish work"], prompt: "", profile: "execution",
    description: `${role.trim()}. Edits only dispatch writePaths; read-only without them. Returns change, check evidence and blockers.`,
    labelEnv: `HUGR_${id.replaceAll("-", "_").toUpperCase()}_NAME`, skills: [`${id}-work`],
    workResult: `${id}-work-result-v1`, writeRoots: true, strictResume: true, atlasMemory: false, toolkit: false,
  })
  const root = path.resolve(directory)
  const definition = path.join(root, "src/maestro/seats", `${id}.ts`)
  const prompt = path.join(root, "src/agent/prompt", `${id}.txt`)
  const tree = path.resolve(root, "..", `${id}-specialist`)
  const index = path.join(root, "src/maestro/seats/index.ts")
  const parents = [...new Set([root, path.dirname(definition), path.dirname(prompt), path.dirname(tree)])]
  for (const parent of parents) await requireCanonicalDirectory(parent)
  const original = await readRegular(index)
  // Refuse occupied paths, including symlinks and empty trees, before creating any artifact.
  for (const file of [definition, prompt, tree]) {
    if (await occupied(file)) throw new Error(`Seat scaffold collision: ${file}`)
  }
  const lockPath = `${index}.seat-lock`
  const lock = await acquireLock(lockPath)
  const owned: { file: string; stat: Stats }[] = []
  const own = async (file: string) => owned.push({ file, stat: await fs.lstat(file) })
  try {
    const barrel = original.text
    if (barrel.split("// seat-imports:end").length !== 2 || barrel.split("  // seat-entries:end").length !== 2)
      throw new Error("Seat registry scaffold markers are missing or duplicated")
    const binding = `seat${id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("")}`
    if (barrel.includes(`"./${id}"`)) throw new Error(`Seat already registered: ${id}`)
    const token = randomUUID()
    const stagedTree = `${tree}.${token}.tmp`
    await fs.mkdir(stagedTree)
    await own(stagedTree)
    await fs.mkdir(path.join(stagedTree, "skills", seat.skills[0], "references"), { recursive: true })
    const definitionText = [
      `import PROMPT from "../../agent/prompt/${id}.txt"`,
      'import { define } from "./seat"', "", "export default define({",
      ...Object.entries(seat).map(([key, value]) => `  ${key}: ${key === "prompt" ? "PROMPT" : JSON.stringify(value)},`),
      "})", "",
    ].join("\n")
    const promptText = [
      `You are {{label}}, ${seat.role} specialist on the Orchestra native team.`, "",
      "Implement only the supplied work packet. Write only dispatch writePaths; absent paths mean read-only. Load your entry skill before work. Stop on missing inputs or permission denials.", "",
      `Return card: ${seat.returnCard}. End with one fenced ${seat.returnCard} JSON card containing outcome (done|blocked), changes [{path, change: created|modified|deleted}], checks [{checkId, command, cwd, status: pass|fail|skip|missing|acquisition-error, exitCode?}], blockers [{kind: packet|permission|safety-hold|tool|atlas|check-unavailable, reason, code?, ref?}], risks [string], nextActions [string]. These are worker claims, not acceptance.`, "",
      `Forbidden: ${seat.forbiddenActions.join(", ")}.`, "",
    ].join("\n")
    validateInstalled({ ...seat, prompt: promptText })
    await fs.writeFile(path.join(stagedTree, "skills", seat.skills[0], "SKILL.md"), [
      "---", `name: ${seat.skills[0]}`, `description: ${JSON.stringify(`Execute a supplied ${seat.role} work packet.`)}`, "---", "",
      "# Work packet", "", "Read the charter and supplied acceptance, write paths and checks. Stop on missing inputs. Record exact changes, check evidence and blockers in the return card.", "",
      "Replace this seed with domain-specific procedures and qualified references before evaluating the seat. See [references](references/README.md).", "",
    ].join("\n"), { flag: "wx" })
    await fs.writeFile(path.join(stagedTree, "skills", seat.skills[0], "references/README.md"), "# References\n\nAdd qualified domain references and applicability limits here.\n", { flag: "wx" })
    const nextBarrel = barrel
      .replace("// seat-imports:end", `import ${binding} from "./${id}"\n// seat-imports:end`)
      .replace("  // seat-entries:end", `  [${binding}.id]: ${binding},\n  // seat-entries:end`)
    new Bun.Transpiler({ loader: "ts" }).transformSync(nextBarrel)
    const staged = []
    for (const [file, text] of [[definition, definitionText], [prompt, promptText], [index, nextBarrel]] as const) {
      const temp = `${file}.${token}.tmp`
      const handle = await fs.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), original.stat.mode & 0o777)
      await own(temp)
      try {
        await handle.writeFile(text)
      } finally {
        await handle.close()
      }
      staged.push({ file, temp })
    }
    // All content is ready before exclusive publication; the barrel is the final commit point.
    for (const parent of parents) await requireCanonicalDirectory(parent)
    for (const item of staged.filter((item) => item.file !== index)) {
      await fs.link(item.temp, item.file)
      await own(item.file)
    }
    await fs.mkdir(tree)
    await own(tree)
    await fs.rename(path.join(stagedTree, "skills"), path.join(tree, "skills"))
    const current = await readRegular(index)
    if (!sameFile(original.stat, current.stat) || original.text !== current.text ||
      original.stat.mtimeMs !== current.stat.mtimeMs || original.stat.ctimeMs !== current.stat.ctimeMs)
      throw new Error("Seat registry changed during scaffold")
    await fs.rename(staged.find((item) => item.file === index)!.temp, index)
    // Published artifacts now belong to the registry; only temporary paths remain ours to clean.
    owned.splice(0, owned.length, ...owned.filter((item) => item.file !== definition && item.file !== prompt && item.file !== tree))
    return { definition, prompt, tree }
  } finally {
    try {
      for (const item of owned.toReversed()) {
        const stat = await fs.lstat(item.file).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined
          throw error
        })
        if (stat && sameFile(stat, item.stat)) await fs.rm(item.file, { recursive: stat.isDirectory() })
      }
    } finally {
      const stat = await lock.stat()
      await lock.close()
      if (sameFile(stat, await fs.lstat(lockPath))) await fs.unlink(lockPath)
    }
  }
}

async function requireCanonicalDirectory(directory: string) {
  for (const parent of [directory, ...ancestors(directory)]) {
    const stat = await fs.lstat(parent)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Seat scaffold requires a canonical directory: ${parent}`)
  }
  if (path.normalize(await fs.realpath(directory)) !== path.normalize(directory))
    throw new Error(`Seat scaffold requires a canonical directory: ${directory}`)
}

function ancestors(directory: string): string[] {
  const parent = path.dirname(directory)
  return parent === directory ? [] : [parent, ...ancestors(parent)]
}

function sameFile(left: Stats, right: Stats) {
  return left.dev === right.dev && left.ino === right.ino
}

async function readRegular(file: string) {
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`Seat scaffold requires a regular non-symlink file: ${file}`)
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || !sameFile(before, stat)) throw new Error(`Seat scaffold file changed while opening: ${file}`)
    return { stat, text: await handle.readFile("utf8") }
  } finally {
    await handle.close()
  }
}

async function acquireLock(file: string): Promise<FileHandle> {
  const handle = await fs.open(file, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0))
    .catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
      const lock = await readRegular(file)
      const pid = Number(lock.text.trim())
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`Seat scaffold lock has no valid owner: ${file}`)
      const live = (() => {
        try {
          process.kill(pid, 0)
          return true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") return false
          throw error
        }
      })()
      if (live) throw new Error(`Seat scaffold lock owner is alive: ${pid}`)
      const current = await readRegular(file)
      if (!sameFile(lock.stat, current.stat) || lock.text !== current.text) throw new Error(`Seat scaffold lock changed: ${file}`)
      await fs.unlink(file)
      return fs.open(file, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0))
    })
  try {
    await handle.writeFile(`${process.pid}\n`)
    return handle
  } catch (error) {
    const stat = await handle.stat()
    await handle.close()
    if (sameFile(stat, await fs.lstat(file))) await fs.unlink(file)
    throw error
  }
}

async function occupied(file: string) {
  return fs.lstat(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false
    throw error
  })
}

if (import.meta.main) {
  const args = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { role: { type: "string" } } })
  if (args.positionals.length !== 2 || args.positionals[0] !== "add" || !args.values.role)
    throw new Error('Usage: bun script/seat.ts add <id> --role "<role>"')
  console.log(await add(args.positionals[1], args.values.role))
}
