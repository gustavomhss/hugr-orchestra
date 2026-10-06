import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import { Skill } from "../../src/skill"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Conformance of the authored backend specialist skill tree (specs/backend-specialist/contracts/f5-f6-toolkit-skills.md, F6)
// through the real V1 discovery path: config `skills.paths` (F6.13), scanned and parsed by Skill.Service.

const ROOT = path.resolve(import.meta.dir, "../../../backend-specialist/skills")
const ENTRY_NAMES = [
  "backend-implement",
  "backend-api",
  "backend-data",
  "backend-concurrency",
  "backend-refactor",
  "backend-check",
]
const CARD_HEADINGS = ["Applicability", "Non-trigger", "Inputs", "Steps", "Tools and outputs", "Limits and checks"]
// Lead ruling S-1 (specs/backend-specialist/contracts/README.md) caps an entry body at 1,000 words, measured in
// whitespace words (the unit Atlas uses for its header bound); references carry the detail.
const MAX_ENTRY_BODY_WORDS = 1000

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Skill.node, [[RuntimeFlags.node, RuntimeFlags.layer({ disableExternalSkills: true })]]),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

const discovered = Effect.gen(function* () {
  const skill = yield* Skill.Service
  return (yield* skill.all()).filter((item) => item.location.startsWith(ROOT + path.sep))
})

const withBackendSkills = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  provideTmpdirInstance(() => self, { git: true, config: { skills: { paths: [ROOT] } } })

describe("backend skills", () => {
  it.live("discovers all six entries with their names and descriptions", () =>
    withBackendSkills(
      Effect.gen(function* () {
        const list = yield* discovered
        // F6.1/F6.2: each entry is discovered once, from its own directory, and is advertised by name.
        expect(list.map((item) => item.name).toSorted()).toEqual(ENTRY_NAMES.toSorted())
        ENTRY_NAMES.forEach((name) => {
          const entry = list.find((item) => item.name === name)
          expect({ name, location: entry?.location }).toEqual({ name, location: path.join(ROOT, name, "SKILL.md") })
          expect(Skill.fmt([entry!], { verbose: false })).toContain(`**${name}**`)
        })
        const implement = list.find((item) => item.name === "backend-implement")
        expect(implement!.description).toStartWith("Common procedure for an assigned backend implementation packet")
        // F6.2: every discovered entry is one of the six names and sits in the directory of the same name.
        list.forEach((item) => {
          expect(ENTRY_NAMES).toContain(item.name)
          expect(path.basename(path.dirname(item.location))).toBe(item.name)
          expect(item.description?.length ?? 0).toBeGreaterThan(0)
        })
      }),
    ),
  )

  it.live("resolves every relative link inside the skill tree and reaches every reference", () =>
    withBackendSkills(
      Effect.gen(function* () {
        const entries = yield* discovered
        expect(entries.length).toBeGreaterThan(0)
        const files = yield* Effect.promise(() => listTree())
        const markdown = files.filter((file) => file.endsWith(".md"))

        // SKILL.md bodies come from the loader, which is what the model receives; references come from disk.
        const bodies = new Map(
          yield* Effect.promise(() =>
            Promise.all(
              markdown.map(async (file) => {
                const loaded = entries.find((item) => item.location === file)
                return [file, loaded ? loaded.content : await Bun.file(file).text()] as const
              }),
            ),
          ),
        )

        const edges = [...bodies].flatMap(([file, body]) => linkTargets(body).map((target) => ({ file, target })))
        expect(edges.length).toBeGreaterThan(0)

        const resolved = yield* Effect.promise(() =>
          Promise.all(edges.map((edge) => resolveLink(edge.file, edge.target))),
        )
        expect(resolved.filter((item) => item.error)).toEqual([])

        // F6.9: every reference is reachable from an entry SKILL.md through at most two links.
        const graph = resolved.flatMap((item) => (item.to ? [{ from: item.from, to: item.to }] : []))
        const level1 = graph.filter((edge) => entries.some((entry) => entry.location === edge.from)).map((e) => e.to)
        const level2 = graph.filter((edge) => level1.includes(edge.from)).map((edge) => edge.to)
        const reachable = new Set([...level1, ...level2])
        const references = markdown.filter((file) => file.includes(`${path.sep}references${path.sep}`))
        expect(references.length).toBeGreaterThan(0)
        expect(references.filter((file) => !reachable.has(file))).toEqual([])
        // Every entry reaches the shared tree directly, so no entry ships as a body with nothing behind it.
        expect(
          entries
            .filter((entry) => !graph.some((edge) => edge.from === entry.location && references.includes(edge.to)))
            .map((entry) => entry.name),
        ).toEqual([])
      }),
    ),
  )

  it.live("keeps every entry body within the 1,000-word cap", () =>
    withBackendSkills(
      Effect.gen(function* () {
        const entries = yield* discovered
        expect(entries.map((entry) => entry.name).toSorted()).toEqual(ENTRY_NAMES.toSorted())
        entries.forEach((entry) => {
          const words = entry.content.split(/\s+/).filter(Boolean).length
          expect({ name: entry.name, words: words > MAX_ENTRY_BODY_WORDS ? words : "within bound" }).toEqual({
            name: entry.name,
            words: "within bound",
          })
        })
      }),
    ),
  )

  test("follows the F6 tree, file and card-heading rules", async () => {
    const files = await listTree()
    expect(files.length).toBeGreaterThan(0)
    const relative = files.map((file) => path.relative(ROOT, file).split(path.sep).join("/"))

    // F6.1, F6.3: exactly the six entry directories, each with its SKILL.md, no loose markdown at the root, and
    // SKILL.md only at entry level.
    expect(relative.filter((file) => !ENTRY_NAMES.includes(file.split("/")[0]))).toEqual([])
    expect(ENTRY_NAMES.filter((name) => !relative.includes(`${name}/SKILL.md`))).toEqual([])
    expect(relative.filter((file) => file.endsWith("/SKILL.md") && file.split("/").length !== 2)).toEqual([])
    // F6.5: entries other than backend-implement contain only their SKILL.md.
    expect(relative.filter((file) => !file.startsWith("backend-implement/") && !file.endsWith("/SKILL.md"))).toEqual([])
    // F6.6: lowercase ASCII names, .md only, relative path of at most 120 characters.
    expect(
      relative.filter((file) => file.length > 120 || !/^[a-z0-9-]+(\/[a-z0-9-]+)*\/([a-z0-9-]+|SKILL)\.md$/.test(file)),
    ).toEqual([])

    const contents = await Promise.all(files.map(async (file) => ({ file, bytes: await Bun.file(file).bytes() })))
    // F6.6: regular files only, UTF-8, LF line endings.
    const stats = await Promise.all(files.map((file) => fs.lstat(file)))
    expect(files.filter((_, index) => !stats[index].isFile())).toEqual([])
    expect(contents.filter((item) => !isUtf8(item.bytes)).map((item) => item.file)).toEqual([])
    expect(contents.filter((item) => item.bytes.includes(13)).map((item) => item.file)).toEqual([])

    // F6.10: references use the card headings as level-2 headings, in order, omitting any that do not apply.
    const references = contents.filter((item) => item.file.includes(`${path.sep}references${path.sep}`))
    expect(references.length).toBeGreaterThan(0)
    const misordered = references.flatMap((item) => {
      const headings = [...stripCode(new TextDecoder().decode(item.bytes)).matchAll(/^## (.+)$/gm)].map((m) => m[1])
      const positions = headings.map((heading) => CARD_HEADINGS.indexOf(heading))
      const ordered = positions.every(
        (position, index) => position >= 0 && (index === 0 || position > positions[index - 1]),
      )
      return ordered && headings.length > 0 ? [] : [{ file: item.file, headings }]
    })
    expect(misordered).toEqual([])
  })
})

async function listTree() {
  const entries = await fs.readdir(ROOT, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted()
}

// Invalid sequences decode to U+FFFD, so a lossy round trip shows the bytes were not valid UTF-8.
function isUtf8(bytes: Uint8Array) {
  return Buffer.compare(Buffer.from(new TextDecoder().decode(bytes), "utf8"), bytes) === 0
}

// Fenced blocks and inline code spans are not links.
function stripCode(body: string) {
  return body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "")
}

// Inline links, images and reference-style definitions. Autolinks are covered by the scheme check below.
function linkTargets(body: string) {
  const text = stripCode(body)
  return [
    ...[...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm)].map((match) => match[1]),
    ...[...text.matchAll(/<([a-z][a-z0-9+.-]*:[^>\s]+)>/gi)].map((match) => match[1]),
  ]
}

async function resolveLink(from: string, target: string) {
  // F6.8: external https links are citations only; any other scheme, or an absolute path, is a defect.
  if (/^https:\/\//i.test(target)) return { from, target }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/"))
    return { from, target, error: "absolute or non-https link" }
  const [file, anchor] = target.split("#")
  const resolved = file === "" ? from : path.resolve(path.dirname(from), file.split("/").join(path.sep))
  // F6.4/F6.5: shared references live only under backend-implement, so a link stays inside its own entry or that tree.
  const own = path.join(ROOT, path.relative(ROOT, from).split(path.sep)[0])
  const scopes = [own, path.join(ROOT, "backend-implement")]
  if (!scopes.some((scope) => resolved.startsWith(scope + path.sep)))
    return { from, target, error: `escapes ${path.relative(ROOT, own)} and the shared tree` }
  const stat = await fs.lstat(resolved).catch(() => undefined)
  if (!stat?.isFile()) return { from, target, error: "target is not an existing regular file" }
  if (anchor === undefined) return { from, target, to: resolved }
  const slugs = [...stripCode(await Bun.file(resolved).text()).matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
    slug(match[1]),
  )
  if (!slugs.includes(anchor)) return { from, target, error: "anchor matches no heading" }
  return { from, target, to: resolved }
}

function slug(heading: string) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/ /g, "-")
}
