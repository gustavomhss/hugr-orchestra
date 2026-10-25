---
name: document-sheets
description: Read, create and edit XLSX workbooks and CSV files. Use when a task involves a spreadsheet; prefers native sheet_read/sheet_edit and falls back to bundled scripts for formula recalculation, charts, tables, validation and reference-aware row or column changes.
---

# Document Sheets

Native tools first, scripts only for what they do not cover. Script paths below are relative to this skill's
directory (`scripts/`, `references/` sit next to this file) and run through `bash`.

## Native tools (preferred)

`sheet_read` and `sheet_edit` work on artifact refs (`{ id, revision }`) from earlier tool results or the
session's artifact listing, never on file paths. Do not invent refs. If the workbook exists only as a path on
disk, use the script recipes below.

| Task | Call |
|---|---|
| Read a sheet or range | `sheet_read { format: "xlsx" \| "csv", artifact, sheet?, range?, header?, delimiter? }` |
| Create a workbook | `sheet_edit { format: "xlsx", operation: "create", worksheets: [{ name, cells }], names? }` |
| Edit cells and styles | `sheet_edit { format: "xlsx", operation: "edit", artifact, expectedRevision, sheet, cells }` |
| Insert/delete rows or columns | `sheet_edit { format: "xlsx", operation: "restructure", artifact, expectedRevision, sheet, axis, action, index, count }` |
| Create/edit CSV | `sheet_edit { format: "csv", operation: "create" \| "edit", ... }` |
| CSV into a sheet / sheet to CSV | `sheet_edit { operation: "import" \| "export", artifact, sheet, range?, formulas? }` |

A cell is `{ address: "B2", value, style? }` with `address` as uppercase A1. `value` is
`{ kind: "literal", value }` or `{ kind: "formula", formula }`. Style supports bold, italic, fontSize, color
(`AARRGGBB`) and numberFormat.

Rules that save retries:

- `expectedRevision` must equal the artifact ref's `revision`. On `revision_conflict`, re-read and use the new ref.
- Literal values, formulas and cached results are distinct in `sheet_read`. Cached values are observations of
  what the last spreadsheet app saved, not fresh calculations.
- There is no calculation engine. Every edit clears formula caches, and formula-bearing results come back
  `partial`. `recalculate` fails natively; use `xlsx_recalc.py` below.
- Native formulas are a closed set: local A1 refs and ranges, `$` markers, numbers, arithmetic, parentheses, and
  SUM/AVERAGE/MIN/MAX/COUNT. Strings, cross-sheet refs, names, structured refs and other functions are rejected.
  Use the scripts for those.
- Native restructure refuses sheets with names, merges, filters, frozen panes, validations, conditional formats or
  charts. Use `xlsx_restructure.py` for those.
- CSV is strict UTF-8 and imports every cell as a literal (leading `=` stays text). Pass `formulas: true` to opt in.
- Ranges are inclusive and 1-based. Sheet names are 31 characters max and reject `[ ] : * ? / \`.
- Limits: 20 worksheets, 10,000 cells, 256 columns, 10,000 rows per request, 8 MiB.

## Script recipes (bash)

Needs Python 3.10+ and `python3 -m pip install openpyxl`. Optional: LibreOffice (`soffice`) for recalculation and
PDF export. Each script prints JSON; `--help` lists every flag. `xlsx_edit.py` edits in place unless `--out` is
given, so copy the file first when the original matters.

```bash
python3 scripts/xlsx_create.py spec.json report.xlsx      # full spec: charts, validation, conditional formats, tables
python3 scripts/xlsx_read.py report.xlsx --sheets         # names, dimensions, merges, charts, tables, protection
python3 scripts/xlsx_read.py report.xlsx --json --sheet Data
python3 scripts/xlsx_read.py report.xlsx --formulas       # formula text paired with cached result
python3 scripts/xlsx_read.py report.xlsx --names | --notes
python3 scripts/xlsx_recalc.py report.xlsx                # recalculate via LibreOffice, cache fresh results
python3 scripts/xlsx_read.py report.xlsx --json --data-only   # read after recalc
```

### Formulas and recalculation

openpyxl never evaluates formulas. To get real results:

1. Write formulas (`"formula": "SUM(B2:B9)"` in the spec, or `xlsx_edit.py f.xlsx --set "C1==SUM(A:A)" --recalc`;
   `--recalc` sets the workbook's full-calc-on-load flag).
2. Run `xlsx_recalc.py f.xlsx`. With no `soffice` it prints `{"recalculated": false, ...}` and exits 0, so branch
   on the JSON and say so instead of presenting uncomputed numbers.
3. Re-read with `--data-only` and check a known total by hand.

Never save a workbook loaded with `data_only=True`: it replaces every formula with its cached value.

### Edits beyond the native subset

```bash
python3 scripts/xlsx_edit.py f.xlsx --sheet Data --set B2=42 --append '[1,"x",true]'
python3 scripts/xlsx_edit.py f.xlsx --add-table Sales:A1:C9
python3 scripts/xlsx_edit.py f.xlsx --table-append 'Sales=["West",5]'
python3 scripts/xlsx_edit.py f.xlsx --define-name "Rates='Data'!\$B\$2:\$B\$9"
python3 scripts/xlsx_edit.py f.xlsx --hyperlink "A1=https://example.com|Docs"
python3 scripts/xlsx_edit.py f.xlsx --note "B2=Check this|Reviewer"
python3 scripts/xlsx_edit.py f.xlsx --copy-sheet Src:New --rename-sheet Old:New
python3 scripts/xlsx_restructure.py f.xlsx --sheet Data --insert-rows 3:2     # rewrites refs on all sheets
python3 scripts/xlsx_restructure.py f.xlsx --sheet Data --delete-cols B
```

- `xlsx_edit.py --insert-rows/--delete-rows` does not shift references. For sheets with formulas, merges, tables or
  filters use `xlsx_restructure.py`, read its `not_shifted` list (chart anchors, images and conditional-format rule
  formulas are not moved), and see `references/restructuring.md`.
- Sheet protection (`--protect`, no password argument needed) only signals "do not edit". It is not security and
  encrypts nothing. Do not ask for or accept a password to put on it.
- Loading and re-saving drops charts and images that openpyxl cannot round-trip. Re-add them or avoid re-saving
  charted files.
- Dates are serial numbers in Excel; dumps emit ISO strings. Typed dates in a spec: `{"value": "2026-01-31", "type": "date"}`.
- Legacy `.xls`: convert first with `soffice --headless --convert-to xlsx old.xls`.

### Export

```bash
soffice --headless --convert-to pdf report.xlsx --outdir out/     # visual check or hand-off
```

CSV: prefer native `sheet_edit` `export`. For European files (`;` delimiter, decimal commas such as `"12,5"`),
pass `delimiter: ";"` and expect those values to stay strings.

## Verification

- After create or edit, `sheet_read` the touched range and compare against the source values.
- After script edits, `xlsx_read.py --sheets` (names, dimensions, merges, chart counts) and `--formulas`.
- After `xlsx_restructure.py`, read the JSON report, then re-run `--formulas` to confirm references moved.
- For a full visual check, convert to PDF with `soffice` and inspect it.
- Never state a formula result you have not recalculated or computed independently.

Adapted from NousResearch/hermes-agent@134e08ca6d272c9b9610ce5889e2ecff9c73adf0 skills/productivity/xlsx (MIT).
