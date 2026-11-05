import type { ReadBytes } from "./context"

export async function extract(file: string): Promise<ReadBytes> {
  const blob = Bun.file(file)
  if (!(await blob.exists())) return { failed: "missing" }
  if (!file.toLowerCase().endsWith(".pdf")) return { text: await blob.text() }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const loaded = await import("unpdf")
  const pdf = await loaded.getDocumentProxy(bytes)
  const extracted = await loaded.extractText(pdf, { mergePages: false })
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text]
  if (pages.length === 0 || pages.some((page) => page.trim().length === 0)) {
    return { failed: "no_text_layer", bytes: "" }
  }
  return { text: pages.join("\n") }
}
