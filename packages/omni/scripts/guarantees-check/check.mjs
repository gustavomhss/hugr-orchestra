// C-GUA-01: every GUARANTEES row has a per-OS status and links the scenario or KPI that proves it.
//
// Scope: these checks catch honest drift by our own contributors (a renamed option, a forgotten README update, a binding
// that starts spawning), not an adversary deliberately evading them.
//
// GUARANTEES.md is read by its headings: the "## Containment tiers (ADR-0005)" table and the "## Promises" table, each
// found by its exact heading, its header row checked cell by cell. A missing heading, header or table exits 2. A table
// is read as GFM renders it: every non-blank line under the separator is a row, with a leading pipe or without, up to the
// first blank line; a line that is not a 5-cell row is a violation, never skipped.
//
//   Promises table (Item | Linux | macOS | Windows | Evidence), per row:
//   - each OS cell is `planned`, `–` (not applicable), `declared: <what is declared>`, or `green` with a link to the CI
//     run (a URL or `run <number>`): a `green` nobody can follow is a promise without evidence (INV-09);
//   - the Evidence cell is a list (`+` or `,`) of links, each of a kind this check can resolve:
//       `scenario`/`scenarios`  every C- item of the row has a file conformance/scenarios/<ID>.*.json
//       `idiom tests`/`runner`  every C- item of the row is named in a test source (TESTS below)
//       `K<n>`                  the KPI exists in docs/acceptance.md
//       `W<nn>`                 the work package has a heading in PLAN.md
//       `<file>.yml run <n>`    a CI run, accepted by its shape: this check does not fetch it
//     a word it cannot resolve is a failure naming it. The check looks that a link exists, not that it is good.
//   And the other way round: every scenario file's item is listed by some row.
//   Containment tiers table: every row has text for each OS (it has no status or evidence column to check).
//
//   node scripts/guarantees-check/check.mjs [--root <repository root>]
// A table row after a blank line, a scenario file that is not .json, an unknown argument: refused, never skipped.
// Exit: 0 holds · 1 violations (each names the row or file) · 2 an input cannot be read, or an argument is unknown.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TESTS = ["crates/hugr-omni/src", "crates/hugr-omni/tests", "bindings/node/test"];
const ITEM = /C-[A-Z]+-(\d\d)(?:\.\.(\d\d))?/g;
const ID = /C-[A-Z]+-\d\d/g;

/** The input cannot be read (or has no table where the heading says): exit 2. */
class Unreadable extends Error {}

const read = (root, path) => {
  try {
    return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
  } catch (e) {
    throw new Unreadable(`${path}: cannot be read (${e.code ?? e.message})`);
  }
};

const list = (root, dir) => {
  try {
    return readdirSync(join(root, dir), { withFileTypes: true });
  } catch (e) {
    throw new Unreadable(`${dir}: cannot be listed (${e.code ?? e.message})`);
  }
};

/** Every C- id named in a `.rs`, `.mjs` or `.ts` file under `dir`. */
function namedIn(root, dir, found) {
  for (const e of list(root, dir)) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "target") namedIn(root, path, found);
    } else if (/\.(rs|mjs|ts)$/.test(e.name)) {
      for (const m of read(root, path).matchAll(ID)) found.add(m[0]);
    }
  }
}

/** The table under `## <heading>`: `{ header, rows: [{ cells, line }] }`; the header must be exactly `want`. */
function table(md, heading, want, file) {
  const lines = md.split("\n");
  const at = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (at < 0) throw new Unreadable(`${file}: the "## ${heading}" section is missing`);
  const start = lines.findIndex((l, i) => i > at && l.trim().startsWith("|"));
  if (start < 0 || lines.slice(at + 1, start).some((l) => l.startsWith("#"))) {
    throw new Unreadable(`${file}: no table under "## ${heading}"`);
  }
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = cells(lines[start]);
  if (header.join("|") !== want.join("|")) {
    throw new Unreadable(`${file}:${start + 1}: the header under "## ${heading}" must be | ${want.join(" | ")} |, it is | ${header.join(" | ")} |`);
  }
  if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[start + 1] ?? "")) throw new Unreadable(`${file}:${start + 2}: the header has no separator row`);
  // As GFM renders it: every non-blank line after the separator is a row of the table, with a leading pipe or without, up
  // to the first blank line or the start of another block. A row the check recognizes by cells, not by its first character.
  const rows = [];
  let end = start + 2;
  for (; end < lines.length && lines[end].trim() !== "" && !/^\s*(#|>|```|~~~)/.test(lines[end]); end++) rows.push({ cells: cells(lines[end]), line: end + 1 });
  if (rows.length === 0) throw new Unreadable(`${file}: the table under "## ${heading}" has no row (it came back EMPTY)`);
  // A row after a blank line is not part of the table, so it would go unchecked: say so instead of skipping it.
  const stray = [];
  for (; end < lines.length && !lines[end].startsWith("## "); end++) if (lines[end].trim().startsWith("|")) stray.push(end + 1);
  return { header, rows, stray };
}

/** The ids an Item cell names: `C-IO-01..04` is four, `C-ERR-01 / C-ERR-02` two. */
function itemsOf(cell) {
  const ids = [];
  for (const m of cell.matchAll(ITEM)) {
    const prefix = m[0].slice(0, m[0].indexOf(m[1]));
    const from = Number(m[1]);
    for (let n = from; n <= Number(m[2] ?? m[1]); n++) ids.push(`${prefix}${String(n).padStart(2, "0")}`);
  }
  return ids;
}

const statusOk = (cell) =>
  cell === "planned" || cell === "–" || /^declared: \S/.test(cell) || (/^green\b/.test(cell) && /https?:\/\/\S+|\brun \d+/.test(cell));

/** Runs the check; returns `{ violations, summary }`. Throws `Unreadable` when an input cannot be read. */
export function check(root) {
  const out = [];
  const file = "GUARANTEES.md";
  const md = read(root, file);
  const tiers = table(md, "Containment tiers (ADR-0005)", ["", "Linux", "macOS", "Windows"], file);
  const promises = table(md, "Promises", ["Item", "Linux", "macOS", "Windows", "Evidence"], file);

  const kpis = new Set([...read(root, "docs/acceptance.md").matchAll(/^\| (K\d+)\b/gm)].map((m) => m[1]));
  if (kpis.size === 0) throw new Unreadable("docs/acceptance.md: no KPI row found (the KPI list came back EMPTY)");
  const packages = new Set([...read(root, "PLAN.md").matchAll(/^#{3,4} (W\d+[a-z]?) ·/gm)].map((m) => m[1]));
  if (packages.size === 0) throw new Unreadable("PLAN.md: no work package heading found (the list came back EMPTY)");

  const entries = list(root, "conformance/scenarios");
  for (const e of entries) if (!e.name.endsWith(".json")) out.push(`conformance/scenarios/${e.name}: not a .json scenario; a file this check does not read`);
  const scenarios = entries.filter((e) => e.name.endsWith(".json")).map((e) => e.name);
  if (scenarios.length === 0) throw new Unreadable("conformance/scenarios: no scenario file found (the list came back EMPTY)");
  const proven = new Map(); // item id -> its scenario files
  for (const name of scenarios) {
    const id = /^(C-[A-Z]+-\d\d)\.[^.]+\.json$/.exec(name)?.[1];
    if (id === undefined) out.push(`conformance/scenarios/${name}: the file name must be <C-item>.<name>.json`);
    else proven.set(id, [...(proven.get(id) ?? []), name]);
  }
  const named = new Set();
  for (const dir of TESTS) namedIn(root, dir, named);

  for (const t of [tiers, promises]) {
    for (const line of t.stray) out.push(`${file}:${line}: a table row after the table ended (a blank line above it?) is not part of the table, so it is not checked`);
  }
  for (const { cells, line } of tiers.rows) {
    if (cells.length !== 4 || cells.some((c) => c === "")) out.push(`${file}:${line}: tier row "${(cells[0] ?? "").slice(0, 50)}" must have text for Linux, macOS and Windows`);
  }

  const listed = new Set();
  for (const { cells, line } of promises.rows) {
    const label = `${file}:${line}: row "${(cells[0] ?? "").slice(0, 50)}"`;
    if (cells.length !== 5) {
      out.push(`${label} has ${cells.length} cells, the header has 5`);
      continue;
    }
    const ids = itemsOf(cells[0]);
    if (/C-[A-Z]+-\d\d(?:\s*[/,&]\s*|-)\d\d\b/.test(cells[0])) out.push(`${label}: an item list in shorthand (\`C-X-01/02\`, \`C-X-01-02\`) is not read; write \`C-X-01..02\` or each item in full`);
    ids.forEach((id) => listed.add(id));
    ["Linux", "macOS", "Windows"].forEach((os, i) => {
      if (!statusOk(cells[i + 1])) out.push(`${label}: ${os} status "${cells[i + 1].slice(0, 40)}" is none of planned, –, declared: <what>, green (with a run link)`);
    });
    const kinds = new Set();
    const tokens = cells[4].replace(/\s*\([^)]*\)/g, "").split(/\s*[+,]\s*/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) out.push(`${label}: no evidence`);
    for (const t of tokens) {
      if (/^scenarios?$/.test(t)) kinds.add("scenario");
      else if (/^(idiom tests|runner)$/.test(t)) kinds.add("tests");
      else if (/^K\d+$/.test(t)) {
        if (!kpis.has(t)) out.push(`${label}: evidence ${t} is not a KPI of docs/acceptance.md`);
      } else if (/^W\d+[a-z]?$/.test(t)) {
        if (!packages.has(t)) out.push(`${label}: evidence ${t} is not a work package of PLAN.md`);
      } else if (!/^\S+\.yml run \d+$/.test(t)) out.push(`${label}: evidence "${t}" is not a link this check can resolve (scenario, idiom tests, runner, K<n>, W<nn>, <file>.yml run <n>)`);
    }
    if (kinds.size > 0 && ids.length === 0) out.push(`${label}: names ${[...kinds].join("/")} evidence but lists no C- item`);
    for (const id of ids) {
      const ok = (kinds.has("scenario") && proven.has(id)) || (kinds.has("tests") && named.has(id));
      if (kinds.size > 0 && !ok) out.push(`${label}: ${id} has no ${[...kinds].map((k) => (k === "scenario" ? `scenario file conformance/scenarios/${id}.*.json` : "test source naming it")).join(" and no ")}`);
    }
  }
  for (const [id, files] of proven) {
    if (!listed.has(id)) out.push(`conformance/scenarios/${files[0]}: proves ${id}, which no row of ${file} lists`);
  }
  const summary = `${promises.rows.length} promise rows (${listed.size} items), ${tiers.rows.length} tier rows, ${scenarios.length} scenario files, ${kpis.size} KPIs, ${packages.size} work packages`;
  return { violations: out, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && !(args.length === 2 && args[0] === "--root" && args[1] !== "" && !args[1].startsWith("--"))) {
      throw new Unreadable(`unknown or incomplete arguments: ${args.join(" ")} (the only one is --root <dir>)`);
    }
    const root = args.length === 2 ? resolve(args[1]) : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const { violations, summary } = check(root);
    if (violations.length > 0) {
      for (const v of violations) console.error(`guarantees-check: FAIL ${v}`);
      console.error(`guarantees-check: ${violations.length} violation(s)`);
      process.exit(1);
    }
    console.log(`guarantees-check: OK, ${summary}`);
  } catch (e) {
    console.error(`guarantees-check: CANNOT READ ${e instanceof Unreadable ? e.message : (e?.stack ?? e)}`);
    process.exit(2);
  }
}
