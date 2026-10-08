import { Schema } from "effect"
import type { PDFDocument, PDFField } from "pdf-lib"
import { Edit, Read } from "./schema"
import { DocumentWork } from "./work"

export async function operate(supplied: unknown, bytes: readonly Uint8Array[]): Promise<DocumentWork.Success> {
  const input = Schema.decodeUnknownSync(Schema.Union([Read, Edit]))(supplied)
  if ("operation" in input && input.operation === "encrypt") throw DocumentWork.failure()
  const { PDFDocument, StandardFonts, degrees, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } = await import("pdf-lib")
  const sources = await Promise.all(bytes.map((data) => PDFDocument.load(data, { updateMetadata: false })))
  sources.forEach(requireBounded)
  const { createEngine } = await import("clawpdf")
  const engine = await createEngine({ maxRenderPixels: DocumentWork.limits.pixels })
  try {
    if (!("operation" in input)) {
      const source = sources[0]
      if (!source || !bytes[0]) throw DocumentWork.failure("unsupported_schema")
      const pdf = await engine.open(bytes[0])
      try {
        const selected = select(input.pages ?? source.getPageIndices().map((n) => n + 1), source)
        const budget = { chars: 0 }
        const pages = selected.map((n) => {
          const raw = pdf.page(n).text()
          const text = raw.slice(0, Math.max(0, DocumentWork.limits.text - budget.chars))
          budget.chars += text.length
          return { page: n, ...source.getPage(n - 1).getSize(), rotation: source.getPage(n - 1).getRotation().angle,
            text, textTruncated: raw.length !== text.length, noTextLayer: !raw.trim() }
        })
        const incomplete = [
          ...(selected.length !== source.getPageCount() ? ["Only selected pages were read"] : []),
          ...(pages.some((p) => p.textTruncated) ? ["Text capture truncated"] : []),
          ...(pages.some((p) => p.noTextLayer) ? ["Pages without extractable text may be scanned or blank; OCR not performed"] : []),
        ]
        const files: typeof DocumentWork.File.Type[] = []
        if (input.raster) {
          const rasterPages = selected.slice(0, 4)
          if (selected.length > rasterPages.length) incomplete.push("Raster limited to four selected pages")
          for (const n of rasterPages) {
            const page = pdf.page(n)
            const edge = Math.max(1, Math.floor(Math.sqrt(DocumentWork.limits.pixels / rasterPages.length / 2)))
            const png = page.pngSync(page.width >= page.height ? { width: edge, forms: true } : { height: edge, forms: true })
            files.push({ data: png, mime: "image/png", metadata: { page: n, raster: true, ocr: false } })
          }
        }
        return { status: "ok", files, incomplete, metadata: { pageCount: source.getPageCount(), pages,
          title: (source.getTitle() ?? "").slice(0, 1024), author: (source.getAuthor() ?? "").slice(0, 1024),
          subject: (source.getSubject() ?? "").slice(0, 1024), fields: fieldValues(source), ocr: false } }
      } finally { pdf.destroy() }
    }

    const target = input.operation === "create" || input.operation === "merge" ? await PDFDocument.create() : sources[0]
    if (!target) throw DocumentWork.failure("unsupported_schema")
    const originalText = await Promise.all(bytes.map(async (data) => {
      const pdf = await engine.open(data)
      try {
        const pages = [...pdf.pages()].map((page) => page.text())
        if (pages.reduce((n, text) => n + text.length, 0) > DocumentWork.limits.text) throw DocumentWork.failure("quota_exceeded")
        return pages
      } finally { pdf.destroy() }
    }))
    const expectedText: string[] = []
    if (input.operation === "create") {
      const font = await target.embedFont(StandardFonts.Helvetica)
      if (input.title) target.setTitle(input.title)
      input.pages.forEach((spec) => {
        const page = target.addPage([spec.width, spec.height])
        spec.text.forEach((draw) => {
          const size = draw.size ?? 12
          if (draw.x + font.widthOfTextAtSize(draw.text, size) > spec.width || draw.y + size > spec.height)
            throw DocumentWork.failure("unsupported_schema")
          page.drawText(draw.text, { x: draw.x, y: draw.y, size, font })
          if (draw.text.trim()) expectedText.push(draw.text)
        })
      })
    }
    if (input.operation === "merge") {
      if (sources.reduce((n, doc) => n + doc.getPageCount(), 0) > DocumentWork.limits.pages) throw DocumentWork.failure("quota_exceeded")
      for (const source of sources) {
        if (source.getForm().getFields().length) throw DocumentWork.failure()
        const copied = await target.copyPages(source, source.getPageIndices())
        copied.forEach((page) => target.addPage(page))
      }
    }
    if (input.operation === "split") {
      if (target.getForm().getFields().length) throw DocumentWork.failure()
      const groups = input.groups.map((group) => select(group, target))
      if (groups.reduce((n, group) => n + group.length, 0) > DocumentWork.limits.pages) throw DocumentWork.failure("quota_exceeded")
      const files: typeof DocumentWork.File.Type[] = []
      for (const group of groups) {
        const split = await PDFDocument.create()
        const copied = await split.copyPages(target, group.map((n) => n - 1))
        copied.forEach((page) => split.addPage(page))
        files.push(await saveVerified(split, false, [], group.map((n) => originalText[0][n - 1])))
      }
      return { status: "ok", files, metadata: { groups, outputs: files.length }, incomplete: [] }
    }
    if (input.operation === "rotate") select(input.pages, target).forEach((n) => {
      const page = target.getPage(n - 1)
      page.setRotation(degrees((page.getRotation().angle + input.degrees) % 360))
    })
    if (input.operation === "stamp") {
      const font = await target.embedFont(StandardFonts.Helvetica)
      select(input.pages, target).forEach((n) => {
        const page = target.getPage(n - 1)
        const size = input.text.size ?? 12
        if (input.text.x + font.widthOfTextAtSize(input.text.text, size) > page.getWidth() || input.text.y + size > page.getHeight())
          throw DocumentWork.failure("unsupported_schema")
        page.drawText(input.text.text, { x: input.text.x, y: input.text.y, size, font })
      })
      if (input.text.text.trim()) expectedText.push(input.text.text)
    }
    if (input.operation === "fill") {
      if (new Set(input.fields.map((f) => f.name)).size !== input.fields.length) throw DocumentWork.failure("unsupported_schema")
      // Validate the entire request before touching a field.
      const changes = input.fields.map((change) => {
        const field = target.getForm().getField(change.name)
        if (field instanceof PDFCheckBox && typeof change.value === "boolean") return { field, value: change.value }
        if (typeof change.value !== "string") throw DocumentWork.failure("unsupported_schema")
        if (field instanceof PDFTextField) return { field, value: change.value }
        if ((field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) && field.getOptions().includes(change.value))
          return { field, value: change.value }
        throw DocumentWork.failure()
      })
      changes.forEach((change) => {
        if (change.field instanceof PDFCheckBox && typeof change.value === "boolean") {
          if (change.value) change.field.check()
          if (!change.value) change.field.uncheck()
          return
        }
        if (typeof change.value !== "string") throw DocumentWork.failure()
        if (change.field instanceof PDFTextField) change.field.setText(change.value)
        if (change.field instanceof PDFDropdown || change.field instanceof PDFOptionList || change.field instanceof PDFRadioGroup)
          change.field.select(change.value)
        if (input.flatten && change.value.trim() && change.field instanceof PDFTextField) expectedText.push(change.value)
      })
      target.getForm().updateFieldAppearances(await target.embedFont(StandardFonts.Helvetica))
    }
    const flatten = input.operation === "flatten" || (input.operation === "fill" && input.flatten === true)
    if (flatten) {
      target.getForm().getFields().forEach((field) => {
        if (field instanceof PDFTextField && field.getText()?.trim()) expectedText.push(field.getText() ?? "")
      })
      await flattenForm(target)
    }
    requireBounded(target)
    const file = await saveVerified(target, flatten, expectedText, input.operation === "merge" ? originalText.flat() : originalText[0] ?? [])
    return { status: "ok", files: [file], metadata: file.metadata, incomplete: [] }

    async function saveVerified(doc: PDFDocument, flattened: boolean, text: readonly string[], preserved: readonly string[]) {
      const geometry = doc.getPages().map((p) => ({ ...p.getSize(), rotation: p.getRotation().angle }))
      const fields = fieldValues(doc)
      const data = await doc.save()
      if (data.byteLength > DocumentWork.limits.bytes) throw DocumentWork.failure("quota_exceeded")
      const reopened = await PDFDocument.load(data, { updateMetadata: false })
      if (JSON.stringify(reopened.getPages().map((p) => ({ ...p.getSize(), rotation: p.getRotation().angle }))) !== JSON.stringify(geometry) ||
        JSON.stringify(fieldValues(reopened)) !== JSON.stringify(fields)) throw DocumentWork.failure("outcome_unknown")
      if (flattened) await requireFlattened(reopened)
      const parsed = await engine.open(data)
      try {
        if (parsed.pageCount !== geometry.length) throw DocumentWork.failure("outcome_unknown")
        const extracted = parsed.text({ maxPages: DocumentWork.limits.pages, maxChars: DocumentWork.limits.text })
        if (text.some((value) => !extracted.includes(value))) throw DocumentWork.failure("outcome_unknown")
        if (preserved.some((value, i) => !parsed.page(i + 1).text().includes(value))) throw DocumentWork.failure("outcome_unknown")
        // Small independent PDFium render catches broken appearance/content streams without allocating full-page rasters.
        for (const page of parsed.pages()) page.render(page.width >= page.height ? { width: 32, forms: true } : { height: 32, forms: true })
      } finally { parsed.destroy() }
      return { data, mime: "application/pdf", metadata: { pageCount: geometry.length, geometry, fieldCount: fields.length,
        flattened, verification: "reopened-field-tree-widget-check-and-pdfium-parse-render" } }
    }
  } finally { await engine.destroy() }
}

function requireBounded(doc: PDFDocument) {
  if (doc.isEncrypted) throw DocumentWork.failure()
  if (doc.getPageCount() < 1 || doc.getPageCount() > DocumentWork.limits.pages || doc.getForm().getFields().length > 100)
    throw DocumentWork.failure("quota_exceeded")
  doc.getPages().forEach((p) => {
    if (![p.getWidth(), p.getHeight()].every((n) => Number.isFinite(n) && n > 0 && n <= 14400)) throw DocumentWork.failure("quota_exceeded")
  })
}

function select(pages: readonly number[], doc: PDFDocument) {
  if (new Set(pages).size !== pages.length || pages.some((n) => n > doc.getPageCount())) throw DocumentWork.failure("unsupported_schema")
  return pages
}

function fieldValues(doc: PDFDocument) {
  return doc.getForm().getFields().map((field) => {
    // Public classes are operation-local; the field dictionary supplies independent raw value/type readback.
    const options = "getOptions" in field && typeof field.getOptions === "function"
      ? Schema.decodeUnknownSync(Schema.Array(Schema.String))(field.getOptions()) : []
    if (field.getName().length > 1024 || options.length > 100 || options.some((value) => value.length > 1024))
      throw DocumentWork.failure("quota_exceeded")
    return { name: field.getName(), type: field.constructor.name, value: rawValue(field), options }
  })
}

function rawValue(field: PDFField) {
  const value = field.acroField.V()
  if (!value) return null
  const text = "decodeText" in value && typeof value.decodeText === "function" ? String(value.decodeText()) : value.toString()
  if (text.length > 4096) throw DocumentWork.failure("quota_exceeded")
  return text
}

async function requireFlattened(doc: PDFDocument) {
  const { PDFName, PDFDict, PDFArray } = await import("pdf-lib")
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict)
  const fields = form?.lookupMaybe(PDFName.of("Fields"), PDFArray)
  if (fields && fields.size() !== 0) throw DocumentWork.failure("outcome_unknown")
  doc.getPages().forEach((page) => {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)
    if (!annots) return
    annots.asArray().forEach((ref) => {
      const annot = doc.context.lookup(ref, PDFDict)
      if (annot.get(PDFName.of("Subtype"))?.toString() === "/Widget") throw DocumentWork.failure("outcome_unknown")
    })
  })
}

async function flattenForm(doc: PDFDocument) {
  const { PDFName, PDFDict, PDFArray } = await import("pdf-lib")
  const widgets = new Set(doc.getForm().getFields().flatMap((field) => field.acroField.getWidgets().map((widget) => widget.dict)))
  const annotations = doc.getPages().map((page) => ({ page,
    widgets: (page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? []).filter((ref) => {
      const annot = doc.context.lookup(ref, PDFDict)
      if (annot.get(PDFName.of("Subtype"))?.toString() !== "/Widget") return false
      if (!widgets.has(annot)) throw DocumentWork.failure()
      return true
    }),
  }))
  doc.getForm().flatten()
  // pdf-lib 1.17.1 removeField uses appearance refs in removeAnnot, leaving deleted widget refs dangling.
  // Remove only the positively identified widgets after their appearances have been burned by flatten().
  annotations.forEach((entry) => entry.widgets.forEach((ref) => {
    const annots = entry.page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)
    const index = annots?.indexOf(ref)
    if (index !== undefined) annots?.remove(index)
  }))
}
