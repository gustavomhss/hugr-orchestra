export * as SeatSkillContent from "./seat-skill-content"

import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"

export class PackagingError extends Error {
  override name = "SeatSkillPackagingError"
}

/** Validate without importing the skill service (which imports seat roots itself). */
export function validate(id: string, files: Record<string, string>, skills?: readonly string[]) {
  if (
    !/^[a-z]+(?:-[a-z]+)*$/.test(id) ||
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    Object.keys(files).length === 0
  )
    throw new PackagingError(`Invalid or empty seat skill tree: ${id}`)
  Object.entries(files).forEach(([file, text]) => {
    if (
      /[\\:\p{Cc}]/u.test(file) ||
      file.startsWith("/") ||
      file.split("/").some((part) => part === "" || part === "." || part === "..")
    )
      throw new PackagingError(`Invalid seat skill path: ${id}/${file}`)
    if (
      typeof text !== "string" ||
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(text)) !== text
    )
      throw new PackagingError(`Nonlossless UTF-8 seat skill content: ${id}/${file}`)
  })
  if (!skills) return
  if (
    new Set(skills).size !== skills.length ||
    skills.some(
      (skill) =>
        (!skill.startsWith(`${id}-`) && !(id === "maestro" && skill === "frame-request")) ||
        !/^[a-z]+(?:-[a-z]+)*$/.test(skill),
    )
  )
    throw new PackagingError(`Invalid declared seat entry skills: ${id}`)
  const authored = Object.keys(files)
    .filter((file) => path.posix.basename(file) === "SKILL.md")
    .toSorted()
  if (JSON.stringify(authored) !== JSON.stringify(skills.map((skill) => `${skill}/SKILL.md`).toSorted()))
    throw new PackagingError(`Seat entry skills differ from declared skills: ${id}`)
  skills.forEach((skill) => {
    const data: unknown = frontmatter(files[`${skill}/SKILL.md`])
    // Same name/description types as src/skill/index.ts; description is optional.
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !("name" in data) ||
      typeof data.name !== "string" ||
      ("description" in data && data.description !== undefined && typeof data.description !== "string")
    )
      throw new PackagingError(`Invalid seat skill frontmatter: ${id}/${skill}`)
    if (data.name !== skill) throw new PackagingError(`Seat skill name mismatch: ${id}/${skill}`)
  })
}

/** Read authored bytes exactly; neither symlinks nor binary companions are supported. */
export async function read(id: string, root: string, skills: readonly string[]) {
  const stat = await fs.lstat(root).catch((cause) => {
    throw new PackagingError(`Cannot acquire seat skill source root: ${id}`, { cause })
  })
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new PackagingError(`Invalid seat skill source root: ${id}`)
  const canonical = await fs.realpath(root)
  // Bun's recursive readdir can follow directory links on Linux. Inspect each level before descending.
  const visit = async (dir: string): Promise<string[]> =>
    (
      await Promise.all(
        (await fs.readdir(dir, { withFileTypes: true })).map((entry) => {
          const target = path.join(dir, entry.name)
          if (entry.isDirectory()) return visit(target)
          if (entry.isFile()) return [target]
          throw new PackagingError(`Non-file in seat skill tree: ${id}`)
        }),
      )
    ).flat()
  const tree = await visit(root)
  const files = Object.fromEntries(
    await Promise.all(
      tree.map(async (target) => {
        const file = path.relative(root, target).split(path.sep).join("/")
        if ((await fs.realpath(target)) !== path.join(canonical, ...file.split("/")))
          throw new PackagingError(`Escaping seat skill source path: ${id}/${file}`)
        const bytes = await fs.readFile(target)
        const text = (() => {
          try {
            return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
          } catch (cause) {
            throw new PackagingError(`Invalid UTF-8 seat skill content: ${id}/${file}`, { cause })
          }
        })()
        if (!bytes.equals(Buffer.from(text, "utf8")))
          throw new PackagingError(`Nonlossless UTF-8 seat skill content: ${id}/${file}`)
        return [file, text] as const
      }),
    ),
  )
  validate(id, files, skills)
  return files
}

/** The name and description of each declared entry skill, for showing what a seat carries. */
export async function describe(root: string, skills: readonly string[]) {
  return Promise.all(
    skills.map(async (skill) => {
      const data = frontmatter(await fs.readFile(path.join(root, skill, "SKILL.md"), "utf8").catch(() => ""))
      const description =
        data && typeof data === "object" && "description" in data && typeof data.description === "string"
          ? data.description
          : undefined
      return { name: skill, description, references: await references(path.join(root, skill, "references")) }
    }),
  )
}

async function references(dir: string) {
  const files = await fs.readdir(dir, { recursive: true }).catch(() => [])
  return Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .toSorted()
      .map(async (file) => {
        const parts = file.split(path.sep)
        const text = await fs.readFile(path.join(dir, file), "utf8")
        return {
          kind: parts.length > 1 ? parts[0] : undefined,
          family: parts.length > 2 ? parts[1] : undefined,
          title: text.match(/^# (.+)$/m)?.[1].trim() ?? path.basename(file, ".md"),
        }
      }),
  )
}

function frontmatter(text: string): unknown {
  // Use the runtime parser and its fallback, but bypass gray-matter's cache: it caches even failed parses, which can
  // otherwise return empty data on the next read and poison the skill service after startup validation.
  try {
    return matter(text, {}).data
  } catch {
    try {
      return matter(ConfigMarkdown.sanitize(text), {}).data
    } catch {
      return undefined
    }
  }
}
