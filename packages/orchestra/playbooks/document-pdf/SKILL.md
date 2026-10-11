---
name: document-pdf
description: Read, create, fill, merge, split, rotate, stamp, OCR, encrypt and inspect PDFs. Use when a task involves a .pdf file; prefers native document_read/document_edit and falls back to bundled scripts for OCR, tables, encryption, metadata and image stamps.
---

# Document PDF

Native tools first, scripts only for what they do not cover. Script paths below are relative to this skill's
directory (the base directory shown when this skill loads; `scripts/` sits next to this file) and run through `bash`.

## Native tools (preferred)

`document_read` and `document_edit` work on artifact refs (`{ id, revision }`) from earlier tool results or the
session's artifact listing, never on file paths. Do not invent refs. If the PDF exists only as a path on disk,
use the script recipes below instead.

| Task | Call |
|---|---|
| Text, page sizes, rotation, metadata, form fields | `document_read { format: "localpdf", artifact, pages? }` |
| Page images for visual review (max 4 pages, PNG artifacts) | `document_read { ..., pages: [1,2], raster: true }` |
| Create from scratch | `document_edit { operation: "create", title?, pages: [{ width, height, text: [{ text, x, y, size? }] }] }` |
| Merge 2-10 PDFs | `document_edit { operation: "merge", artifacts: [...] }` |
| Split into page groups | `document_edit { operation: "split", artifact, groups: [[1,2],[3]] }` |
| Rotate pages | `document_edit { operation: "rotate", artifact, expectedRevision, pages, degrees: 90 \| 180 \| 270 }` |
| Stamp one text line | `document_edit { operation: "stamp", artifact, expectedRevision, pages, text: { text, x, y, size? } }` |
| Fill AcroForm | `document_edit { operation: "fill", artifact, expectedRevision, fields: [{ name, value }], flatten? }` |
| Flatten a form | `document_edit { operation: "flatten", artifact, expectedRevision }` |

Rules that save retries:

- Pages are 1-based. Coordinates are PDF points from the bottom-left (US Letter is 612 x 792).
- `expectedRevision` must equal the artifact ref's `revision`. On `revision_conflict`, re-read and use the new ref.
- Created or stamped text is Helvetica/WinAnsi only and must fit the page. Longer or non-Latin text needs a script.
- Read `fields` before filling: use exact names; checkboxes take booleans; radio and choice values must match
  an existing option. Unknown fields fail.
- Merge and split reject PDFs with interactive forms. Flatten or fill-and-flatten first.
- Encrypted PDFs and XFA forms are rejected natively. Decrypt with the script below first.
- Blank text from `document_read` is not proof of a scan. It reports image-only pages as `partial` and does no OCR.
- Each edit publishes a new artifact revision. Read the result back to verify before reporting success.

## Script recipes (bash)

Needs Python 3.10+. Each script prints JSON and exits non-zero on failure; `--help` lists every flag.

```bash
python3 -m pip install pypdf pdfplumber reportlab          # read/stamp/secure/meta scripts
python3 -m pip install pypdfium2                           # optional page rendering (or poppler's pdftoppm)
python3 -m pip install pymupdf pymupdf4llm                 # lightweight extraction
python3 -m pip install marker-pdf                          # OCR; about 3-5 GB with models
```

### Inspect and extract

```bash
python3 scripts/pdf_read.py doc.pdf --meta                 # page_count, encrypted, likely_scanned_pages
python3 scripts/pdf_read.py doc.pdf --tables --csv-dir t/  # tables as JSON and CSV (native read has no tables)
python3 scripts/pdf_read.py form.pdf --fields              # field names, types, values
python3 scripts/extract_pymupdf.py doc.pdf --markdown      # layout-aware markdown, instant, no OCR
python3 scripts/extract_pymupdf.py doc.pdf --tables --pages 0-4   # note: this script is 0-indexed
```

### Scanned or image-only PDFs (OCR)

Check `likely_scanned_pages` from `--meta` first. Never report empty text as "no content".

- A few pages: render, then read the images yourself.
  `python3 scripts/pdf_page_image.py doc.pdf --pages 3 --dpi 200 --out-dir imgs/` (or
  `pdftoppm -png -r 150 -f 3 -l 3 doc.pdf imgs/page`) and inspect the PNGs with the model's image input.
- Many pages, equations, complex layout: marker-pdf.
  `python3 scripts/extract_marker.py --check` verifies disk space first (models download about 2.5 GB on first
  use), then `python3 scripts/extract_marker.py scanned.pdf > out.md`.
  If there is no room for it, say so and offer pymupdf for text-layer PDFs only.
- Prefer pymupdf unless OCR, equations, forms or reading-order analysis is needed.

### Encrypt and decrypt (not supported natively)

Passwords are secrets: never ask the user to paste them into chat and never put them in a command line.
The user exports them in their own shell, and the scripts read them from the environment.

```bash
# user runs once: export PDF_USER_PASSWORD=...   (optional PDF_OWNER_PASSWORD)
python3 scripts/pdf_secure.py doc.pdf --encrypt -o enc.pdf
# user runs once: export PDF_PASSWORD=...
python3 scripts/pdf_secure.py enc.pdf --decrypt -o dec.pdf
```

The same `PDF_PASSWORD` variable is honored by `pdf_read.py`, `pdf_meta.py`, `pdf_page_image.py`. Encryption is
AES-256. Owner-password permission flags (no-print, no-copy) are advisory; any library can strip them, so only
the user password protects content.

### Metadata, attachments, richer stamps

```bash
python3 scripts/pdf_meta.py doc.pdf --set-meta --title "T" --author "A" -o out.pdf
python3 scripts/pdf_meta.py doc.pdf --attach data.csv -o out.pdf
python3 scripts/pdf_meta.py doc.pdf --list-attachments
python3 scripts/pdf_meta.py doc.pdf --extract-attachments dir/
python3 scripts/pdf_stamp.py doc.pdf -o out.pdf --text "DRAFT" --x 150 --y 400 --font-size 60 \
  --rotation 45 --opacity 0.3 --color "#cc0000" --pages 1-3        # rotation, opacity, color
python3 scripts/pdf_stamp.py doc.pdf -o out.pdf --image sig.png --x 400 --y 60 --width 120
```

`pdf_meta.py` writes classic DocInfo only; embedded XMP is untouched. Page arguments in these scripts are 1-based,
except `extract_pymupdf.py --pages` (0-based).

## Not covered

Pixel-perfect HTML-to-PDF (use a headless browser), PDF/A conformance (needs Ghostscript plus veraPDF and
validation, not assumption), compression beyond deflating streams (`gs` for image downsampling), and building new
fillable forms (not bundled).

## Verification

- After any edit, `document_read` the new artifact: page count, rotation, text, field values (exact match,
  including non-ASCII). Raster the page for anything visual (stamps, flattened forms).
- After script edits, `pdf_read.py out.pdf --meta`; for rotated stamps verify with a rendered image, since text
  extraction scrambles rotated glyphs.
- After encrypt, `--meta` shows `"encrypted": true`; after decrypt, extracted text matches the original.
- Flattening can drop exotic widgets (rich text, custom appearances, radio groups). Inspect the result.
- Table extraction is heuristic; spot-check one known cell.

Adapted from NousResearch/hermes-agent@134e08ca6d272c9b9610ce5889e2ecff9c73adf0 skills/productivity/pdf (MIT).
