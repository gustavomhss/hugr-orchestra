import type { useLanguage } from "@/context/language"

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

// A28D: the package layers and the identity sample go here.
