// The small Markdown reader of skill-check: frontmatter, headings (as GitHub anchors), links and inline code spans.
//
// What it reads, and nothing more:
// - frontmatter: the first line is `---`, the next `---` line ends it; every line between is `key: value` on one line
//   (a quoted or plain scalar). A YAML block (`|`, `>`), a list or a nested map is refused, never half-read;
// - fences: CommonMark backtick or tilde fences with at most three spaces of indentation. Nothing inside a fence is a
//   heading, a link or a code span (fenced code is readme-check's: it type-checks and runs the `ts` blocks);
// - headings: ATX (`#` to `######`) outside fences; the anchor is GitHub's (github-slugger): the rendered text in lower
//   case, every character that is not a letter, a mark, a digit, a space, `-` or `_` removed, spaces turned into `-`,
//   and `-1`, `-2`, ... appended to repeats;
// - links: inline `[text](target)` / `![alt](target)` and reference definitions `[label]: target`, outside code spans;
// - code spans: backtick runs on one line (a span that crosses a line end is not read).

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Splits `text` into `{ fields, body, bodyLine, problems }`; `bodyLine` is the 1-based line where the body starts. */
export function frontmatter(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const problems = [];
  if (lines[0] !== "---") return { fields: null, body: lines, bodyLine: 1, problems: ["line 1: no frontmatter (the file must start with a `---` line)"] };
  const end = lines.indexOf("---", 1);
  if (end < 0) return { fields: null, body: lines, bodyLine: 1, problems: ["the frontmatter is never closed (no second `---` line)"] };
  const fields = new Map();
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const m = /^([a-z][a-z0-9-]*):(?: (.*))?$/.exec(raw);
    if (!m) {
      problems.push(`line ${i + 1}: "${raw.slice(0, 60)}" is not a one-line \`key: value\` (no YAML block, list, map or indented line is read)`);
      continue;
    }
    const [, key, given = ""] = m;
    const value = scalar(given.trim(), i + 1, problems);
    if (fields.has(key)) problems.push(`line ${i + 1}: \`${key}\` is given twice`);
    else fields.set(key, { value, line: i + 1 });
  }
  return { fields, body: lines.slice(end + 1), bodyLine: end + 2, problems };
}

/** A one-line YAML scalar: quoted (`"..."` with `\"` and `\\`, or `'...'` with `''`) or plain. */
function scalar(v, line, problems) {
  if (v.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"$/.exec(v);
    if (m) return m[1].replace(/\\(.)/g, "$1");
  } else if (v.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(v);
    if (m) return m[1].replaceAll("''", "'");
  } else if (/^[|>[{&*!%@`]/.test(v)) {
    problems.push(`line ${line}: a value starting with "${v[0]}" is YAML syntax this check does not read; write one quoted line`);
    return v;
  } else if (/: |\s#/.test(v) || v.endsWith(":")) {
    problems.push(`line ${line}: a plain value with ": " or " #" is not what it seems in YAML; quote it`);
    return v;
  } else return v;
  problems.push(`line ${line}: an unterminated or malformed quoted value`);
  return v;
}

/** GitHub's anchor for the heading text `raw` (before de-duplication). */
export function slug(raw) {
  const text = raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
}

/**
 * Reads `lines` (the body of a file; `first` is the 1-based number of `lines[0]`): `{ anchors, links, spans }`.
 * `anchors` is the set of heading anchors; `links` and `spans` are `{ line, value }`.
 */
export function scan(lines, first = 1) {
  const anchors = new Set();
  const seen = new Map();
  const links = [];
  const spans = [];
  let fence = null;
  lines.forEach((raw, i) => {
    const line = first + i;
    const f = FENCE.exec(raw);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && raw.trim() === f[1]) fence = null;
      return;
    }
    if (f) {
      fence = f[1];
      return;
    }
    const plain = raw.replace(/(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (_, _ticks, code) => {
      spans.push({ line, value: code.trim() });
      return " ";
    });
    const h = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(raw);
    if (h) {
      const base = slug(h[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
    for (const m of plain.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ line, value: m[1].replace(/^<|>$/g, "") });
    }
    const def = /^ {0,3}\[[^\]]+\]:\s*(\S+)/.exec(plain);
    if (def) links.push({ line, value: def[1].replace(/^<|>$/g, "") });
  });
  return { anchors, links, spans, unclosed: fence !== null };
}
