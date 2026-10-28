// The bundled pictures. A `seat-<id>` file is that native seat's portrait; every other file is free for any agent to
// pick. Adding a file to `./avatars` adds it to the library.
const files = import.meta.glob<string>("./avatars/*.webp", { eager: true, query: "?url", import: "default" })

const urls = new Map(
  Object.entries(files).map(([path, url]) => [path.slice("./avatars/".length, -".webp".length), url] as const),
)

export const AVATAR_LIBRARY = [...urls.keys()]
  .filter((slug) => !slug.startsWith("seat-"))
  .sort()
  .map((slug) => ({ value: `lib:${slug}`, url: urls.get(slug)! }))

/** The image source for an avatar value: a bundled picture by slug, or an uploaded data URL as is. */
export function avatarUrl(value: string | undefined) {
  if (!value) return
  if (value.startsWith("data:image/")) return value
  if (value.startsWith("lib:")) return urls.get(value.slice(4))
}

/**
 * Shrinks an uploaded image to a square WebP data URL small enough to live in the agent file. The center is cropped
 * so a portrait or landscape picture fills the frame.
 */
export async function avatarFromFile(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return
  const bitmap = await createImageBitmap(file).catch(() => undefined)
  if (!bitmap) return
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  canvas
    .getContext("2d")
    ?.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    )
  bitmap.close()
  const url = canvas.toDataURL("image/webp", 0.85)
  // A browser without a WebP encoder returns PNG, which the schema accepts too, as long as it stays small.
  if (url.length > AVATAR_MAX_LENGTH) return
  return url
}

const AVATAR_SIZE = 192
// Well under the schema's 200,000 characters, so the agent file stays readable.
const AVATAR_MAX_LENGTH = 120_000
