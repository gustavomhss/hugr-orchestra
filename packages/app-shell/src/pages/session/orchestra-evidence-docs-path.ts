import type { FileNode } from "@orchestra/sdk/v2"

const documents = /\.(md|mdx|txt)$/i
const roots = ["README.md", "AGENTS.md"]

/** Local documentation is Markdown, MDX or plain text; MDX is read as text and never compiled. */
export function isDocument(path: string) {
  return documents.test(path)
}

/** The workspace's documentation entry points: README.md and AGENTS.md at its root, then docs/. */
export function documentationRoots(children: readonly FileNode[]) {
  return {
    files: roots.flatMap((name) => children.filter((node) => node.type === "file" && node.name === name)),
    folder: children.find((node) => node.type === "directory" && node.name === "docs"),
  }
}

export type DocumentLink = { type: "external"; url: string } | { type: "document"; path: string } | { type: "inert" }

const inert: DocumentLink = { type: "inert" }

/**
 * Resolves a link inside a document opened at `from` (a workspace-relative path). Web links leave
 * the app through the external opener; relative links reach only other documents inside the
 * workspace root. Other schemes, absolute paths, encoded segments and anything climbing above
 * the root stay inert.
 */
export function resolveDocumentLink(from: string, href: string): DocumentLink {
  const value = href.trim()
  if (/^https?:\/\//i.test(value)) return URL.canParse(value) ? { type: "external", url: new URL(value).href } : inert
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) || /^[\\/#?]/.test(value)) return inert
  const target = value.split(/[?#]/)[0]!
  const segments = [...from.split(/[\\/]/).slice(0, -1), ...target.split(/[\\/]/)]
  if (segments.some((segment) => segment.includes("%"))) return inert
  const parts = segments.reduce<string[] | undefined>((path, segment) => {
    if (!path || segment === "" || segment === ".") return path
    if (segment !== "..") return [...path, segment]
    return path.length > 0 ? path.slice(0, -1) : undefined
  }, [])
  if (!parts || parts.length === 0) return inert
  const path = parts.join("/")
  return isDocument(path) ? { type: "document", path } : inert
}
