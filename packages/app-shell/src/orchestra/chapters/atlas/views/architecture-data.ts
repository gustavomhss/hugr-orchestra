import type { useLanguage } from "@/context/language"
import type { AtlasFact, AtlasModel } from "../atlas-model"

// Pure data and derivations of the Architecture view (specs/atlas-ui/mock/views-arch.js).
export type ArchCopyKey = Parameters<ReturnType<typeof useLanguage>["t"]>[0]

// The seven chapters: the `ch` query value, the copy key of its label, its icon (views-arch.js:14).
export const ARCH_CHAPTERS = [
  ["overview", "orchestra.atlas.architecture.chapter.overview", "eye"],
  ["write", "orchestra.atlas.architecture.chapter.write", "play"],
  ["read", "orchestra.atlas.architecture.chapter.read", "search"],
  ["store", "orchestra.atlas.architecture.chapter.store", "folder"],
  ["identity", "orchestra.atlas.architecture.chapter.identity", "hash"],
  ["packages", "orchestra.atlas.architecture.chapter.packages", "stack"],
  ["portable", "orchestra.atlas.architecture.chapter.portable", "download"],
] as const
export type ArchChapterId = (typeof ARCH_CHAPTERS)[number][0]
export const archChapter = (id: ArchChapterId) => ARCH_CHAPTERS.find((item) => item[0] === id) ?? ARCH_CHAPTERS[0]

// The Identity chapter's sample: the first live fact with model reasoning, else the first live fact (views-arch.js:105).
export const archSampleFact = (model: AtlasModel): AtlasFact | undefined =>
  model.live().find((x) => x.why) ?? model.live()[0]

// The thirteen packages (views-arch.js:124-138). `deps` are the package ids each one uses; the ring packages
// compose everything and list none.
export type ArchLayer = {
  id: string
  level: string
  loc: string
  deps: readonly string[]
  what: ArchCopyKey
  key: readonly ArchCopyKey[]
}
export const ARCH_LAYERS: readonly ArchLayer[] = [
  {
    id: "contracts",
    level: "L0",
    loc: "0.5k",
    deps: [],
    what: "orchestra.atlas.architecture.layer.contracts.what",
    key: ["orchestra.atlas.architecture.layer.contracts.key.1", "orchestra.atlas.architecture.layer.contracts.key.2"],
  },
  {
    id: "kernel",
    level: "L1",
    loc: "1.7k",
    deps: ["contracts"],
    what: "orchestra.atlas.architecture.layer.kernel.what",
    key: ["orchestra.atlas.architecture.layer.kernel.key.1", "orchestra.atlas.architecture.layer.kernel.key.2"],
  },
  {
    id: "persist",
    level: "L2",
    loc: "4.1k",
    deps: ["kernel"],
    what: "orchestra.atlas.architecture.layer.persist.what",
    key: ["orchestra.atlas.architecture.layer.persist.key.1"],
  },
  {
    id: "index",
    level: "L2",
    loc: "5.0k",
    deps: ["kernel"],
    what: "orchestra.atlas.architecture.layer.index.what",
    key: ["orchestra.atlas.architecture.layer.index.key.1", "orchestra.atlas.architecture.layer.index.key.2"],
  },
  {
    id: "grounding",
    level: "L3",
    loc: "1.8k",
    deps: ["kernel", "index"],
    what: "orchestra.atlas.architecture.layer.grounding.what",
    key: ["orchestra.atlas.architecture.layer.grounding.key.1", "orchestra.atlas.architecture.layer.grounding.key.2"],
  },
  {
    id: "knowledge",
    level: "L4",
    loc: "5.7k",
    deps: ["kernel", "index", "grounding"],
    what: "orchestra.atlas.architecture.layer.knowledge.what",
    key: ["orchestra.atlas.architecture.layer.knowledge.key.1"],
  },
  {
    id: "retrieval",
    level: "L5",
    loc: "5.4k",
    deps: ["index", "knowledge"],
    what: "orchestra.atlas.architecture.layer.retrieval.what",
    key: ["orchestra.atlas.architecture.layer.retrieval.key.1"],
  },
  {
    id: "memory",
    level: "L6",
    loc: "4.6k",
    deps: ["knowledge", "retrieval"],
    what: "orchestra.atlas.architecture.layer.memory.what",
    key: ["orchestra.atlas.architecture.layer.memory.key.1"],
  },
  {
    id: "tools",
    level: "L7",
    loc: "6.0k",
    deps: ["persist", "grounding", "knowledge", "memory", "retrieval"],
    what: "orchestra.atlas.architecture.layer.tools.what",
    key: ["orchestra.atlas.architecture.layer.tools.key.1"],
  },
  {
    id: "genesis",
    level: "L8",
    loc: "11.3k",
    deps: ["index", "knowledge", "memory"],
    what: "orchestra.atlas.architecture.layer.genesis.what",
    key: ["orchestra.atlas.architecture.layer.genesis.key.1"],
  },
  {
    id: "adapter-io",
    level: "ring",
    loc: "36k",
    deps: [],
    what: "orchestra.atlas.architecture.layer.adapter-io.what",
    key: ["orchestra.atlas.architecture.layer.adapter-io.key.1", "orchestra.atlas.architecture.layer.adapter-io.key.2"],
  },
  {
    id: "cli",
    level: "ring",
    loc: "11.5k",
    deps: [],
    what: "orchestra.atlas.architecture.layer.cli.what",
    key: ["orchestra.atlas.architecture.layer.cli.key.1"],
  },
  {
    id: "mcp-server",
    level: "ring",
    loc: "1.4k",
    deps: [],
    what: "orchestra.atlas.architecture.layer.mcp-server.what",
    key: ["orchestra.atlas.architecture.layer.mcp-server.key.1"],
  },
]
// The stack top-down (L8 first), one row per level, and the ring beside it.
export const ARCH_LAYER_ROWS = ["L8", "L7", "L6", "L5", "L4", "L3", "L2", "L1", "L0"].map(
  (level) => [level, ARCH_LAYERS.filter((layer) => layer.level === level)] as const,
)
export const ARCH_RING = ARCH_LAYERS.filter((layer) => layer.level === "ring")

// The selected package (query `pkg`, default knowledge) and the packages that use it (views-arch.js:140-142).
export function archLayerLinks(id?: string) {
  const selected = ARCH_LAYERS.find((layer) => layer.id === id) ?? ARCH_LAYERS[5]
  return {
    selected,
    users: ARCH_LAYERS.filter((layer) => layer.deps.includes(selected.id)).map((layer) => layer.id),
  }
}
