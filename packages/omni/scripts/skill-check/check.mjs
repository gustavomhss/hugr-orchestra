// The skills of hugr-omni (skills/<name>/SKILL.md) are loaded by Claude Code (.claude-plugin/plugin.json) and by
// Orchestra (`skills.paths`). This check keeps them loadable and keeps what they say tied to the code and the docs.
//
// Scope: these checks catch honest drift by our own contributors (a renamed option, a moved heading, a skill a loader
// would skip), not an adversary deliberately evading them.
//
// Per skill folder (every entry of skills/ must be one):
//   - SKILL.md opens with frontmatter (markdown.mjs reads it): `name` equals the folder and matches [a-z0-9-]{1,64};
//     `description` is at most 1024 characters, holds "Use when" (it is the trigger text) and no `<` or `>`; no key
//     outside KEYS; the body is at most 500 lines and has the headings "## When to use" and "## When not to use";
//   - the folder holds SKILL.md and, optionally, references/: .md files only, no subfolder (references stay one
//     level deep), each one linked from SKILL.md.
// Per file (SKILL.md and its references):
//   - every relative link resolves to a file or folder inside this package (the mirror holds nothing else), and every
//     `#anchor` to a heading of the .md file it names (or of the file itself);
//   - every inline code span that is, or starts with (followed by `:`, `(` or `=`), an identifier of one of two shapes
//     is checked against bindings/node/index.d.ts (read with surface-check/dts.mjs):
//       option shape  lowerCamelCase with at least one hump (`timeoutMs`, `droppedBytes`): a name of the surface;
//       code shape    upper case with two letters or more, `_` allowed (`NOT_FOUND`, `IO`): an `OmniError` code;
//     anything else (a dotted path, a lower-case word, a sentence, fenced code) is not looked at. A shaped identifier
//     that is not omni's (`PATH`, `killSignal`) must be listed in FOREIGN, one per line with a `# why`; an entry that
//     omni does have, that no skill uses, or that is listed twice is a violation (the ledger cannot rot).
// Plus .claude-plugin/plugin.json: valid JSON with a kebab-case `name`; any `skills` path it adds exists.
//
//   node scripts/skill-check/check.mjs [--root <package root>]
// Exit: 0 holds · 1 violations (each names file:line) · 2 an input cannot be read (no skill at all, no index.d.ts,
// no OmniError codes, no ledger), or an argument is unknown.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Unreadable, rootArg, tsSurface } from "../surface-check/dts.mjs";
import { frontmatter, scan } from "./markdown.mjs";

const KEYS = new Set(["name", "description", "license", "allowed-tools", "compatibility"]);
const MAX_DESCRIPTION = 1024;
const MAX_BODY = 500;
const HEADINGS = ["## When to use", "## When not to use"];
const DTS = "bindings/node/index.d.ts";
const FOREIGN = "scripts/skill-check/foreign.txt";
const OPTION = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/;
const CODE = /^[A-Z]{2,}[A-Z0-9]*(?:_[A-Z0-9]+)*$/;

const read = (root, path) => {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch (e) {
    throw new Unreadable(`${path}: cannot be read (${e.code ?? e.message})`);
  }
};
const kind = (path) => {
  try {
    const s = statSync(path);
    return s.isDirectory() ? "dir" : s.isFile() ? "file" : "other";
  } catch {
    return null;
  }
};
const entries = (root, dir) => {
  try {
    return readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    throw new Unreadable(`${dir}: cannot be listed (${e.code ?? e.message})`);
  }
};

/** What omni's TypeScript surface names: every segment of every item, and the `OmniError` codes. */
function surface(root) {
  const text = read(root, DTS);
  const names = new Set(tsSurface(text, DTS).flatMap((item) => item.split(".")));
  const union = /class\s+OmniError\b[\s\S]*?\breadonly\s+code\s*:([^;]*);/.exec(text);
  const codes = new Set(union ? [...union[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []);
  if (codes.size === 0) throw new Unreadable(`${DTS}: no \`OmniError\` code union found (the codes came back EMPTY)`);
  return { names, codes };
}

/** The ledger of foreign identifiers: `Map<identifier, line>`, and its own violations. */
function ledger(root, known) {
  const out = [];
  const ids = new Map();
  read(root, FOREIGN).replace(/\r\n/g, "\n").split("\n").forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") return;
    const where = `${FOREIGN}:${i + 1}`;
    if (!OPTION.test(line) && !CODE.test(line)) out.push(`${where}: "${line}" has neither the option nor the code shape; nothing would ever look it up`);
    else if (!/#\s*\S/.test(raw)) out.push(`${where}: \`${line}\` says no reason; add \`# why\` (whose name it is)`);
    if (ids.has(line)) out.push(`${where}: \`${line}\` is listed twice (first on line ${ids.get(line)})`);
    else ids.set(line, i + 1);
    if (known.names.has(line) || known.codes.has(line)) out.push(`${where}: \`${line}\` is omni's own (bindings/node/index.d.ts), not foreign; remove it`);
  });
  return { ids, out };
}

/** Checks the links, anchors and identifiers of one file (`path` relative to `root`); `used` collects foreign ids met. */
function checkFile(root, path, lines, first, known, foreign, used) {
  const out = [];
  const found = scan(lines, first);
  if (found.unclosed) out.push(`${path}: a code fence is never closed (the rest of the file would be read as code)`);
  const linked = [];
  for (const { line, value } of found.links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) continue; // http:, https:, mailto:
    const where = `${path}:${line}`;
    const [target, anchor] = value.split("#", 2);
    const file = target === "" ? join(root, path) : resolve(join(root, dirname(path)), decodeURI(target));
    const rel = relative(root, file);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      out.push(`${where}: the link \`${value}\` leaves this package (the mirror would not have it)`);
      continue;
    }
    const k = kind(file);
    if (k === null) {
      out.push(`${where}: the link \`${value}\` names ${rel}, which does not exist`);
      continue;
    }
    linked.push(rel.split("\\").join("/"));
    if (anchor === undefined) continue;
    if (k !== "file" || !file.endsWith(".md")) {
      out.push(`${where}: the link \`${value}\` has an anchor, but ${rel} is not a Markdown file`);
      continue;
    }
    const anchors = target === "" ? found.anchors : scan(readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n")).anchors;
    if (!anchors.has(anchor)) out.push(`${where}: ${rel} has no heading with the anchor #${anchor}`);
  }
  let checked = 0;
  for (const { line, value } of found.spans) {
    const id = /^([A-Za-z_$][\w$]*)(?:$|[:(=])/.exec(value)?.[1];
    if (!id) continue;
    const option = OPTION.test(id);
    const code = CODE.test(id);
    if (!option && !code) continue;
    checked++;
    if (foreign.has(id)) {
      used.add(id);
      continue;
    }
    if (option && !known.names.has(id)) out.push(`${path}:${line}: \`${id}\` is not a name of ${DTS} (a renamed or invented option?); if it is another library's, list it in ${FOREIGN}`);
    if (code && !known.codes.has(id)) out.push(`${path}:${line}: \`${id}\` is not an \`OmniError\` code of ${DTS}; if it is another name (an env var, a signal), list it in ${FOREIGN}`);
  }
  return { out, linked, checked, links: found.links.length };
}

/** Checks one skill folder; returns `{ out, files, links, checked }`. */
function checkSkill(root, name, known, foreign, used) {
  const dir = `skills/${name}`;
  const out = [];
  const stats = { files: 0, links: 0, checked: 0 };
  const take = (r) => {
    out.push(...r.out);
    stats.files++;
    stats.links += r.links;
    stats.checked += r.checked;
    return r;
  };
  const refs = [];
  let hasSkill = false;
  for (const e of entries(root, dir)) {
    if (e.name === "SKILL.md" && e.isFile()) hasSkill = true;
    else if (e.name === "references" && e.isDirectory()) {
      for (const r of entries(root, `${dir}/references`)) {
        if (r.isFile() && r.name.endsWith(".md")) refs.push(`${dir}/references/${r.name}`);
        else out.push(`${dir}/references/${r.name}: references hold .md files only, one level deep (no subfolder, no other file)`);
      }
    } else out.push(`${dir}/${e.name}: a skill folder holds SKILL.md and references/ only`);
  }
  if (!hasSkill) return { out: [...out, `${dir}: has no SKILL.md (a loader would skip it)`], ...stats };

  const path = `${dir}/SKILL.md`;
  const fm = frontmatter(read(root, path));
  out.push(...fm.problems.map((p) => `${path}${p.replace(/^line (\d+): /, ":$1: ").replace(/^(?!:)/, ": ")}`));
  if (fm.fields) {
    for (const [key, { line }] of fm.fields) if (!KEYS.has(key)) out.push(`${path}:${line}: unknown frontmatter key \`${key}\` (known: ${[...KEYS].join(", ")})`);
    const n = fm.fields.get("name");
    if (!n) out.push(`${path}: the frontmatter has no \`name\``);
    else {
      if (!/^[a-z0-9-]{1,64}$/.test(n.value)) out.push(`${path}:${n.line}: name "${n.value}" must match [a-z0-9-]{1,64}`);
      if (n.value !== name) out.push(`${path}:${n.line}: name "${n.value}" is not the folder's name "${name}"`);
    }
    const d = fm.fields.get("description");
    if (!d || d.value.trim() === "") out.push(`${path}: the frontmatter has no \`description\` (the text that triggers the skill)`);
    else {
      if (d.value.length > MAX_DESCRIPTION) out.push(`${path}:${d.line}: the description has ${d.value.length} characters; the limit is ${MAX_DESCRIPTION}`);
      if (!d.value.includes("Use when")) out.push(`${path}:${d.line}: the description must say "Use when ..." (it is the trigger text)`);
      if (/[<>]/.test(d.value)) out.push(`${path}:${d.line}: the description must not contain < or >`);
    }
  }
  if (fm.body.length > MAX_BODY) out.push(`${path}: the body has ${fm.body.length} lines; the limit is ${MAX_BODY} (move detail to references/)`);
  for (const h of HEADINGS) if (!fm.body.some((l) => l.trimEnd() === h)) out.push(`${path}: has no "${h}" heading`);

  const skill = take(checkFile(root, path, fm.body, fm.bodyLine, known, foreign, used));
  for (const ref of refs) {
    take(checkFile(root, ref, read(root, ref).replace(/\r\n/g, "\n").split("\n"), 1, known, foreign, used));
    if (!skill.linked.includes(ref)) out.push(`${ref}: no link from ${path} reaches it (a reference is read only through SKILL.md)`);
  }
  return { out, ...stats };
}

/** The plugin manifest Claude Code reads (`claude --plugin-dir <package root>`). */
function checkPlugin(root) {
  const path = ".claude-plugin/plugin.json";
  let manifest;
  try {
    manifest = JSON.parse(read(root, path));
  } catch (e) {
    if (e instanceof Unreadable) return [`${e.message}: Claude Code would not find the skills`];
    return [`${path}: not valid JSON (${e.message})`];
  }
  const out = [];
  if (typeof manifest.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name)) out.push(`${path}: \`name\` must be a kebab-case string`);
  for (const p of [manifest.skills ?? []].flat()) {
    if (typeof p !== "string" || kind(join(root, p)) !== "dir") out.push(`${path}: the skills path ${JSON.stringify(p)} is not a folder of this package`);
  }
  return out;
}

/** Runs every rule; returns `{ violations, summary }`. Throws `Unreadable` when an input cannot be read. */
export function check(root) {
  const known = surface(root);
  const { ids: foreign, out } = ledger(root, known);
  const used = new Set();
  const skills = entries(root, "skills");
  const totals = { files: 0, links: 0, checked: 0 };
  let n = 0;
  for (const e of skills) {
    if (!e.isDirectory()) {
      out.push(`skills/${e.name}: skills/ holds skill folders only`);
      continue;
    }
    n++;
    const r = checkSkill(root, e.name, known, foreign, used);
    out.push(...r.out);
    for (const k of Object.keys(totals)) totals[k] += r[k];
  }
  if (n === 0) throw new Unreadable("skills/: no skill folder found (the skills came back EMPTY)");
  for (const [id, line] of foreign) if (!used.has(id)) out.push(`${FOREIGN}:${line}: \`${id}\` is used by no skill; remove it`);
  out.push(...checkPlugin(root));
  const summary = `${n} skills, ${totals.files} files, ${totals.links} links, ${totals.checked} identifiers checked (${foreign.size} declared foreign)`;
  return { violations: out, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = rootArg(process.argv, join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
    const { violations, summary } = check(root);
    if (violations.length > 0) {
      for (const v of violations) console.error(`skill-check: FAIL ${v}`);
      console.error(`skill-check: ${violations.length} failure(s); ${summary}`);
      process.exit(1);
    }
    console.log(`skill-check: OK, ${summary}`);
  } catch (e) {
    console.error(`skill-check: CANNOT READ ${e instanceof Unreadable ? e.message : (e?.stack ?? e)}`);
    process.exit(2);
  }
}
