// C-PAR-01: the parity check. Scope: these checks catch honest drift by our own contributors (a renamed option, a forgotten
// README update, a binding that starts spawning), not an adversary deliberately evading them.
// Reads three things and fails when any of them disagrees with another:
//   - the glossary, docs/api-contract.md §2 (the parity unit: at most 15 concepts, none of an excluded capability);
//   - the public surface of each language: bindings/node/index.d.ts (TypeScript) and the core crate (Rust);
//   - scripts/surface-check/parity.txt, which places every public item in exactly one concept.
// Both directions are checked: a public item the map does not place, and a map entry naming an item that does not
// exist; a glossary concept without a row, and a row without a glossary concept; a concept missing in a language.
//
// v0.1 covers TypeScript and Rust. Python (C-PAR-01 is v0.2) is not read here: its column joins the map with the
// package. Declared limit: the capabilities are compared, not the values inside a type: a Rust enum variant or a TypeScript
// string-literal value (an error code, a `reason`) that exists in one language only is not caught (v0.2). A check that cannot read its input exits 2 and says which file and why, never 0.
//
//   node scripts/surface-check/parity.mjs [--root <repository root>]
// Exit: 0 parity holds · 1 violations (each names the item) · 2 an input cannot be read.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Unreadable, rootArg, tsSurface } from "./dts.mjs";
import { rustSurface } from "./rust.mjs";

const MAX_CONCEPTS = 15; // C-PAR-01
const here = dirname(fileURLToPath(import.meta.url));

const read = (root, path) => {
  try {
    return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
  } catch (e) {
    throw new Unreadable(`${path}: cannot be read (${e.code ?? e.message})`);
  }
};

/** Splits `text` at every `sep` that is outside parentheses. */
function topLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(from, i));
      from = i + sep.length;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

/** The glossary section: `{ declared, concepts: [{ name, names }] }`; `names` are the identifiers its parentheses cite. */
function glossary(md, file) {
  const m = /^## 2\. Glossary([^\n]*)\n([\s\S]*?)(?=^## )/m.exec(md);
  if (!m) throw new Unreadable(`${file}: the "## 2. Glossary" section is missing`);
  const declared = /\((\d+) concepts/.exec(m[1])?.[1];
  const text = m[2].replace(/\s+/g, " ").trim().replace(/\.$/, "");
  const concepts = topLevel(text, " · ").map((part) => {
    const open = part.indexOf(" (");
    const name = (open < 0 ? part : part.slice(0, open)).trim();
    const names = open < 0 ? [] : [...part.slice(open).matchAll(/`([A-Za-z_]\w*)/g)].map((x) => x[1]);
    return { name, names, parenthetical: open >= 0 };
  });
  if (concepts.length === 0 || concepts.some((c) => c.name === "")) {
    throw new Unreadable(`${file}: the glossary came back with ${concepts.length === 0 ? "no concepts" : "an empty concept"}`);
  }
  return { declared: declared === undefined ? undefined : Number(declared), concepts };
}

/** The map file: `{ excluded: Map(word -> where), rows: [{ concept, ts, rust }] }`. */
function parityMap(text, file) {
  const logical = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "" || raw.startsWith("#")) continue;
    if (/^\s/.test(raw) && logical.length > 0) logical[logical.length - 1] += ` ${raw.trim()}`;
    else logical.push(raw.trim());
  }
  const excluded = new Map();
  const rows = [];
  let section = null;
  for (const line of logical) {
    if (line === "[excluded]" || line === "[parity]") {
      section = line;
      continue;
    }
    const cells = line.split("|").map((c) => c.trim());
    if (section === "[excluded]" && cells.length === 2 && cells[0] && cells[1]) excluded.set(cells[0], cells[1]);
    else if (section === "[parity]" && cells.length === 3 && cells[0]) {
      const list = (c) => c.split(",").map((s) => s.trim()).filter(Boolean);
      rows.push({ concept: cells[0], ts: list(cells[1]), rust: list(cells[2]) });
    } else throw new Unreadable(`${file}: cannot read the line "${line.slice(0, 80)}" (${section ?? "before any section"})`);
  }
  if (excluded.size === 0) throw new Unreadable(`${file}: the [excluded] section is missing or empty`);
  if (rows.length === 0) throw new Unreadable(`${file}: the [parity] section is missing or empty`);
  return { excluded, rows };
}

/** The words of an identifier: `parentPid` and `parent_pid` are `parent`, `pid`. */
const words = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** The last name of an item path: `Child.stop.graceMs` and `Command::timeout` end in `graceMs`, `timeout`. */
const last = (item) => item.split(/\.|::/).pop();

/** One language's side: every public item placed once, every placed item real, no excluded word. */
function sideViolations(lang, surface, placed, excluded, out) {
  const owner = new Map();
  for (const [concept, items] of placed) {
    for (const item of items) {
      if (owner.has(item)) out.push(`${lang} item \`${item}\` is placed in two concepts (${owner.get(item)} and ${concept})`);
      owner.set(item, concept);
    }
  }
  const real = new Set(surface);
  for (const item of surface) {
    if (!owner.has(item)) out.push(`${lang} public item \`${item}\` is in no concept of scripts/surface-check/parity.txt (a capability added to one language: INV-02)`);
  }
  for (const [item, concept] of owner) {
    if (!real.has(item)) out.push(`parity.txt places \`${item}\` under "${concept}" but the ${lang} surface has no such item`);
  }
  for (const item of surface) {
    const hit = words(last(item)).find((w) => excluded.has(w));
    if (hit) out.push(`${lang} public item \`${item}\` carries the excluded word "${hit}" (${excluded.get(hit)})`);
  }
  return owner;
}

/** Runs the check; returns `{ violations, summary }`. Throws `Unreadable` when an input cannot be read. */
export function check(root) {
  const contract = "docs/api-contract.md";
  const mapFile = "scripts/surface-check/parity.txt";
  const { declared, concepts } = glossary(read(root, contract), contract);
  const { excluded, rows } = parityMap(read(root, mapFile), mapFile);
  const ts = tsSurface(read(root, "bindings/node/index.d.ts"), "bindings/node/index.d.ts");
  const rust = rustSurface(root);
  const out = [];

  if (concepts.length > MAX_CONCEPTS) out.push(`the glossary has ${concepts.length} concepts; the limit is ${MAX_CONCEPTS}`);
  if (declared !== undefined && declared !== concepts.length) {
    out.push(`the glossary heading says ${declared} concepts but lists ${concepts.length}`);
  }
  for (const { name } of concepts) {
    const hit = words(name).find((w) => excluded.has(w));
    if (hit) out.push(`glossary concept "${name}" carries the excluded word "${hit}" (${excluded.get(hit)})`);
  }

  const byConcept = new Map();
  for (const row of rows) {
    if (byConcept.has(row.concept)) out.push(`parity.txt has two rows for "${row.concept}"`);
    byConcept.set(row.concept, row);
    if (!concepts.some((c) => c.name === row.concept)) out.push(`parity.txt row "${row.concept}" is not a glossary concept`);
  }
  for (const { name, names, parenthetical } of concepts) {
    if (parenthetical && names.length === 0) out.push(`glossary concept "${name}" has a parenthetical that cites no \`backticked\` name, so nothing is cross-checked against it`);
    const row = byConcept.get(name);
    if (!row) {
      out.push(`glossary concept "${name}" has no row in parity.txt`);
      continue;
    }
    if (row.ts.length === 0) out.push(`concept "${name}" has no TypeScript item`);
    if (row.rust.length === 0) out.push(`concept "${name}" has no Rust item`);
    for (const cited of names) {
      if (!row.ts.some((item) => last(item) === cited)) out.push(`the glossary cites \`${cited}\` under "${name}" but no TypeScript item of that concept is named so`);
    }
  }
  sideViolations("TypeScript", ts, new Map(rows.map((r) => [r.concept, r.ts])), excluded, out);
  sideViolations("Rust", rust.items, new Map(rows.map((r) => [r.concept, r.rust])), excluded, out);

  const summary =
    `glossary ${concepts.length} concepts (limit ${MAX_CONCEPTS}) · TypeScript ${ts.length} items, Rust ${rust.items.length} items` +
    ` (${rust.foreign.length} re-exported from another crate: ${rust.foreign.join(", ") || "none"}) · excluded words: ${[...excluded.keys()].join(", ")}` +
    " · Python: v0.2, not read";
  return { violations: out, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = rootArg(process.argv, resolve(here, "../.."));
    const { violations, summary } = check(root);
    if (violations.length > 0) {
      for (const v of violations) console.error(`surface-check: FAIL ${v}`);
      console.error(`surface-check: ${violations.length} violation(s)`);
      process.exit(1);
    }
    console.log(`surface-check: parity OK, ${summary}`);
  } catch (e) {
    console.error(`surface-check: CANNOT READ ${e instanceof Unreadable ? e.message : (e?.stack ?? e)}`);
    process.exit(2);
  }
}
