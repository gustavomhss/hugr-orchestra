// Unicode before every import makes byte offsets differ from JavaScript/AST offsets.
export const unicode = "🦣 café 日本語"
import { RGBA } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
import { Filesystem } from "@/util/filesystem"
export { RGBA as reexportedRGBA } from "@opentui/core"
export type { KeyEvent } from "@opentui/core"
export type RuntimeType = typeof import("@opentui/core")

// Data starts here. Same specifiers as real imports above; never computed away.
// import { RGBA } from "@opentui/core"
/* require("@/util/filesystem") */
export const data = [
  'import { RGBA } from "@opentui/core"',
  'import { Filesystem } from "@/util/filesystem"',
  'export * from "@opentui/core"',
  'import "@opentui/core"',
  'import("@opentui/core")',
  'require("@/util/filesystem")',
  `from "@opentui/core"`,
  `🦣 import("@/util/filesystem")`,
]
// Data ends here.

export const staticRGBA = RGBA
export const filesystem = Filesystem
export const dynamicRGBA = async () => (await import /* trivia */ ("@opentui/core")).RGBA
export const requireRGBA = () => require("@opentui/core").RGBA as typeof RGBA
export const dynamicFilesystem = async () => (await import("@/util/filesystem")).Filesystem
export const eventKey = (event: KeyEvent) => event.name
