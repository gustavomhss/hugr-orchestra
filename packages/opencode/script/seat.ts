#!/usr/bin/env bun
import fs from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { define } from "../src/maestro/seats/seat"

// Source scaffold only. Registration is the existing barrel, not a runtime plugin loader.
export async function add(id: string, role: string, directory = path.resolve(import.meta.dirname, "..")) {
  if (!role.trim() || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(role)) throw new Error("Seat role must be nonempty and single-line")
  const seat = define({
    id, role: role.trim(), abilityClass: "scoped repository write", returnCard: `${id}-result`,
    forbiddenActions: ["delegation", "self-review", "publish work"], prompt: "", profile: "execution",
    description: `${role.trim()}. Edits only dispatch writePaths; read-only without them. Returns change, check evidence and blockers.`,
    labelEnv: `HUGR_${id.replaceAll("-", "_").toUpperCase()}_NAME`, skills: [`${id}-work`],
    workResult: `${id}-work-result-v1`, writeRoots: true, strictResume: true, atlasMemory: false, toolkit: false,
  })
  const definition = path.join(directory, "src/maestro/seats", `${id}.ts`)
  const prompt = path.join(directory, "src/agent/prompt", `${id}.txt`)
  const tree = path.resolve(directory, "..", `${id}-specialist`)
  const index = path.join(directory, "src/maestro/seats/index.ts")
  // Refuse occupied paths, including symlinks and empty trees, before creating any artifact.
  for (const file of [definition, prompt, tree]) {
    if (await occupied(file)) throw new Error(`Seat scaffold collision: ${file}`)
  }
  const lock = await fs.open(`${index}.seat-lock`, "wx")
  try {
    const barrel = await fs.readFile(index, "utf8")
    if (barrel.split("// seat-imports:end").length !== 2 || barrel.split("  // seat-entries:end").length !== 2)
      throw new Error("Seat registry scaffold markers are missing or duplicated")
    const binding = `seat${id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("")}`
    if (barrel.includes(`"./${id}"`)) throw new Error(`Seat already registered: ${id}`)
    await fs.mkdir(tree)
    await fs.mkdir(path.join(tree, "skills", seat.skills[0], "references"), { recursive: true })
    await fs.writeFile(definition, [
      `import PROMPT from "../../agent/prompt/${id}.txt"`,
      'import { define } from "./seat"', "", "export default define({",
      ...Object.entries(seat).map(([key, value]) => `  ${key}: ${key === "prompt" ? "PROMPT" : JSON.stringify(value)},`),
      "})", "",
    ].join("\n"), { flag: "wx" })
    await fs.writeFile(prompt, [
      `You are {{label}}, ${seat.role} specialist on the Orchestra native team.`, "",
      "Implement only the supplied work packet. Write only dispatch writePaths; absent paths mean read-only. Load your entry skill before work. Stop on missing inputs or permission denials.", "",
      `Return card: ${seat.returnCard}. End with one fenced ${seat.returnCard} JSON card containing outcome (done|blocked), changes [{path, change: created|modified|deleted}], checks [{checkId, command, cwd, status: pass|fail|skip|missing|acquisition-error, exitCode?}], blockers [{kind: packet|permission|safety-hold|tool|atlas|check-unavailable, reason, code?, ref?}], risks [string], nextActions [string]. These are worker claims, not acceptance.`, "",
      `Forbidden: ${seat.forbiddenActions.join(", ")}.`, "",
    ].join("\n"), { flag: "wx" })
    await fs.writeFile(path.join(tree, "skills", seat.skills[0], "SKILL.md"), [
      "---", `name: ${seat.skills[0]}`, `description: ${JSON.stringify(`Execute a supplied ${seat.role} work packet.`)}`, "---", "",
      "# Work packet", "", "Read the charter and supplied acceptance, write paths and checks. Stop on missing inputs. Record exact changes, check evidence and blockers in the return card.", "",
      "Replace this seed with domain-specific procedures and qualified references before evaluating the seat. See [references](references/README.md).", "",
    ].join("\n"), { flag: "wx" })
    await fs.writeFile(path.join(tree, "skills", seat.skills[0], "references/README.md"), "# References\n\nAdd qualified domain references and applicability limits here.\n", { flag: "wx" })
    await fs.writeFile(index, barrel
      .replace("// seat-imports:end", `import ${binding} from "./${id}"\n// seat-imports:end`)
      .replace("  // seat-entries:end", `  [${binding}.id]: ${binding},\n  // seat-entries:end`))
    return { definition, prompt, tree }
  } finally {
    await lock.close()
    await fs.unlink(`${index}.seat-lock`)
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
